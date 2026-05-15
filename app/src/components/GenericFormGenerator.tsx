import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { openInAppWindow } from "../lib/openInApp";
import {
  parseProfileBody,
  profilePathFor,
  type ProfileFormValues,
} from "../lib/clientProfile";
import {
  defaultValuesFor,
  type FormConfig,
  type FormField,
  type FormValues,
} from "../lib/formConfigs";
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

  // pre-fill from Profile.md when the form opts in via config.prefillFromProfile
  useEffect(() => {
    const mapping = config.prefillFromProfile;
    if (!mapping) return;
    let cancelled = false;
    (async () => {
      try {
        const note = await api.readVaultNote(
          root,
          profilePathFor(root, {
            slug: clientSlug,
            name: clientName,
            status: "pre-launch",
          }),
        );
        if (cancelled || !note?.body) return;
        const profile = parseProfileBody(note.body);
        setValues((prev) => {
          const next = { ...prev };
          for (const [fieldKey, profileKey] of Object.entries(mapping)) {
            if (!profileKey) continue;
            const v = profile[profileKey as keyof ProfileFormValues];
            if (typeof v === "string" && v.trim().length > 0) {
              next[fieldKey] = v;
            }
          }
          return next;
        });
      } catch {
        // No Profile.md (or unreadable) — defaults stand; user can still type.
      }
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

  const setField = (key: string, value: string | number | string[]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const toggleMulti = (key: string, option: string) => {
    setValues((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [key]: next };
    });
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
      const parsed = extractJson(finalText);
      const title =
        (parsed?.headline as string | undefined) ?? `${config.defaultTitle} · ${clientName}`;
      const summary = (parsed?.summary as string | undefined) ?? null;
      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: config.kind,
        title,
        summary,
        body: finalText,
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
              {streaming ? "streaming" : "complete"}
            </span>
          </div>
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
