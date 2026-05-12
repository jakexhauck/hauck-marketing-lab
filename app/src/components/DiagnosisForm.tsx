import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { assembleDiagnosisPrompt, type DiagnosisPromptInputs } from "../lib/prompt";
import type {
  AgentSummary,
  DiagnosisFile,
  DiagnosisInputs,
  KnowledgeChunk,
  StreamEvent,
  VaultNote,
} from "../lib/types";

type Props = {
  root: string;
  agents: AgentSummary[];
  clientName: string;
  clientSlug: string;
  onClose: () => void;
};

type FieldKey =
  | "spend"
  | "cpm"
  | "ctr"
  | "cvr"
  | "cpa"
  | "roas"
  | "frequency"
  | "creatives_active";

type FormState = Record<FieldKey, string>;

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  placeholder: string;
  integer?: boolean;
}> = [
  { key: "spend", label: "Spend ($)", placeholder: "1847" },
  { key: "cpm", label: "CPM ($)", placeholder: "32.4" },
  { key: "ctr", label: "CTR (%)", placeholder: "1.4" },
  { key: "cvr", label: "CVR (%)", placeholder: "2.8" },
  { key: "cpa", label: "CPA ($)", placeholder: "48" },
  { key: "roas", label: "ROAS (×)", placeholder: "1.6" },
  { key: "frequency", label: "Frequency", placeholder: "2.1" },
  { key: "creatives_active", label: "Creatives Active", placeholder: "8", integer: true },
];

