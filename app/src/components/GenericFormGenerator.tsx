import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
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

type Props = {
  config: FormConfig;
  root: string;
  agents: AgentSummary[];
  clientName: string;
  clientSlug: string;
  onClose: () => void;
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
}: Props) {
  const [values, setValues] = useState<FormValues>(() => defaultValuesFor(config));
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);
  const [driveBadge, setDriveBadge] = useState<string | null>(null);
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
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const disabled = streaming || !!saved;

  const renderField = (field: FormField) => {
    const v = values[field.key];
    switch (field.kind) {
      case "text":
        return (
          <input
            className="kpi-form-input"
            placeholder={field.placeholder ?? ""}
            value={(v as string) ?? ""}
            onChange={(e) => setField(field.key, e.target.value)}
            disabled={disabled}
          />
        );
      case "textarea":
        return (
          <textarea
            className="kpi-form-textarea"
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
            className="kpi-form-input"
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
          <div className="status-toggle">
            {field.options.map((opt) => (
              <button
                type="button"
                key={opt}
                className={`status-toggle-btn ${v === opt ? "active ok" : ""}`}
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {field.options.map((opt) => {
              const on = current.includes(opt);
              return (
                <button
                  type="button"
                  key={opt}
                  className={`status-toggle-btn ${on ? "active ok" : ""}`}
                  onClick={() => toggleMulti(field.key, opt)}
                  disabled={disabled}
                  style={{ flex: "0 0 auto" }}
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
    return groups.map((group, idx) => {
      if (group.length === 1) {
        const f = group[0];
        return (
          <div key={f.key} style={{ marginBottom: idx === groups.length - 1 ? 0 : 14 }}>
            <label className="kpi-form-label">
              {f.label}
              {f.hint && <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>· {f.hint}</span>}
            </label>
            {renderField(f)}
          </div>
        );
      }
      return (
        <div
          key={group.map((g) => g.key).join("+")}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${group.length}, 1fr)`,
            gap: 14,
            marginBottom: idx === groups.length - 1 ? 0 : 14,
          }}
        >
          {group.map((f) => (
            <div key={f.key}>
              <label className="kpi-form-label">
                {f.label}
                {f.hint && <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>· {f.hint}</span>}
              </label>
              {renderField(f)}
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <main className="main" style={{ position: "relative" }}>
      <section className="hero reveal reveal-1">
        <div className="hero-eyebrow">
          <span>{config.eyebrow}</span>
          {config.eyebrowMeta && <span className="verdict">{config.eyebrowMeta}</span>}
          <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
            CLIENT · {clientName.toUpperCase()}
          </span>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            disabled={streaming}
            aria-label={`Close ${config.title}`}
            style={{ marginLeft: 12 }}
          >
            ×
          </button>
        </div>
        <h1>{config.title}</h1>
        <p className="hero-body">{config.subtitle}</p>
        {driveBadge && (
          <p
            className="hero-body"
            style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}
          >
            ◇ Google Drive context · {driveBadge} · will be included in the prompt.
          </p>
        )}
      </section>

      {!saved && (
        <>
          {config.sections.map((section) => (
            <section
              key={section.title}
              className="panel reveal reveal-2"
              style={{ marginBottom: 24 }}
            >
              <div className="panel-head">
                <span className="panel-title">{section.title}</span>
                {section.meta && <span className="panel-meta">{section.meta}</span>}
              </div>
              <div style={{ display: "grid", gap: 14 }}>{renderFields(section.fields)}</div>
            </section>
          ))}

          {/* generate button — bottom of form, in flow (not sticky) */}
          <div className="actions-row reveal reveal-3" style={{ marginBottom: 32 }}>
            <button
              type="button"
              className="action primary"
              onClick={handleRun}
              disabled={!canRun}
            >
              {streaming ? config.generatingLabel : config.generateLabel}
            </button>
            <button type="button" className="action" onClick={onClose} disabled={streaming}>
              Cancel
            </button>
            {!agent && (
              <span
                style={{
                  marginLeft: 12,
                  fontFamily: "var(--mono)",
                  fontSize: 11.5,
                  color: "var(--signal-stop)",
                  letterSpacing: "0.04em",
                  alignSelf: "center",
                }}
              >
                {config.agentName.toUpperCase()} AGENT NOT FOUND IN agents/
              </span>
            )}
          </div>
        </>
      )}

      {(streaming || streamText) && !saved && (
        <section className="panel reveal reveal-4" style={{ marginBottom: 32 }}>
          <div className="panel-head">
            <span className="panel-title">
              ▸ {config.agentName.toUpperCase()} · DRAFTING
            </span>
            <span className="panel-meta">{streaming ? "streaming" : "complete"}</span>
          </div>
          <div ref={transcriptRef} className="thread" style={{ maxHeight: 480, padding: 0, gap: 0 }}>
            <div className="msg agent">
              <div className="msg-label">{config.agentName.toUpperCase()} ›</div>
              <div className="msg-body">
                {streamText}
                {streaming && <span className="caret" />}
              </div>
            </div>
          </div>
        </section>
      )}

      {error && (
        <section
          className="panel reveal"
          style={{ marginBottom: 32, borderLeft: "2px solid var(--signal-stop)" }}
        >
          <div className="panel-head">
            <span className="panel-title" style={{ color: "var(--signal-stop)" }}>
              ▸ ERROR
            </span>
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--signal-stop)" }}>
            {error}
          </div>
        </section>
      )}

      {saved && (
        <>
          <section className="panel reveal reveal-3" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <span className="panel-title">▸ {config.savedHeading.toUpperCase()}</span>
              <span className="panel-meta">
                {saved.path.split(/[\\/]/).slice(-2).join("/")}
              </span>
            </div>
            <div className="diag-headline" style={{ marginBottom: 12 }}>
              {saved.title}
            </div>
            {saved.summary && (
              <p
                className="hero-body"
                style={{ marginBottom: 18, fontSize: 15, color: "var(--text-mid)" }}
              >
                {saved.summary}
              </p>
            )}
            <div className="actions-row">
              <button type="button" className="action primary" onClick={onClose}>
                Back to dashboard
              </button>
              <button
                type="button"
                className="action"
                onClick={() => {
                  setSaved(null);
                  setStreamText("");
                  setValues(defaultValuesFor(config));
                }}
              >
                Run again
              </button>
            </div>
          </section>

          <section className="panel reveal reveal-4">
            <div className="panel-head">
              <span className="panel-title">▸ FULL OUTPUT</span>
              <span className="panel-meta">{config.agentName.toLowerCase()} · verbatim</span>
            </div>
            <div className="thread" style={{ maxHeight: 600, padding: 0, gap: 0 }}>
              <div className="msg agent">
                <div className="msg-label">{config.agentName.toUpperCase()} ›</div>
                <div className="msg-body">{saved.body}</div>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
