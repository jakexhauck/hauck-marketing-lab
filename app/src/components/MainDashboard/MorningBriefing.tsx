import { useCallback, useEffect, useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/tauri";
import type { ClientEntry, NoteFront } from "../../lib/types";
import type { ActivityEvent } from "../../lib/activity";
import {
  buildBriefing,
  type BriefingPayload,
  type ClientKpiSnapshot,
  type ClientProfileMeta,
  type OnboardingStateLite,
} from "../../lib/briefing";

interface Props {
  root: string | null;
  clients: ClientEntry[];
  /** Forwarded so a row click can jump into the relevant client surface. */
  onOpenClient?: (slug: string) => void;
}

type SectionKey =
  | "inbox"
  | "cpl"
  | "approval"
  | "onboarding"
  | "wins";

const PLACEHOLDER_INBOX_COUNT = 0;

export function MorningBriefing({ root, clients, onOpenClient }: Props) {
  const [payload, setPayload] = useState<BriefingPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set());

  const refresh = useCallback(async () => {
    if (!root) {
      setPayload(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Activity tail covers yesterday's wins + creative-approval staleness.
      // 400 entries comfortably spans 48h+ at expected volume.
      const tail = await api.tailActivity(root, 400);
      const activity: ActivityEvent[] = tail.events;

      const profiles: Record<string, ClientProfileMeta> = {};
      const kpis: Record<string, ClientKpiSnapshot> = {};
      const onboarding: Record<string, OnboardingStateLite> = {};

      await Promise.all(
        clients.map(async (c) => {
          // Profile.md frontmatter for CPL target + AOV.
          try {
            const notes = await api.readClientNotes(root, c.slug);
            const profileNote = notes.find((n) => {
              const lower = n.path.toLowerCase();
              return lower.endsWith("/profile.md") || lower.endsWith("\\profile.md");
            });
            if (profileNote) {
              profiles[c.slug] = readProfileMeta(profileNote.front);
            }
          } catch {
            // Missing profile is fine — the client just won't surface in CPL drift.
          }

          // Latest Meta KPI snapshot (per `data/kpis/<slug>-YYYY-MM-DD.yaml`).
          try {
            const latest = await api.readLatestKpis(root, c.slug);
            if (latest) {
              kpis[c.slug] = { cpa: latest.cpa ?? null, date: latest.date };
            }
          } catch {
            // No KPIs yet — skip.
          }

          // Onboarding state for slippage rows.
          try {
            const state = await api.readOnboardingState(root, c.slug);
            onboarding[c.slug] = {
              done: state.done ?? [],
              startedAt: state.updatedAt ?? c.created_at ?? null,
            };
          } catch {
            // No onboarding file yet — skip.
          }
        }),
      );

      const next = buildBriefing({
        clients,
        activity,
        profiles,
        kpis,
        onboarding,
        // TODO: wire Gmail MCP via `claude -p` for real inbox count. For v1 we
        // pass 0 so the section renders "all clear" until the integration lands.
        inboxNeedingReply: PLACEHOLDER_INBOX_COUNT,
        now: new Date(),
      });
      setPayload(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [root, clients]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const counts = useMemo(() => {
    if (!payload) {
      return { inbox: 0, cpl: 0, approval: 0, onboarding: 0, wins: 0 };
    }
    const w = payload.yesterdayWins;
    const winsTotal =
      w.leads + w.formRuns + w.creativesShipped + w.outreachSent + w.replies;
    return {
      inbox: payload.inbox.length,
      cpl: payload.cplDrift.length,
      approval: payload.awaitingApproval.length,
      onboarding: payload.onboardingSlip.length,
      wins: winsTotal,
    };
  }, [payload]);

  const toggle = (key: SectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const builtLabel = payload
    ? new Date(payload.builtAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="hml-content">
      <section className="hml-greeting">
        <div className="hml-greeting-eyebrow">
          <span className="hml-eyebrow-dot" />
          TODAY
        </div>
        <h1 className="hml-greeting-title">Morning briefing</h1>
        <div className="hml-greeting-sub">
          What needs your attention across every client.
          {payload && (
            <>
              <span className="hml-divider" />
              <span className="hml-mono">Built {builtLabel}</span>
            </>
          )}
          <span className="hml-divider" />
          <button
            type="button"
            className="hml-btn hml-ghost"
            onClick={() => void refresh()}
            disabled={loading || !root}
            style={{ fontSize: 11.5, padding: "4px 10px" }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {!root && (
        <div className="hml-panel" style={{ padding: "12px 18px", fontSize: 13 }}>
          Pick a media-buying folder first to see today's briefing.
        </div>
      )}

      {error && (
        <div
          className="hml-panel"
          style={{
            padding: "12px 18px",
            color: "var(--hml-red)",
            fontSize: 13,
            borderColor: "var(--hml-red-border)",
            background: "var(--hml-red-bg)",
          }}
        >
          {error}
        </div>
      )}

      {payload && (
        <>
          <Section
            title="Inbox needing reply"
            count={counts.inbox}
            open={openSections.has("inbox")}
            onToggle={() => toggle("inbox")}
            emptyLabel="all clear"
          >
            {payload.inbox.map((r, i) => (
              <Row key={i} primary={r.label} />
            ))}
            <div className="hml-empty-sub" style={{ padding: "4px 14px" }}>
              Gmail MCP wiring still parked. Live count will replace the
              placeholder once the integration ships.
            </div>
          </Section>

          <Section
            title="CPL drift alerts"
            count={counts.cpl}
            open={openSections.has("cpl")}
            onToggle={() => toggle("cpl")}
            emptyLabel="all clear"
          >
            {payload.cplDrift.map((r) => (
              <Row
                key={r.clientSlug}
                primary={r.clientName}
                secondary={
                  <>
                    CPL ${r.currentCpl.toFixed(2)} vs target ${r.targetCpl.toFixed(2)}
                    <span className="hml-sep">·</span>
                    <span style={{ color: "var(--hml-red, #ef4444)" }}>
                      +{r.deltaPct}% over
                    </span>
                    <span className="hml-sep">·</span>
                    <span>since {r.sinceDate}</span>
                  </>
                }
                onClick={() => onOpenClient?.(r.clientSlug)}
              />
            ))}
          </Section>

          <Section
            title={`Creative awaiting approval > 48h`}
            count={counts.approval}
            open={openSections.has("approval")}
            onToggle={() => toggle("approval")}
            emptyLabel="all clear"
          >
            {payload.awaitingApproval.map((r, i) => (
              <Row
                key={`${r.clientSlug}-${i}`}
                primary={r.summary}
                secondary={
                  <>
                    <span>{r.clientName}</span>
                    <span className="hml-sep">·</span>
                    <span>{r.ageHours}h waiting</span>
                  </>
                }
                onClick={
                  r.refPath
                    ? () => {
                        void openPath(r.refPath!);
                      }
                    : () => onOpenClient?.(r.clientSlug)
                }
              />
            ))}
          </Section>

          <Section
            title="Onboarding slippage"
            count={counts.onboarding}
            open={openSections.has("onboarding")}
            onToggle={() => toggle("onboarding")}
            emptyLabel="all clear"
          >
            {payload.onboardingSlip.map((r) => (
              <Row
                key={`${r.clientSlug}-${r.taskId}`}
                primary={r.taskLabel}
                secondary={
                  <>
                    <span>{r.clientName}</span>
                    <span className="hml-sep">·</span>
                    <span>
                      Phase {r.phaseNum}: {r.phaseName}
                    </span>
                    <span className="hml-sep">·</span>
                    <span style={{ color: "var(--hml-amber, #f59e0b)" }}>
                      {r.daysOverdue}d overdue
                    </span>
                  </>
                }
                onClick={() => onOpenClient?.(r.clientSlug)}
              />
            ))}
          </Section>

          <Section
            title="Yesterday's wins"
            count={counts.wins}
            open={openSections.has("wins")}
            onToggle={() => toggle("wins")}
            emptyLabel="quiet day"
          >
            <Row primary={formatWins(payload.yesterdayWins)} />
          </Section>
        </>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: number;
  open: boolean;
  emptyLabel: string;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({
  title,
  count,
  open,
  emptyLabel,
  onToggle,
  children,
}: SectionProps) {
  const empty = count === 0;
  return (
    <div className="hml-panel" style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={onToggle}
        className="hml-panel-header"
        style={{
          width: "100%",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          padding: "10px 14px",
        }}
      >
        <div className="hml-panel-title">
          <span
            className="hml-dot"
            style={{
              background: empty ? "var(--hml-green, #22c55e)" : "var(--hml-amber, #f59e0b)",
            }}
          />
          <span style={{ marginRight: 8 }}>{empty ? "▸" : open ? "▾" : "▸"}</span>
          {title}
        </div>
        <span className="hml-panel-action" style={{ cursor: "pointer" }}>
          {empty ? emptyLabel : count}
        </span>
      </button>
      {open && !empty && <div className="hml-panel-body">{children}</div>}
    </div>
  );
}

interface RowProps {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  onClick?: () => void;
}

function Row({ primary, secondary, onClick }: RowProps) {
  return (
    <div
      className="hml-activity"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: "var(--hml-accent, #6aa9ff)",
          flexShrink: 0,
          marginTop: 7,
        }}
      />
      <div className="hml-activity-body">
        <div className="hml-activity-title">
          <span className="hml-em">{primary}</span>
        </div>
        {secondary && <div className="hml-activity-meta">{secondary}</div>}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function readProfileMeta(front: NoteFront): ClientProfileMeta {
  // Profile.md frontmatter currently has no formal CPL fields. Accept a few
  // common spellings so a hand-edited Profile can opt in.
  const cplTarget = numberFromFront(front, [
    "cplTarget",
    "cpl_target",
    "cpl",
    "target_cpl",
  ]);
  const cplDriftPct = numberFromFront(front, [
    "cplDriftPct",
    "cpl_drift_pct",
    "drift_pct",
  ]);
  const aov = numberFromFront(front, ["aov", "averageOrderValue"]);
  return { cplTarget, cplDriftPct, aov };
}

function numberFromFront(front: NoteFront, keys: string[]): number | null {
  for (const k of keys) {
    const raw = front[k];
    if (raw == null) continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (isFinite(n)) return n;
  }
  return null;
}

function formatWins(w: BriefingPayload["yesterdayWins"]): string {
  const parts: string[] = [];
  if (w.leads > 0) parts.push(`${w.leads} leads`);
  if (w.formRuns > 0) parts.push(`${w.formRuns} form runs`);
  if (w.creativesShipped > 0)
    parts.push(`${w.creativesShipped} creative${w.creativesShipped === 1 ? "" : "s"} shipped`);
  if (w.outreachSent > 0) parts.push(`${w.outreachSent} outreach sent`);
  if (w.replies > 0) parts.push(`${w.replies} repl${w.replies === 1 ? "y" : "ies"}`);
  return parts.length === 0 ? "Nothing logged yesterday." : parts.join(" · ");
}
