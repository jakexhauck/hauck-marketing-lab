import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sun } from "lucide-react";
import Shell from "../components/Shell";
import DashboardDesktop from "../components/dashboard/DashboardDesktop";
import TopBar from "../components/TopBar";
import ViewTabs from "../components/ViewTabs";
import StageFilter, { type StageFilterOption } from "../components/StageFilter";
import StatsStrip from "../components/StatsStrip";
import LeadRow from "../components/LeadRow";
import PipelineSwitcher from "../components/PipelineSwitcher";
import SearchBar from "../components/SearchBar";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import { useLeads } from "../context/LeadsContext";
import { usePipelines } from "../context/PipelinesContext";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { computeStats } from "../lib/computeStats";
import { permissionsFor } from "../lib/rolePermissions";

// Sentinel chip ids for the status filters that follow the real stage chips.
const WON = "__won__";
const LOST = "__lost__";

export default function Dashboard() {
  const navigate = useNavigate();
  const { leads: allLeads } = useLeads();
  const { pipelines, selectedId, selected, setSelectedId } = usePipelines();
  const { client } = useClient();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [active, setActive] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  const stages = useMemo(() => selected?.stages ?? [], [selected]);

  // Default to the first real stage once the pipeline loads, and heal a
  // selection that no longer exists after a pipeline switch.
  useEffect(() => {
    const valid =
      active === WON ||
      active === LOST ||
      stages.some((s) => s.id === active);
    if (!valid) {
      setActive(stages[0]?.id ?? "");
    }
  }, [stages, active]);

  useEffect(() => {
    if (currentUser?.role === "rep") {
      navigate("/today", { replace: true });
    }
  }, [currentUser, navigate]);

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
    [leads, client.monthlySpend]
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
          new Date(a.lastActivityAt).getTime()
      ),
    [leads]
  );

  // Stage chips show open leads per real stage; Won/Lost chips key off status.
  const options = useMemo<StageFilterOption[]>(() => {
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
    [leads]
  );

  return (
    <Shell>
      {/* Phone layout (below lg). The desktop client app renders
          DashboardDesktop instead; both share the same data so there is no
          double fetch. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <PullToRefresh queryKeys={[["leads"], ["summary"]]} />
      <TopBar />
      <ViewTabs />
      <StatsStrip
        stats={stats}
        permissions={permissions}
        repWonValue={repWonValue}
        repLeadsCount={leads.length}
      />

      <div className="mb-2 flex items-end justify-between px-5">
        <div className="flex flex-col gap-1">
          <span
            className="label-cap-strong"
            style={{ color: "var(--brand-text)" }}
          >
            Active Pipeline
          </span>
          <PipelineSwitcher
            pipelines={pipelines}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text)]">
            {hasQuery ? (
              <>
                {visible.length} of {leads.length}{" "}
                {leads.length === 1 ? "lead" : "leads"}
              </>
            ) : (
              <>
                {inFlight} {inFlight === 1 ? "lead" : "leads"} in flight
              </>
            )}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => navigate("/today")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.97] active:bg-[var(--surface-2)]"
          style={{ minHeight: "36px" }}
        >
          <Sun size={14} aria-hidden="true" />
          Today
        </button>
      </div>

      <div className="px-5 pt-4">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      <StageFilter options={options} active={active} onChange={setActive} />

      <main className="flex flex-1 flex-col px-5 pb-6">
        {visible.length === 0 ? (
          hasQuery ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <EmptyState message={`No leads match "${trimmedQuery}"`} />
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.97] active:bg-[var(--surface-2)]"
                style={{ minHeight: "36px" }}
              >
                Clear search
              </button>
            </div>
          ) : (
            <EmptyState message="No leads in this stage yet." />
          )
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {visible.map((lead, idx) => (
              <li key={lead.id}>
                <LeadRow
                  lead={lead}
                  onTap={(id) => navigate(`/lead/${id}`)}
                  onAction={showToast}
                  isLast={idx === visible.length - 1}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
      </div>

      {/* Desktop client app (lg+): the Atelier command deck. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <DashboardDesktop />
      </div>
    </Shell>
  );
}
