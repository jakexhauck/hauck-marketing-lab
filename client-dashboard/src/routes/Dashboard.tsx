import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import TopBar from "../components/TopBar";
import StageFilter, { type StageFilterValue } from "../components/StageFilter";
import StatsStrip from "../components/StatsStrip";
import LeadRow from "../components/LeadRow";
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

  useEffect(() => {
    if (active === "all") return;
    if (!client.pipeline.stages.includes(active)) {
      setActive("all");
    }
  }, [client.pipeline.stages, active]);

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

  const visible = useMemo(() => {
    if (active === "all") return sorted;
    return sorted.filter((l) => l.stage === active);
  }, [sorted, active]);

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
            {inFlight} {inFlight === 1 ? "lead" : "leads"} in flight
          </h2>
        </div>
      </div>

      <StageFilter active={active} counts={counts} onChange={setActive} />

      <main className="flex flex-1 flex-col px-5 pb-6">
        {visible.length === 0 ? (
          <EmptyState message="No leads in this stage yet." />
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {visible.map((lead, idx) => (
              <li key={lead.id} className={idx === visible.length - 1 ? "[&_button]:border-b-0" : ""}>
                <LeadRow lead={lead} onTap={(id) => navigate(`/lead/${id}`)} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}
