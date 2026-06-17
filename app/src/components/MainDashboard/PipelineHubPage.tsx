// Shared pipeline viewer used by both Sales Hub and Onboarding Hub.
//
// Each hub stores its own GHL pipeline ID in the GHL config. On mount:
//   * If no pipeline is chosen → show a picker listing every pipeline in
//     the location. The user clicks one to lock it in.
//   * If a pipeline is chosen → render that single pipeline as a kanban.
//
// A small "Change pipeline" link in the header lets the user re-pick at
// any time. The choice is persisted in the per-machine GHL config, not
// in the synced vault.

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCalendar, IconChevronRight, IconExternalLink, IconSearch } from "../icons";
import { api } from "../../lib/tauri";
import type {
  GhlHubKey,
  GhlOpportunity,
  GhlPipeline,
  OpsAppointmentRow,
} from "../../lib/types";
import "./pipeline-hub.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "error"; message: string }
  | { kind: "picker"; pipelines: GhlPipeline[] }
  | { kind: "ready"; pipeline: GhlPipeline; opportunities: GhlOpportunity[]; pipelines: GhlPipeline[] };

export interface PipelineHubPageProps {
  /** Which slot in the GHL config to read/write the chosen pipeline ID. */
  hubKey: GhlHubKey;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Opportunity ID → appointment row, used to render booking badges on
   *  cards. Sales Hub fills this from `ops/appointments.json`; other hubs
   *  leave it undefined. */
  appointmentsByOpportunityId?: Map<string, OpsAppointmentRow>;
}

