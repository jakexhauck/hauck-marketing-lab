import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import {
  assembleHookPrompt,
  type HookPromptInputs,
} from "../lib/generatorPrompts";
import type {
  AgentSummary,
  GeneratorOutput,
  KnowledgeChunk,
  StreamEvent,
} from "../lib/types";

type Props = {
  root: string;
  agents: AgentSummary[];
  clientName: string;
  clientSlug: string;
  onClose: () => void;
};

type FormState = {
  offer: string;
  audience: string;
  awareness: HookPromptInputs["awareness"];
  angleCount: string;
  hooksPerAngle: string;
  seed: string;
};

const EMPTY: FormState = {
  offer: "",
  audience: "",
  awareness: "cold",
  angleCount: "4",
  hooksPerAngle: "5",
  seed: "",
};

const AWARENESS: HookPromptInputs["awareness"][] = ["cold", "warm", "retargeting"];

function findVortex(agents: AgentSummary[]): AgentSummary | null {
  return (
    agents.find((a) => a.slug === "vortex") ??
    agents.find((a) => a.name.toLowerCase() === "vortex") ??
    null
  );
}

function clampInt(s: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(s));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildInputsYaml(form: FormState): string {
  const lines: string[] = [];
  lines.push(`offer: "${form.offer.replace(/"/g, '\\"')}"`);
  lines.push(`audience: "${form.audience.replace(/"/g, '\\"')}"`);
  lines.push(`awareness: ${form.awareness}`);
  lines.push(`angle_count: ${clampInt(form.angleCount, 1, 12, 4)}`);
  lines.push(`hooks_per_angle: ${clampInt(form.hooksPerAngle, 1, 25, 5)}`);
  if (form.seed.trim()) {
    lines.push("seed: |");
    for (const line of form.seed.trim().split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  return lines.join("\n");
}

export function HookGenerator({
  root,
  agents,
  clientName,
  clientSlug,
  onClose,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const vortex = useMemo(() => findVortex(agents), [agents]);

  const canRun =
    !streaming &&
    !saved &&
    !!vortex &&
    form.offer.trim().length > 0 &&
    form.audience.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !streaming) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, streaming]);

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

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleRun = async () => {
    if (!canRun || !vortex) return;
    setError(null);
    setStreamText("");
    setSaved(null);
    setStreaming(true);

    const inputs: HookPromptInputs = {
      offer: form.offer.trim(),
      audience: form.audience.trim(),
      awareness: form.awareness,
      angleCount: clampInt(form.angleCount, 1, 12, 4),
      hooksPerAngle: clampInt(form.hooksPerAngle, 1, 25, 5),
      seed: form.seed,
    };

    let vortexBody = "";
    try {
      vortexBody = await api.readAgentBody(root, vortex.slug);
    } catch (e) {
      setError(`Could not read Vortex body: ${e}`);
      setStreaming(false);
      return;
    }

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      const query = `${inputs.offer} ${inputs.audience} hooks creative`;
      knowledgeChunks = await api.matchKnowledgeChunks(root, query);
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    const prompt = assembleHookPrompt({
      vortexBody,
      clientName,
      inputs,
      knowledgeChunks,
    });

    const id = crypto.randomUUID();
    try {
      const full = await api.invokeClaude(id, prompt);
      const finalText = full || streamText;
      const parsed = extractJson(finalText);
      const title =
        (parsed?.headline as string | undefined) ??
        `Hook set · ${inputs.offer || clientName}`;
      const summary = (parsed?.summary as string | undefined) ?? null;
      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: "hooks",
        title,
        summary,
        body: finalText,
        inputsYaml: buildInputsYaml(form),
      });
      setSaved(output);
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <main className="main" style={{ position: "relative" }}>
      <section className="hero reveal reveal-1">
        <div className="hero-eyebrow">
          <span>▸ HOOK GENERATOR · VORTEX</span>
          <span className="verdict">100-HOOK FRAMEWORK</span>
          <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
            CLIENT · {clientName.toUpperCase()}
          </span>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            disabled={streaming}
            aria-label="Close hook generator"
            style={{ marginLeft: 12 }}
          >
            ×
          </button>
        </div>
        <h1>
          Give me the offer. <strong>Vortex</strong> will ship hooks across diverse
          angles.
        </h1>
        <p className="hero-body">
          Vortex generates {form.angleCount || "?"} angles × {form.hooksPerAngle || "?"}{" "}
          hooks each, attributed to a category from the 100-Hook Framework, with the top
          5 picks called out.
        </p>
      </section>

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ OFFER & AUDIENCE</span>
            <span className="panel-meta">required</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label className="kpi-form-label">Offer / product</label>
              <input
                className="kpi-form-input"
                placeholder="Window cleaning subscription · Willis Windows"
                value={form.offer}
                onChange={(e) => setField("offer", e.target.value)}
                disabled={streaming || !!saved}
              />
            </div>
            <div>
              <label className="kpi-form-label">Target audience</label>
              <input
                className="kpi-form-input"
                placeholder="Homeowners 35-65, $150k+ income, suburban"
                value={form.audience}
                onChange={(e) => setField("audience", e.target.value)}
                disabled={streaming || !!saved}
              />
            </div>
            <div>
              <label className="kpi-form-label">Awareness</label>
              <div className="status-toggle">
                {AWARENESS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`status-toggle-btn ${form.awareness === opt ? "active ok" : ""}`}
                    onClick={() => setField("awareness", opt)}
                    disabled={streaming || !!saved}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label className="kpi-form-label">Angles</label>
                <input
                  className="kpi-form-input"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={form.angleCount}
                  onChange={(e) => setField("angleCount", e.target.value)}
                  disabled={streaming || !!saved}
                />
              </div>
              <div>
                <label className="kpi-form-label">Hooks per angle</label>
                <input
                  className="kpi-form-input"
                  type="number"
                  min={1}
                  max={25}
                  step={1}
                  value={form.hooksPerAngle}
                  onChange={(e) => setField("hooksPerAngle", e.target.value)}
                  disabled={streaming || !!saved}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ SEED (OPTIONAL)</span>
            <span className="panel-meta">winning lines · references · tone</span>
          </div>
          <textarea
            className="kpi-form-textarea"
            placeholder="Paste a competitor ad, a top-performing hook, a tone reference, or anything Vortex should echo or avoid."
            value={form.seed}
            onChange={(e) => setField("seed", e.target.value)}
            disabled={streaming || !!saved}
            style={{ minHeight: 320, fontFamily: "var(--mono)", fontSize: 13 }}
          />
        </div>
      </section>

      {!saved && (
        <div className="actions-row reveal reveal-3" style={{ marginBottom: 32 }}>
          <button
            type="button"
            className="action primary"
            onClick={handleRun}
            disabled={!canRun}
          >
            {streaming ? "Generating…" : "Generate hooks"}
          </button>
          <button type="button" className="action" onClick={onClose} disabled={streaming}>
            Cancel
          </button>
          {!vortex && (
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
              VORTEX AGENT NOT FOUND IN agents/
            </span>
          )}
        </div>
      )}

      {(streaming || streamText) && !saved && (
        <section className="panel reveal reveal-4" style={{ marginBottom: 32 }}>
          <div className="panel-head">
            <span className="panel-title">▸ VORTEX · DRAFTING</span>
            <span className="panel-meta">{streaming ? "streaming" : "complete"}</span>
          </div>
          <div ref={transcriptRef} className="thread" style={{ maxHeight: 480, padding: 0, gap: 0 }}>
            <div className="msg agent">
              <div className="msg-label">VORTEX ›</div>
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
          <SavedHeader
            output={saved}
            onClose={onClose}
            onRunAgain={() => {
              setSaved(null);
              setStreamText("");
              setForm(EMPTY);
            }}
          />
          <FullTranscript title="▸ FULL HOOK SET" agent="VORTEX" body={saved.body} />
        </>
      )}
    </main>
  );
}

