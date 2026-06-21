import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import NotificationBell from "../NotificationBell";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import StagePill from "../StagePill";
import PipelineSwitcher from "../PipelineSwitcher";
import { useLeads } from "../../context/LeadsContext";
import { usePipelines } from "../../context/PipelinesContext";
import { useClient } from "../../context/ClientContext";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { computeStats } from "../../lib/computeStats";
import { permissionsFor } from "../../lib/rolePermissions";
import { formatMoney, formatRoas } from "../../lib/formatMoney";
import { timeAgo } from "../../lib/timeAgo";
import type { Lead } from "../../types";

// Sentinel ids for the status filters that follow the real stage chips.
const WON = "__won__";
const LOST = "__lost__";

// The Atelier desktop Dashboard (lg+): the pipeline command deck. The phone
// keeps its own layout below lg; this renders only inside `hidden lg:flex` from
// the Dashboard route. Same real data and computations as the phone screen,
// restyled into the calm command-deck system.

// One KPI tile. Airy: soft surface, generous padding, mono label, tabular
// value. The "ledger" tone is reserved for money and renders in gold.
function Kpi({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "ledger";
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]"
      role="group"
      aria-label={label}
    >
      <div className="flex items-center justify-between">
        <span className="label-cap truncate">{label}</span>
        <span className="text-faint" aria-hidden>
          {icon}
        </span>
      </div>
      <div
        className={
          tone === "ledger"
            ? "ledger text-[2rem] font-semibold leading-none"
            : "stat-num text-[2rem]"
        }
      >
        {value}
      </div>
      {sub && <div className="text-[12.5px] font-medium text-muted">{sub}</div>}
    </div>
  );
}

