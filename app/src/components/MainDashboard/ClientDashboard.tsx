/**
 * ClientDashboard, per-client surface.
 *
 * No sub-nav of its own. The left sidebar (AppSidebar) renders the per-client
 * section list (Onboarding Â· Dashboard Â· Ads Â· Recordings Â· Websites Â· Drive
 * Â· Reporting Â· Settings) and drives `section`. We just render the active
 * pane based on it.
 *
 * Section map:
 *   onboarding â†’ OnboardingChecklist (pre-launch only, sidebar hides it after)
 *   dashboard  â†’ ClientOverviewPanel (stats, account status, key dates)
 *   ads        â†’ Meta Ads Manager on top + non-reporting forms underneath
 *   recordings â†’ Fathom transcript ingest + per-client recordings list
 *   websites   â†’ WebDesignerPage
 *   drive      â†’ ClientDriveView
 *   reporting  â†’ Weekly + Monthly report forms only
 *   settings   â†’ Profile editor + Memory.md view
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentSummary,
  ClientEntry,
  DashboardState,
  FathomRecording,
  OpsClientRow,
  VaultNote,
} from "../../lib/types";
import type { ClientSection } from "../../lib/navigation";
import type { FormSurfaceId } from "../../lib/formConfigs";
import { api } from "../../lib/tauri";
import {
  buildProfileBody,
  buildProfileFront,
  emptyProfileFormValues,
  parseProfileBody,
  profilePathFor,
  type ProfileFormValues,
} from "../../lib/clientProfile";
import { ClientMediaBuying } from "./ClientMediaBuying";
import { ClientDocuments } from "./pages/ClientDocuments";
import { WebDesignerPage } from "./WebDesignerPage";
import { recordingsPageCSS, openFathomInApp } from "./RecordingsPage";
import { TranscriptIngestPanel } from "./TranscriptIngestPanel";
import { OnboardingChecklist } from "../OnboardingChecklist";
import { AdsManagerPage } from "./AdsManagerPage";
import { AdsSequenceWizard } from "../AdsSequenceWizard";
import { emptySequenceState, type SequenceState } from "../../lib/mediaBuyingSequence";
import { deriveTargetCpa } from "../../lib/adsOptimizer";
import { ClientDriveSettings } from "../ClientDriveSettings";
import {
  IconBarChart,
  IconRecordings,
} from "../icons";

interface ClientDashboardProps {
  client: ClientEntry;
  section: ClientSection;
  root: string | null;
  agents: AgentSummary[];
  onSelectSection: (section: ClientSection) => void;
  onOpenForm: (id: FormSurfaceId, clientSlug: string, clientName: string) => void;
  onOpenDrive?: () => void;
}

/** Sections valid for a given client status. Used to bounce the user off a
 *  section the sidebar would hide (e.g. Onboarding on a live client). */
function isSectionAllowed(section: ClientSection, status: ClientEntry["status"]): boolean {
  if (section === "onboarding") return status === "pre-launch";
  return true;
}

