import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sun } from "lucide-react";
import Shell from "../components/Shell";
import TopBar from "../components/TopBar";
import ViewTabs from "../components/ViewTabs";
import StageFilter, { type StageFilterValue } from "../components/StageFilter";
import StatsStrip from "../components/StatsStrip";
import LeadRow from "../components/LeadRow";
import SearchBar from "../components/SearchBar";
import EmptyState from "../components/EmptyState";
import Toast from "../components/Toast";
import { useLeads } from "../context/LeadsContext";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import { computeStats } from "../lib/computeStats";
import { permissionsFor } from "../lib/rolePermissions";

interface DashboardLocationState {
  toast?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leads: allLeads } = useLeads();
  const { client } = useClient();
  const { currentUser } = useAuth();
  const [active, setActive] = useState<StageFilterValue>("all");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    if (active === "all") return;
    if (!client.pipeline.stages.includes(active)) {
      setActive("all");
    }
  }, [client.pipeline.stages, active]);

  useEffect(() => {
    if (currentUser?.role === "rep") {
      navigate("/today", { replace: true });
    }
  }, [currentUser, navigate]);

  const permissions = currentUser
    ? permissionsFor(currentUser.role)
    : permissionsFor("owner");

  const leads = useMemo(() => {
    if (permissions.assignedOnly && currentUser) {
      return allLeads.filter((l) => l.assignedUserId === currentUser.id);
    }
    return allLeads;
  }, [allLeads, permissions.assignedOnly, currentUser]);

  const stats = useMemo(
    () => computeStats(leads, client.monthlySpend),
    [leads, client.monthlySpend]
  );

  const repWonValue = useMemo(() => {
    if (!permissions.assignedOnly) return 0;
    return leads
      .filter((l) => l.stage === "won" && typeof l.value === "number")
      .reduce((sum, l) => sum + (l.value ?? 0), 0);
  }, [leads, permissions.assignedOnly]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as DashboardLocationState | null;
    if (state?.toast) {
      setToast(state.toast);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const sorted = useMemo(
    () =>
      [...leads].sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime()
      ),
    [leads]
  );

  const counts = useMemo(() => {
    const base: Record<StageFilterValue, number> = {
      all: leads.length,
      new: 0,
      contacted: 0,
      "estimate-sent": 0,
      consultation: 0,
      booked: 0,
      won: 0,
      lost: 0,
      "no-show": 0,
    };
    for (const l of leads) {
      base[l.stage] += 1;
    }
    return base;
  }, [leads]);

  const stageFiltered = useMemo(() => {
    if (active === "all") return sorted;
    return sorted.filter((l) => l.stage === active);
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
    () =>
      leads.filter(
        (l) => l.stage !== "won" && l.stage !== "lost" && l.stage !== "no-show"
      ).length,
    [leads]
  );

  return (
    <Shell>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
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
            style={{ color: "var(--brand-primary)" }}
          >
            Active Pipeline
          </span>
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

      <StageFilter active={active} counts={counts} onChange={setActive} />

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
                  onAction={(message) => setToast(message)}
                  isLast={idx === visible.length - 1}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}
