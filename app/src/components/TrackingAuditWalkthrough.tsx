import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/tauri";
import {
  assembleTrackingAuditPrompt,
  type TrackingAuditWalkInputs,
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
import { PastResults } from "./generators/PastResults";
import { logActivity } from "../lib/activity";
import { writeBackMemory } from "../lib/memoryWriteback";

type Props = {
  root: string;
  agents: AgentSummary[];
  clientName: string;
  clientSlug: string;
  onClose: () => void;
};

const empty = (): TrackingAuditWalkInputs => ({
  pixelId: "",
  pixelInstalled: "all",
  capiConfigured: "yes",
  capiAccessToken: "valid",
  dedup: "verified",
  emqScore: "",
  events: {
    pageView: true,
    viewContent: true,
    lead: true,
    purchase: false,
  },
  userDataParams: ["fbp", "fbc", "em"],
  notes: "",
});

const PIXEL_OPTS: TrackingAuditWalkInputs["pixelInstalled"][] = ["all", "some", "none"];
const CAPI_CONF: TrackingAuditWalkInputs["capiConfigured"][] = ["yes", "partial", "no"];
const TOKEN_OPTS: TrackingAuditWalkInputs["capiAccessToken"][] = ["valid", "expired", "missing"];
const DEDUP_OPTS: TrackingAuditWalkInputs["dedup"][] = ["verified", "unknown", "broken"];
const USER_DATA_PARAMS: Array<{ key: string; label: string }> = [
  { key: "fbp", label: "fbp (browser ID)" },
  { key: "fbc", label: "fbc (click ID)" },
  { key: "external_id", label: "external_id" },
  { key: "em", label: "em (email hash)" },
  { key: "ph", label: "ph (phone hash)" },
  { key: "fn", label: "fn (first name)" },
  { key: "ln", label: "ln (last name)" },
];

const READY_TONE: Record<string, { background: string; borderColor: string; color: string }> = {
  yes: {
    background: "rgba(95, 230, 153, 0.13)",
    borderColor: "rgba(95, 230, 153, 0.4)",
    color: "var(--signal-go)",
  },
  conditional: {
    background: "rgba(251, 191, 36, 0.13)",
    borderColor: "rgba(251, 191, 36, 0.4)",
    color: "var(--signal-hold)",
  },
  no: {
    background: "rgba(248, 113, 113, 0.13)",
    borderColor: "rgba(248, 113, 113, 0.4)",
    color: "var(--signal-stop)",
  },
};

function findNexus(agents: AgentSummary[]): AgentSummary | null {
  return (
    agents.find((a) => a.slug === "nexus") ??
    agents.find((a) => a.name.toLowerCase() === "nexus") ??
    null
  );
}

function buildInputsYaml(i: TrackingAuditWalkInputs): string {
  const out: string[] = [];
  out.push(`pixel_id: "${i.pixelId.replace(/"/g, '\\"')}"`);
  out.push(`pixel_installed: ${i.pixelInstalled}`);
  out.push(`capi_configured: ${i.capiConfigured}`);
  out.push(`capi_access_token: ${i.capiAccessToken}`);
  out.push(`dedup: ${i.dedup}`);
  if (i.emqScore) out.push(`emq_score: ${i.emqScore}`);
  out.push("events:");
  out.push(`  page_view: ${i.events.pageView}`);
  out.push(`  view_content: ${i.events.viewContent}`);
  out.push(`  lead: ${i.events.lead}`);
  out.push(`  purchase: ${i.events.purchase}`);
  out.push(`user_data_params: [${i.userDataParams.join(", ")}]`);
  return out.join("\n");
}

export function TrackingAuditWalkthrough({
  root,
  agents,
  clientName,
  clientSlug,
  onClose,
}: Props) {
  const [form, setForm] = useState<TrackingAuditWalkInputs>(empty);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GeneratorOutput | null>(null);
  const [launchReady, setLaunchReady] = useState<string | null>(null);
  const [pastRefresh, setPastRefresh] = useState(0);

  const nexus = useMemo(() => findNexus(agents), [agents]);

  const canRun = !streaming && !saved && !!nexus;

  useEscapeClose(onClose, streaming);
  useStreamListener(
    (text) => setStreamText((p) => p + text),
    (msg) => setError(msg),
  );

  // Prefill from existing tracking yaml + credentials
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [tracking, creds] = await Promise.all([
          api.readTrackingAudit(root, clientSlug),
          api.readClientCredentials(root, clientSlug).catch(() => null),
        ]);
        if (!mounted) return;
        setForm((prev) => ({
          ...prev,
          pixelId: prev.pixelId || creds?.meta.pixel_id || "",
          capiConfigured:
            tracking?.capi_status === "ok"
              ? "yes"
              : tracking?.capi_status === "warning"
                ? "partial"
                : tracking?.capi_status === "missing"
                  ? "no"
                  : prev.capiConfigured,
          emqScore:
            prev.emqScore ||
            (tracking?.emq_score !== null && tracking?.emq_score !== undefined
              ? String(tracking.emq_score)
              : ""),
        }));
      } catch {
        /* noop */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [root, clientSlug]);

  const setField = <K extends keyof TrackingAuditWalkInputs>(
    key: K,
    value: TrackingAuditWalkInputs[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleEvent = (k: keyof TrackingAuditWalkInputs["events"]) =>
    setForm((p) => ({ ...p, events: { ...p.events, [k]: !p.events[k] } }));

  const toggleParam = (key: string) =>
    setForm((p) => {
      const exists = p.userDataParams.includes(key);
      return {
        ...p,
        userDataParams: exists
          ? p.userDataParams.filter((k) => k !== key)
          : [...p.userDataParams, key],
      };
    });

  const handleRun = async () => {
    if (!canRun || !nexus) return;
    setError(null);
    setStreamText("");
    setSaved(null);
    setLaunchReady(null);
    setStreaming(true);

    let nexusBody = "";
    try {
      nexusBody = await api.readAgentBody(root, nexus.slug);
    } catch (e) {
      setError(`Could not read Nexus body: ${e}`);
      setStreaming(false);
      return;
    }

    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      knowledgeChunks = await api.matchKnowledgeChunks(
        root,
        "tracking pixel CAPI EMQ dedup audit",
      );
    } catch (e) {
      console.error("matchKnowledgeChunks failed", e);
    }

    const prompt = assembleTrackingAuditPrompt({
      nexusBody,
      clientName,
      inputs: form,
      knowledgeChunks,
    });

    const id = crypto.randomUUID();
    try {
      const full = await api.invokeClaude(id, prompt);
      const finalText = full || streamText;
      const parsed = extractJson(finalText);
      const ready = (parsed?.launch_ready as string | undefined) ?? null;
      setLaunchReady(ready);
      const title =
        (parsed?.headline as string | undefined) ??
        `Tracking audit · ${clientName}`;
      const summary = (parsed?.summary as string | undefined) ?? null;
      const output = await api.saveGeneratorOutput({
        root,
        clientSlug,
        kind: "audits",
        title,
        summary,
        body: finalText,
        inputsYaml: buildInputsYaml(form),
      });
      setSaved(output);
      setPastRefresh((n) => n + 1);

      void logActivity(root, {
        type: "form.run",
        summary: `Tracking audit: ${output.title}`,
        clientSlug,
        refPath: output.path,
      });
      void writeBackMemory({
        root,
        clientSlug,
        clientName,
        outputPath: output.path,
        formTitle: "Tracking audit",
        body: finalText,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <main className="main" style={{ position: "relative" }}>
      <HeroBar
        eyebrow="▸ TRACKING AUDIT · NEXUS"
        tag="LAUNCH GATE"
        clientName={clientName}
        onClose={onClose}
        closeDisabled={streaming}
        title={
          <>
            Walk me through the setup. <strong>Nexus</strong> will produce a per-check
            audit with copy-paste fixes.
          </>
        }
        body="Pixel · events · CAPI · dedup · EMQ. Output saves to outputs/audits/ with launch-ready verdict."
      />

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ PIXEL</span>
            <span className="panel-meta">browser side</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label className="kpi-form-label">Pixel ID</label>
              <input
                className="kpi-form-input"
                placeholder="1234567890"
                value={form.pixelId}
                onChange={(e) => setField("pixelId", e.target.value)}
                disabled={streaming || !!saved}
              />
            </div>
            <div>
              <label className="kpi-form-label">Installed on pages</label>
              <div className="status-toggle">
                {PIXEL_OPTS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`status-toggle-btn ${form.pixelInstalled === opt ? `active ${opt === "all" ? "ok" : opt === "some" ? "warning" : "missing"}` : ""}`}
                    onClick={() => setField("pixelInstalled", opt)}
                    disabled={streaming || !!saved}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="kpi-form-label">Events firing</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(
                  [
                    ["pageView", "PageView"],
                    ["viewContent", "ViewContent"],
                    ["lead", "Lead"],
                    ["purchase", "Purchase"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: "var(--mono)",
                      fontSize: 12.5,
                      color: form.events[key] ? "var(--text)" : "var(--text-faint)",
                      cursor: streaming || !!saved ? "default" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.events[key]}
                      onChange={() => toggleEvent(key)}
                      disabled={streaming || !!saved}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ CAPI · DEDUP · EMQ</span>
            <span className="panel-meta">server side</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label className="kpi-form-label">CAPI configured</label>
              <div className="status-toggle">
                {CAPI_CONF.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`status-toggle-btn ${form.capiConfigured === opt ? `active ${opt === "yes" ? "ok" : opt === "partial" ? "warning" : "missing"}` : ""}`}
                    onClick={() => setField("capiConfigured", opt)}
                    disabled={streaming || !!saved}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="kpi-form-label">CAPI access token</label>
              <div className="status-toggle">
                {TOKEN_OPTS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`status-toggle-btn ${form.capiAccessToken === opt ? `active ${opt === "valid" ? "ok" : opt === "expired" ? "warning" : "missing"}` : ""}`}
                    onClick={() => setField("capiAccessToken", opt)}
                    disabled={streaming || !!saved}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="kpi-form-label">event_id parity (dedup)</label>
              <div className="status-toggle">
                {DEDUP_OPTS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`status-toggle-btn ${form.dedup === opt ? `active ${opt === "verified" ? "ok" : opt === "unknown" ? "warning" : "missing"}` : ""}`}
                    onClick={() => setField("dedup", opt)}
                    disabled={streaming || !!saved}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="kpi-form-label">EMQ score (0-10)</label>
              <input
                className="kpi-form-input"
                type="number"
                step="0.1"
                min="0"
                max="10"
                placeholder="7.2"
                value={form.emqScore}
                onChange={(e) => setField("emqScore", e.target.value)}
                disabled={streaming || !!saved}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="row-split reveal reveal-3" style={{ marginBottom: 32 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ USER-DATA PARAMS</span>
            <span className="panel-meta">improves EMQ</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {USER_DATA_PARAMS.map(({ key, label }) => {
              const active = form.userDataParams.includes(key);
              return (
                <button
                  type="button"
                  key={key}
                  className={`status-toggle-btn ${active ? "active ok" : ""}`}
                  onClick={() => toggleParam(key)}
                  disabled={streaming || !!saved}
                  style={{ justifyContent: "flex-start" }}
                >
                  {active ? "✓ " : ""}{label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">▸ NOTES</span>
            <span className="panel-meta">context for Nexus</span>
          </div>
          <textarea
            className="kpi-form-textarea"
            placeholder="Recent attribution discrepancies, GTM/Shopify quirks, anything Nexus should investigate."
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            disabled={streaming || !!saved}
            style={{ minHeight: 140 }}
          />
        </div>
      </section>

      {!saved && (
        <div className="actions-row reveal reveal-4" style={{ marginBottom: 32 }}>
          <button type="button" className="action primary" onClick={handleRun} disabled={!canRun}>
            {streaming ? "Auditing…" : "Run tracking audit"}
          </button>
          <button type="button" className="action" onClick={onClose} disabled={streaming}>
            Cancel
          </button>
          {!nexus && (
            <span style={{ marginLeft: 12, color: "var(--signal-stop)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
              NEXUS AGENT NOT FOUND
            </span>
          )}
        </div>
      )}

      {(streaming || streamText) && !saved && (
        <StreamPanel agentName="Nexus" streaming={streaming} streamText={streamText} kind="audits" />
      )}
      {error && <ErrorPanel error={error} />}

      {!saved && !streaming && !streamText && (
        <PastResults
          root={root}
          clientSlug={clientSlug}
          kind="audits"
          refreshKey={pastRefresh}
          onSelect={(out) => {
            setSaved(out);
            setStreamText("");
            setError(null);
            const parsed = extractJson(out.body);
            const ready = (parsed?.launch_ready as string | undefined) ?? null;
            setLaunchReady(ready);
          }}
        />
      )}

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
              setLaunchReady(null);
              setForm(empty());
            }}
            badge={launchReady ? `LAUNCH READY · ${launchReady}` : null}
            badgeTone={launchReady ? READY_TONE[launchReady] : undefined}
          />
          <FullTranscript title="▸ FULL AUDIT" agent="NEXUS" body={saved.body} kind="audits" />
          <PastResults
            root={root}
            clientSlug={clientSlug}
            kind="audits"
            refreshKey={pastRefresh}
            activePath={saved.path}
            onSelect={(out) => {
              setSaved(out);
              setStreamText("");
              setError(null);
              const parsed = extractJson(out.body);
              const ready = (parsed?.launch_ready as string | undefined) ?? null;
              setLaunchReady(ready);
            }}
          />
        </>
      )}
    </main>
  );
}
