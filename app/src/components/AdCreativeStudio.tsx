/**
 * Ad Creative Studio. Scoped Replicate playground for the wizard's
 * `ad-creative` step.
 *
 * Default model is `google/nano-banana-pro` and the workbench is pure
 * playground: schema-driven inputs from the model's OpenAPI schema, exactly
 * like the standalone Creative Studio. "Change model" reveals a search bar to
 * swap; "Reset to default" snaps back to nano-banana-pro.
 *
 * On top of the playground:
 *   - Save to client: each Replicate output URL lands in
 *     `<root>/data/<slug>/creatives/` and is appended to an on-disk session
 *     manifest. First save also calls `onSaved` so the wizard ticks the step
 *     done.
 *   - Import existing images: file picker copies local PNG/JPGs straight into
 *     the same creatives folder (no Replicate round-trip), so creatives the
 *     user generated elsewhere flow through the same Drive-push UI.
 *   - Drive push: per-save and bulk push to the client's chosen Drive folder.
 */

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/tauri";
import { parseDriveFolders, type DriveFolder } from "../lib/driveIndex";
import type { FormValues } from "../lib/formConfigs";
import type {
  DocFolderTarget,
  GeneratorOutput,
  ReplicateModel,
  ReplicateModelDetail,
  ReplicatePredictionResult,
} from "../lib/types";

// ── Types ────────────────────────────────────────────────────

type FieldValue = string | number | boolean | null;

type Schemas = Record<string, SchemaNode>;

interface SchemaNode {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  allOf?: Array<{ $ref?: string }>;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  "x-order"?: number;
}

interface SavedCreative {
  savedPath: string;
  filename: string;
  sourceUrl: string;
  /** Web view link returned by Drive after a successful push. */
  driveUrl?: string;
  /** Last push failure for this file. Cleared on retry success. */
  drivePushError?: string;
  /** True for files imported via the local picker; false for Replicate runs. */
  imported: boolean;
  /** Inline preview: remote URL for Replicate saves, data URI for imports. */
  previewUrl?: string;
}

interface Props {
  root: string;
  clientName: string;
  clientSlug: string;
  /** Kept for prop compatibility with the wizard; not used in the playground. */
  initialValues?: Partial<FormValues>;
  /** Called after the first save/import so the wizard can mark the step done. */
  onSaved?: (output: GeneratorOutput) => void;
  /** Send a saved creative to the campaign tree in pick mode — clicking an
   *  ad slot in the tree attaches the file to that ad. */
  onSendCreativeToTree?: (pick: {
    savedPath: string;
    filename: string;
    previewUrl?: string;
  }) => void;
}

// ── Constants ────────────────────────────────────────────────

const DEFAULT_MODEL = { owner: "google", name: "nano-banana-pro" };

// ── Helpers ──────────────────────────────────────────────────

function resolveEnum(node: SchemaNode, schemas: Schemas): string[] | null {
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return node.enum.map((v) => String(v));
  }
  const ref = node.allOf?.[0]?.$ref;
  if (!ref) return null;
  const name = ref.split("/").pop();
  if (!name) return null;
  const target = schemas[name];
  if (target && Array.isArray(target.enum)) {
    return target.enum.map((v) => String(v));
  }
  return null;
}

function fieldDefault(node: SchemaNode, schemas: Schemas): FieldValue {
  const enumValues = resolveEnum(node, schemas);
  if (enumValues) {
    if (typeof node.default === "string") return node.default;
    return enumValues[0] ?? "";
  }
  if (node.default !== undefined && node.default !== null) {
    if (
      typeof node.default === "string" ||
      typeof node.default === "number" ||
      typeof node.default === "boolean"
    ) {
      return node.default;
    }
  }
  if (node.type === "boolean") return false;
  if (node.type === "integer" || node.type === "number") return "";
  return "";
}

function sortedEntries(
  properties: Record<string, SchemaNode>,
): Array<[string, SchemaNode]> {
  return Object.entries(properties).sort(([ak, a], [bk, b]) => {
    const ao = a["x-order"];
    const bo = b["x-order"];
    if (typeof ao === "number" && typeof bo === "number") return ao - bo;
    if (typeof ao === "number") return -1;
    if (typeof bo === "number") return 1;
    return ak.localeCompare(bk);
  });
}

