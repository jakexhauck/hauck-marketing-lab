import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../components/Shell";
import TopBar from "../components/TopBar";
import StageFilter, { type StageFilterValue } from "../components/StageFilter";
import LeadRow from "../components/LeadRow";
import EmptyState from "../components/EmptyState";
import { useClient } from "../context/ClientContext";
import { getMockData } from "../mock";

export default function Dashboard() {
  const { client } = useClient();
  const navigate = useNavigate();
  const [active, setActive] = useState<StageFilterValue>("all");

  const leads = useMemo(() => getMockData(client.id).leads, [client.id]);

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
      <TopBar />
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
