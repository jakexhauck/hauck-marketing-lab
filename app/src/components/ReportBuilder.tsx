import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/tauri";
import {
  assemblePerformanceReportPrompt,
  type PerformanceReportInputs,
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

const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const weekAgoStr = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const empty = (): PerformanceReportInputs => ({
  periodStart: weekAgoStr(),
  periodEnd: todayStr(),
  spend: "",
  revenue: "",
  roas: "",
  cpa: "",
  conversions: "",
  goalRoas: "2.0",
  goalCpa: "",
  campaignNotes: "",
  paste: "",
});

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : String(n);

function findAurelius(agents: AgentSummary[]): AgentSummary | null {
  return (
    agents.find((a) => a.slug === "aurelius") ??
    agents.find((a) => a.name.toLowerCase() === "aurelius") ??
    null
  );
}

const VERDICT_TONE: Record<string, { background: string; borderColor: string; color: string }> = {
  on_track: {
    background: "rgba(95, 230, 153, 0.13)",
    borderColor: "rgba(95, 230, 153, 0.4)",
    color: "var(--signal-go)",
  },
  at_risk: {
    background: "rgba(251, 191, 36, 0.13)",
    borderColor: "rgba(251, 191, 36, 0.4)",
    color: "var(--signal-hold)",
  },
  off_track: {
    background: "rgba(248, 113, 113, 0.13)",
    borderColor: "rgba(248, 113, 113, 0.4)",
    color: "var(--signal-stop)",
  },
};

function buildInputsYaml(i: PerformanceReportInputs): string {
  const out: string[] = [];
  out.push(`period_start: ${i.periodStart}`);
  out.push(`period_end: ${i.periodEnd}`);
  if (i.spend) out.push(`spend: ${i.spend}`);
  if (i.revenue) out.push(`revenue: ${i.revenue}`);
  if (i.roas) out.push(`roas: ${i.roas}`);
  if (i.cpa) out.push(`cpa: ${i.cpa}`);
  if (i.conversions) out.push(`conversions: ${i.conversions}`);
  if (i.goalRoas) out.push(`goal_roas: ${i.goalRoas}`);
  if (i.goalCpa) out.push(`goal_cpa: ${i.goalCpa}`);
  return out.join("\n");
}

export function ReportBuilder({
  root,
  agents,
  clientName,
  clientSlug,
  onClose,
}: Props) {
  const [form, setForm] = useState<PerformanceReportInputs>(empty);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);

  const aurelius = useMemo(() => findAurelius(agents), [agents]);

  const canRun = !streaming && !saved && !!aurelius;

  useEscapeClose(onClose, streaming);
  useStreamListener(
    (text) => setStreamText((p) => p + text),
    (msg) => setError(msg),
  );

  // Prefill KPIs from latest entry on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const latest = await api.readLatestKpis(root, clientSlug);
        if (!mounted || !latest) return;
        setForm((prev) => ({
          ...prev,
          spend: prev.spend || fmt(latest.spend),
          roas: prev.roas || fmt(latest.roas),
          cpa: prev.cpa || fmt(latest.cpa),
        }));
      } catch {
        /* noop */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [root, clientSlug]);

  const setField = <K extends keyof PerformanceReportInputs>(
    key: K,
    value: PerformanceReportInputs[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleRun = async () => {
    if (!canRun || !aurelius) return;
    setError(null);
    setStreamText("");
    setSaved(null);
    setVerdict(null);
    setStreaming(true);

    let aureliusBody = "";
    try {
      aureliusBody = await api.readAgentBody(root, aurelius.slug);
    } catch (e) {
      setError(`Could not read Aurelius body: ${e}`);
      setStreaming(false);
      return;
    }

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      knowledgeChunks = await api.matchKnowledgeChunks(
        root,
        "performance report ROAS CPA insights",
      );
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    const prompt = assemblePerformanceReportPrompt({
      aureliusBody,
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
        `Performance report · ${form.periodStart} → ${form.periodEnd}`;
      const summary = (parsed?.summary as string | undefined) ?? null;
      const v = (parsed?.verdict as string | undefined) ?? null;
      setVerdict(v);
      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: "reports",
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
        eyebrow="▸ PERFORMANCE REPORT · AURELIUS"
        tag="CLIENT-READY"
        clientName={clientName}
        onClose={onClose}
        closeDisabled={streaming}
        title={
          <>
            Hand me the period. <strong>Aurelius</strong> will write the report you'd
            send the client.
          </>
        }
        body={`KPIs vs goals, what worked, what didn't, next-period plan. Window prefills from your latest KPI entry.`}
      />

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ PERIOD</span>
            <span className="panel-meta">YYYY-MM-DD</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field
              label="Start"
              type="date"
              value={form.periodStart}
              onChange={(v) => setField("periodStart", v)}
              disabled={streaming || !!saved}
            />
            <Field
              label="End"
              type="date"
              value={form.periodEnd}
              onChange={(v) => setField("periodEnd", v)}
              disabled={streaming || !!saved}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ HEADLINE KPIS</span>
            <span className="panel-meta">prefilled from latest</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Spend ($)" value={form.spend} onChange={(v) => setField("spend", v)} disabled={streaming || !!saved} />
            <Field label="Revenue ($)" value={form.revenue} onChange={(v) => setField("revenue", v)} disabled={streaming || !!saved} />
            <Field label="ROAS (×)" value={form.roas} onChange={(v) => setField("roas", v)} disabled={streaming || !!saved} />
            <Field label="CPA ($)" value={form.cpa} onChange={(v) => setField("cpa", v)} disabled={streaming || !!saved} />
            <Field label="Conversions" value={form.conversions} onChange={(v) => setField("conversions", v)} disabled={streaming || !!saved} />
            <Field label="ROAS goal (×)" value={form.goalRoas} onChange={(v) => setField("goalRoas", v)} disabled={streaming || !!saved} />
            <Field label="CPA goal ($)" value={form.goalCpa} onChange={(v) => setField("goalCpa", v)} disabled={streaming || !!saved} />
          </div>
        </div>
      </section>

      <section className="row-split reveal reveal-3" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ NOTES</span>
            <span className="panel-meta">context for Aurelius</span>
          </div>
          <textarea
            className="kpi-form-textarea"
            placeholder="What changed this period? Creative refresh, audience tweak, landing page edit, seasonality?"
            value={form.campaignNotes}
            onChange={(e) => setField("campaignNotes", e.target.value)}
            disabled={streaming || !!saved}
            style={{ minHeight: 220 }}
          />
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ PASTE EXPORT</span>
            <span className="panel-meta">optional · any format</span>
          </div>
          <textarea
            className="kpi-form-textarea"
            placeholder="Paste a CSV / table / Ads Manager dump for per-campaign breakdown."
            value={form.paste}
            onChange={(e) => setField("paste", e.target.value)}
            disabled={streaming || !!saved}
            style={{ minHeight: 220, fontFamily: "var(--mono)", fontSize: 13 }}
          />
        </div>
      </section>

      {!saved && (
        <div className="actions-row reveal reveal-4" style={{ marginBottom: 32 }}>
          <button type="button" className="action primary" onClick={handleRun} disabled={!canRun}>
            {streaming ? "Writing report…" : "Generate report"}
          </button>
          <button type="button" className="action" onClick={onClose} disabled={streaming}>
            Cancel
          </button>
          {!aurelius && (
            <span style={{ marginLeft: 12, color: "var(--signal-stop)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
              AURELIUS AGENT NOT FOUND
            </span>
          )}
        </div>
      )}

      {(streaming || streamText) && !saved && (
        <StreamPanel agentName="Aurelius" streaming={streaming} streamText={streamText} />
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
              setVerdict(null);
              setForm(empty());
            }}
            badge={verdict ? verdict.replace("_", " ") : null}
            badgeTone={verdict ? VERDICT_TONE[verdict] : undefined}
          />
          <FullTranscript title="▸ FULL REPORT" agent="AURELIUS" body={saved.body} />
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
  type = "number",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: "number" | "date";
}) {
  return (
    <div>
      <label className="kpi-form-label">{label}</label>
      <input
        className="kpi-form-input"
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

