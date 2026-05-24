/**
 * Creative Studio — Replicate playground inside the HML app.
 *
 * Mirrors replicate.com's per-model playground: search for a model on top,
 * pick one, the input form below is schema-driven (rendered from the model's
 * OpenAPI schema), output preview on the right, save outputs to a client
 * folder.
 *
 * Replaces the legacy AD_CREATIVE form. Replicate token comes from
 * `AppConfig.replicate_api_token` (set in Settings).
 */

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/tauri";
import type {
  ClientEntry,
  ReplicateModel,
  ReplicateModelDetail,
  ReplicatePredictionResult,
  ReplicateSavedOutput,
} from "../../lib/types";

interface Props {
  root: string;
  clients: ClientEntry[];
  activeClientSlug: string | null;
}

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

const PLACEHOLDER_RESULTS: ReplicateModel[] = [];

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
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CreativeStudio({ root, clients, activeClientSlug }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] =
    useState<ReplicateModel[]>(PLACEHOLDER_RESULTS);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReplicateModelDetail | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [inputs, setInputs] = useState<Record<string, FieldValue>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastResult, setLastResult] =
    useState<ReplicatePredictionResult | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedOutputs, setSavedOutputs] = useState<ReplicateSavedOutput[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [targetClientSlug, setTargetClientSlug] = useState<string>(
    activeClientSlug ?? "",
  );

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

  useEffect(() => {
    setTargetClientSlug(activeClientSlug ?? "");
  }, [activeClientSlug]);

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

  const pickModel = useCallback(
    async (model: ReplicateModel) => {
      if (!token) return;
      setLoadingModel(true);
      setRunError(null);
      setLastResult(null);
      try {
        const detail = await api.getReplicateModel(
          token,
          model.owner,
          model.name,
        );
        setSelected(detail);
        const schemas = (detail.input_schema as Schemas) ?? {};
        const inputSchema = schemas["Input"] ?? schemas["input"];
        const props = inputSchema?.properties ?? {};
        const initial: Record<string, FieldValue> = {};
        for (const [k, v] of Object.entries(props)) {
          initial[k] = fieldDefault(v, schemas);
        }
        setInputs(initial);
      } catch (e) {
        setRunError(String(e));
      } finally {
        setLoadingModel(false);
      }
    },
    [token],
  );

  const updateInput = useCallback((key: string, value: FieldValue) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handlePickFile = useCallback(
    async (key: string) => {
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
        updateInput(key, dataUri);
      } catch (e) {
        setRunError(String(e));
      }
    },
    [updateInput],
  );

  const runPrediction = useCallback(async () => {
    if (!token || !selected) return;
    setRunning(true);
    setRunError(null);
    setLastResult(null);
    setSavedOutputs([]);
    setSaveError(null);
    try {
      // Strip blank optional fields so Replicate falls back to its own defaults.
      const schemas = (selected.input_schema as Schemas) ?? {};
      const inputSchema = schemas["Input"] ?? schemas["input"];
      const required = new Set(inputSchema?.required ?? []);
      const cleanInputs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inputs)) {
        if (v === "" || v === null) {
          if (required.has(k)) cleanInputs[k] = v;
          continue;
        }
        cleanInputs[k] = v;
      }
      const result = await api.runReplicatePrediction(
        token,
        selected.owner,
        selected.name,
        cleanInputs,
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
  }, [token, selected, inputs]);

  const outputUrls = useMemo(() => extractUrls(lastResult?.output), [lastResult]);

  const saveOutput = useCallback(
    async (url: string, idx: number) => {
      if (!selected) return;
      if (!targetClientSlug) {
        setSaveError("Pick a client to save into first.");
        return;
      }
      setSaving(url);
      setSaveError(null);
      try {
        const slug = `${selected.owner}-${selected.name}`.replace(
          /[^a-z0-9-]+/gi,
          "-",
        );
        const stem = `${Date.now()}-${slug}-${idx + 1}`;
        const dir = `${root.replace(/[\\/]+$/, "")}${root.includes("\\") ? "\\" : "/"}data${root.includes("\\") ? "\\" : "/"}${targetClientSlug}${root.includes("\\") ? "\\" : "/"}creatives`;
        const saved = await api.saveReplicateOutput(url, dir, stem);
        setSavedOutputs((prev) => [...prev, saved]);
      } catch (e) {
        setSaveError(String(e));
      } finally {
        setSaving(null);
      }
    },
    [selected, root, targetClientSlug],
  );

  if (tokenLoading) {
    return (
      <div className="cs-shell">
        <style>{studioCSS}</style>
        <div className="cs-placeholder">Loading…</div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="cs-shell">
        <style>{studioCSS}</style>
        <div className="cs-placeholder">
          <h2>Replicate not connected</h2>
          <p>
            Add your Replicate API token in Settings → Replicate. Grab one at{" "}
            <code>replicate.com/account/api-tokens</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="cs-shell">
      <style>{studioCSS}</style>
      <header className="cs-header">
        <div className="cs-header-text">
          <div className="cs-eyebrow">▸ CREATIVE STUDIO</div>
          <h1 className="cs-title">Replicate Playground</h1>
          <p className="cs-subtitle">
            Search any model on Replicate, run it with your own inputs, save
            the output to a client folder.
          </p>
        </div>
        <div className="cs-header-meta">
          <span className="cs-status-dot" />
          <span>Token connected</span>
        </div>
      </header>

      {/* Search ───────────────────────────────── */}
      <section className="cs-search-bar">
        <input
          type="text"
          className="cs-search-input"
          placeholder="Search Replicate models — try 'nano banana', 'flux', 'kontext'…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
        />
        <button
          type="button"
          className="cs-btn cs-btn-primary"
          onClick={runSearch}
          disabled={searching}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </section>

      {searchError && <div className="cs-error">{searchError}</div>}

      {searchResults.length > 0 && (
        <section className="cs-results">
          {searchResults.slice(0, 18).map((m) => {
            const slug = `${m.owner}/${m.name}`;
            const active =
              selected &&
              selected.owner === m.owner &&
              selected.name === m.name;
            return (
              <button
                type="button"
                key={slug}
                className={`cs-model-card${active ? " cs-active" : ""}`}
                onClick={() => pickModel(m)}
              >
                <div className="cs-model-cover">
                  {m.cover_image_url ? (
                    <img src={m.cover_image_url} alt={slug} />
                  ) : (
                    <div className="cs-model-cover-empty">▸</div>
                  )}
                </div>
                <div className="cs-model-body">
                  <div className="cs-model-slug">{slug}</div>
                  <div className="cs-model-desc">
                    {m.description ?? "No description"}
                  </div>
                  {typeof m.run_count === "number" && (
                    <div className="cs-model-meta">
                      {m.run_count.toLocaleString()} runs
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Workbench ───────────────────────────── */}
      {selected && (
        <section className="cs-workbench">
          <div className="cs-pane cs-pane-inputs">
            <div className="cs-pane-header">
              <div>
                <div className="cs-pane-eyebrow">INPUTS</div>
                <div className="cs-pane-title">
                  {selected.owner}/{selected.name}
                </div>
                {selected.description && (
                  <div className="cs-pane-desc">{selected.description}</div>
                )}
              </div>
            </div>
            <div className="cs-pane-body">
              {loadingModel ? (
                <div className="cs-placeholder">Loading schema…</div>
              ) : (
                <SchemaForm
                  schemas={(selected.input_schema as Schemas) ?? {}}
                  values={inputs}
                  onChange={updateInput}
                  onPickFile={handlePickFile}
                />
              )}
              <div className="cs-run-row">
                <button
                  type="button"
                  className="cs-btn cs-btn-accent"
                  onClick={runPrediction}
                  disabled={running || loadingModel}
                >
                  {running ? "Running…" : "Run"}
                </button>
                <span className="cs-run-hint">
                  Calls Replicate. Cost varies by model.
                </span>
              </div>
              {runError && <div className="cs-error">{runError}</div>}
            </div>
          </div>

          <div className="cs-pane cs-pane-output">
            <div className="cs-pane-header">
              <div>
                <div className="cs-pane-eyebrow">OUTPUT</div>
                <div className="cs-pane-title">
                  {lastResult
                    ? `Status: ${lastResult.status}`
                    : "Run to generate"}
                </div>
              </div>
              <div className="cs-save-controls">
                <label className="cs-label-inline">Save to client:</label>
                <select
                  value={targetClientSlug}
                  onChange={(e) => setTargetClientSlug(e.target.value)}
                  className="cs-select-inline"
                >
                  <option value="">— pick client —</option>
                  {clients.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="cs-pane-body">
              {!lastResult && (
                <div className="cs-placeholder">No output yet.</div>
              )}
              {lastResult && outputUrls.length === 0 && Boolean(lastResult.output) && (
                <pre className="cs-text-output">
                  {typeof lastResult.output === "string"
                    ? lastResult.output
                    : JSON.stringify(lastResult.output, null, 2)}
                </pre>
              )}
              {outputUrls.length > 0 && (
                <div className="cs-output-grid">
                  {outputUrls.map((url, idx) => (
                    <div key={url + idx} className="cs-output-tile">
                      <div className="cs-output-media">
                        {isVideoUrl(url) ? (
                          <video src={url} controls />
                        ) : (
                          <img src={url} alt={`output ${idx + 1}`} />
                        )}
                      </div>
                      <div className="cs-output-actions">
                        <button
                          type="button"
                          className="cs-btn"
                          onClick={() => void openUrl(url)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="cs-btn cs-btn-accent"
                          onClick={() => saveOutput(url, idx)}
                          disabled={saving === url || !targetClientSlug}
                        >
                          {saving === url ? "Saving…" : "Save to client"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {saveError && <div className="cs-error">{saveError}</div>}
              {savedOutputs.length > 0 && (
                <div className="cs-saved">
                  <div className="cs-saved-title">Saved this session</div>
                  <ul>
                    {savedOutputs.map((s) => (
                      <li key={s.saved_path}>
                        <code>{s.saved_path}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lastResult?.logs && (
                <details className="cs-logs">
                  <summary>Logs</summary>
                  <pre>{lastResult.logs}</pre>
                </details>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Schema-driven form ──────────────────────────────────

interface SchemaFormProps {
  schemas: Schemas;
  values: Record<string, FieldValue>;
  onChange: (key: string, value: FieldValue) => void;
  onPickFile: (key: string) => void;
}

function SchemaForm({ schemas, values, onChange, onPickFile }: SchemaFormProps) {
  const inputSchema = schemas["Input"] ?? schemas["input"];
  if (!inputSchema?.properties) {
    return <div className="cs-placeholder">No input schema available.</div>;
  }
  const required = new Set(inputSchema.required ?? []);
  const entries = sortedEntries(inputSchema.properties);
  return (
    <div className="cs-form">
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
        className="cs-input"
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
      <label className="cs-checkbox">
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
        className="cs-input"
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
      <div className="cs-file-row">
        <input
          type="text"
          className="cs-input cs-input-flex"
          placeholder="https://… or pick a file"
          value={isDataUri ? "" : v}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="cs-btn"
          onClick={onPickFile}
        >
          {isDataUri ? "Replace file" : "Pick file…"}
        </button>
        {isDataUri && (
          <button
            type="button"
            className="cs-btn cs-btn-quiet"
            onClick={() => onChange("")}
          >
            Clear
          </button>
        )}
      </div>
    );
  } else {
    const v = value == null ? "" : String(value);
    const long = (node.description?.length ?? 0) > 60 || /prompt|text|description/i.test(fieldKey);
    control = long ? (
      <textarea
        className="cs-input cs-textarea"
        rows={4}
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <input
        type="text"
        className="cs-input"
        value={v}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="cs-field">
      <div className="cs-field-label-row">
        <label className="cs-field-label">{label}</label>
        {required && <span className="cs-field-required">required</span>}
        <code className="cs-field-key">{fieldKey}</code>
      </div>
      {control}
      {node.description && (
        <div className="cs-field-help">{node.description}</div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function extractUrls(output: unknown): string[] {
  if (!output) return [];
  if (typeof output === "string") return isLikelyUrl(output) ? [output] : [];
  if (Array.isArray(output)) {
    return output
      .filter((v): v is string => typeof v === "string" && isLikelyUrl(v));
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

// ── CSS ──────────────────────────────────────────────────

const studioCSS = `
.cs-shell {
  padding: 22px 28px 60px;
  color: var(--hml-text-primary);
  font-family: var(--hml-font);
}

.cs-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}
.cs-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--hml-text-tertiary);
  margin-bottom: 6px;
}
.cs-title {
  font-size: 26px;
  font-weight: 600;
  margin: 0 0 6px;
}
.cs-subtitle {
  margin: 0;
  color: var(--hml-text-tertiary);
  max-width: 640px;
  line-height: 1.5;
}
.cs-header-meta {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.cs-status-dot {
  width: 8px; height: 8px;
  background: var(--hml-green);
  border-radius: 50%;
  display: inline-block;
}

.cs-search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}
.cs-search-input {
  flex: 1;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  padding: 11px 14px;
  color: var(--hml-text-primary);
  font-size: 14px;
  font-family: inherit;
}
.cs-search-input:focus {
  outline: none;
  border-color: var(--hml-accent-border);
}

.cs-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.cs-model-card {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  overflow: hidden;
  padding: 0;
  text-align: left;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: border-color 0.12s ease, transform 0.12s ease;
  font-family: inherit;
}
.cs-model-card:hover {
  border-color: var(--hml-border);
  transform: translateY(-1px);
}
.cs-model-card.cs-active {
  border-color: var(--hml-accent);
  background: var(--hml-accent-dim);
}
.cs-model-cover {
  aspect-ratio: 16 / 9;
  background: var(--hml-bg-elev-3);
  overflow: hidden;
}
.cs-model-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cs-model-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--hml-text-quaternary);
  font-size: 24px;
}
.cs-model-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 80px;
}
.cs-model-slug {
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-primary);
  font-weight: 500;
}
.cs-model-desc {
  font-size: 12px;
  color: var(--hml-text-tertiary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cs-model-meta {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-quaternary);
  margin-top: auto;
}

.cs-workbench {
  display: grid;
  grid-template-columns: minmax(340px, 1fr) minmax(380px, 1fr);
  gap: 16px;
}
@media (max-width: 1180px) {
  .cs-workbench {
    grid-template-columns: 1fr;
  }
}

.cs-pane {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  min-height: 480px;
}
.cs-pane-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--hml-border-subtle);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.cs-pane-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--hml-text-tertiary);
  margin-bottom: 4px;
}
.cs-pane-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--hml-text-primary);
  word-break: break-word;
}
.cs-pane-desc {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
  line-height: 1.5;
}
.cs-pane-body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.cs-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cs-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cs-field-label-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.cs-field-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--hml-text-primary);
}
.cs-field-required {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-amber);
  text-transform: uppercase;
}
.cs-field-key {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-quaternary);
  margin-left: auto;
}
.cs-field-help {
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
  line-height: 1.45;
}

.cs-input {
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
.cs-input:focus {
  outline: none;
  border-color: var(--hml-accent-border);
}
.cs-textarea {
  resize: vertical;
  font-family: var(--hml-font);
  line-height: 1.5;
}
.cs-input-flex { flex: 1; }
.cs-file-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.cs-checkbox {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--hml-text-secondary);
}

.cs-run-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
}
.cs-run-hint {
  font-size: 12px;
  color: var(--hml-text-tertiary);
}

.cs-btn {
  background: var(--hml-bg-elev-3);
  border: 1px solid var(--hml-border);
  color: var(--hml-text-primary);
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.cs-btn:hover { background: var(--hml-bg-elev-4, var(--hml-bg-elev-3)); }
.cs-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cs-btn-primary {
  background: var(--hml-accent);
  border-color: var(--hml-accent);
  color: #0b0b0e;
}
.cs-btn-accent {
  background: var(--hml-teal);
  border-color: var(--hml-teal);
  color: #0b0b0e;
}
.cs-btn-quiet {
  background: transparent;
  border-color: var(--hml-border-subtle);
  color: var(--hml-text-tertiary);
}

.cs-save-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cs-label-inline {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
}
.cs-select-inline {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--hml-text-primary);
  font-size: 12px;
  font-family: inherit;
}

.cs-output-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.cs-output-tile {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.cs-output-media {
  aspect-ratio: 1 / 1;
  background: var(--hml-bg-elev-3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cs-output-media img,
.cs-output-media video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cs-output-actions {
  padding: 8px;
  display: flex;
  gap: 6px;
}
.cs-output-actions .cs-btn { flex: 1; padding: 6px 8px; font-size: 11.5px; }

.cs-text-output {
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

.cs-saved {
  margin-top: 14px;
  padding: 10px 12px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
}
.cs-saved-title {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.cs-saved ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--hml-text-secondary);
}
.cs-saved code {
  font-family: var(--hml-font-mono);
  font-size: 11px;
}

.cs-logs {
  margin-top: 12px;
  font-size: 12px;
  color: var(--hml-text-tertiary);
}
.cs-logs pre {
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

.cs-placeholder {
  text-align: center;
  color: var(--hml-text-tertiary);
  padding: 40px 24px;
  font-size: 14px;
}
.cs-placeholder h2 {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--hml-text-primary);
}

.cs-error {
  background: var(--hml-red-bg);
  border: 1px solid var(--hml-red-border);
  color: var(--hml-red);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 6px;
}
`;
