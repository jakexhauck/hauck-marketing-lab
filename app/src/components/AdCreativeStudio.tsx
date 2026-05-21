/**
 * Ad Creative Studio. Replaces the legacy AD_CREATIVE form-and-Claude path
 * with a Replicate-backed builder scoped to the wizard's `ad-creative` step.
 *
 * Flow (one creative at a time, playground-style):
 *   1. Context section (auto-filled from chained data) — brand colors,
 *      visual style, do-nots, reference photo path, competitor intel.
 *   2. Ad-copy picker — parses the prior step's `Ad N` markdown blocks into
 *      clickable chips, click one to seed the prompt.
 *   3. Replicate workbench — default model is `google/nano-banana`; "Change
 *      model" reveals the Creative Studio search bar for a swap. For the
 *      default model we surface a curated form (prompt + aspect ratio +
 *      reference image); for swapped models we fall back to the full
 *      schema-driven inputs.
 *   4. Run → preview → Save to client. Each save lands the file in
 *      `<root>/data/<slug>/creatives/` and appends to an on-disk session
 *      manifest. First save also calls `onSaved` so the wizard ticks the
 *      step done.
 */

import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/tauri";
import type { FormValues } from "../lib/formConfigs";
import type {
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

interface AdCopyEntry {
  number: number;
  heading: string;
  body: string;
}

interface SavedCreative {
  savedPath: string;
  filename: string;
  sourceUrl: string;
  adNumber: number | null;
  aspect: string;
  promptExcerpt: string;
}

interface Props {
  root: string;
  clientName: string;
  clientSlug: string;
  /** Chained values produced by the wizard (ad_copy_markdown, visual_style, do_nots, …). */
  initialValues: Partial<FormValues>;
  /** Called after the first save so the wizard can mark the step done. */
  onSaved?: (output: GeneratorOutput) => void;
}

// ── Constants ────────────────────────────────────────────────

const DEFAULT_MODEL = { owner: "google", name: "nano-banana" };

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square · 1:1 · Feed" },
  { value: "9:16", label: "Vertical · 9:16 · Stories & Reels" },
  { value: "4:5", label: "Portrait · 4:5 · Feed tall" },
  { value: "16:9", label: "Landscape · 16:9 · Desktop right-rail" },
];

const ASPECT_TOKEN: Record<string, string> = {
  "1:1": "1x1",
  "9:16": "9x16",
  "4:5": "4x5",
  "16:9": "16x9",
};

// ── Helpers ──────────────────────────────────────────────────

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** Parse the prior step's free-form ad copy markdown into discrete "Ad N"
 *  blocks. Looks for headings of the form "## Ad 1", "### Ad 2 · …", etc.
 *  Each block keeps its body until the next "Ad N" heading. */
function parseAdBlocks(markdown: string): AdCopyEntry[] {
  if (!markdown.trim()) return [];
  const lines = markdown.split(/\r?\n/);
  const headingRe = /^#{1,4}\s*Ad\s*(\d+)\b\s*(.*)$/i;
  const out: AdCopyEntry[] = [];
  let current: AdCopyEntry | null = null;
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (current) out.push(current);
      const n = parseInt(m[1], 10);
      const trailing = (m[2] ?? "").replace(/^[·\s\-]+/, "").trim();
      current = {
        number: n,
        heading: trailing ? `Ad ${n} · ${trailing}` : `Ad ${n}`,
        body: "",
      };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) out.push(current);
  return out.map((e) => ({ ...e, body: e.body.trim() }));
}

/** Tight one-line excerpt of an ad copy block — first non-empty meaningful
 *  line, with markdown stripped. Used as the chip subtitle. */
