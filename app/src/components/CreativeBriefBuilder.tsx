import { useMemo, useState } from "react";
import { api } from "../lib/tauri";
import {
  assembleCreativeBriefPrompt,
  type CreativeBriefInputs,
} from "../lib/generatorPrompts";
import type {
  AgentSummary,
  GeneratorOutput,
  KnowledgeChunk,
} from "../lib/types";
import {
  ErrorPanel,
  FullTranscript,
  HeroBar,
  SavedHeader,
  StreamPanel,
  extractJson,
  useEscapeClose,
  useStreamListener,
} from "./generators/GeneratorChrome";

type Props = {
  root: string;
  agents: AgentSummary[];
  clientName: string;
  clientSlug: string;
  onClose: () => void;
};

const EMPTY: CreativeBriefInputs = {
  product: "",
  format: "1080×1920 video, 15-30s",
  quantity: "3",
  audience: "",
  pains: "",
  desires: "",
  awareness: "cold",
  hook: "",
  coreMessage: "",
  proof: "",
  cta: "Get a free quote",
  visualStyle: "",
  doNots: "",
  deadline: "",
};

const AWARENESS: CreativeBriefInputs["awareness"][] = ["cold", "warm", "hot"];

function findVortex(agents: AgentSummary[]): AgentSummary | null {
  return (
    agents.find((a) => a.slug === "vortex") ??
    agents.find((a) => a.name.toLowerCase() === "vortex") ??
    null
  );
}

function buildInputsYaml(i: CreativeBriefInputs): string {
  const out: string[] = [];
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  out.push(`product: ${q(i.product)}`);
  out.push(`format: ${q(i.format)}`);
  out.push(`quantity: ${q(i.quantity)}`);
  out.push(`audience: ${q(i.audience)}`);
  out.push(`awareness: ${i.awareness}`);
  if (i.hook.trim()) out.push(`hook: ${q(i.hook)}`);
  if (i.cta.trim()) out.push(`cta: ${q(i.cta)}`);
  if (i.deadline.trim()) out.push(`deadline: ${q(i.deadline)}`);
  return out.join("\n");
}