export function ClientDashboard({
  client,
  section,
  root,
  agents,
  onSelectSection,
  onOpenForm,
}: ClientDashboardProps) {
  // Bounce off disallowed sections (e.g. landing on Onboarding for a live
  // client). The sidebar handles which sections render; this just keeps the
  // route honest.
  useEffect(() => {
    if (!isSectionAllowed(section, client.status)) {
      onSelectSection(client.status === "pre-launch" ? "onboarding" : "dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, client.status]);

  return (
    <div className="hml-client-shell">
      {section === "dashboard" && (
        <ClientOverviewPanel client={client} root={root} />
      )}
      {section === "onboarding" && (
        <OnboardingChecklist
          root={root}
          clientSlug={client.slug}
          clientName={client.name}
          agents={agents}
          onComplete={() => {
            if (client.status !== "pre-launch") onSelectSection("dashboard");
          }}
        />
      )}
      {section === "ads" && (
        client.status === "pre-launch" && root ? (
          <OnboardingAdsSequenceTab
            root={root}
            client={client}
            agents={agents}
            onExit={() => onSelectSection("dashboard")}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <AdsManagerPage
              mode="client"
              clients={[client]}
              activeClientSlug={client.slug}
              root={root}
            />
            <ClientMediaBuying
              clientName={client.name}
              onOpenForm={(id) => onOpenForm(id, client.slug, client.name)}
              includeGroups={["creative", "audiences", "campaigns", "comms"]}
              compact
            />
          </div>
        )
      )}
      {section === "documents" && (
        root ? (
          <ClientDocuments client={client} root={root} />
        ) : (
          <div className="hml-empty">
            <div className="hml-empty-title">Pick a media-buying folder</div>
            <div className="hml-empty-sub">
              The documents tab needs the vault root to read and write docs.
            </div>
          </div>
        )
      )}
      {section === "recordings" && (
        <ClientRecordingsView
          root={root}
          clientSlug={client.slug}
          clientName={client.name}
        />
      )}
      {section === "websites" && (
        <WebDesignerPage
          root={root}
          clientSlug={client.slug}
          clientName={client.name}
        />
      )}
      {section === "reporting" && (
        <ClientMediaBuying
          clientName={client.name}
          onOpenForm={(id) => onOpenForm(id, client.slug, client.name)}
          includeGroups={["reports"]}
        />
      )}
      {section === "settings" && (
        <ClientSettingsPanel
          client={client}
          root={root}
          clientSlug={client.slug}
        />
      )}
    </div>
  );
}

/** Ads tab surface for clients still in onboarding. Loads the onboarding
 *  state, hands the sequence block to AdsSequenceWizard, and persists changes
 *  back to the same `onboarding.json` the OnboardingChecklist owns. Mirrors
 *  the load/persist pattern in OnboardingChecklist so the two surfaces stay
 *  in sync. */
function OnboardingAdsSequenceTab({
  root,
  client,
  agents,
  onExit,
}: {
  root: string;
  client: ClientEntry;
  agents: AgentSummary[];
  onExit: () => void;
}) {
  const [doneSet, setDoneSet] = useState<Set<string>>(() => new Set());
  const [skippedSet, setSkippedSet] = useState<Set<string>>(() => new Set());
  const [phaseDoneAt, setPhaseDoneAt] = useState<Record<string, string>>({});
  const [sequenceState, setSequenceState] = useState<SequenceState>(() => emptySequenceState());
  const [loaded, setLoaded] = useState(false);
  const skipNextPersist = useRef(true);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    skipNextPersist.current = true;
    setLoaded(false);
    void (async () => {
      try {
        const state = await api.readOnboardingState(root, client.slug);
        if (cancelled) return;
        setDoneSet(new Set(state.done ?? []));
        setSkippedSet(new Set(state.skippedOptional ?? []));
        setPhaseDoneAt(state.phaseDoneAt ?? {});
        if (state.sequence) {
          setSequenceState({
            currentStep: state.sequence.currentStep as SequenceState["currentStep"],
            stepOutputs: state.sequence.stepOutputs as SequenceState["stepOutputs"],
            skipped: state.sequence.skipped as SequenceState["skipped"],
            launchedAt: state.sequence.launchedAt,
            driveFolderId: state.sequence.driveFolderId,
            campaignSkeleton: state.sequence.campaignSkeleton as SequenceState["campaignSkeleton"],
          });
        } else {
          setSequenceState(emptySequenceState());
        }
      } catch {
        if (!cancelled) {
          setDoneSet(new Set());
          setSkippedSet(new Set());
          setPhaseDoneAt({});
          setSequenceState(emptySequenceState());
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, client.slug]);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api
        .writeOnboardingState(root, client.slug, {
          done: Array.from(doneSet),
          skippedOptional: Array.from(skippedSet),
          phaseDoneAt,
          sequence: sequenceState,
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("ads-tab onboarding persist failed", err);
        });
    }, 300);
  }, [root, client.slug, doneSet, skippedSet, phaseDoneAt, sequenceState, loaded]);

  useEffect(
    () => () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  if (!loaded) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-sub">Loading ads sequence…</div>
      </div>
    );
  }

  return (
    <AdsSequenceWizard
      root={root}
      clientName={client.name}
      clientSlug={client.slug}
      agents={agents}
      sequenceState={sequenceState}
      onSequenceChange={(next) => setSequenceState(next)}
      onTaskTick={(taskId) =>
        setDoneSet((prev) => {
          if (prev.has(taskId)) return prev;
          const n = new Set(prev);
          n.add(taskId);
          return n;
        })
      }
      onClose={onExit}
    />
  );
}

/** Settings pane: Profile editor on top, Memory.md view below. Lives behind
 *  the per-client "Settings" sidebar entry, replacing the old Profile + Memory
 *  top-level tabs. */
function ClientSettingsPanel({
  client,
  root,
  clientSlug,
}: {
  client: ClientEntry;
  root: string | null;
  clientSlug: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ClientDriveSettings client={client} root={root} />
      <ClientOptimizerSettings client={client} root={root} />
      <ClientProfileInlineEditor client={client} root={root} />
      <ClientNoteView
        root={root}
        clientSlug={clientSlug}
        match="memory"
        emptyLabel="No Memory.md yet."
      />
    </div>
  );
}

/**
 * Optimizer settings â€” operator enters LTV (avg customer value), the app
 * derives target CPA as LTV / target_ROAS. Default ROAS is 3.0 (lesson 3.2's
 * "client is happy" floor). Optional override for niches the math doesn't
 * fit. Until LTV (or override) is set, the optimizer skips this client.
 */
function ClientOptimizerSettings({
  client,
  root,
}: {
  client: ClientEntry;
  root: string | null;
}) {
  const numStr = (n: number | null | undefined) =>
    typeof n === "number" && n > 0 ? String(n) : "";

  const initialLtv = numStr(client.avg_customer_value);
  const initialRoas = numStr(client.target_roas);
  const initialOverride = numStr(client.target_cpa_override);
  const initialMode: "off" | "suggest" =
    client.optimizer_mode === "suggest" ? "suggest" : "off";

  const [ltvStr, setLtvStr] = useState(initialLtv);
  const [roasStr, setRoasStr] = useState(initialRoas);
  const [overrideStr, setOverrideStr] = useState(initialOverride);
  const [mode, setMode] = useState<"off" | "suggest">(initialMode);
  const [showAdvanced, setShowAdvanced] = useState(
    initialOverride !== "" || initialRoas !== "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Resync on client switch.
  useEffect(() => {
    setLtvStr(initialLtv);
    setRoasStr(initialRoas);
    setOverrideStr(initialOverride);
    setMode(initialMode);
    setShowAdvanced(initialOverride !== "" || initialRoas !== "");
    setErr(null);
    setSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.slug]);

  const parsePositive = (s: string): number | null | typeof Number.NaN => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) return Number.NaN;
    return n;
  };

  const ltvParsed = parsePositive(ltvStr);
  const roasParsed = parsePositive(roasStr);
  const overrideParsed = parsePositive(overrideStr);

  const anyInvalid =
    ltvParsed === Number.NaN ||
    roasParsed === Number.NaN ||
    overrideParsed === Number.NaN;

  const derived = useMemo(() => {
    return deriveTargetCpa({
      avgCustomerValue: typeof ltvParsed === "number" ? ltvParsed : null,
      targetRoas: typeof roasParsed === "number" ? roasParsed : null,
      targetCpaOverride: typeof overrideParsed === "number" ? overrideParsed : null,
    });
  }, [ltvParsed, roasParsed, overrideParsed]);

  const initialLtvNum = client.avg_customer_value ?? null;
  const initialRoasNum = client.target_roas ?? null;
  const initialOverrideNum = client.target_cpa_override ?? null;

  const valOrNull = (v: number | null | typeof Number.NaN): number | null =>
    typeof v === "number" ? v : null;

  const dirty =
    valOrNull(ltvParsed) !== initialLtvNum ||
    valOrNull(roasParsed) !== initialRoasNum ||
    valOrNull(overrideParsed) !== initialOverrideNum ||
    mode !== initialMode;

  const canSave = !busy && !!root && !anyInvalid && dirty;

  const handleSave = async () => {
    if (!root) return;
    if (anyInvalid) {
      setErr("Values must be positive numbers, or empty.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.setClientOptimizer(
        root,
        client.slug,
        valOrNull(ltvParsed),
        valOrNull(roasParsed),
        valOrNull(overrideParsed),
        mode === "off" ? "off" : "suggest",
      );
      setSavedAt(Date.now());
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const fmtMoney = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <section
      style={{
        background: "var(--hml-bg-elev-1, rgba(255,255,255,0.03))",
        border: "1px solid var(--hml-border, rgba(255,255,255,0.08))",
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--hml-text-tertiary)",
            marginBottom: 4,
          }}
        >
          Optimizer
        </div>
        <div style={{ fontSize: 14, color: "var(--hml-text-primary)", fontWeight: 600 }}>
          24/7 campaign optimizer
        </div>
        <div style={{ fontSize: 12, color: "var(--hml-text-tertiary)", marginTop: 4 }}>
          KILL at 3Ã— target CPA Â· WATCH at 1.5-3Ã— Â· SCALE +25% at â‰¤target Â· REFRESH at freq 3.0+
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: 12,
          alignItems: "center",
        }}
      >
        <label style={{ fontSize: 12, color: "var(--hml-text-secondary)" }}>
          Average customer value ($)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="e.g. 80 â€” LTV per customer"
          value={ltvStr}
          onChange={(e) => setLtvStr(e.target.value)}
          disabled={busy}
          style={inputStyle}
        />

        <label style={{ fontSize: 12, color: "var(--hml-text-secondary)" }}>
          Mode
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "off" | "suggest")}
          disabled={busy}
          style={inputStyle}
        >
          <option value="off">Off â€” skip this client</option>
          <option value="suggest">Suggest â€” show verdicts, no auto-execute</option>
        </select>
      </div>

      {/* Live computed target CPA chip */}
      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: derived.value
            ? "rgba(180, 120, 255, 0.10)"
            : "var(--hml-bg-elev-2, rgba(255,255,255,0.03))",
          border: `1px solid ${
            derived.value
              ? "rgba(180, 120, 255, 0.30)"
              : "var(--hml-border, rgba(255,255,255,0.08))"
          }`,
          borderRadius: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--hml-text-tertiary)",
            }}
          >
            Derived target CPA
          </div>
          <div
            style={{
              fontFamily: "var(--hml-font-sans)",
              fontSize: 20,
              fontWeight: 600,
              color: derived.value
                ? "var(--hml-text-primary)"
                : "var(--hml-text-tertiary)",
              marginTop: 2,
            }}
          >
            {derived.value ? fmtMoney(derived.value) : "â€”"}
          </div>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--hml-text-tertiary)",
            textAlign: "right",
            maxWidth: 340,
            lineHeight: 1.5,
          }}
        >
          {derived.source === "override" && (
            <>Manual override active. LTV math ignored.</>
          )}
          {derived.source === "ltv" && typeof ltvParsed === "number" && (
            <>
              {fmtMoney(ltvParsed)} LTV Ã· {derived.effectiveRoas.toFixed(1)}Ã— target ROAS.
              KILL triggers at {fmtMoney(derived.value! * 3)}.
            </>
          )}
          {derived.source === "missing" && (
            <>Enter average customer value to activate the optimizer.</>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--hml-text-tertiary)",
            fontFamily: "inherit",
            fontSize: 11.5,
            cursor: "pointer",
            padding: 0,
            letterSpacing: "0.02em",
          }}
        >
          {showAdvanced ? "Hide advanced" : "Advancedâ€¦"}
        </button>
      </div>

      {showAdvanced && (
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "200px 1fr",
            gap: 12,
            alignItems: "center",
            paddingTop: 10,
            borderTop: "1px solid var(--hml-border-subtle, rgba(255,255,255,0.05))",
          }}
        >
          <label style={{ fontSize: 12, color: "var(--hml-text-secondary)" }}>
            Target ROAS (default 3.0Ã—)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            placeholder="3"
            value={roasStr}
            onChange={(e) => setRoasStr(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />

          <label style={{ fontSize: 12, color: "var(--hml-text-secondary)" }}>
            Manual CPA override ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="Leave empty to use LTV math"
            value={overrideStr}
            onChange={(e) => setOverrideStr(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
        </div>
      )}

      {err && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 11px",
            background: "rgba(239, 107, 107, 0.10)",
            border: "1px solid rgba(239, 107, 107, 0.32)",
            borderRadius: 7,
            color: "#ff8b8b",
            fontSize: 12,
          }}
        >
          {err}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {savedAt && (
          <span style={{ fontSize: 11, color: "var(--hml-text-tertiary)" }}>
            Saved.
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          style={{
            background: canSave
              ? "rgba(180, 120, 255, 0.22)"
              : "var(--hml-bg-elev-2, rgba(255,255,255,0.04))",
            border: `1px solid ${
              canSave ? "rgba(180, 120, 255, 0.5)" : "var(--hml-border, rgba(255,255,255,0.10))"
            }`,
            color: canSave ? "#d6bdff" : "var(--hml-text-tertiary)",
            borderRadius: 6,
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: canSave ? "pointer" : "not-allowed",
            letterSpacing: "0.02em",
          }}
        >
          {busy ? "Savingâ€¦" : "Save"}
        </button>
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--hml-bg-elev-2, rgba(255,255,255,0.06))",
  border: "1px solid var(--hml-border, rgba(255,255,255,0.10))",
  color: "var(--hml-text-primary)",
  borderRadius: 6,
  padding: "8px 11px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  maxWidth: 280,
};

/** Per-client overview surface â€” status snapshot, ops row stats, latest activity. */
function ClientOverviewPanel({
  client,
  root,
}: {
  client: ClientEntry;
  root: string | null;
}) {
  const [opsRow, setOpsRow] = useState<OpsClientRow | null>(null);
  const [recCount, setRecCount] = useState<number | null>(null);
  const [latestRec, setLatestRec] = useState<FathomRecording | null>(null);

  useEffect(() => {
    if (!root) {
      setOpsRow(null);
      setRecCount(null);
      setLatestRec(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ops = await api.readOpsClients(root);
        if (!cancelled) setOpsRow(ops.rows[client.slug] ?? null);
      } catch {
        if (!cancelled) setOpsRow(null);
      }
      try {
        const state = await api.readDashboardState(root);
        if (cancelled) return;
        const mine = (state.recordings ?? []).filter(
          (r) => r.clientSlug === client.slug,
        );
        setRecCount(mine.length);
        mine.sort((a, b) => b.createdAt - a.createdAt);
        setLatestRec(mine[0] ?? null);
      } catch {
        if (!cancelled) {
          setRecCount(null);
          setLatestRec(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, client.slug]);

  const fmtMoney = (n: number | null | undefined) =>
    n == null ? "â€”" : `$${n.toLocaleString()}`;
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "â€”";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Patch a partial OpsClientRow into ops/clients.json and reflect in local
  // state. When `invoicePaidAt` is set for the first time, retainer
  // `startDate` is auto-filled to the same date â€” the engagement officially
  // begins when the first invoice clears.
  async function patchOpsRow(patch: Partial<OpsClientRow>) {
    if (!root) return;
    try {
      const ops = await api.readOpsClients(root);
      const existing = ops.rows[client.slug] ?? {};
      const next: OpsClientRow = { ...existing, ...patch };
      if (patch.invoicePaidAt && !next.startDate) {
        next.startDate = patch.invoicePaidAt;
      }
      await api.writeOpsClients(root, {
        rows: { ...ops.rows, [client.slug]: next },
      });
      setOpsRow(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("patchOpsRow failed", err);
    }
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const markContractSigned = () => patchOpsRow({ contractSignedAt: today() });
  const markInvoicePaid = () => patchOpsRow({ invoicePaidAt: today() });
  const clearContract = () => patchOpsRow({ contractSignedAt: null });
  const clearInvoice = () => patchOpsRow({ invoicePaidAt: null });

  return (
    <div>
      <section className="hml-stat-row">
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconBarChart className="hml-icon" />
            Retainer
          </div>
          <div className="hml-stat-value">
            {fmtMoney(opsRow?.retainer ?? null)}
            <span className="hml-stat-delta hml-flat">monthly</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconBarChart className="hml-icon" />
            Ad spend
          </div>
          <div className="hml-stat-value">
            {fmtMoney(opsRow?.adSpend ?? null)}
            <span className="hml-stat-delta hml-flat">monthly</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconRecordings className="hml-icon" />
            Recordings
          </div>
          <div className="hml-stat-value">
            {recCount ?? 0}
            <span className="hml-stat-delta hml-flat">
              {recCount && recCount > 0 ? "on file" : "â€” none yet"}
            </span>
          </div>
        </div>
      </section>

      <section className="hml-panel" style={{ marginBottom: 16 }}>
        <div className="hml-panel-header">
          <div className="hml-panel-title">
            <span
              className="hml-dot"
              style={{
                background:
                  opsRow?.contractSignedAt && opsRow?.invoicePaidAt
                    ? "var(--hml-green)"
                    : "var(--hml-amber)",
              }}
            />
            Account status
          </div>
        </div>
        <div className="hml-panel-body" style={{ padding: "14px 20px" }}>
          <StatusRow
            label="Contract"
            date={opsRow?.contractSignedAt}
            onMark={markContractSigned}
            onClear={clearContract}
            doneLabel="Signed"
            dueLabel="Contract due"
            actionLabel="Mark as signed"
            fmtDate={fmtDate}
          />
          <StatusRow
            label="Invoice"
            date={opsRow?.invoicePaidAt}
            onMark={markInvoicePaid}
            onClear={clearInvoice}
            doneLabel="Paid"
            dueLabel="Invoice due"
            actionLabel="Mark as paid"
            fmtDate={fmtDate}
          />
        </div>
      </section>

      <section className="hml-col-2">
        <div className="hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              Key dates
            </div>
          </div>
          <div className="hml-panel-body" style={{ padding: "14px 20px" }}>
            <KvRow label="Retainer start" value={fmtDate(opsRow?.startDate)} />
            <KvRow label="Ads launched" value={fmtDate(opsRow?.adsLaunchedAt)} />
            <KvRow label="Last weekly report" value={fmtDate(opsRow?.weeklyReportSentAt)} />
            <KvRow label="Last monthly report" value={fmtDate(opsRow?.monthlyReportSentAt)} />
            <KvRow label="Next call" value={fmtDate(opsRow?.nextCall)} />
          </div>
        </div>

        <div className="hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
              Latest recording
            </div>
          </div>
          <div className="hml-panel-body" style={{ padding: "14px 20px" }}>
            {latestRec ? (
              <div>
                <button
                  type="button"
                  className="hml-link"
                  onClick={() => openFathomInApp(latestRec.url, latestRec.title)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    color: "var(--hml-text)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {latestRec.title}
                </button>
                {latestRec.description && (
                  <div
                    style={{
                      marginTop: 6,
                      color: "var(--hml-text-secondary)",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {latestRec.description}
                  </div>
                )}
                <div className="hml-activity-meta" style={{ marginTop: 8 }}>
                  <span>
                    {new Date(latestRec.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="hml-empty" style={{ padding: "8px 0" }}>
                <div className="hml-empty-sub">No recordings on file for {client.name}.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {opsRow?.notes && (
        <section className="hml-panel" style={{ marginTop: 18 }}>
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              Ops notes
            </div>
          </div>
          <div
            className="hml-panel-body"
            style={{
              padding: "14px 20px",
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--hml-text-secondary)",
            }}
          >
            {opsRow.notes}
          </div>
        </section>
      )}
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "7px 0",
        borderBottom: "1px solid var(--hml-border-subtle, rgba(255,255,255,0.05))",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--hml-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--hml-text)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/** One row of the Account Status panel â€” Contract or Invoice.
 *  Shows an amber "due" pill + action button when undated; flips to a green
 *  done pill with the date and a small clear/undo affordance once marked. */
function StatusRow({
  label,
  date,
  onMark,
  onClear,
  doneLabel,
  dueLabel,
  actionLabel,
  fmtDate,
}: {
  label: string;
  date: string | null | undefined;
  onMark: () => void;
  onClear: () => void;
  doneLabel: string;
  dueLabel: string;
  actionLabel: string;
  fmtDate: (iso: string | null | undefined) => string;
}) {
  const isDone = !!date;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px solid var(--hml-border-subtle, rgba(255,255,255,0.05))",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            color: "var(--hml-text-secondary)",
            minWidth: 72,
            display: "inline-block",
          }}
        >
          {label}
        </span>
        <span className={`hml-pill ${isDone ? "hml-green" : "hml-amber"}`}>
          <span className="hml-pill-dot" />
          {isDone ? `${doneLabel} Â· ${fmtDate(date)}` : dueLabel}
        </span>
      </div>
      {isDone ? (
        <button
          type="button"
          onClick={onClear}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--hml-text-tertiary)",
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 4,
          }}
          title="Clear â€” mark as not yet completed"
        >
          Clear
        </button>
      ) : (
        <button
          type="button"
          onClick={onMark}
          style={{
            background: "var(--hml-bg-elev-2)",
            border: "1px solid var(--hml-border)",
            color: "var(--hml-text-primary)",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: 5,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Profile.md editor â€” embedded form for in-place edits. Mirrors the standalone
 *  ClientProfileForm but without the modal chrome. */
function ClientProfileInlineEditor({
  client,
  root,
}: {
  client: ClientEntry;
  root: string | null;
}) {
  const [values, setValues] = useState<ProfileFormValues>(() => emptyProfileFormValues());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!root) {
      setLoading(false);
      setValues(emptyProfileFormValues());
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedAt(null);
    (async () => {
      try {
        const notes = await api.readClientNotes(root, client.slug);
        const profileNote =
          notes.find((n) => n.front?.type === "profile") ??
          notes.find((n) => n.rel_path.replace(/\\/g, "/").endsWith("/Profile.md"));
        if (profileNote) {
          const parsed = parseProfileBody(profileNote.body);
          if (!cancelled) setValues(parsed);
        } else if (!cancelled) {
          setValues(emptyProfileFormValues());
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, client.slug]);

  const update = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!root) {
      setError("Pick a media-buying folder first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildProfileBody(client, values);
      const front = buildProfileFront(client);
      const vaultRoot = await api.vaultRootPath(root);
      const path = profilePathFor(vaultRoot, client);
      await api.writeVaultNote(root, path, front, body);
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading profileâ€¦</div></div>;
  }

  return (
    <section className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" />
          Profile
        </div>
        <span className="hml-panel-action">
          vault/Clients/{client.name}/Profile.md
        </span>
      </div>
      <div className="hml-panel-body" style={{ padding: "18px 22px 22px" }}>
        {error && (
          <div
            className="hml-error-banner"
            style={{ marginBottom: 14 }}
          >
            {error}
          </div>
        )}

        <Field label="What they do" hint='One sentence. Becomes the "Business" section.'>
          <input
            className="hml-form-input"
            placeholder="e.g. Residential window cleaning company serving the north suburbs."
            value={values.business}
            onChange={(e) => update("business", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Services" hint="One service per line. Saved as bullets.">
          <textarea
            className="hml-form-textarea"
            rows={4}
            placeholder={"Residential window cleaning\nGutter cleaning\nScreen repair"}
            value={values.services}
            onChange={(e) => update("services", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field
          label="Target customer"
          hint="Homeowner profile, age, income, neighborhoods, pain points."
        >
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder="Homeowners 35â€“65, $120k+ HHI, neighborhoods with HOA pressure to keep curb appeal up."
            value={values.target}
            onChange={(e) => update("target", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Offers" hint="Intro pricing, packages, seasonal promos. One per line.">
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder={"$99 first-time clean\nSpring bundle: windows + gutters"}
            value={values.offers}
            onChange={(e) => update("offers", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Voice / brand notes" hint="How they want to be talked about.">
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder="Friendly, local, never corporate. We sound like a neighbor, not a chain."
            value={values.voice}
            onChange={(e) => update("voice", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="What to avoid" hint="No-gos. One item per line.">
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder={"Fake urgency claims\nDiscounts above 30%"}
            value={values.avoid}
            onChange={(e) => update("avoid", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Geography" hint="Service area, ZIP codes, radius.">
          <input
            className="hml-form-input"
            placeholder="e.g. North suburbs of Chicago â€” 20 mi radius from 60062"
            value={values.geography}
            onChange={(e) => update("geography", e.target.value)}
            disabled={busy}
          />
        </Field>

        <div className="hml-form-footer">
          {savedAt && (
            <span className="hml-dim" style={{ fontSize: 12 }}>
              Saved {new Date(savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            className="hml-btn hml-accent"
            onClick={handleSave}
            disabled={busy || !root}
            style={{ marginLeft: "auto" }}
          >
            {busy ? "Savingâ€¦" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hml-form-field">
      <label className="hml-form-label">{label}</label>
      {children}
      {hint && <div className="hml-form-help">{hint}</div>}
    </div>
  );
}

/** Lightweight vault-note display for the Memory tab â€” read-only for now. */
function ClientNoteView({
  root,
  clientSlug,
  match,
  emptyLabel,
}: {
  root: string | null;
  clientSlug: string;
  match: "profile" | "memory";
  emptyLabel: string;
}) {
  const [notes, setNotes] = useState<VaultNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    setNotes(null);
    setError(null);
    api
      .readClientNotes(root, clientSlug)
      .then((list) => {
        if (cancelled) return;
        setNotes(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  if (notes === null) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loadingâ€¦</div></div>;
  }

  const note = notes.find((n) => {
    const lower = n.path.toLowerCase();
    return lower.endsWith(`/${match}.md`) || lower.endsWith(`\\${match}.md`);
  });

  if (error) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't load notes</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">{emptyLabel}</div>
        <div className="hml-empty-sub">
          Create it at vault/Clients/{clientSlug}/{match.charAt(0).toUpperCase() + match.slice(1)}.md.
        </div>
      </div>
    );
  }

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" />
          {match === "profile" ? "Profile" : "Memory"}
        </div>
        <span className="hml-panel-action">
          {note.path.split(/[/\\]/).slice(-3).join(" / ")}
        </span>
      </div>
      <pre
        style={{
          padding: "18px 22px",
          margin: 0,
          fontFamily: "var(--hml-font-sans)",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--hml-text-secondary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {note.body}
      </pre>
    </div>
  );
}

const CLIENT_RECORDINGS_KEY_PREFIX = "hml.recordings.client.";
const FATHOM_SHARE_RE_CLIENT =
  /^https?:\/\/(?:[\w-]+\.)?fathom\.video\/(?:share|calls)\/([\w-]+)/i;

function recUid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseFathomUrl(input: string): { url: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!FATHOM_SHARE_RE_CLIENT.test(trimmed)) return null;
  return { url: trimmed };
}

function formatRecStamp(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} Â· ${time}`.toUpperCase();
}

function ClientRecordingsView({
  root,
  clientSlug,
  clientName,
}: {
  root: string | null;
  clientSlug: string;
  clientName: string;
}) {
  const [recordings, setRecordings] = useState<FathomRecording[]>([]);
  const [allRecordings, setAllRecordings] = useState<FathomRecording[]>([]);
  const [clientNameBySlug, setClientNameBySlug] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [subTab, setSubTab] = useState<"mine" | "all">("mine");
  const [loading, setLoading] = useState(true);
  const skipSave = useRef(true);
  const saveTimer = useRef<number | null>(null);

  const [recUrl, setRecUrl] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDescription, setRecDescription] = useState("");
  const [recError, setRecError] = useState<string | null>(null);

  const lsKey = `${CLIENT_RECORDINGS_KEY_PREFIX}${clientSlug}`;

  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    setLoading(true);

    const run = async () => {
      if (root) {
        try {
          const state = await api.readDashboardState(root);
          if (cancelled) return;
          const all = Array.isArray(state.recordings) ? state.recordings : [];
          setAllRecordings(all);
          setRecordings(all.filter((r) => r.clientSlug === clientSlug));
        } catch (err) {
          console.warn("Failed to read dashboard state for client recordings:", err);
          if (!cancelled) {
            try {
              const raw = localStorage.getItem(lsKey);
              setRecordings(raw ? JSON.parse(raw) : []);
              setAllRecordings([]);
            } catch {
              setRecordings([]);
              setAllRecordings([]);
            }
          }
        }
        try {
          const list = await api.listClients(root);
          if (!cancelled) {
            const m = new Map<string, string>();
            for (const c of list) m.set(c.slug, c.name);
            setClientNameBySlug(m);
          }
        } catch (err) {
          console.warn("Failed to list clients for recordings view:", err);
        }
      } else {
        try {
          const raw = localStorage.getItem(lsKey);
          if (!cancelled) setRecordings(raw ? JSON.parse(raw) : []);
        } catch {
          if (!cancelled) setRecordings([]);
        }
        if (!cancelled) setAllRecordings([]);
      }
      if (!cancelled) setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug, lsKey]);

  useEffect(() => {
    if (loading) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const persist = async () => {
        if (root) {
          try {
            const current = await api.readDashboardState(root);
            const others = (current.recordings ?? []).filter(
              (r) => r.clientSlug !== clientSlug,
            );
            const next: DashboardState = {
              tasks: Array.isArray(current.tasks) ? current.tasks : [],
              notes: Array.isArray(current.notes) ? current.notes : [],
              calendar: current.calendar ?? null,
              recordings: [...others, ...recordings],
            };
            await api.writeDashboardState(root, next);
          } catch (err) {
            console.warn("Failed to write client recordings:", err);
          }
        } else {
          try {
            localStorage.setItem(lsKey, JSON.stringify(recordings));
          } catch (err) {
            console.warn("Failed to write client recordings to localStorage:", err);
          }
        }
      };
      void persist();
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [recordings, root, loading, clientSlug, lsKey]);

  const sortedRecordings = useMemo(
    () => [...recordings].sort((a, b) => b.createdAt - a.createdAt),
    [recordings],
  );
  const mergedAllRecordings = useMemo(() => {
    const others = allRecordings.filter((r) => r.clientSlug !== clientSlug);
    return [...others, ...recordings];
  }, [allRecordings, recordings, clientSlug]);
  const sortedAllRecordings = useMemo(
    () => [...mergedAllRecordings].sort((a, b) => b.createdAt - a.createdAt),
    [mergedAllRecordings],
  );
  const visibleRecordings = subTab === "all" ? sortedAllRecordings : sortedRecordings;

  const recUrlValid = !recUrl.trim() || parseFathomUrl(recUrl) !== null;

  const addRecording = () => {
    const parsed = parseFathomUrl(recUrl);
    if (!parsed) {
      setRecError("Paste a fathom.video share link.");
      return;
    }
    const title = recTitle.trim();
    if (!title) {
      setRecError("Add a title before saving.");
      return;
    }
    const description = recDescription.trim();
    const rec: FathomRecording = {
      id: recUid(),
      url: parsed.url,
      title,
      description: description || undefined,
      createdAt: Date.now(),
      clientSlug,
    };
    setRecordings((prev) => [rec, ...prev]);
    setRecUrl("");
    setRecTitle("");
    setRecDescription("");
    setRecError(null);
  };

  const removeRecording = (id: string) => {
    const rec = recordings.find((r) => r.id === id);
    const label = rec?.title || "this recording";
    if (!window.confirm(`Delete "${label}"?`)) return;
    setRecordings((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRecordingTitle = (id: string, title: string) => {
    setRecordings((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  };

  const updateRecordingDescription = (id: string, description: string) => {
    setRecordings((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, description: description || undefined } : r,
      ),
    );
  };

  const isAll = subTab === "all";

  return (
    <div className="md-recordings-page">
      <style>{recordingsPageCSS}</style>
      <style>{RECORDINGS_SUBTAB_CSS}</style>

      <div className="md-rec-subtabs" role="tablist" aria-label="Recordings scope">
        <button
          type="button"
          role="tab"
          aria-selected={!isAll}
          className={`md-rec-subtab${!isAll ? " is-active" : ""}`}
          onClick={() => setSubTab("mine")}
        >
          {clientName}
          <span className="md-rec-subtab-count">{sortedRecordings.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAll}
          className={`md-rec-subtab${isAll ? " is-active" : ""}`}
          onClick={() => setSubTab("all")}
        >
          All recordings
          <span className="md-rec-subtab-count">{sortedAllRecordings.length}</span>
        </button>
      </div>

      {!isAll && (
        <TranscriptIngestPanel
          root={root}
          clientSlug={clientSlug}
          clientName={clientName}
        />
      )}

      {!isAll && (
        <div className="md-panel md-recordings-panel">
          <div className="md-panel-head">
            <span className="md-panel-title">â–¸ New Recording â€” {clientName}</span>
            <span className="md-panel-meta">{recordings.length} SAVED</span>
          </div>

          <div className="md-rec-form">
            <input
              className={`md-rec-input ${recUrl && !recUrlValid ? "is-invalid" : ""}`}
              type="url"
              placeholder="Paste fathom.video linkâ€¦"
              value={recUrl}
              onChange={(e) => {
                setRecUrl(e.target.value);
                if (recError) setRecError(null);
              }}
            />
            <input
              className="md-rec-input"
              type="text"
              placeholder="Title"
              value={recTitle}
              onChange={(e) => {
                setRecTitle(e.target.value);
                if (recError) setRecError(null);
              }}
            />
            <textarea
              className="md-rec-description"
              placeholder="Description (optional)"
              value={recDescription}
              onChange={(e) => setRecDescription(e.target.value)}
              rows={2}
            />
            <div className="md-rec-form-actions">
              {recError ? <span className="md-rec-error">{recError}</span> : <span />}
              <button
                type="button"
                className="md-rec-add"
                onClick={addRecording}
                disabled={!recUrl.trim() || !recTitle.trim()}
              >
                Save recording
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="md-rec-empty">Loadingâ€¦</div>
      ) : visibleRecordings.length === 0 ? (
        <div className="md-rec-empty">
          {isAll
            ? "No recordings on file yet, Sir."
            : `No recordings for ${clientName} yet, Sir.`}
        </div>
      ) : (
        <ul className="md-rec-list">
          {visibleRecordings.map((r) => {
            const parsed = parseFathomUrl(r.url);
            const ownedByThisClient = r.clientSlug === clientSlug;
            const ownerName = r.clientSlug
              ? clientNameBySlug.get(r.clientSlug) ?? r.clientSlug
              : "Unassigned";
            return (
              <li key={r.id} className="md-rec-item md-panel">
                {parsed ? (
                  <button
                    type="button"
                    className="md-rec-card"
                    onClick={() => openFathomInApp(r.url, r.title)}
                    title="Play recording"
                  >
                    <span className="md-rec-card-play" aria-hidden="true">â–¶</span>
                    <span className="md-rec-card-label">Play recording</span>
                  </button>
                ) : (
                  <div className="md-rec-card md-rec-card-invalid">
                    <span className="md-rec-card-label">
                      Invalid Fathom URL,{" "}
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.url}
                      </a>
                    </span>
                  </div>
                )}
                <div className="md-rec-body">
                  {isAll && !ownedByThisClient ? (
                    <div className="md-rec-title-readonly">{r.title}</div>
                  ) : (
                    <input
                      className="md-rec-title-input"
                      type="text"
                      value={r.title}
                      onChange={(e) => updateRecordingTitle(r.id, e.target.value)}
                      placeholder="Title"
                    />
                  )}
                  {isAll && !ownedByThisClient ? (
                    r.description ? (
                      <div className="md-rec-description-readonly">{r.description}</div>
                    ) : null
                  ) : (
                    <textarea
                      className="md-rec-description-input"
                      value={r.description ?? ""}
                      onChange={(e) =>
                        updateRecordingDescription(r.id, e.target.value)
                      }
                      placeholder="Description (optional)"
                      rows={2}
                    />
                  )}
                  <div className="md-rec-meta-row">
                    <a
                      className="md-rec-link"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Fathom â†—
                    </a>
                    {isAll && (
                      <span
                        className={`md-rec-owner-tag${ownedByThisClient ? " is-mine" : ""}`}
                        title={
                          ownedByThisClient
                            ? "Belongs to the active client"
                            : `Belongs to ${ownerName}`
                        }
                      >
                        {ownerName}
                      </span>
                    )}
                    <span className="md-panel-meta">{formatRecStamp(r.createdAt)}</span>
                    {(!isAll || ownedByThisClient) && (
                      <button
                        type="button"
                        className="md-rec-delete"
                        onClick={() => removeRecording(r.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const RECORDINGS_SUBTAB_CSS = `
.md-rec-subtabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-surface, var(--hml-bg-elev-1));
  border: 1px solid var(--border, var(--hml-border-subtle));
  margin-bottom: 14px;
  align-self: flex-start;
}
.md-rec-subtab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  padding: 6px 14px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.md-rec-subtab:hover { color: var(--text); }
.md-rec-subtab.is-active {
  color: var(--copper);
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.08);
}
.md-rec-subtab-count {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-faint);
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
}
.md-rec-subtab.is-active .md-rec-subtab-count {
  color: var(--copper);
  border-color: var(--copper);
}
.md-rec-owner-tag {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 3px 8px;
}
.md-rec-owner-tag.is-mine {
  color: var(--copper);
  border-color: var(--copper);
}
.md-rec-title-readonly {
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  padding: 4px 6px;
  margin: -4px -6px;
}
.md-rec-description-readonly {
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
  padding: 6px;
  margin: -6px;
  white-space: pre-wrap;
}
`;
