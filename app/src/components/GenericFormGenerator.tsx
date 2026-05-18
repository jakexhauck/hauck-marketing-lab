import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { openInAppWindow } from "../lib/openInApp";
import {
  nicheFromFront,
  parseProfileBody,
  profilePathFor,
} from "../lib/clientProfile";
import {
  defaultValuesFor,
  type FormConfig,
  type FormField,
  type FormValues,
} from "../lib/formConfigs";
import { resolvePrefills, type PrefillSource } from "../lib/playbooks";
import { assembleGenericPrompt, buildInputsYaml } from "../lib/genericPrompt";
import type {
  AgentSummary,
  GeneratorOutput,
  KnowledgeChunk,
  StreamEvent,
} from "../lib/types";
import { PastResults } from "./generators/PastResults";
import { FormOutput } from "./forms/FormOutput";

type Props = {
  config: FormConfig;
  root: string;
  agents: AgentSummary[];
  clientName: string;
  clientSlug: string;
  onClose: () => void;
  /** Override values to seed the form with. Applied AFTER defaults + Profile.md
   *  prefill, so chained values from a prior sequence step take precedence. */
  initialValues?: Partial<FormValues>;
  /** Fires the moment a generator output is saved to disk. Lets parent
   *  surfaces (e.g. ClientSequence) advance the stepper without polling. */
  onSaved?: (output: GeneratorOutput) => void;
};

function findAgent(agents: AgentSummary[], slug: string): AgentSummary | null {
  const lc = slug.toLowerCase();
  return (
    agents.find((a) => a.slug.toLowerCase() === lc) ??
    agents.find((a) => a.name.toLowerCase() === lc) ??
    null
  );
}

