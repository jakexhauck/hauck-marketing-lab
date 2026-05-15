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
import { computeStats } from "../lib/computeStats";

interface DashboardLocationState {
  toast?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leads } = useLeads();
  const { client } = useClient();
  const [active, setActive] = useState<StageFilterValue>("all");

  const stats = useMemo(
    () => computeStats(leads, client.monthlySpend),
    [leads, client.monthlySpend]
  );
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
        (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
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

  return (
    <Shell>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      <TopBar />
      <StatsStrip stats={stats} />
      <StageFilter active={active} counts={counts} onChange={setActive} />
      <main className="flex flex-1 flex-col">
        {visible.length === 0 ? (
          <EmptyState message="No leads in this stage yet." />
        ) : (
          <ul className="flex flex-col">
            {visible.map((lead) => (
              <li key={lead.id}>
                <LeadRow lead={lead} onTap={(id) => navigate(`/lead/${id}`)} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}
