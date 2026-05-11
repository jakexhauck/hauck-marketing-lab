import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/tauri";
import {
  assembleScaleReadinessPrompt,
  type ScaleReadinessInputs,
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

const empty = (): ScaleReadinessInputs => ({
  dailySpend: "",
  roas: "",
  targetRoas: "2.0",
  cpa: "",
  targetCpa: "",
  daysStable: "",
  activeCreatives: "",
  topCreativePct: "",
  frequency: "",
  capiStatus: "ok",
  emqScore: "",
  infraReady: "yes",
  notes: "",
});

const STATUS: ScaleReadinessInputs["capiStatus"][] = ["ok", "warning", "missing"];
const INFRA: ScaleReadinessInputs["infraReady"][] = ["yes", "partial", "no"];

const VERDICT_TONE: Record<string, { background: string; borderColor: string; color: string }> = {
  green: {
    background: "rgba(95, 230, 153, 0.13)",
    borderColor: "rgba(95, 230, 153, 0.4)",
    color: "var(--signal-go)",
  },
  yellow: {
    background: "rgba(251, 191, 36, 0.13)",
    borderColor: "rgba(251, 191, 36, 0.4)",
    color: "var(--signal-hold)",
  },
  red: {
    background: "rgba(248, 113, 113, 0.13)",
    borderColor: "rgba(248, 113, 113, 0.4)",
    color: "var(--signal-stop)",
  },
};

function findStratos(agents: AgentSummary[]): AgentSummary | null {
  return (
    agents.find((a) => a.slug === "stratos") ??
    agents.find((a) => a.name.toLowerCase() === "stratos") ??
    null
  );
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

function buildInputsYaml(i: ScaleReadinessInputs): string {
  const out: string[] = [];
  if (i.dailySpend) out.push(`daily_spend: ${i.dailySpend}`);
  if (i.roas) out.push(`roas: ${i.roas}`);
  if (i.targetRoas) out.push(`target_roas: ${i.targetRoas}`);
  if (i.cpa) out.push(`cpa: ${i.cpa}`);
  if (i.targetCpa) out.push(`target_cpa: ${i.targetCpa}`);
  if (i.daysStable) out.push(`days_stable: ${i.daysStable}`);
  if (i.activeCreatives) out.push(`active_creatives: ${i.activeCreatives}`);
  if (i.topCreativePct) out.push(`top_creative_pct: ${i.topCreativePct}`);
  if (i.frequency) out.push(`frequency: ${i.frequency}`);
  out.push(`capi_status: ${i.capiStatus}`);
  if (i.emqScore) out.push(`emq_score: ${i.emqScore}`);
  out.push(`infra_ready: ${i.infraReady}`);
  return out.join("\n");
}

export function ScaleReadiness({
  root,
  agents,
  clientName,
  clientSlug,
  onClose,
}: Props) {
  const [form, setForm] = useState<ScaleReadinessInputs>(empty);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);

  const stratos = useMemo(() => findStratos(agents), [agents]);

  const canRun = !streaming && !saved && !!stratos;

  useEscapeClose(onClose, streaming);
  useStreamListener(
    (text) => setStreamText((p) => p + text),
    (msg) => setError(msg),
  );

  // Prefill from latest KPIs + tracking audit
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [latest, tracking] = await Promise.all([
          api.readLatestKpis(root, clientSlug),
          api.readTrackingAudit(root, clientSlug),
        ]);
        if (!mounted) return;
        setForm((prev) => ({
          ...prev,
          roas: prev.roas || fmt(latest?.roas),
          cpa: prev.cpa || fmt(latest?.cpa),
          frequency: prev.frequency,
          capiStatus: tracking?.capi_status ?? prev.capiStatus,
          emqScore: prev.emqScore || fmt(tracking?.emq_score ?? null),
        }));
      } catch {
        /* noop */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [root, clientSlug]);

  const setField = <K extends keyof ScaleReadinessInputs>(
    key: K,
    value: ScaleReadinessInputs[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleRun = async () => {
    if (!canRun || !stratos) return;
    setError(null);
    setStreamText("");
    setSaved(null);
    setVerdict(null);
    setStreaming(true);

    let stratosBody = "";
    try {
      stratosBody = await api.readAgentBody(root, stratos.slug);
    } catch (e) {
      setError(`Could not read Stratos body: ${e}`);
      setStreaming(false);
      return;
    }

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      knowledgeChunks = await api.matchKnowledgeChunks(
        root,
        "scale readiness pillars budget increase",
      );
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    const prompt = assembleScaleReadinessPrompt({
      stratosBody,
      clientName,
      inputs: form,
      knowledgeChunks,
    });

    const id = crypto.randomUUID();
    try {
      const full = await api.invokeClaude(id, prompt);
      const finalText = full || streamText;
      const parsed = extractJson(finalText);
      const v = (parsed?.verdict as string | undefined) ?? null;
      setVerdict(v);
      const title =
        (parsed?.headline as string | undefined) ??
        `Scale readiness · ${v ?? "verdict"}`;
      const summary = (parsed?.summary as string | undefined) ?? null;
      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: "scale_checks",
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
        eyebrow="▸ SCALE READINESS · STRATOS"
        tag="4-PILLAR CHECK"
        clientName={clientName}
        onClose={onClose}
        closeDisabled={streaming}
        title={
          <>
            <strong>Am I ready to scale?</strong> Stratos applies the 4-pillar check and
            calls it.
          </>
        }
        body="Metrics stability · creative health · tracking health · infrastructure. Verdict: green / yellow / red, with the scaling schedule if green."
      />

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ METRICS</span>
            <span className="panel-meta">prefilled from latest</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Daily spend ($)" value={form.dailySpend} onChange={(v) => setField("dailySpend", v)} disabled={streaming || !!saved} />
            <Field label="Days stable" value={form.daysStable} onChange={(v) => setField("daysStable", v)} disabled={streaming || !!saved} />
            <Field label="ROAS (×)" value={form.roas} onChange={(v) => setField("roas", v)} disabled={streaming || !!saved} />
            <Field label="Target ROAS (×)" value={form.targetRoas} onChange={(v) => setField("targetRoas", v)} disabled={streaming || !!saved} />
            <Field label="CPA ($)" value={form.cpa} onChange={(v) => setField("cpa", v)} disabled={streaming || !!saved} />
            <Field label="Target CPA ($)" value={form.targetCpa} onChange={(v) => setField("targetCpa", v)} disabled={streaming || !!saved} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ CREATIVE</span>
            <span className="panel-meta">vortex layer</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Active creatives" value={form.activeCreatives} onChange={(v) => setField("activeCreatives", v)} disabled={streaming || !!saved} />
            <Field label="Top creative % of spend" value={form.topCreativePct} onChange={(v) => setField("topCreativePct", v)} disabled={streaming || !!saved} />
            <Field label="Frequency" value={form.frequency} onChange={(v) => setField("frequency", v)} disabled={streaming || !!saved} />
          </div>
        </div>
      </section>

      <section className="row-split reveal reveal-3" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ TRACKING</span>
            <span className="panel-meta">nexus layer</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label className="kpi-form-label">CAPI status</label>
              <div className="status-toggle">
                {STATUS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`status-toggle-btn ${form.capiStatus === opt ? `active ${opt}` : ""}`}
                    onClick={() => setField("capiStatus", opt)}
                    disabled={streaming || !!saved}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="EMQ score (0-10)"
              value={form.emqScore}
              onChange={(v) => setField("emqScore", v)}
              disabled={streaming || !!saved}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ INFRASTRUCTURE</span>
            <span className="panel-meta">sales · support · cash flow</span>
          </div>
          <div>
            <label className="kpi-form-label">Ready for +20-30% volume?</label>
            <div className="status-toggle">
              {INFRA.map((opt) => (
                <button
                  type="button"
                  key={opt}
                  className={`status-toggle-btn ${form.infraReady === opt ? `active ${opt === "yes" ? "ok" : opt === "partial" ? "warning" : "missing"}` : ""}`}
                  onClick={() => setField("infraReady", opt)}
                  disabled={streaming || !!saved}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel reveal reveal-4" style={{ marginBottom: 32 }}>
        <div className="panel-head">
          <span className="panel-title">▸ NOTES</span>
          <span className="panel-meta">optional</span>
        </div>
        <textarea
          className="kpi-form-textarea"
          placeholder="Anything Stratos should know? Recent changes, planned promos, sales-team capacity caveats."
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          disabled={streaming || !!saved}
          style={{ minHeight: 120 }}
        />
      </section>

      {!saved && (
        <div className="actions-row reveal" style={{ marginBottom: 32 }}>
          <button type="button" className="action primary" onClick={handleRun} disabled={!canRun}>
            {streaming ? "Checking…" : "Run readiness check"}
          </button>
          <button type="button" className="action" onClick={onClose} disabled={streaming}>
            Cancel
          </button>
          {!stratos && (
            <span style={{ marginLeft: 12, color: "var(--signal-stop)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
              STRATOS AGENT NOT FOUND
            </span>
          )}
        </div>
      )}

      {(streaming || streamText) && !saved && (
        <StreamPanel agentName="Stratos" streaming={streaming} streamText={streamText} />
      )}
      {error && <ErrorPanel error={error} />}

      {saved && (
        <>
          <SavedHeader
            output={saved}
            primaryLabel="Back to dashboard"
            onPrimary={onClose}
            secondaryLabel="Run again"
            onSecondary={() => {
              setSaved(null);
              setStreamText("");
              setVerdict(null);
              setForm(empty());
            }}
            badge={verdict}
            badgeTone={verdict ? VERDICT_TONE[verdict] : undefined}
          />
          <FullTranscript title="▸ FULL READINESS REPORT" agent="STRATOS" body={saved.body} />
        </>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="kpi-form-label">{label}</label>
      <input
        className="kpi-form-input"
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