function extractJson(src: string): Record<string, unknown> | null {
  const startIdx = src.indexOf("```json");
  if (startIdx === -1) return null;
  const after = src.slice(startIdx + "```json".length).replace(/^\n/, "");
  const endIdx = after.indexOf("```");
  if (endIdx === -1) return null;
  const block = after.slice(0, endIdx).trim();
  try {
    return JSON.parse(block) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Sanitise a string for use as a vault folder name. Matches the Rust side
 *  (vault_root + Clients/<name>); the client name is normally already safe
 *  but stripping path separators belt-and-braces. */
function safeFolder(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

type ParsedCreativePrompt = {
  filename?: string;
  aspect_ratio?: string;
  prompt?: string;
};

/** Pull the Nano Banana 2 prompts out of Claude's JSON block, call
 *  generate_creative_set, and return a markdown results block to append to
 *  the saved output. Catches everything so a Gemini failure does not block
 *  the brief from saving. */
async function runImageGeneration(
  finalText: string,
  parsedJson: Record<string, unknown> | null,
  root: string,
  clientName: string,
  setStreamText: (updater: (prev: string) => string) => void,
): Promise<string> {
  setStreamText((p) => p + "\n\n[Calling Nano Banana 2 …]\n");

  const promptsRaw = parsedJson?.prompts as unknown;
  if (!Array.isArray(promptsRaw) || promptsRaw.length === 0) {
    return "## Image generation\n\nSkipped: Claude did not emit a `prompts` array.";
  }

  const prompts = (promptsRaw as ParsedCreativePrompt[])
    .filter(
      (p): p is Required<ParsedCreativePrompt> =>
        typeof p?.filename === "string" &&
        typeof p?.aspect_ratio === "string" &&
        typeof p?.prompt === "string",
    )
    .map((p) => ({
      filename: p.filename,
      aspect_ratio: p.aspect_ratio,
      prompt: p.prompt,
    }));

  if (prompts.length === 0) {
    return "## Image generation\n\nSkipped: no valid prompts in the JSON block.";
  }

  let apiKey: string | null = null;
  try {
    const cfg = await api.loadConfig();
    apiKey = cfg.gemini_api_key ?? null;
  } catch {
    apiKey = null;
  }
  if (!apiKey) {
    return "## Image generation\n\nSkipped: no Gemini API key on file. Settings → Google AI Studio.";
  }

  let vaultRoot: string;
  try {
    vaultRoot = await api.vaultRootPath(root);
  } catch (e) {
    return `## Image generation\n\nSkipped: could not resolve vault root (${String(e)}).`;
  }

  const date = new Date().toISOString().slice(0, 10);
  const sep = vaultRoot.includes("\\") ? "\\" : "/";
  const outputDir = [
    vaultRoot,
    "Clients",
    safeFolder(clientName),
    "Assets",
    `${date}-creatives`,
  ].join(sep);

  try {
    const result = await api.generateCreativeSet(apiKey, prompts, outputDir);
    const lines: string[] = ["## Image generation"];
    lines.push(`Rendered ${result.saved.length} / ${prompts.length} creatives via Nano Banana 2.`);
    lines.push(`Output folder: \`${outputDir}\``);
    lines.push("");
    if (result.saved.length > 0) {
      lines.push("### Saved");
      for (const r of result.saved) {
        lines.push(`- \`${r.filename}\` · ${r.aspect_ratio} → \`${r.saved_path}\``);
      }
    }
    if (result.errors.length > 0) {
      lines.push("");
      lines.push("### Errors");
      for (const e of result.errors) {
        lines.push(`- \`${e.filename}\`: ${e.error}`);
      }
    }
    setStreamText((p) => p + `\n[Done. ${result.saved.length} images saved, ${result.errors.length} errors.]\n`);
    // `finalText` is already in the saved markdown — return only the new
    // results block; the caller appends it.
    void finalText;
    return lines.join("\n");
  } catch (e) {
    return `## Image generation\n\nFailed: ${String(e)}`;
  }
}

function clampNumber(s: string | number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(s));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isRequired(field: FormField): boolean {
  return field.required === true;
}

function isFilled(field: FormField, value: unknown): boolean {
  if (field.kind === "multi") return Array.isArray(value) && (value as string[]).length > 0;
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

export function GenericFormGenerator({
  config,
  root,
  agents,
  clientName,
  clientSlug,
  onClose,
  initialValues,
  onSaved,
}: Props) {
  const [values, setValues] = useState<FormValues>(() => defaultValuesFor(config));
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);
  const [driveBadge, setDriveBadge] = useState<string | null>(null);
  const [pastRefresh, setPastRefresh] = useState(0);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveFilename, setDriveFilename] = useState("");
  const [driveUploading, setDriveUploading] = useState(false);
  const [driveUploadUrl, setDriveUploadUrl] = useState<string | null>(null);
  const [driveUploadFilename, setDriveUploadFilename] = useState<string | null>(null);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const agent = useMemo(() => findAgent(agents, config.agentSlug), [agents, config.agentSlug]);

  const canRun = useMemo(() => {
    if (streaming || saved || !agent) return false;
    for (const section of config.sections) {
      for (const f of section.fields) {
        if (isRequired(f) && !isFilled(f, values[f.key])) return false;
      }
    }
    return true;
  }, [streaming, saved, agent, config, values]);

  // reset values when switching forms while the component is mounted
  useEffect(() => {
    setValues(defaultValuesFor(config));
    setSaved(null);
    setStreamText("");
    setError(null);
  }, [config]);

  // reset Drive upload state whenever the saved output changes (run again, picking a past result, etc.)
  useEffect(() => {
    setDriveOpen(false);
    setDriveFilename(saved?.title ?? "");
    setDriveUploading(false);
    setDriveUploadUrl(null);
    setDriveUploadFilename(null);
    setDriveUploadError(null);
  }, [saved]);

  // Tracks per-field prefill provenance so the form can render
  // `auto · profile` / `auto · <niche> playbook` badges next to each field.
  // Cleared when the user types into a field (the override wins).
  const [prefillSources, setPrefillSources] = useState<
    Record<string, PrefillSource>
  >({});

  // pre-fill from Profile.md + niche playbook when the form opts in
  useEffect(() => {
    const profileMap = config.prefillFromProfile;
    const playbookMap = config.prefillFromPlaybook;
    if (!profileMap && !playbookMap) return;
    let cancelled = false;
    (async () => {
      let vaultRoot = root;
      try {
        vaultRoot = await api.vaultRootPath(root);
      } catch {
        vaultRoot = root;
      }
      let profileValues: ReturnType<typeof parseProfileBody> | null = null;
      let niche: string | null = null;
      try {
        const note = await api.readVaultNote(
          root,
          profilePathFor(vaultRoot, {
            slug: clientSlug,
            name: clientName,
            status: "pre-launch",
          }),
        );
        if (note?.body) profileValues = parseProfileBody(note.body);
        niche = nicheFromFront(note?.front);
      } catch {
        // No Profile.md (or unreadable) — defaults stand; user can still type.
      }
      if (cancelled) return;
      const resolved = await resolvePrefills({
        root,
        niche,
        profile: profileValues,
        profileMap,
        playbookMap,
      });
      if (cancelled) return;
      setValues((prev) => {
        const next = { ...prev };
        for (const [fieldKey, entry] of Object.entries(resolved)) {
          next[fieldKey] = entry.value;
        }
        return next;
      });
      setPrefillSources(
        Object.fromEntries(
          Object.entries(resolved).map(([k, v]) => [k, v.source]),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [config, root, clientName, clientSlug]);

  // Apply caller-supplied initialValues last so they override both
  // defaultValuesFor and prefillFromProfile. Re-runs on identity change so
  // a sequence stepper can swap chained values when the user revisits.
  useEffect(() => {
    if (!initialValues) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(initialValues)) {
        if (v === undefined) continue;
        next[k] = v as FormValues[string];
      }
      return next;
    });
  }, [initialValues]);

  // load drive index badge once per (client, root)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const idx = await api.readDriveIndex(root, clientSlug);
        if (cancelled) return;
        if (idx && idx.body && idx.body.trim().length > 0) {
          const lineCount = idx.body.split("\n").filter((l) => l.trim().length > 0).length;
          setDriveBadge(`${lineCount} item${lineCount === 1 ? "" : "s"} indexed`);
        } else {
          setDriveBadge(null);
        }
      } catch {
        setDriveBadge(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  // esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !streaming) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, streaming]);

  // streaming subscription
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let mounted = true;
    api
      .onClaudeStream((evt: StreamEvent) => {
        if (!mounted) return;
        if (evt.kind === "delta") setStreamText((p) => p + evt.text);
        else if (evt.kind === "error") setError(evt.message);
      })
      .then((un) => {
        if (!mounted) un();
        else unlistenFn = un;
      });
    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  const progress = useMemo(() => {
    const cfg = config.progress;
    if (!cfg) return null;
    let count = 0;
    try {
      const itemRe = new RegExp(cfg.itemPattern, "gm");
      count = (streamText.match(itemRe) ?? []).length;
    } catch {
      count = 0;
    }
    let section: string | null = null;
    if (cfg.sectionPattern) {
      try {
        const sectionRe = new RegExp(cfg.sectionPattern, "gm");
        let last: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = sectionRe.exec(streamText)) !== null) last = m;
        if (last) section = last[1] ?? last[0];
      } catch {
        section = null;
      }
    }
    const done = Math.min(count, cfg.total);
    const pct = cfg.total > 0 ? Math.round((done / cfg.total) * 100) : 0;
    const unit = cfg.unitLabel + (done === 1 ? "" : "s");
    return { done, total: cfg.total, pct, unit, section };
  }, [config.progress, streamText]);

  const clearPrefillSource = (key: string) => {
    setPrefillSources((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setField = (key: string, value: string | number | string[]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    clearPrefillSource(key);
  };

  const toggleMulti = (key: string, option: string) => {
    setValues((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [key]: next };
    });
    clearPrefillSource(key);
  };

  const handleRun = async () => {
    if (!canRun || !agent) return;
    setError(null);
    setStreamText("");
    setSaved(null);
    setStreaming(true);

    let agentBody = "";
    try {
      agentBody = await api.readAgentBody(root, agent.slug);
    } catch (e) {
      setError(`Could not read ${config.agentName} body: ${e}`);
      setStreaming(false);
      return;
    }

    let driveBody: string | null = null;
    try {
      const idx = await api.readDriveIndex(root, clientSlug);
      driveBody = idx?.body ?? null;
    } catch {
      driveBody = null;
    }

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      const queryParts: string[] = [config.title];
      for (const section of config.sections) {
        for (const f of section.fields) {
          const v = values[f.key];
          if (typeof v === "string" && v.trim()) queryParts.push(v);
        }
      }
      knowledgeChunks = await api.matchKnowledgeChunks(root, queryParts.join(" "));
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    const prompt = assembleGenericPrompt({
      config,
      values,
      agentBody,
      clientName,
      driveContext: driveBody,
      knowledgeChunks,
    });

    const id = crypto.randomUUID();
    try {
      const full = await api.invokeClaude(id, prompt);
      const finalText = full || streamText;
      if (!finalText.trim()) {
        // Rust now throws Err when there's no text; fall back here only if
        // somehow we still got an empty string. Preserve any stream-error.
        setError(
          (prev) =>
            prev ??
            "Generation finished but no text was returned. Try running again — if it keeps happening, run `claude --version` in a terminal to confirm the CLI is logged in and not rate-limited.",
        );
        return;
      }
      const parsed = extractJson(finalText);
      const title =
        (parsed?.headline as string | undefined) ?? `${config.defaultTitle} · ${clientName}`;
      const summary = (parsed?.summary as string | undefined) ?? null;

      // Image-generation post-processor: if the form is flagged, parse the
      // JSON prompts block emitted by Claude, render each via Nano Banana 2,
      // save the PNGs into the client's vault Assets folder, and append a
      // results block to the markdown body before saving.
      let finalBody = finalText;
      if (config.imageGeneration?.provider === "nano-banana-2") {
        const renderNote = await runImageGeneration(
          finalText,
          parsed,
          root,
          clientName,
          setStreamText,
        );
        finalBody = `${finalText}\n\n${renderNote}`;
      }

      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: config.kind,
        title,
        summary,
        body: finalBody,
        inputsYaml: buildInputsYaml(config, values),
      });
      setSaved(output);
      setPastRefresh((n) => n + 1);
      onSaved?.(output);
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const disabled = streaming || !!saved;

  const handleSendToDrive = async () => {
    if (!saved || driveUploading) return;
    const trimmed = driveFilename.trim();
    if (!trimmed) {
      setDriveUploadError("Enter a filename before sending.");
      return;
    }
    setDriveUploadError(null);
    setDriveUploading(true);
    try {
      const result = await api.uploadOutputToDrive(root, clientSlug, saved.path, trimmed);
      setDriveUploadUrl(result.doc_url);
      setDriveUploadFilename(result.filename);
      setDriveOpen(false);
    } catch (e) {
      setDriveUploadError(String(e));
    } finally {
      setDriveUploading(false);
    }
  };

  const renderField = (field: FormField) => {
    const v = values[field.key];
    switch (field.kind) {
      case "text":
        return (
          <input
            className="os-input"
            placeholder={field.placeholder ?? ""}
            value={(v as string) ?? ""}
            onChange={(e) => setField(field.key, e.target.value)}
            disabled={disabled}
          />
        );
      case "textarea":
        return (
          <textarea
            className="os-input os-textarea"
            placeholder={field.placeholder ?? ""}
            value={(v as string) ?? ""}
            onChange={(e) => setField(field.key, e.target.value)}
            disabled={disabled}
            rows={field.minRows ?? 3}
          />
        );
      case "number":
        return (
          <input
            className="os-input"
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={(v as number | string) ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") setField(field.key, "");
              else
                setField(
                  field.key,
                  clampNumber(raw, field.min ?? 0, field.max ?? 9999, field.default ?? 0),
                );
            }}
            disabled={disabled}
          />
        );
      case "segmented":
      case "select":
        return (
          <div className="os-segment">
            {field.options.map((opt) => (
              <button
                type="button"
                key={opt}
                className={`os-segment-btn${v === opt ? " is-active" : ""}`}
                onClick={() => setField(field.key, opt)}
                disabled={disabled}
              >
                {opt}
              </button>
            ))}
          </div>
        );
      case "multi": {
        const current = (v as string[] | undefined) ?? [];
        return (
          <div className="os-segment">
            {field.options.map((opt) => {
              const on = current.includes(opt);
              return (
                <button
                  type="button"
                  key={opt}
                  className={`os-segment-btn${on ? " is-active" : ""}`}
                  onClick={() => toggleMulti(field.key, opt)}
                  disabled={disabled}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }
    }
  };

  const sourceTag = (key: string) => {
    const src = prefillSources[key];
    if (!src) return null;
    const text =
      src.kind === "profile"
        ? "auto · profile"
        : `auto · ${src.slug} playbook`;
    return (
      <span
        title="Pre-filled. Typing overrides this."
        style={{
          marginLeft: 8,
          fontFamily: "var(--hml-font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--hml-accent, #ec9849)",
          padding: "1px 6px",
          border: "1px solid var(--hml-accent-border, rgba(236,152,73,0.35))",
          background: "var(--hml-accent-dim, rgba(236,152,73,0.08))",
          borderRadius: 4,
          verticalAlign: "middle",
        }}
      >
        {text}
      </span>
    );
  };

  const renderFields = (fields: FormField[]) => {
    // Group fields that have inline=true with the previous one into a grid row.
    const groups: FormField[][] = [];
    for (const f of fields) {
      if (f.inline && groups.length > 0) groups[groups.length - 1].push(f);
      else groups.push([f]);
    }
    return groups.map((group) => {
      if (group.length === 1) {
        const f = group[0];
        return (
          <label key={f.key} className="os-field">
            <span className="os-label">
              {f.label}
              {sourceTag(f.key)}
              {f.hint && <span className="os-hint" style={{ marginLeft: 6 }}>· {f.hint}</span>}
            </span>
            {renderField(f)}
          </label>
        );
      }
      return (
        <div
          key={group.map((g) => g.key).join("+")}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${group.length}, 1fr)`,
            gap: 14,
          }}
        >
          {group.map((f) => (
            <label key={f.key} className="os-field">
              <span className="os-label">
                {f.label}
                {sourceTag(f.key)}
                {f.hint && <span className="os-hint" style={{ marginLeft: 6 }}>· {f.hint}</span>}
              </span>
              {renderField(f)}
            </label>
          ))}
        </div>
      );
    });
  };

  return (
    <div className="hml-content">
      <header className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span>{config.eyebrow}</span>
            {config.eyebrowMeta && (
              <>
                <span aria-hidden="true">·</span>
                <span>{config.eyebrowMeta}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>CLIENT · {clientName.toUpperCase()}</span>
          </div>
          <h1 className="hml-page-title">{config.title}</h1>
          <div className="hml-page-subtitle">{config.subtitle}</div>
          {driveBadge && (
            <div className="os-hint" style={{ marginTop: 8 }}>
              ◇ Google Drive context · {driveBadge} · will be included in the prompt.
            </div>
          )}
        </div>
        <div className="hml-page-header-actions">
          <button
            type="button"
            className="hml-btn"
            onClick={onClose}
            disabled={streaming}
            aria-label={`Close ${config.title}`}
          >
            Close
          </button>
        </div>
      </header>

      {!saved && (
        <>
          {config.sections.map((section) => (
            <div key={section.title} className="os-card">
              <div
                className="os-card-eyebrow"
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <span>▸ {section.title}</span>
                {section.meta && (
                  <span style={{ marginLeft: "auto", opacity: 0.75 }}>{section.meta}</span>
                )}
              </div>
              <div style={{ display: "grid", gap: 14 }}>{renderFields(section.fields)}</div>
            </div>
          ))}

          <div className="os-card-actions" style={{ margin: "4px 0 24px" }}>
            <button
              type="button"
              className="os-primary"
              onClick={handleRun}
              disabled={!canRun}
            >
              {streaming ? config.generatingLabel : config.generateLabel}
            </button>
            <button
              type="button"
              className="hml-btn"
              onClick={onClose}
              disabled={streaming}
            >
              Cancel
            </button>
            {!agent && (
              <span className="os-warn" style={{ marginLeft: 8 }}>
                {config.agentName.toUpperCase()} AGENT NOT FOUND IN agents/
              </span>
            )}
          </div>

          {!streaming && !streamText && (
            <PastResults
              root={root}
              clientSlug={clientSlug}
              kind={config.kind}
              refreshKey={pastRefresh}
              onSelect={(out) => {
                setSaved(out);
                setStreamText("");
                setError(null);
              }}
            />
          )}
        </>
      )}

      {(streaming || streamText) && !saved && (
        <div className="os-card">
          <div
            className="os-card-eyebrow"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <span>▸ {config.agentName.toUpperCase()} · DRAFTING</span>
            <span style={{ marginLeft: "auto", opacity: 0.75 }}>
              {progress
                ? `${progress.done} of ${progress.total} ${progress.unit}${
                    progress.section ? ` · ${progress.section}` : ""
                  }`
                : streaming
                  ? "streaming"
                  : "complete"}
            </span>
          </div>
          {progress && (
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
                margin: "2px 0 10px",
              }}
              role="progressbar"
              aria-valuenow={progress.done}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-label={`${progress.done} of ${progress.total} ${progress.unit} drafted`}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress.pct}%`,
                  background: "var(--copper, #ec9849)",
                  transition: "width 200ms ease-out",
                }}
              />
            </div>
          )}
          <div ref={transcriptRef} style={{ maxHeight: 480, overflow: "auto" }}>
            <FormOutput body={streamText} kind={config.kind} streaming />
            {streaming && <span className="caret" />}
          </div>
        </div>
      )}

      {error && (
        <div className="os-error" style={{ margin: "12px 0" }}>
          {error}
        </div>
      )}

      {saved && (
        <>
          <div className="os-card">
            <div
              className="os-card-eyebrow"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span>▸ {config.savedHeading.toUpperCase()}</span>
              <span style={{ marginLeft: "auto", opacity: 0.75 }}>
                {saved.path.split(/[\\/]/).slice(-2).join("/")}
              </span>
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--hml-text-primary)",
              }}
            >
              {saved.title}
            </div>
            {saved.summary && (
              <p
                style={{
                  margin: 0,
                  color: "var(--hml-text-secondary)",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                }}
              >
                {saved.summary}
              </p>
            )}
            <div className="os-card-actions">
              <button type="button" className="os-primary" onClick={onClose}>
                Back to dashboard
              </button>
              <button
                type="button"
                className="hml-btn"
                onClick={() => {
                  setSaved(null);
                  setStreamText("");
                  setValues(defaultValuesFor(config));
                }}
              >
                Run again
              </button>
              {driveUploadUrl ? (
                <button
                  type="button"
                  className="hml-btn"
                  onClick={() =>
                    openInAppWindow(
                      driveUploadUrl,
                      driveUploadFilename
                        ? `${driveUploadFilename} · Drive`
                        : `${clientName} · Drive`,
                    )
                  }
                  title={driveUploadFilename ?? undefined}
                >
                  Open in Drive ↗
                </button>
              ) : (
                <button
                  type="button"
                  className="hml-btn"
                  onClick={() => {
                    setDriveOpen((v) => !v);
                    setDriveFilename((cur) => (cur ? cur : saved?.title ?? ""));
                  }}
                  disabled={driveUploading}
                >
                  {driveUploading ? "Sending to Drive…" : "Send to Google Drive"}
                </button>
              )}
            </div>

            {driveOpen && !driveUploadUrl && (
              <div
                style={{
                  padding: 14,
                  border: "1px solid var(--hml-border-subtle)",
                  borderRadius: 6,
                  background: "var(--hml-bg-elev-2)",
                }}
              >
                <label className="os-field">
                  <span className="os-label">
                    Filename in Drive
                    <span className="os-hint" style={{ marginLeft: 6 }}>
                      · creates a Google Doc in {clientName}'s folder
                    </span>
                  </span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="os-input"
                      style={{ flex: 1 }}
                      value={driveFilename}
                      onChange={(e) => setDriveFilename(e.target.value)}
                      placeholder={saved?.title ?? "Document name"}
                      disabled={driveUploading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !driveUploading) {
                          e.preventDefault();
                          handleSendToDrive();
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="os-primary"
                      onClick={handleSendToDrive}
                      disabled={driveUploading || !driveFilename.trim()}
                    >
                      {driveUploading ? "Sending…" : "Upload"}
                    </button>
                    <button
                      type="button"
                      className="hml-btn"
                      onClick={() => {
                        setDriveOpen(false);
                        setDriveUploadError(null);
                      }}
                      disabled={driveUploading}
                    >
                      Cancel
                    </button>
                  </div>
                </label>
                {driveUploadError && (
                  <div className="os-error" style={{ marginTop: 10 }}>
                    {driveUploadError}
                  </div>
                )}
              </div>
            )}

            {driveUploadUrl && driveUploadFilename && (
              <div className="os-hint">
                ◇ Uploaded as <strong>{driveUploadFilename}</strong> · Google Doc in{" "}
                {clientName}'s Drive folder.
              </div>
            )}

            {driveUploadError && !driveOpen && (
              <div className="os-error">Drive upload failed: {driveUploadError}</div>
            )}
          </div>

          <div className="os-card">
            <div
              className="os-card-eyebrow"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span>▸ OUTPUT</span>
              <span style={{ marginLeft: "auto", opacity: 0.75 }}>
                {config.agentName.toLowerCase()}
              </span>
            </div>
            <div>
              <FormOutput body={saved.body} kind={config.kind} showHeader={false} />
            </div>
          </div>

          <PastResults
            root={root}
            clientSlug={clientSlug}
            kind={config.kind}
            refreshKey={pastRefresh}
            activePath={saved.path}
            onSelect={(out) => {
              setSaved(out);
              setStreamText("");
              setError(null);
            }}
          />
        </>
      )}
    </div>
  );
}