export default function DashboardDesktop() {
  const navigate = useNavigate();
  const { leads: allLeads, isLoading, error } = useLeads();
  const { pipelines, selectedId, selected, setSelectedId } = usePipelines();
  const { client } = useClient();
  const { currentUser, session } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);

  const [active, setActive] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  const stages = useMemo(() => selected?.stages ?? [], [selected]);

  // Default to the first real stage once the pipeline loads, and heal a
  // selection that no longer exists after a pipeline switch.
  useEffect(() => {
    const valid =
      active === WON || active === LOST || stages.some((s) => s.id === active);
    if (!valid) setActive(stages[0]?.id ?? "");
  }, [stages, active]);

  const permissions = currentUser
    ? permissionsFor(currentUser.role)
    : permissionsFor("owner");

  const leads = useMemo(() => {
    let out = allLeads;
    if (selectedId) out = out.filter((l) => l.pipelineId === selectedId);
    if (permissions.assignedOnly && currentUser) {
      out = out.filter((l) => l.assignedUserId === currentUser.id);
    }
    return out;
  }, [allLeads, selectedId, permissions.assignedOnly, currentUser]);

  const stats = useMemo(
    () => computeStats(leads, client.monthlySpend),
    [leads, client.monthlySpend],
  );

  const repWonValue = useMemo(() => {
    if (!permissions.assignedOnly) return 0;
    return leads
      .filter((l) => l.status === "won" && typeof l.value === "number")
      .reduce((sum, l) => sum + (l.value ?? 0), 0);
  }, [leads, permissions.assignedOnly]);

  const sorted = useMemo(
    () =>
      [...leads].sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime(),
      ),
    [leads],
  );

  // Stage chips show open leads per real stage; Won/Lost chips key off status.
  const options = useMemo(() => {
    const openByStage: Record<string, number> = {};
    let won = 0;
    let lost = 0;
    for (const l of leads) {
      if (l.status === "won") won += 1;
      else if (l.status === "lost" || l.status === "abandoned") lost += 1;
      else
        openByStage[l.pipelineStageId] =
          (openByStage[l.pipelineStageId] ?? 0) + 1;
    }
    return [
      ...stages.map((s) => ({
        id: s.id,
        label: s.name,
        count: openByStage[s.id] ?? 0,
      })),
      { id: WON, label: client.pipeline.wonLabel, count: won },
      { id: LOST, label: "Lost", count: lost },
    ];
  }, [leads, stages, client.pipeline.wonLabel]);

  const stageFiltered = useMemo(() => {
    if (active === WON) return sorted.filter((l) => l.status === "won");
    if (active === LOST)
      return sorted.filter(
        (l) => l.status === "lost" || l.status === "abandoned",
      );
    return sorted.filter(
      (l) => l.status === "open" && l.pipelineStageId === active,
    );
  }, [sorted, active]);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const visible = useMemo(() => {
    if (!hasQuery) return stageFiltered;
    const q = trimmedQuery.toLowerCase();
    const qDigits = trimmedQuery.replace(/\D+/g, "");
    return stageFiltered.filter((l) => {
      if (l.name.toLowerCase().includes(q)) return true;
      if (l.email.toLowerCase().includes(q)) return true;
      if (l.sourceAd.toLowerCase().includes(q)) return true;
      if (l.sourceCampaign.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0) {
        const phoneDigits = l.phone.replace(/\D+/g, "");
        if (phoneDigits.includes(qDigits)) return true;
      }
      return false;
    });
  }, [stageFiltered, hasQuery, trimmedQuery]);

  const inFlight = useMemo(
    () => leads.filter((l) => l.status === "open").length,
    [leads],
  );

  const wonLabel = client.pipeline.wonLabel;
  const showRevenue = permissions.seeRevenue;
  const isRep = permissions.assignedOnly;
  const showValueColumn = showRevenue;

  const progressRate =
    stats.leadsMtd === 0
      ? 0
      : Math.round((stats.progressedMtd / stats.leadsMtd) * 100);
  const commission = Math.round(repWonValue * 0.1);

  const subtitle = hasQuery
    ? `${visible.length} of ${leads.length} ${leads.length === 1 ? "lead" : "leads"}`
    : `${inFlight} ${inFlight === 1 ? "lead" : "leads"} in flight`;

  return (
    <DesktopPage
      title="Dashboard"
      subtitle={subtitle}
      actions={<NotificationBell enabled={useReal} variant="surface" />}
    >
      {error ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          Failed to load your pipeline. {error.message || "Try again."}
        </div>
      ) : (
        <>
          {/* KPI band: the same role-aware month-to-date figures the phone
              StatsStrip shows, restyled as calm tiles. */}
          <section className="grid grid-cols-2 gap-5 xl:grid-cols-4">
            {showRevenue ? (
              <>
                <Kpi
                  label="Revenue this month"
                  value={formatMoney(stats.revenueMtd)}
                  tone="ledger"
                  sub={
                    stats.roas !== null
                      ? `${formatRoas(stats.roas)} ROAS`
                      : "won deals this month"
                  }
                  icon={<TrendingUp size={16} />}
                />
                <Kpi
                  label={wonLabel}
                  value={stats.wonMtd}
                  sub={
                    stats.cpa !== null ? `${formatMoney(stats.cpa)} CPA` : "this month"
                  }
                  icon={<Target size={16} />}
                />
                <Kpi
                  label="Leads"
                  value={stats.leadsMtd}
                  sub="created this month"
                  icon={<ArrowUpRight size={16} />}
                />
                <Kpi
                  label="Progressed"
                  value={stats.progressedMtd}
                  sub="advanced this month"
                  icon={<Users size={16} />}
                />
              </>
            ) : isRep ? (
              <>
                <Kpi
                  label={`My ${wonLabel}`}
                  value={stats.wonMtd}
                  sub="this month"
                  icon={<Target size={16} />}
                />
                <Kpi
                  label="Est. commission"
                  value={formatMoney(commission)}
                  tone="ledger"
                  sub="this month"
                  icon={<TrendingUp size={16} />}
                />
                <Kpi
                  label="My leads"
                  value={stats.leadsMtd}
                  sub="created this month"
                  icon={<ArrowUpRight size={16} />}
                />
                <Kpi
                  label="My progressed"
                  value={stats.progressedMtd}
                  sub="advanced this month"
                  icon={<Users size={16} />}
                />
              </>
            ) : (
              <>
                <Kpi
                  label="Progress rate"
                  value={`${progressRate}%`}
                  sub="of leads advanced"
                  icon={<TrendingUp size={16} />}
                />
                <Kpi
                  label="Leads"
                  value={stats.leadsMtd}
                  sub="created this month"
                  icon={<ArrowUpRight size={16} />}
                />
                <Kpi
                  label="Progressed"
                  value={stats.progressedMtd}
                  sub="advanced this month"
                  icon={<Users size={16} />}
                />
                <Kpi
                  label="New"
                  value={stats.newMtd}
                  sub="awaiting first move"
                  icon={<Target size={16} />}
                />
              </>
            )}
          </section>

          {/* Pipeline toolbar: switch pipeline, search, then stage chips. */}
          <section className="mt-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="label-cap text-brand-text">Active pipeline</span>
                <PipelineSwitcher
                  pipelines={pipelines}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
              <div className="relative w-full max-w-sm">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email, phone, or source"
                  aria-label="Search leads"
                  className="w-full rounded-[var(--radius)] border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              </div>
            </div>

            <div
              className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto pb-1"
              role="tablist"
              aria-label="Stage filter"
            >
              {options.map((opt) => {
                const isActive = opt.id === active;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(opt.id)}
                    className={
                      "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors " +
                      (isActive
                        ? "border-transparent bg-brand-tint text-brand-text"
                        : "border-border bg-surface text-muted hover:border-border-strong hover:text-text")
                    }
                  >
                    <span className="truncate">{opt.label}</span>
                    <span
                      className={
                        "font-data text-[12px] tabular-nums " +
                        (isActive ? "text-brand-text" : "text-faint")
                      }
                    >
                      {opt.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Leads table */}
          <section className="mt-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div
                  className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
                  aria-hidden
                />
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
                <EmptyState
                  title={hasQuery ? "No matches" : "No leads"}
                  message={
                    hasQuery
                      ? `No leads match "${trimmedQuery}"`
                      : "No leads in this stage yet."
                  }
                />
                {hasQuery && (
                  <div className="flex justify-center pb-4">
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:border-border-strong hover:text-text"
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-divider text-left">
                      <th className="label-cap px-6 py-3 font-semibold">Lead</th>
                      <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                        Stage
                      </th>
                      {showValueColumn && (
                        <th className="label-cap hidden px-6 py-3 text-right font-semibold xl:table-cell">
                          Value
                        </th>
                      )}
                      <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                        Last active
                      </th>
                      <th className="label-cap px-6 py-3 text-right font-semibold">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((lead) => (
                      <LeadTableRow
                        key={lead.id}
                        lead={lead}
                        now={now}
                        showValue={showValueColumn}
                        onOpen={() => navigate(`/lead/${lead.id}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </DesktopPage>
  );
}

function LeadTableRow({
  lead,
  now,
  showValue,
  onOpen,
}: {
  lead: Lead;
  now: number;
  showValue: boolean;
  onOpen: () => void;
}) {
  const hasEmail = lead.email.length > 0;
  return (
    <tr
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer border-b border-divider transition-colors last:border-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
    >
      {/* Lead name + source */}
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={lead.name} size="md" />
          <div className="min-w-0">
            <div className="truncate font-display text-[14.5px] font-semibold text-text">
              {lead.name}
            </div>
            <div className="truncate text-[12.5px] text-muted">
              {hasEmail ? lead.email : lead.sourceAd || "Direct"}
            </div>
          </div>
        </div>
      </td>

      {/* Stage */}
      <td className="hidden px-6 py-3.5 lg:table-cell">
        <StagePill lead={lead} />
      </td>

      {/* Value (owners only; money is gold) */}
      {showValue && (
        <td className="hidden px-6 py-3.5 text-right xl:table-cell">
          <span className="ledger text-[13px]">
            {typeof lead.value === "number" ? formatMoney(lead.value) : "--"}
          </span>
        </td>
      )}

      {/* Last active */}
      <td className="hidden px-6 py-3.5 lg:table-cell">
        <span className="font-data text-[12px] text-faint tabular-nums">
          {timeAgo(lead.lastActivityAt, now)}
        </span>
      </td>

      {/* Open */}
      <td className="px-6 py-3.5">
        <div className="flex justify-end">
          <ChevronRight size={16} className="text-faint" aria-hidden />
        </div>
      </td>
    </tr>
  );
}