const EMPTY: FormState = {
  spend: "",
  cpm: "",
  ctr: "",
  cvr: "",
  cpa: "",
  roas: "",
  frequency: "",
  creatives_active: "",
};

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseInt32(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function findZenith(agents: AgentSummary[]): AgentSummary | null {
  return (
    agents.find((a) => a.slug === "zenith") ??
    agents.find((a) => a.name.toLowerCase() === "zenith") ??
    null
  );
}

export function DiagnosisForm({ root, agents, clientName, clientSlug, onClose }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [paste, setPaste] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<DiagnosisFile | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const zenith = useMemo(() => findZenith(agents), [agents]);

  const canRun =
    !streaming &&
    !saved &&
    !!zenith &&
    (paste.trim().length > 0 ||
      FIELDS.some((f) => form[f.key].trim().length > 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !streaming) {
        onClose();
      }
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
        if (evt.kind === "delta") {
          setStreamText((prev) => prev + evt.text);
        } else if (evt.kind === "error") {
          setError(evt.message);
        }
      })
      .then((un) => {
        if (!mounted) {
          un();
          return;
        }
        unlistenFn = un;
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

  const setField = (key: FieldKey, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleRun = async () => {
    if (!canRun || !zenith) return;
    setError(null);
    setStreamText("");
    setSaved(null);
    setStreaming(true);

    const promptInputs: DiagnosisPromptInputs = {
      spend: parseNum(form.spend),
      cpm: parseNum(form.cpm),
      ctr: parseNum(form.ctr),
      cvr: parseNum(form.cvr),
      cpa: parseNum(form.cpa),
      roas: parseNum(form.roas),
      frequency: parseNum(form.frequency),
      creatives_active: parseInt32(form.creatives_active),
    };

    const fileInputs: DiagnosisInputs = {
      ...promptInputs,
      paste_dump: paste.trim().length > 0 ? paste : null,
    };

    let zenithBody = "";
    try {
      zenithBody = await api.readAgentBody(root, zenith.slug);
    } catch (e) {
      setError(`Could not read Zenith body: ${e}`);
      setStreaming(false);
      return;
    }

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      const query =
        paste.trim().length > 0 ? paste.trim() : "diagnose campaign performance";
      knowledgeChunks = await api.matchKnowledgeChunks(root, query);
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    let aboutNotes: VaultNote[] = [];
    let clientNotes: VaultNote[] = [];
    try {
      [aboutNotes, clientNotes] = await Promise.all([
        api.readAboutNotes(root),
        api.readClientNotes(root, clientSlug),
      ]);
    } catch (e) {
      console.error("vault context fetch failed", e);
    }

    const prompt = assembleDiagnosisPrompt({
      zenithBody,
      inputs: promptInputs,
      paste,
      clientName,
      knowledgeChunks,
      aboutNotes,
      clientNotes,
    });

    const id = crypto.randomUUID();
    try {
      const full = await api.invokeClaude(id, prompt);
      const finalText = full || streamText;
      const file = await api.saveDiagnosis(root, clientSlug, fileInputs, finalText);
      setSaved(file);
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  const verdictTone = (v: DiagnosisFile["verdict"]) => {
    if (v === "kill")
      return {
        background: "rgba(248, 113, 113, 0.13)",
        borderColor: "rgba(248, 113, 113, 0.4)",
        color: "var(--signal-stop)",
      };
    if (v === "scale")
      return {
        background: "rgba(95, 230, 153, 0.13)",
        borderColor: "rgba(95, 230, 153, 0.4)",
        color: "var(--signal-go)",
      };
    return undefined;
  };

  return (
    <main className="main" style={{ position: "relative" }}>
      <section className="hero reveal reveal-1">
        <div className="hero-eyebrow">
          <span>▸ DIAGNOSIS · ZENITH</span>
          <span className="verdict">PASTE OR FILL</span>
          <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
            CLIENT · {clientName.toUpperCase()}
          </span>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            disabled={streaming}
            title="Close diagnosis"
            aria-label="Close diagnosis"
            style={{ marginLeft: 12 }}
          >
            ×
          </button>
        </div>
        <h1>
          Hand me the snapshot. <strong>Zenith</strong> will diagnose the bottleneck.
        </h1>
        <p className="hero-body">
          Paste a campaign export, or fill any structured fields you have. Zenith will surface 1–4
          findings attributed to the agent that owns each layer, plus a verdict and a scale score.
        </p>
      </section>

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ STRUCTURED INPUT</span>
            <span className="panel-meta">optional · any subset</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px 18px",
            }}
          >
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="kpi-form-label">{f.label}</label>
                <input
                  className="kpi-form-input"
                  type="number"
                  inputMode="decimal"
                  step={f.integer ? "1" : "any"}
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  disabled={streaming || !!saved}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ PASTE DUMP</span>
            <span className="panel-meta">any format</span>
          </div>
          <textarea
            className="kpi-form-textarea"
            placeholder="paste a campaign snapshot here — any format. Ad set names, daily numbers, screenshots-of-tables-as-text, anything Zenith can chew on."
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            disabled={streaming || !!saved}
            style={{ minHeight: 380, fontFamily: "var(--mono)", fontSize: 13 }}
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
            {streaming ? "Diagnosing…" : "Run diagnosis"}
          </button>
          <button
            type="button"
            className="action"
            onClick={onClose}
            disabled={streaming}
          >
            Cancel
          </button>
          {!zenith && (
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
              ZENITH AGENT NOT FOUND IN agents/
            </span>
          )}
        </div>
      )}

      {(streaming || streamText) && !saved && (
        <section className="panel reveal reveal-4" style={{ marginBottom: 32 }}>
          <div className="panel-head">
            <span className="panel-title">▸ ZENITH · DRAFTING</span>
            <span className="panel-meta">
              {streaming ? "streaming" : "complete"}
            </span>
          </div>
          <div
            ref={transcriptRef}
            className="thread"
            style={{
              maxHeight: 420,
              padding: 0,
              gap: 0,
            }}
          >
            <div className="msg agent">
              <div className="msg-label">ZENITH ›</div>
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
          style={{
            marginBottom: 32,
            borderLeft: "2px solid var(--signal-stop)",
          }}
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
              <span className="panel-title">▸ DIAGNOSIS RECORDED</span>
              <span className="panel-meta">
                {saved.path.split(/[\\/]/).slice(-2).join("/")}
              </span>
            </div>

            <div
              className="hero-eyebrow"
              style={{ marginBottom: 18, paddingTop: 6 }}
            >
              <span>VERDICT</span>
              <span className="verdict" style={verdictTone(saved.verdict)}>
                ▸ {saved.verdict.toUpperCase()}
              </span>
              <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
                SCALE SCORE · {saved.scale_score}/100
              </span>
            </div>

            <div className="diag-headline" style={{ marginBottom: 16 }}>
              {saved.headline}
            </div>
            {saved.body && saved.body !== saved.headline && (
              <p
                className="hero-body"
                style={{ marginBottom: 18, fontSize: 15, color: "var(--text-mid)" }}
              >
                {saved.body}
              </p>
            )}

            {saved.findings.length > 0 && (
              <ul className="diag-list">
                {saved.findings.map((f, i) => (
                  <li key={i} className="diag-item">
                    <span className={`diag-dot ${f.severity}`} />
                    <span className="diag-attr">
                      {f.attribution} · {f.severity.toUpperCase()}
                    </span>
                    <span className="diag-text">{f.body}</span>
                  </li>
                ))}
              </ul>
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
                  setForm(EMPTY);
                  setPaste("");
                }}
              >
                Run another diagnosis
              </button>
            </div>
          </section>

          <section className="panel reveal reveal-4">
            <div className="panel-head">
              <span className="panel-title">▸ FULL TRANSCRIPT</span>
              <span className="panel-meta">zenith · verbatim</span>
            </div>
            <div className="thread" style={{ maxHeight: 480, padding: 0, gap: 0 }}>
              <div className="msg agent">
                <div className="msg-label">ZENITH ›</div>
                <div className="msg-body">{saved.transcript}</div>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