export function PipelineHubPage({
  hubKey,
  title,
  subtitle,
  eyebrow = "CRM · GoHighLevel",
  appointmentsByOpportunityId,
}: PipelineHubPageProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSwitcher, setShowSwitcher] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setSearchTerm("");
    setShowSwitcher(false);
    try {
      const status = await api.ghlGetConfigStatus();
      if (!status.configured) {
        setState({ kind: "unconfigured" });
        return;
      }
      const all = await api.ghlListPipelines();
      const chosenId =
        hubKey === "sales" ? status.salesPipelineId : status.onboardingPipelineId;
      const chosen = chosenId ? all.find((p) => p.id === chosenId) ?? null : null;
      if (!chosen) {
        setState({ kind: "picker", pipelines: all });
        return;
      }
      const opps = await api.ghlListOpportunities(chosen.id);
      setState({ kind: "ready", pipeline: chosen, opportunities: opps, pipelines: all });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
    }
  }, [hubKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const choosePipeline = useCallback(
    async (pipelineId: string) => {
      try {
        await api.ghlSetPipelineChoice(hubKey, pipelineId);
        await load();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    },
    [hubKey, load],
  );

  const clearChoice = useCallback(async () => {
    try {
      await api.ghlSetPipelineChoice(hubKey, null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
    }
  }, [hubKey, load]);

  const handleRefresh = useCallback(async () => {
    if (state.kind !== "ready") return;
    setRefreshing(true);
    try {
      const opps = await api.ghlListOpportunities(state.pipeline.id);
      setState((cur) =>
        cur.kind === "ready" ? { ...cur, opportunities: opps } : cur,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("refresh pipeline failed", err);
    } finally {
      setRefreshing(false);
    }
  }, [state]);

  // ── Render branches ───────────────────────────────────

  if (state.kind === "loading") {
    return (
      <div className="hml-content">
        <PageHeader title={title} eyebrow={eyebrow} subtitle={subtitle} />
        <section className="hml-panel">
          <div className="hml-panel-body">
            <div className="hml-empty">
              <div className="hml-empty-title">Loading…</div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (state.kind === "unconfigured") {
    return (
      <div className="hml-content">
        <PageHeader title={title} eyebrow={eyebrow} subtitle={subtitle} />
        <section className="hml-panel">
          <div className="hml-panel-body">
            <div className="hml-empty">
              <div className="hml-empty-title">Not connected to GoHighLevel</div>
              <div className="hml-empty-sub">
                Add your Private Integration token + Location ID in Settings.
                This hub will populate automatically once GHL is reachable.
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="hml-content">
        <PageHeader title={title} eyebrow={eyebrow} subtitle={subtitle} />
        <section className="hml-panel">
          <div className="hml-panel-body">
            <div className="hml-empty">
              <div className="hml-empty-title">Couldn’t load pipeline</div>
              <div className="hml-empty-sub">{state.message}</div>
              <button
                type="button"
                className="hml-btn hml-ghost"
                onClick={() => void load()}
                style={{ marginTop: 16 }}
              >
                Retry
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (state.kind === "picker") {
    return (
      <div className="hml-content">
        <PageHeader
          title={title}
          eyebrow={eyebrow}
          subtitle="Pick the GoHighLevel pipeline this hub should mirror. You can change it later."
        />
        <PipelinePicker
          pipelines={state.pipelines}
          onChoose={choosePipeline}
          onRefresh={() => void load()}
        />
      </div>
    );
  }

  // ── kind: "ready" ─────────────────────────────────────
  return (
    <div className="hml-content">
      <PageHeader title={title} eyebrow={eyebrow} subtitle={subtitle}>
        <div className="hml-page-header-actions">
          <label className="ph-search">
            <IconSearch size={13} />
            <input
              type="text"
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="hml-btn hml-ghost"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </PageHeader>

      <div className="ph-meta-row">
        <div className="ph-pipeline-label">
          <span className="ph-pipeline-dot" />
          <span className="ph-pipeline-name">{state.pipeline.name}</span>
          <span className="ph-pipeline-count">
            {state.opportunities.length} opp{state.opportunities.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          className="ph-link-btn"
          onClick={() => setShowSwitcher((v) => !v)}
        >
          {showSwitcher ? "Cancel" : "Change pipeline"}
          <IconChevronRight size={11} />
        </button>
      </div>

      {showSwitcher && (
        <PipelinePicker
          pipelines={state.pipelines}
          currentId={state.pipeline.id}
          onChoose={(id) => {
            setShowSwitcher(false);
            void choosePipeline(id);
          }}
          onClear={() => {
            setShowSwitcher(false);
            void clearChoice();
          }}
        />
      )}

      <section className="hml-panel ph-board-panel">
        <PipelineKanban
          pipeline={state.pipeline}
          opportunities={state.opportunities}
          searchTerm={searchTerm}
          appointmentsByOpportunityId={appointmentsByOpportunityId}
        />
      </section>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────

function PageHeader({
  title,
  eyebrow,
  subtitle,
  children,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="hml-page-header">
      <div>
        {eyebrow && (
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            {eyebrow}
          </div>
        )}
        <h1 className="hml-page-title">{title}</h1>
        {subtitle && <div className="hml-page-subtitle">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function PipelinePicker({
  pipelines,
  currentId,
  onChoose,
  onClear,
  onRefresh,
}: {
  pipelines: GhlPipeline[];
  currentId?: string;
  onChoose: (id: string) => void;
  onClear?: () => void;
  onRefresh?: () => void;
}) {
  if (pipelines.length === 0) {
    return (
      <section className="hml-panel">
        <div className="hml-panel-body">
          <div className="hml-empty">
            <div className="hml-empty-title">No pipelines in this GHL location</div>
            <div className="hml-empty-sub">
              Create a pipeline in GoHighLevel (Opportunities → Pipelines → New)
              and then refresh.
            </div>
            {onRefresh && (
              <button
                type="button"
                className="hml-btn hml-ghost"
                onClick={onRefresh}
                style={{ marginTop: 16 }}
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hml-panel ph-picker-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" />
          Available pipelines · {pipelines.length}
        </div>
        {onClear && (
          <button type="button" className="hml-panel-action" onClick={onClear}>
            Clear choice
          </button>
        )}
      </div>
      <div className="ph-picker-grid">
        {pipelines.map((p) => {
          const isCurrent = p.id === currentId;
          return (
            <button
              key={p.id}
              type="button"
              className={`ph-picker-card${isCurrent ? " ph-picker-current" : ""}`}
              onClick={() => onChoose(p.id)}
            >
              <div className="ph-picker-card-head">
                <div className="ph-picker-card-name">{p.name}</div>
                {isCurrent && <span className="ph-picker-badge">Current</span>}
              </div>
              <div className="ph-picker-card-stages">
                {p.stages.length} stage{p.stages.length === 1 ? "" : "s"}
              </div>
              <div className="ph-picker-card-stage-list">
                {[...p.stages]
                  .sort((a, b) => a.position - b.position)
                  .slice(0, 6)
                  .map((s) => (
                    <span key={s.id} className="ph-picker-stage-chip">
                      {s.name}
                    </span>
                  ))}
                {p.stages.length > 6 && (
                  <span className="ph-picker-stage-more">
                    +{p.stages.length - 6} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PipelineKanban({
  pipeline,
  opportunities,
  searchTerm,
  appointmentsByOpportunityId,
}: {
  pipeline: GhlPipeline;
  opportunities: GhlOpportunity[];
  searchTerm: string;
  appointmentsByOpportunityId?: Map<string, OpsAppointmentRow>;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, GhlOpportunity[]>();
    for (const stage of pipeline.stages) map.set(stage.id, []);
    const lower = searchTerm.trim().toLowerCase();
    for (const o of opportunities) {
      if (lower) {
        const hay = `${o.name} ${o.contactName ?? ""} ${o.contactEmail ?? ""}`.toLowerCase();
        if (!hay.includes(lower)) continue;
      }
      const bucket = map.get(o.pipelineStageId);
      if (bucket) bucket.push(o);
    }
    return map;
  }, [pipeline, opportunities, searchTerm]);

  const sortedStages = useMemo(
    () => [...pipeline.stages].sort((a, b) => a.position - b.position),
    [pipeline.stages],
  );

  return (
    <div className="ph-board">
      {sortedStages.map((stage) => {
        const items = grouped.get(stage.id) ?? [];
        const totalValue = items.reduce((s, o) => s + (o.monetaryValue ?? 0), 0);
        return (
          <div key={stage.id} className="ph-col">
            <header className="ph-col-head">
              <div className="ph-col-title">
                <span className="ph-col-dot" />
                <span className="ph-col-name">{stage.name}</span>
                <span className="ph-col-count">{items.length}</span>
              </div>
              {totalValue > 0 && (
                <div className="ph-col-sum">{money(totalValue)}</div>
              )}
            </header>
            <div className="ph-col-body">
              {items.map((o) => (
                <OpportunityCard
                  key={o.id}
                  opp={o}
                  appointment={appointmentsByOpportunityId?.get(o.id)}
                />
              ))}
              {items.length === 0 && <div className="ph-col-empty">Empty</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpportunityCard({
  opp,
  appointment,
}: {
  opp: GhlOpportunity;
  appointment?: OpsAppointmentRow;
}) {
  const displayName = opp.contactName || opp.name;
  const sub = opp.contactName && opp.contactName !== opp.name ? opp.name : null;
  return (
    <article className="ph-card">
      <div className="ph-card-row">
        <div className="ph-card-avatar">{initials(displayName)}</div>
        <div className="ph-card-title-block">
          <div className="ph-card-name">{displayName}</div>
          {sub && <div className="ph-card-sub">{sub}</div>}
          {opp.contactEmail && (
            <div className="ph-card-email">{opp.contactEmail}</div>
          )}
        </div>
      </div>
      {appointment && <BookingBadge appointment={appointment} />}
      {opp.monetaryValue != null && opp.monetaryValue > 0 && (
        <div className="ph-card-value">{money(opp.monetaryValue)}</div>
      )}
      {opp.updatedAt && (
        <div className="ph-card-foot">
          <IconCalendar size={11} />
          <span>Updated {relTime(opp.updatedAt)}</span>
        </div>
      )}
      <a
        className="ph-card-link"
        href={`https://app.gohighlevel.com/v2/location/${opp.pipelineId}/opportunities/list?opportunity=${opp.id}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in GoHighLevel"
      >
        <IconExternalLink size={11} />
      </a>
    </article>
  );
}

function BookingBadge({ appointment }: { appointment: OpsAppointmentRow }) {
  const cancelled = appointment.status === "cancelled";
  const when = formatBookingTime(appointment.startIso);
  return (
    <div
      className="ph-card-booking"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        padding: "4px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        background: cancelled
          ? "color-mix(in srgb, var(--danger) 10%, transparent)"
          : "color-mix(in srgb, var(--hue-blue) 10%, transparent)",
        color: cancelled ? "var(--danger)" : "var(--hue-blue)",
      }}
      title={cancelled ? "Booking cancelled in GHL" : "Booked via GHL"}
    >
      <IconCalendar size={11} />
      <span>
        {cancelled ? "Cancelled · " : ""}
        {when}
      </span>
    </div>
  );
}

function formatBookingTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

// ── helpers ─────────────────────────────────────────────

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function relTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