function SavedHeader({
  output,
  onClose,
  onRunAgain,
}: {
  output: GeneratorOutput;
  onClose: () => void;
  onRunAgain: () => void;
}) {
  return (
    <section className="panel reveal reveal-3" style={{ marginBottom: 24 }}>
      <div className="panel-head">
        <span className="panel-title">▸ HOOKS SAVED</span>
        <span className="panel-meta">{output.path.split(/[\\/]/).slice(-2).join("/")}</span>
      </div>
      <div className="diag-headline" style={{ marginBottom: 12 }}>
        {output.title}
      </div>
      {output.summary && (
        <p className="hero-body" style={{ marginBottom: 18, fontSize: 15, color: "var(--text-mid)" }}>
          {output.summary}
        </p>
      )}
      <div className="actions-row">
        <button type="button" className="action primary" onClick={onClose}>
          Back to dashboard
        </button>
        <button type="button" className="action" onClick={onRunAgain}>
          Generate another set
        </button>
      </div>
    </section>
  );
}

function FullTranscript({
  title,
  agent,
  body,
}: {
  title: string;
  agent: string;
  body: string;
}) {
  return (
    <section className="panel reveal reveal-4">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        <span className="panel-meta">{agent.toLowerCase()} · verbatim</span>
      </div>
      <div className="thread" style={{ maxHeight: 600, padding: 0, gap: 0 }}>
        <div className="msg agent">
          <div className="msg-label">{agent} ›</div>
          <div className="msg-body">{body}</div>
        </div>
      </div>
    </section>
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