function pickHumanLabel(key: string, node: SchemaNode): string {
  if (node.title && node.title.length > 0) return node.title;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractUrls(output: unknown): string[] {
  if (!output) return [];
  if (typeof output === "string") return isLikelyUrl(output) ? [output] : [];
  if (Array.isArray(output)) {
    return output.filter((v): v is string => typeof v === "string" && isLikelyUrl(v));
  }
  return [];
}

function isLikelyUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function isVideoUrl(s: string): boolean {
  const lower = s.toLowerCase();
  return /\.(mp4|webm|mov)(\?|#|$)/.test(lower);
}

function initializeSchemaInputs(detail: ReplicateModelDetail): Record<string, FieldValue> {
  const schemas = (detail.input_schema as Schemas) ?? {};
  const inputSchema = schemas["Input"] ?? schemas["input"];
  const props = inputSchema?.properties ?? {};
  const initial: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(props)) {
    initial[k] = fieldDefault(v, schemas);
  }
  return initial;
}

function buildManifestBody(args: {
  modelSlug: string;
  business: string;
  saved: SavedCreative[];
}): string {
  const lines: string[] = [];
  lines.push(`# Static creatives · ${args.business || "Client"}`);
  lines.push("");
  lines.push(`**Model:** \`${args.modelSlug}\``);
  lines.push(`**Total assets:** ${args.saved.length}`);
  lines.push("");
  if (args.saved.length > 0) {
    lines.push("## Assets");
    lines.push("");
    for (const s of args.saved) {
      const source = s.imported ? "imported" : "replicate";
      lines.push(`- \`${s.filename}\` · ${source}`);
    }
  }
  return lines.join("\n");
}

// ── Component ────────────────────────────────────────────────

export function AdCreativeStudio({
  root,
  clientName,
  clientSlug,
  onSaved,
  onSendCreativeToTree,
}: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  // Model state.
  const [model, setModel] = useState<ReplicateModelDetail | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReplicateModel[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [schemaInputs, setSchemaInputs] = useState<Record<string, FieldValue>>({});

  // Run state.
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ReplicatePredictionResult | null>(null);

  // Save / import state.
  const [savedThisSession, setSavedThisSession] = useState<SavedCreative[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Latest manifest output. Held back from the wizard so import/save doesn't
  // auto-advance to the next step; user clicks "Mark step done" when ready.
  const [pendingStepOutput, setPendingStepOutput] = useState<GeneratorOutput | null>(null);
  const [stepHandedOff, setStepHandedOff] = useState(false);

  // Drive push state.
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [folderTarget, setFolderTarget] = useState<DocFolderTarget | null>(null);
  const [pushingPaths, setPushingPaths] = useState<Set<string>>(new Set());
  const [pushAllInFlight, setPushAllInFlight] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const isDefaultModel =
    model?.owner === DEFAULT_MODEL.owner && model?.name === DEFAULT_MODEL.name;

  // Load token.
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.loadConfig();
        setToken(cfg.replicate_api_token ?? null);
      } finally {
        setTokenLoading(false);
      }
    })();
  }, []);

  // Load the default model once the token is available.
  useEffect(() => {
    if (!token || model) return;
    void (async () => {
      setModelLoading(true);
      setModelError(null);
      try {
        const detail = await api.getReplicateModel(
          token,
          DEFAULT_MODEL.owner,
          DEFAULT_MODEL.name,
        );
        setModel(detail);
        setSchemaInputs(initializeSchemaInputs(detail));
      } catch (e) {
        setModelError(String(e));
      } finally {
        setModelLoading(false);
      }
    })();
  }, [token, model]);

  // Load the client's per-step folder default + drive index folders once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [clients, idx] = await Promise.all([
          api.listClients(root),
          api.readDriveIndex(root, clientSlug),
        ]);
        if (cancelled) return;
        const folders = idx ? parseDriveFolders(idx.body) : [];
        setDriveFolders(folders);
        const client = clients.find((c) => c.slug === clientSlug);
        const preset = client?.sequence_folder_defaults?.["ad-creative"] ?? null;
        if (preset && folders.some((f) => f.id === preset.id)) {
          setFolderTarget(preset);
        } else if (folders.length > 0) {
          setFolderTarget({ id: folders[0].id, name: folders[0].name });
        }
      } catch (e) {
        console.warn("AdCreativeStudio: load drive folders failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  const onPickFolder = useCallback(
    (folderId: string) => {
      if (!folderId) {
        setFolderTarget(null);
        return;
      }
      const f = driveFolders.find((x) => x.id === folderId);
      if (f) setFolderTarget({ id: f.id, name: f.name });
    },
    [driveFolders],
  );

  const pushOne = useCallback(
    async (entry: SavedCreative) => {
      if (!folderTarget) {
        setPushError(
          "Pick a Drive folder first (dropdown above the saved list).",
        );
        return;
      }
      setPushError(null);
      setPushingPaths((curr) => {
        const next = new Set(curr);
        next.add(entry.savedPath);
        return next;
      });
      try {
        const result = await api.uploadLocalFileToDrive({
          folderId: folderTarget.id,
          sourcePath: entry.savedPath,
          filename: `Learning Phase - ${entry.filename}`,
          mimeType: "image/png",
        });
        setSavedThisSession((curr) =>
          curr.map((s) =>
            s.savedPath === entry.savedPath
              ? { ...s, driveUrl: result.webViewLink, drivePushError: undefined }
              : s,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSavedThisSession((curr) =>
          curr.map((s) =>
            s.savedPath === entry.savedPath
              ? { ...s, drivePushError: msg }
              : s,
          ),
        );
      } finally {
        setPushingPaths((curr) => {
          const next = new Set(curr);
          next.delete(entry.savedPath);
          return next;
        });
      }
    },
    [folderTarget],
  );

  const pushAllUnsynced = useCallback(async () => {
    if (!folderTarget) {
      setPushError(
        "Pick a Drive folder first (dropdown above the saved list).",
      );
      return;
    }
    setPushAllInFlight(true);
    setPushError(null);
    try {
      const queue = savedThisSession.filter((s) => !s.driveUrl);
      for (const entry of queue) {
        await pushOne(entry);
      }
    } finally {
      setPushAllInFlight(false);
    }
  }, [savedThisSession, folderTarget, pushOne]);

  const runSearch = useCallback(async () => {
    if (!token) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await api.searchReplicateModels(token, query);
      setSearchResults(results);
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setSearching(false);
    }
  }, [token, query]);

  const swapModel = useCallback(
    async (next: ReplicateModel) => {
      if (!token) return;
      setModelLoading(true);
      setModelError(null);
      setLastResult(null);
      try {
        const detail = await api.getReplicateModel(token, next.owner, next.name);
        setModel(detail);
        setSchemaInputs(initializeSchemaInputs(detail));
        setPickerOpen(false);
      } catch (e) {
        setModelError(String(e));
      } finally {
        setModelLoading(false);
      }
    },
    [token],
  );

  const resetToDefaultModel = useCallback(async () => {
    if (!token) return;
    setModelLoading(true);
    setModelError(null);
    setLastResult(null);
    try {
      const detail = await api.getReplicateModel(
        token,
        DEFAULT_MODEL.owner,
        DEFAULT_MODEL.name,
      );
      setModel(detail);
      setSchemaInputs(initializeSchemaInputs(detail));
      setPickerOpen(false);
    } catch (e) {
      setModelError(String(e));
    } finally {
      setModelLoading(false);
    }
  }, [token]);

  const pickSchemaFile = useCallback(async (key: string) => {
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Media",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"],
          },
        ],
      });
      if (!picked || typeof picked !== "string") return;
      const dataUri = await api.fileToDataUri(picked);
      setSchemaInputs((prev) => ({ ...prev, [key]: dataUri }));
    } catch (e) {
      setRunError(String(e));
    }
  }, []);

  const runPrediction = useCallback(async () => {
    if (!token || !model) return;
    setRunning(true);
    setRunError(null);
    setLastResult(null);
    setSaveError(null);
    try {
      const schemas = (model.input_schema as Schemas) ?? {};
      const inputSchema = schemas["Input"] ?? schemas["input"];
      const required = new Set(inputSchema?.required ?? []);
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schemaInputs)) {
        if (v === "" || v === null) {
          if (required.has(k)) cleaned[k] = v;
          continue;
        }
        cleaned[k] = v;
      }

      const result = await api.runReplicatePrediction(
        token,
        model.owner,
        model.name,
        cleaned,
      );
      setLastResult(result);
      if (result.status === "failed") {
        setRunError(result.error ?? "Prediction failed.");
      }
    } catch (e) {
      setRunError(String(e));
    } finally {
      setRunning(false);
    }
  }, [token, model, schemaInputs]);

  const outputUrls = useMemo(() => extractUrls(lastResult?.output), [lastResult]);

  const creativesDir = useMemo(() => {
    const sep = root.includes("\\") ? "\\" : "/";
    return `${root.replace(/[\\/]+$/, "")}${sep}data${sep}${clientSlug}${sep}creatives`;
  }, [root, clientSlug]);

  const writeManifest = useCallback(
    async (nextSaved: SavedCreative[]) => {
      if (!model) return;
      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: "briefs",
        title: `Static creatives · ${clientName}`,
        summary: `${nextSaved.length} asset${nextSaved.length === 1 ? "" : "s"} via ${model.owner}/${model.name}`,
        body: buildManifestBody({
          modelSlug: `${model.owner}/${model.name}`,
          business: clientName,
          saved: nextSaved,
        }),
        inputsYaml: null,
      });
      // Hold the manifest output until the user explicitly marks the step done.
      // Calling onSaved here would auto-advance the wizard before the user has
      // a chance to see what they just saved/imported.
      setPendingStepOutput(output);
    },
    [model, root, clientSlug, clientName],
  );

  const markStepDone = useCallback(() => {
    if (!pendingStepOutput || stepHandedOff) return;
    setStepHandedOff(true);
    onSaved?.(pendingStepOutput);
  }, [pendingStepOutput, stepHandedOff, onSaved]);

  const saveOutput = useCallback(
    async (url: string, idx: number) => {
      if (!model) return;
      setSaving(url);
      setSaveError(null);
      try {
        const stem = `replicate-${Date.now()}-${idx + 1}`;
        const saved = await api.saveReplicateOutput(url, creativesDir, stem);
        const entry: SavedCreative = {
          savedPath: saved.saved_path,
          filename: saved.filename,
          sourceUrl: saved.source_url,
          imported: false,
          previewUrl: url,
        };
        const nextSaved = [...savedThisSession, entry];
        setSavedThisSession(nextSaved);
        await writeManifest(nextSaved);
      } catch (e) {
        setSaveError(String(e));
      } finally {
        setSaving(null);
      }
    },
    [model, creativesDir, savedThisSession, writeManifest],
  );

  /** Multi-file picker → copies each file straight into the creatives folder
   *  via the `import_local_creative` tauri command. No Replicate round-trip.
   *  Lands in the same Saved-this-session list so Drive push works the same. */
  const importExisting = useCallback(async () => {
    setImportError(null);
    try {
      const picked = await openDialog({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Image",
            extensions: ["png", "jpg", "jpeg", "webp", "gif"],
          },
        ],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      if (paths.length === 0) return;

      setImporting(true);
      const stampBase = Date.now();
      const newEntries: SavedCreative[] = [];
      for (let i = 0; i < paths.length; i += 1) {
        const stem = `imported-${stampBase}-${i + 1}`;
        const saved = await api.importLocalCreative(paths[i], creativesDir, stem);
        // Generate an inline preview from the source path. Failure is non-fatal:
        // the row still shows up, just without a thumbnail.
        let previewUrl: string | undefined;
        try {
          previewUrl = await api.fileToDataUri(paths[i]);
        } catch {
          previewUrl = undefined;
        }
        newEntries.push({
          savedPath: saved.saved_path,
          filename: saved.filename,
          sourceUrl: saved.source_url,
          imported: true,
          previewUrl,
        });
      }
      const nextSaved = [...savedThisSession, ...newEntries];
      setSavedThisSession(nextSaved);
      await writeManifest(nextSaved);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [creativesDir, savedThisSession, writeManifest]);

  // ── Early returns ──────────────────────────────────────────

  if (tokenLoading) {
    return (
      <div className="acs-shell">
        <div className="acs-placeholder">Loading…</div>
        <style>{ACS_CSS}</style>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="acs-shell">
        <div className="acs-placeholder">
          <h2>Replicate not connected</h2>
          <p>
            Add your Replicate API token in Settings → Replicate. Grab one at{" "}
            <code>replicate.com/account/api-tokens</code>.
          </p>
        </div>
        <style>{ACS_CSS}</style>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────

  return (
    <div className="acs-shell">
      <style>{ACS_CSS}</style>

      {/* Workbench */}
      <section className="acs-section">
        <div className="acs-section-head">
          <div className="acs-section-eyebrow">▸ REPLICATE</div>
          <div className="acs-section-title">
            {model ? `${model.owner}/${model.name}` : "Loading model…"}
            {isDefaultModel && model && <span className="acs-default-tag">default</span>}
          </div>
          <div className="acs-section-meta">
            <button
              type="button"
              className="acs-link-btn"
              onClick={() => setPickerOpen((v) => !v)}
            >
              {pickerOpen ? "Close model picker" : "Change model"}
            </button>
            {!isDefaultModel && model && (
              <>
                <span className="acs-meta-sep">·</span>
                <button type="button" className="acs-link-btn" onClick={resetToDefaultModel}>
                  Reset to default
                </button>
              </>
            )}
          </div>
        </div>

        {pickerOpen && (
          <div className="acs-picker">
            <div className="acs-picker-search">
              <input
                type="text"
                className="acs-input"
                placeholder="Search Replicate models — 'flux', 'kontext', 'nano banana'…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
              <button
                type="button"
                className="acs-btn acs-btn-primary"
                onClick={runSearch}
                disabled={searching}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            {searchError && <div className="acs-error">{searchError}</div>}
            {searchResults.length > 0 && (
              <div className="acs-picker-results">
                {searchResults.slice(0, 12).map((m) => {
                  const slug = `${m.owner}/${m.name}`;
                  const isActive = model?.owner === m.owner && model?.name === m.name;
                  return (
                    <button
                      type="button"
                      key={slug}
                      className={`acs-picker-card${isActive ? " is-active" : ""}`}
                      onClick={() => swapModel(m)}
                    >
                      <div className="acs-picker-cover">
                        {m.cover_image_url ? (
                          <img src={m.cover_image_url} alt={slug} />
                        ) : (
                          <div className="acs-picker-cover-empty">▸</div>
                        )}
                      </div>
                      <div className="acs-picker-body">
                        <div className="acs-picker-slug">{slug}</div>
                        <div className="acs-picker-desc">{m.description ?? ""}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {modelError && <div className="acs-error">{modelError}</div>}

        {model && (
          <div className="acs-section-body">
            {modelLoading ? (
              <div className="acs-placeholder">Loading schema…</div>
            ) : (
              <SchemaForm
                schemas={(model.input_schema as Schemas) ?? {}}
                values={schemaInputs}
                onChange={(k, v) => setSchemaInputs((p) => ({ ...p, [k]: v }))}
                onPickFile={pickSchemaFile}
              />
            )}

            <div className="acs-run-row">
              <button
                type="button"
                className="acs-btn acs-btn-accent"
                onClick={runPrediction}
                disabled={running || modelLoading || !model}
              >
                {running ? "Running…" : "Run on Replicate"}
              </button>
              <span className="acs-run-hint">
                Calls Replicate. Cost varies by model. One render per click.
              </span>
            </div>
            {runError && <div className="acs-error">{runError}</div>}
          </div>
        )}
      </section>

      {/* Output */}
      <section className="acs-section">
        <div className="acs-section-head">
          <div className="acs-section-eyebrow">▸ OUTPUT</div>
          <div className="acs-section-title">
            {lastResult ? `Status: ${lastResult.status}` : "Run or import to save"}
          </div>
          <div className="acs-section-meta">
            Saves land in <code>data/{clientSlug}/creatives/</code>. Step is marked done on the first save or import.
          </div>
        </div>
        <div className="acs-section-body">
          {/* Import existing — always visible */}
          <div className="acs-import-row">
            <div className="acs-import-text">
              <div className="acs-import-title">Already generated something?</div>
              <div className="acs-import-sub">
                Import PNGs / JPGs you made elsewhere straight into this client's creatives folder.
              </div>
            </div>
            <button
              type="button"
              className="acs-btn acs-btn-primary"
              onClick={importExisting}
              disabled={importing}
            >
              {importing ? "Importing…" : "Import existing images"}
            </button>
          </div>
          {importError && <div className="acs-error acs-error-sm">{importError}</div>}

          {!lastResult && outputUrls.length === 0 && (
            <div className="acs-placeholder">No Replicate output yet. Run when you're ready, or import an existing image above.</div>
          )}
          {lastResult && outputUrls.length === 0 && Boolean(lastResult.output) && (
            <pre className="acs-text-output">
              {typeof lastResult.output === "string"
                ? lastResult.output
                : JSON.stringify(lastResult.output, null, 2)}
            </pre>
          )}
          {outputUrls.length > 0 && (
            <div className="acs-output-grid">
              {outputUrls.map((url, idx) => (
                <div key={url + idx} className="acs-output-tile">
                  <div className="acs-output-media">
                    {isVideoUrl(url) ? (
                      <video src={url} controls />
                    ) : (
                      <img src={url} alt={`output ${idx + 1}`} />
                    )}
                  </div>
                  <div className="acs-output-actions">
                    <button
                      type="button"
                      className="acs-btn"
                      onClick={() => void openUrl(url)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="acs-btn acs-btn-accent"
                      onClick={() => saveOutput(url, idx)}
                      disabled={saving === url}
                    >
                      {saving === url ? "Saving…" : "Save to client"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {saveError && <div className="acs-error">{saveError}</div>}

          {savedThisSession.length > 0 && (
            <div className="acs-saved">
              <div className="acs-saved-head">
                <div className="acs-saved-title">
                  Saved this session ({savedThisSession.length})
                </div>
                <div className="acs-drive-target">
                  <label className="acs-drive-label">Drive folder</label>
                  <select
                    className="acs-drive-select"
                    value={folderTarget?.id ?? ""}
                    onChange={(e) => onPickFolder(e.target.value)}
                  >
                    <option value="">Not set</option>
                    {driveFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="acs-btn acs-btn-accent acs-btn-sm"
                    onClick={() => void pushAllUnsynced()}
                    disabled={
                      pushAllInFlight ||
                      !folderTarget ||
                      savedThisSession.every((s) => Boolean(s.driveUrl))
                    }
                    title="Push every saved file that hasn't been pushed yet."
                  >
                    {pushAllInFlight ? "Pushing…" : "Push all to Drive"}
                  </button>
                </div>
              </div>
              <ul>
                {savedThisSession.map((s) => {
                  const pushing = pushingPaths.has(s.savedPath);
                  return (
                    <li key={s.savedPath} className="acs-saved-row">
                      <div className="acs-saved-thumb">
                        {s.previewUrl ? (
                          <img src={s.previewUrl} alt={s.filename} />
                        ) : (
                          <div className="acs-saved-thumb-empty">▸</div>
                        )}
                      </div>
                      <div className="acs-saved-meta-line">
                        <code>{s.filename}</code>{" "}
                        <span className="acs-saved-meta">
                          · {s.imported ? "imported" : "replicate"}
                        </span>
                      </div>
                      <div className="acs-saved-actions">
                        {onSendCreativeToTree && (
                          <button
                            type="button"
                            className="acs-btn acs-btn-sm"
                            onClick={() =>
                              onSendCreativeToTree({
                                savedPath: s.savedPath,
                                filename: s.filename,
                                previewUrl: s.previewUrl,
                              })
                            }
                            title="Send to campaign tree — click an ad slot to attach."
                          >
                            ↗ To tree
                          </button>
                        )}
                        {s.driveUrl ? (
                          <a
                            href={s.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="acs-drive-pill is-ok"
                            title="Open in Drive"
                            onClick={(e) => {
                              e.preventDefault();
                              if (s.driveUrl) void openUrl(s.driveUrl);
                            }}
                          >
                            ✓ Drive
                          </a>
                        ) : s.drivePushError ? (
                          <button
                            type="button"
                            className="acs-drive-pill is-error"
                            title={s.drivePushError}
                            onClick={() => void pushOne(s)}
                            disabled={pushing || !folderTarget}
                          >
                            ↻ Retry
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="acs-btn acs-btn-sm"
                            onClick={() => void pushOne(s)}
                            disabled={pushing || !folderTarget}
                            title={
                              folderTarget
                                ? "Push this file to the selected Drive folder."
                                : "Pick a Drive folder first."
                            }
                          >
                            {pushing ? "Pushing…" : "Push to Drive"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {pushError && <div className="acs-error acs-error-sm">{pushError}</div>}
              <div className="acs-step-done-row">
                <button
                  type="button"
                  className="acs-btn acs-btn-primary"
                  onClick={markStepDone}
                  disabled={!pendingStepOutput || stepHandedOff}
                  title={
                    stepHandedOff
                      ? "Step already marked done."
                      : "Mark this wizard step done and continue."
                  }
                >
                  {stepHandedOff ? "Step done ✓" : "Mark step done & continue →"}
                </button>
                <span className="acs-step-done-hint">
                  {stepHandedOff
                    ? "Wizard advanced. You can still push more files to Drive above."
                    : "Pushes above stay available either way."}
                </span>
              </div>
            </div>
          )}

          {lastResult?.logs && (
            <details className="acs-logs">
              <summary>Logs</summary>
              <pre>{lastResult.logs}</pre>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

interface SchemaFormProps {
  schemas: Schemas;
  values: Record<string, FieldValue>;
  onChange: (key: string, value: FieldValue) => void;
  onPickFile: (key: string) => void;
}

function SchemaForm({ schemas, values, onChange, onPickFile }: SchemaFormProps) {
  const inputSchema = schemas["Input"] ?? schemas["input"];
  if (!inputSchema?.properties) {
    return <div className="acs-placeholder">No input schema available.</div>;
  }
  const required = new Set(inputSchema.required ?? []);
  const entries = sortedEntries(inputSchema.properties);
  return (
    <div className="acs-schema-form">
      {entries.map(([key, node]) => (
        <SchemaField
          key={key}
          fieldKey={key}
          node={node}
          schemas={schemas}
          required={required.has(key)}
          value={values[key]}
          onChange={(v) => onChange(key, v)}
          onPickFile={() => onPickFile(key)}
        />
      ))}
    </div>
  );
}

interface SchemaFieldProps {
  fieldKey: string;
  node: SchemaNode;
  schemas: Schemas;
  required: boolean;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  onPickFile: () => void;
}

function SchemaField({
  fieldKey,
  node,
  schemas,
  required,
  value,
  onChange,
  onPickFile,
}: SchemaFieldProps) {
  const label = pickHumanLabel(fieldKey, node);
  const enumValues = resolveEnum(node, schemas);

  let control: React.ReactNode = null;

  if (enumValues) {
    control = (
      <select
        className="acs-input"
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {enumValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  } else if (node.type === "boolean") {
    control = (
      <label className="acs-checkbox">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{value ? "on" : "off"}</span>
      </label>
    );
  } else if (node.type === "integer" || node.type === "number") {
    control = (
      <input
        type="number"
        className="acs-input"
        value={value == null ? "" : String(value)}
        min={node.minimum}
        max={node.maximum}
        step={node.type === "integer" ? 1 : "any"}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange("");
          const n = node.type === "integer" ? parseInt(raw, 10) : parseFloat(raw);
          onChange(Number.isNaN(n) ? "" : n);
        }}
      />
    );
  } else if (node.format === "uri") {
    const v = value == null ? "" : String(value);
    const isDataUri = v.startsWith("data:");
    control = (
      <div className="acs-file-row">
        <input
          type="text"
          className="acs-input acs-input-flex"
          placeholder="https://… or pick a file"
          value={isDataUri ? "" : v}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="acs-btn" onClick={onPickFile}>
          {isDataUri ? "Replace" : "Pick file…"}
        </button>
        {isDataUri && (
          <button
            type="button"
            className="acs-btn acs-btn-quiet"
            onClick={() => onChange("")}
          >
            Clear
          </button>
        )}
      </div>
    );
  } else {
    const v = value == null ? "" : String(value);
    const long =
      (node.description?.length ?? 0) > 60 ||
      /prompt|text|description/i.test(fieldKey);
    control = long ? (
      <textarea
        className="acs-input acs-textarea"
        rows={4}
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <input
        type="text"
        className="acs-input"
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="acs-schema-field">
      <div className="acs-schema-label-row">
        <label className="acs-field-label">{label}</label>
        {required && <span className="acs-field-required">required</span>}
        <code className="acs-field-key">{fieldKey}</code>
      </div>
      {control}
      {node.description && <div className="acs-field-help">{node.description}</div>}
    </div>
  );
}

// ── CSS ──────────────────────────────────────────────────────

const ACS_CSS = `
.acs-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--hml-text-primary);
  font-family: var(--hml-font-sans, var(--hml-font));
}

.acs-section {
  border: 1px solid var(--hml-border-subtle);
  background: var(--hml-bg-elev-1);
  border-radius: 10px;
  overflow: hidden;
}
.acs-section-head {
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--hml-border-subtle);
}
.acs-section-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--hml-text-tertiary);
  margin-bottom: 4px;
}
.acs-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--hml-text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.acs-section-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--hml-text-tertiary);
  line-height: 1.45;
}
.acs-section-meta code {
  font-family: var(--hml-font-mono);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  padding: 0 4px;
  border-radius: 3px;
}
.acs-section-body {
  padding: 14px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.acs-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acs-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--hml-text-secondary);
  letter-spacing: 0.01em;
}

.acs-input {
  width: 100%;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 8px 11px;
  color: var(--hml-text-primary);
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
}
.acs-input:focus {
  outline: none;
  border-color: var(--hml-accent-border);
}
.acs-textarea {
  resize: vertical;
  line-height: 1.5;
}
.acs-input-flex { flex: 1; }

.acs-default-tag {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--hml-accent-dim);
  color: var(--hml-accent);
  border: 1px solid var(--hml-accent-border);
}

.acs-link-btn {
  background: transparent;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  color: var(--hml-accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.acs-link-btn:hover {
  color: var(--hml-accent-bright);
}
.acs-meta-sep {
  color: var(--hml-text-quaternary);
  margin: 0 6px;
}

.acs-picker {
  padding: 14px 18px;
  border-bottom: 1px solid var(--hml-border-subtle);
  background: var(--hml-bg-elev-2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.acs-picker-search {
  display: flex;
  gap: 8px;
}
.acs-picker-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}
.acs-picker-card {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  display: flex;
  flex-direction: column;
  font-family: inherit;
}
.acs-picker-card:hover { border-color: var(--hml-border); }
.acs-picker-card.is-active { border-color: var(--hml-accent); }
.acs-picker-cover {
  aspect-ratio: 16 / 9;
  background: var(--hml-bg-elev-3);
  overflow: hidden;
}
.acs-picker-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.acs-picker-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--hml-text-quaternary);
}
.acs-picker-body {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.acs-picker-slug {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-primary);
}
.acs-picker-desc {
  font-size: 11px;
  color: var(--hml-text-tertiary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.acs-schema-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.acs-schema-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acs-schema-label-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.acs-field-required {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-amber);
  text-transform: uppercase;
}
.acs-field-key {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-quaternary);
  margin-left: auto;
}
.acs-field-help {
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
  line-height: 1.4;
}

.acs-file-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.acs-checkbox {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--hml-text-secondary);
}

.acs-btn {
  background: var(--hml-bg-elev-3);
  border: 1px solid var(--hml-border);
  color: var(--hml-text-primary);
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.acs-btn:hover { background: var(--hml-bg-elev-4, var(--hml-bg-elev-3)); }
.acs-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.acs-btn-primary {
  background: var(--hml-accent);
  border-color: var(--hml-accent);
  color: #0b0b0e;
}
.acs-btn-accent {
  background: var(--hml-teal);
  border-color: var(--hml-teal);
  color: #0b0b0e;
}
.acs-btn-quiet {
  background: transparent;
  border-color: var(--hml-border-subtle);
  color: var(--hml-text-tertiary);
}

.acs-run-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
}
.acs-run-hint {
  font-size: 12px;
  color: var(--hml-text-tertiary);
}

.acs-import-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border: 1px dashed var(--hml-accent-border);
  border-radius: 8px;
  background: var(--hml-accent-dim);
}
.acs-import-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.acs-import-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--hml-text-primary);
}
.acs-import-sub {
  font-size: 12px;
  color: var(--hml-text-tertiary);
  line-height: 1.45;
}

.acs-output-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.acs-output-tile {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.acs-output-media {
  aspect-ratio: 1 / 1;
  background: var(--hml-bg-elev-3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.acs-output-media img,
.acs-output-media video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.acs-output-actions {
  padding: 8px;
  display: flex;
  gap: 6px;
}
.acs-output-actions .acs-btn { flex: 1; padding: 6px 8px; font-size: 11.5px; }

.acs-text-output {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 10px 12px;
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  white-space: pre-wrap;
  max-height: 320px;
  overflow-y: auto;
}

.acs-saved {
  margin-top: 6px;
  padding: 10px 12px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
}
.acs-saved-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.acs-saved-title {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
}
.acs-drive-target {
  display: flex;
  align-items: center;
  gap: 8px;
}
.acs-drive-label {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
}
.acs-drive-select {
  font-family: var(--hml-font-sans);
  font-size: 12px;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--hml-border);
  background: var(--hml-bg-elev-1);
  color: var(--hml-text-primary);
  min-width: 160px;
}
.acs-saved ul {
  margin: 0;
  padding-left: 0;
  list-style: none;
  font-size: 12px;
  color: var(--hml-text-secondary);
}
.acs-saved-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px;
  border-top: 1px solid var(--hml-border-subtle);
}
.acs-saved-row:first-child { border-top: none; }
.acs-saved-thumb {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--hml-bg-elev-3);
  border: 1px solid var(--hml-border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
}
.acs-saved-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.acs-saved-thumb-empty {
  color: var(--hml-text-quaternary);
  font-size: 18px;
}
.acs-saved-meta-line { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acs-saved-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.acs-saved code {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-primary);
}
.acs-saved-meta {
  color: var(--hml-text-quaternary);
  font-size: 11px;
}
.acs-btn-sm {
  font-size: 10.5px;
  padding: 5px 10px;
}
.acs-drive-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid transparent;
  text-decoration: none;
  cursor: pointer;
  line-height: 1.5;
}
.acs-drive-pill.is-ok {
  border-color: var(--hml-green-border);
  background: var(--hml-green-bg);
  color: var(--hml-green);
}
.acs-drive-pill.is-ok:hover { filter: brightness(1.15); }
.acs-drive-pill.is-error {
  border-color: var(--hml-amber-border, var(--hml-border));
  background: var(--hml-amber-bg, var(--hml-bg-elev-3));
  color: var(--hml-amber, var(--hml-text-secondary));
}
.acs-drive-pill.is-error:hover { filter: brightness(1.1); }
.acs-error-sm {
  margin-top: 8px;
  font-size: 12px;
  padding: 8px 10px;
}

.acs-step-done-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--hml-border-subtle);
  flex-wrap: wrap;
}
.acs-step-done-hint {
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
}

.acs-logs {
  margin-top: 8px;
  font-size: 12px;
  color: var(--hml-text-tertiary);
}
.acs-logs pre {
  margin-top: 6px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 10px 12px;
  white-space: pre-wrap;
  max-height: 240px;
  overflow-y: auto;
  font-size: 11px;
}

.acs-placeholder {
  text-align: center;
  color: var(--hml-text-tertiary);
  padding: 24px;
  font-size: 13px;
}
.acs-placeholder h2 {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--hml-text-primary);
}

.acs-error {
  background: var(--hml-red-bg);
  border: 1px solid var(--hml-red-border);
  color: var(--hml-red);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
}
`;

export default AdCreativeStudio;