export function CreativeBriefBuilder({
  root,
  agents,
  clientName,
  clientSlug,
  onClose,
}: Props) {
  const [form, setForm] = useState<CreativeBriefInputs>(EMPTY);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);

  const vortex = useMemo(() => findVortex(agents), [agents]);

  const canRun =
    !streaming &&
    !saved &&
    !!vortex &&
    form.product.trim().length > 0 &&
    form.audience.trim().length > 0;

  useEscapeClose(onClose, streaming);
  useStreamListener(
    (text) => setStreamText((p) => p + text),
    (msg) => setError(msg),
  );

  const setField = <K extends keyof CreativeBriefInputs>(
    key: K,
    value: CreativeBriefInputs[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleRun = async () => {
    if (!canRun || !vortex) return;
    setError(null);
    setStreamText("");
    setSaved(null);
    setStreaming(true);

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
      const query = `${form.product} ${form.audience} creative brief`;
      knowledgeChunks = await api.matchKnowledgeChunks(root, query);
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    const prompt = assembleCreativeBriefPrompt({
      vortexBody,
      clientName,
      inputs: form,
      knowledgeChunks,
    });

    const id = crypto.randomUUID();
    try {
      const full = await api.invokeClaude(id, prompt);
      const finalText = full || streamText;
      const parsed = extractJson(finalText);
      const title =
        (parsed?.headline as string | undefined) ??
        `Creative brief · ${form.product || clientName}`;
      const summary = (parsed?.summary as string | undefined) ?? null;
      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: "briefs",
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
      <HeroBar
        eyebrow="▸ CREATIVE BRIEF · VORTEX"
        tag="DESIGNER-READY"
        clientName={clientName}
        onClose={onClose}
        closeDisabled={streaming}
        title={
          <>
            Tell me the brief. <strong>Vortex</strong> will hand the editor a brief they
            can execute.
          </>
        }
        body="Production-ready output: overview, audience, message, visual direction, technical specs, deliverables checklist."
      />

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ PROJECT</span>
            <span className="panel-meta">required</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <Field
              label="Product / offer"
              placeholder="Bi-monthly window cleaning subscription"
              value={form.product}
              onChange={(v) => setField("product", v)}
              disabled={streaming || !!saved}
            />
            <Field
              label="Audience"
              placeholder="Homeowners 35-65, $150k+, suburban"
              value={form.audience}
              onChange={(v) => setField("audience", v)}
              disabled={streaming || !!saved}
            />
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
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
              <Field
                label="Format(s)"
                placeholder="1080×1920 video 15-30s"
                value={form.format}
                onChange={(v) => setField("format", v)}
                disabled={streaming || !!saved}
              />
              <Field
                label="Quantity"
                placeholder="3"
                value={form.quantity}
                onChange={(v) => setField("quantity", v)}
                disabled={streaming || !!saved}
              />
            </div>
            <Field
              label="Deadline"
              placeholder="2026-05-20"
              value={form.deadline}
              onChange={(v) => setField("deadline", v)}
              disabled={streaming || !!saved}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ MESSAGE</span>
            <span className="panel-meta">what to say</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <Field
              label="Lead hook (optional)"
              placeholder={'"Your neighbors can see your windows from the street"'}
              value={form.hook}
              onChange={(v) => setField("hook", v)}
              disabled={streaming || !!saved}
            />
            <FieldArea
              label="Core message"
              placeholder="Window cleaning shouldn't be a chore you forget about. Subscribe and it just happens every other month."
              value={form.coreMessage}
              onChange={(v) => setField("coreMessage", v)}
              disabled={streaming || !!saved}
            />
            <FieldArea
              label="Pain points"
              placeholder="Don't want to climb ladders. Worried about damage. Forget to schedule."
              value={form.pains}
              onChange={(v) => setField("pains", v)}
              disabled={streaming || !!saved}
            />
            <FieldArea
              label="Desires"
              placeholder="Effortless clean windows. Trusted local crew. Predictable schedule."
              value={form.desires}
              onChange={(v) => setField("desires", v)}
              disabled={streaming || !!saved}
            />
            <Field
              label="CTA"
              placeholder="Get a free quote"
              value={form.cta}
              onChange={(v) => setField("cta", v)}
              disabled={streaming || !!saved}
            />
          </div>
        </div>
      </section>

      <section className="row-split reveal reveal-3" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ PROOF</span>
            <span className="panel-meta">credibility</span>
          </div>
          <FieldArea
            label="Proof elements"
            placeholder="200+ Google reviews. Local crew since 2014. Insured & bonded."
            value={form.proof}
            onChange={(v) => setField("proof", v)}
            disabled={streaming || !!saved}
          />
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ VISUAL DIRECTION</span>
            <span className="panel-meta">style · do-nots</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <FieldArea
              label="Style"
              placeholder="Modern, bright, real-world (no stock). Copper highlights. Hanken Grotesk."
              value={form.visualStyle}
              onChange={(v) => setField("visualStyle", v)}
              disabled={streaming || !!saved}
            />
            <FieldArea
              label="Do-nots"
              placeholder="No fake before/afters. No urgency claims. No models."
              value={form.doNots}
              onChange={(v) => setField("doNots", v)}
              disabled={streaming || !!saved}
            />
          </div>
        </div>
      </section>

      {!saved && (
        <div className="actions-row reveal reveal-4" style={{ marginBottom: 32 }}>
          <button type="button" className="action primary" onClick={handleRun} disabled={!canRun}>
            {streaming ? "Drafting brief…" : "Generate brief"}
          </button>
          <button type="button" className="action" onClick={onClose} disabled={streaming}>
            Cancel
          </button>
          {!vortex && (
            <span style={{ marginLeft: 12, color: "var(--signal-stop)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
              VORTEX AGENT NOT FOUND
            </span>
          )}
        </div>
      )}

      {(streaming || streamText) && !saved && (
        <StreamPanel agentName="Vortex" streaming={streaming} streamText={streamText} />
      )}
      {error && <ErrorPanel error={error} />}

      {saved && (
        <>
          <SavedHeader
            output={saved}
            primaryLabel="Back to dashboard"
            onPrimary={onClose}
            secondaryLabel="Generate another"
            onSecondary={() => {
              setSaved(null);
              setStreamText("");
              setForm(EMPTY);
            }}
          />
          <FullTranscript title="▸ FULL BRIEF" agent="VORTEX" body={saved.body} />
        </>
      )}
    </main>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="kpi-form-label">{label}</label>
      <input
        className="kpi-form-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function FieldArea({
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="kpi-form-label">{label}</label>
      <textarea
        className="kpi-form-textarea"
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