function adExcerpt(entry: AdCopyEntry): string {
  const lines = entry.body.split(/\r?\n/).map((l) => l.trim());
  for (const raw of lines) {
    if (!raw) continue;
    const stripped = raw
      .replace(/^\*\*([^*]+)\*\*:?\s*/, "$1: ")
      .replace(/^[-*]\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/[_`]/g, "")
      .trim();
    if (stripped.length > 0) {
      return stripped.length > 90 ? stripped.slice(0, 89).trimEnd() + "…" : stripped;
    }
  }
  return "";
}

/** Compose the Replicate prompt for the picked ad + brand context. Mirrors
 *  the spirit of the old AD_CREATIVE prompt template but in plain prose,
 *  because Replicate models don't follow Claude-style structured prompts. */
function composePrompt(args: {
  ad: AdCopyEntry | null;
  business: string;
  visualStyle: string;
  brandColors: string;
  doNots: string;
  competitor: string;
  aspect: string;
}): string {
  const lines: string[] = [];
  lines.push(
    `Static ad creative for ${args.business || "a local business"}. Aspect ratio ${args.aspect}. Real-photo feel, phone-shot lighting. Render every word of on-image text inside the image — clean, legible typography, no post-production overlay.`,
  );
  if (args.ad) {
    lines.push("");
    lines.push(`AD COPY (render the key words inside the image):`);
    lines.push(args.ad.body);
  }
  if (args.visualStyle.trim()) {
    lines.push("");
    lines.push(`VISUAL STYLE: ${args.visualStyle.trim()}`);
  }
  if (args.brandColors.trim()) {
    lines.push(`BRAND COLORS + LOGO: ${args.brandColors.trim()}`);
  }
  if (args.doNots.trim()) {
    lines.push(`AVOID: ${args.doNots.trim()}`);
  }
  if (args.competitor.trim()) {
    lines.push(`PUSH AWAY FROM COMPETITORS: ${args.competitor.trim()}`);
  }
  lines.push("");
  lines.push(
    "Hard rules: no stock-photo gloss, no fake-model sheen, no generic AI sleekness, never use em dashes anywhere in any rendered text.",
  );
  return lines.join("\n");
}

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

function buildManifestBody(args: {
  modelSlug: string;
  business: string;
  saved: SavedCreative[];
}): string {
  const lines: string[] = [];
  lines.push(`# Static creatives · ${args.business || "Client"}`);
  lines.push("");
  lines.push(`**Model:** \`${args.modelSlug}\``);
  lines.push(`**Total renders:** ${args.saved.length}`);
  lines.push("");
  if (args.saved.length > 0) {
    lines.push("## Renders");
    lines.push("");
    for (const s of args.saved) {
      const ad = s.adNumber != null ? `Ad ${s.adNumber}` : "Custom";
      lines.push(`- \`${s.filename}\` · ${ad} · ${s.aspect} — ${s.promptExcerpt}`);
    }
  }
  return lines.join("\n");
}

// ── Component ────────────────────────────────────────────────

export function AdCreativeStudio({
  root,
  clientName,
  clientSlug,
  initialValues,
  onSaved,
}: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  // Context fields — seeded from chainFrom, editable inline.
  const [businessName, setBusinessName] = useState(clientName);
  const [visualStyle, setVisualStyle] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [doNots, setDoNots] = useState("");
  const [competitor, setCompetitor] = useState("");

  // Ad-copy picker.
  const adCopyMarkdown = asString(initialValues.ad_copy_markdown);
  const adBlocks = useMemo(() => parseAdBlocks(adCopyMarkdown), [adCopyMarkdown]);
  const [pickedAdNumber, setPickedAdNumber] = useState<number | null>(null);

  // Model state.
  const [model, setModel] = useState<ReplicateModelDetail | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReplicateModel[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Schema-driven inputs for swapped (non-default) models.
  const [schemaInputs, setSchemaInputs] = useState<Record<string, FieldValue>>({});

  // Default-model inputs.
  const [aspect, setAspect] = useState<string>("1:1");
  const [prompt, setPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string>("");

  // Run state.
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ReplicatePredictionResult | null>(null);

  // Save state — per-session manifest plus per-URL spinner.
  const [savedThisSession, setSavedThisSession] = useState<SavedCreative[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // Hydrate context fields from chainFrom only once on mount. Subsequent
  // user edits stick.
  useEffect(() => {
    setVisualStyle(asString(initialValues.visual_style));
    setDoNots(asString(initialValues.do_nots));
    setBrandColors(asString(initialValues.brand_colors));
    setCompetitor(asString(initialValues.competitor_intel));
    const biz = asString(initialValues.business_name);
    if (biz) setBusinessName(biz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Compose the prompt whenever the picked ad / context / aspect changes.
  // Default-model only — schema mode owns its own inputs.
  useEffect(() => {
    if (!isDefaultModel) return;
    const ad = adBlocks.find((b) => b.number === pickedAdNumber) ?? null;
    setPrompt(
      composePrompt({
        ad,
        business: businessName,
        visualStyle,
        brandColors,
        doNots,
        competitor,
        aspect,
      }),
    );
  }, [
    isDefaultModel,
    pickedAdNumber,
    adBlocks,
    businessName,
    visualStyle,
    brandColors,
    doNots,
    competitor,
    aspect,
  ]);

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

  const pickReferenceFile = useCallback(async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Image",
            extensions: ["png", "jpg", "jpeg", "webp"],
          },
        ],
      });
      if (!picked || typeof picked !== "string") return;
      const dataUri = await api.fileToDataUri(picked);
      setReferenceImage(dataUri);
    } catch (e) {
      setRunError(String(e));
    }
  }, []);

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
      let inputs: Record<string, unknown>;
      if (isDefaultModel) {
        // Curated mapping: prompt + aspect ratio + (optional) reference image.
        // Nano Banana's input field for reference images is `image_input`
        // (array of URIs). Keep the field shape forgiving so this still
        // works if Replicate ever renames it.
        inputs = {
          prompt,
          aspect_ratio: aspect,
        };
        if (referenceImage) {
          inputs.image_input = [referenceImage];
        }
      } else {
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
        inputs = cleaned;
      }

      const result = await api.runReplicatePrediction(
        token,
        model.owner,
        model.name,
        inputs,
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
  }, [
    token,
    model,
    isDefaultModel,
    prompt,
    aspect,
    referenceImage,
    schemaInputs,
  ]);

  const outputUrls = useMemo(() => extractUrls(lastResult?.output), [lastResult]);

  /** Save a single Replicate output URL to the client's creatives folder and
   *  refresh the on-disk session manifest. First save also calls `onSaved`
   *  so the wizard ticks the step done. */
  const saveOutput = useCallback(
    async (url: string, idx: number) => {
      if (!model) return;
      setSaving(url);
      setSaveError(null);
      try {
        const sep = root.includes("\\") ? "\\" : "/";
        const dir = `${root.replace(/[\\/]+$/, "")}${sep}data${sep}${clientSlug}${sep}creatives`;
        const adNumber = isDefaultModel ? pickedAdNumber : null;
        const aspectForStem = isDefaultModel ? aspect : "custom";
        const adToken = adNumber != null ? `ad-${adNumber}` : "freeform";
        const aspectStem = ASPECT_TOKEN[aspectForStem] ?? aspectForStem.replace(/[^a-z0-9]+/gi, "");
        const stamp = Date.now();
        const stem = `${adToken}-${aspectStem}-${stamp}-${idx + 1}`;
        const saved = await api.saveReplicateOutput(url, dir, stem);

        const promptExcerpt = (isDefaultModel ? prompt : String(schemaInputs.prompt ?? ""))
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);

        const entry: SavedCreative = {
          savedPath: saved.saved_path,
          filename: saved.filename,
          sourceUrl: saved.source_url,
          adNumber,
          aspect: isDefaultModel ? aspect : "custom",
          promptExcerpt,
        };
        const nextSaved = [...savedThisSession, entry];
        setSavedThisSession(nextSaved);

        // Refresh the on-disk session manifest. First save calls onSaved so
        // the wizard ticks the step done; later saves just rewrite the .md.
        const isFirst = savedThisSession.length === 0;
        const output = await api.saveGeneratorOutput({
          root,
          clientSlug,
          kind: "briefs",
          title: `Static creatives · ${clientName}`,
          summary: `${nextSaved.length} render${nextSaved.length === 1 ? "" : "s"} via ${model.owner}/${model.name}`,
          body: buildManifestBody({
            modelSlug: `${model.owner}/${model.name}`,
            business: clientName,
            saved: nextSaved,
          }),
          inputsYaml: null,
        });
        if (isFirst) onSaved?.(output);
      } catch (e) {
        setSaveError(String(e));
      } finally {
        setSaving(null);
      }
    },
    [
      model,
      root,
      clientSlug,
      clientName,
      isDefaultModel,
      pickedAdNumber,
      aspect,
      prompt,
      schemaInputs,
      savedThisSession,
      onSaved,
    ],
  );

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

      {/* Context block — collapsible would be nicer but auto mode says ship. */}
      <section className="acs-section">
        <div className="acs-section-head">
          <div className="acs-section-eyebrow">▸ CONTEXT</div>
          <div className="acs-section-title">Brand + style</div>
          <div className="acs-section-meta">
            Auto-filled from the creative brief. Edit inline if a render needs different guidance.
          </div>
        </div>
        <div className="acs-section-body">
          <div className="acs-grid-2">
            <Field label="Business name">
              <input
                className="acs-input"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </Field>
            <Field label="Brand colors + logo notes">
              <input
                className="acs-input"
                value={brandColors}
                placeholder="Primary navy #0B1E3F. Logo bottom-right."
                onChange={(e) => setBrandColors(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Visual style direction">
            <textarea
              className="acs-input acs-textarea"
              rows={2}
              value={visualStyle}
              placeholder="Real-photo feel. Phone-shot lighting. Warm afternoon sun."
              onChange={(e) => setVisualStyle(e.target.value)}
            />
          </Field>
          <Field label="Do-nots">
            <textarea
              className="acs-input acs-textarea"
              rows={2}
              value={doNots}
              placeholder="No stock-photo gloss. No fake-model sheen. No generic AI look."
              onChange={(e) => setDoNots(e.target.value)}
            />
          </Field>
          <Field label="Competitor intel (optional)">
            <textarea
              className="acs-input acs-textarea"
              rows={2}
              value={competitor}
              placeholder="Local competitors leaning hard into stock imagery — push toward real homes."
              onChange={(e) => setCompetitor(e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* Ad copy picker */}
      <section className="acs-section">
        <div className="acs-section-head">
          <div className="acs-section-eyebrow">▸ AD COPY</div>
          <div className="acs-section-title">
            {adBlocks.length > 0
              ? `Pick the variation to render (${adBlocks.length} from the prior step)`
              : "No prior ad-copy step found"}
          </div>
          <div className="acs-section-meta">
            Clicking a chip seeds the prompt below. You can still edit the prompt before running.
          </div>
        </div>
        <div className="acs-section-body">
          {adBlocks.length === 0 ? (
            <div className="acs-empty-inline">
              Run the Ad Copy step first to seed variations here, or write a custom prompt below.
            </div>
          ) : (
            <div className="acs-ad-chips">
              {adBlocks.map((entry) => {
                const active = entry.number === pickedAdNumber;
                return (
                  <button
                    type="button"
                    key={entry.number}
                    className={`acs-ad-chip${active ? " is-active" : ""}`}
                    onClick={() => setPickedAdNumber(entry.number)}
                  >
                    <div className="acs-ad-chip-label">{entry.heading}</div>
                    <div className="acs-ad-chip-sub">{adExcerpt(entry)}</div>
                  </button>
                );
              })}
              {pickedAdNumber !== null && (
                <button
                  type="button"
                  className="acs-ad-chip acs-ad-chip-clear"
                  onClick={() => setPickedAdNumber(null)}
                  title="Clear ad pick — write a freeform prompt"
                >
                  Clear pick
                </button>
              )}
            </div>
          )}
        </div>
      </section>

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
            {isDefaultModel ? (
              <>
                <Field label="Aspect ratio">
                  <div className="acs-aspect-row">
                    {ASPECT_RATIOS.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        className={`acs-aspect-btn${aspect === opt.value ? " is-active" : ""}`}
                        onClick={() => setAspect(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Prompt (auto-composed, editable)">
                  <textarea
                    className="acs-input acs-textarea"
                    rows={10}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </Field>
                <Field label="Reference image (optional)">
                  <div className="acs-file-row">
                    <div className="acs-file-status">
                      {referenceImage
                        ? "✓ Reference loaded"
                        : "No reference attached"}
                    </div>
                    <button type="button" className="acs-btn" onClick={pickReferenceFile}>
                      {referenceImage ? "Replace" : "Pick file…"}
                    </button>
                    {referenceImage && (
                      <button
                        type="button"
                        className="acs-btn acs-btn-quiet"
                        onClick={() => setReferenceImage("")}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </Field>
              </>
            ) : modelLoading ? (
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
            {lastResult ? `Status: ${lastResult.status}` : "Run to generate"}
          </div>
          <div className="acs-section-meta">
            Saves land in <code>data/{clientSlug}/creatives/</code>. Step is marked done on the first save.
          </div>
        </div>
        <div className="acs-section-body">
          {!lastResult && (
            <div className="acs-placeholder">No output yet. Run when you're ready.</div>
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
                      onClick={() => window.open(url, "_blank")}
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
              <div className="acs-saved-title">
                Saved this session ({savedThisSession.length})
              </div>
              <ul>
                {savedThisSession.map((s) => (
                  <li key={s.savedPath}>
                    <code>{s.filename}</code>{" "}
                    <span className="acs-saved-meta">
                      · {s.adNumber != null ? `Ad ${s.adNumber}` : "Freeform"} · {s.aspect}
                    </span>
                  </li>
                ))}
              </ul>
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

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="acs-field">
      <label className="acs-field-label">{props.label}</label>
      {props.children}
    </div>
  );
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

.acs-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 720px) {
  .acs-grid-2 { grid-template-columns: 1fr; }
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

.acs-empty-inline {
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
  padding: 8px 12px;
  border: 1px dashed var(--hml-border-subtle);
  border-radius: 6px;
  background: var(--hml-bg-elev-2);
}

.acs-ad-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.acs-ad-chip {
  text-align: left;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  padding: 10px 12px;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 120ms ease, background 120ms ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.acs-ad-chip:hover {
  border-color: var(--hml-border);
}
.acs-ad-chip.is-active {
  border-color: var(--hml-accent-border);
  background: var(--hml-accent-dim);
}
.acs-ad-chip-label {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--hml-text-primary);
  letter-spacing: 0.02em;
}
.acs-ad-chip-sub {
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.acs-ad-chip-clear {
  align-items: center;
  justify-content: center;
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.acs-aspect-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.acs-aspect-btn {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}
.acs-aspect-btn:hover {
  border-color: var(--hml-border);
  color: var(--hml-text-primary);
}
.acs-aspect-btn.is-active {
  border-color: var(--hml-accent-border);
  background: var(--hml-accent-dim);
  color: var(--hml-accent);
}

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
.acs-file-status {
  flex: 1;
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
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
.acs-saved-title {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.acs-saved ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--hml-text-secondary);
}
.acs-saved code {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-primary);
}
.acs-saved-meta {
  color: var(--hml-text-quaternary);
  font-size: 11px;
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
