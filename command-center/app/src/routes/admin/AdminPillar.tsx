// A pillar workspace: its own little business. A header, a row of tabs, and the
// active tab's content. Tabs come from the pillar config (every pillar has a
// Tasks tab; Operations also has Clients and Stack). Everything renders from
// pillars.ts, so adding a tab there shows up here automatically. Full-width.

import { Link, Navigate, useParams } from "react-router-dom";
import { getPillar } from "../../lib/pillarStatus";
import { Scoreboard, pillarIcon } from "../../components/pillars/PillarKit";
import { usePillarTasks } from "../../hooks/usePillarTasks";
import type { PillarTab } from "../../lib/pillars";
import OverviewTab from "../../components/pillars/tabs/OverviewTab";
import LanesTab from "../../components/pillars/tabs/LanesTab";
import TeamTab from "../../components/pillars/tabs/TeamTab";
import TasksTab from "../../components/pillars/tabs/TasksTab";
import ReportingTab from "../../components/pillars/tabs/ReportingTab";
import StackTab from "../../components/pillars/tabs/StackTab";
import BuildTab from "../../components/pillars/tabs/BuildTab";

export default function AdminPillar() {
  const { pillarId, tabId } = useParams();
  const pillar = getPillar(pillarId ?? "");
  // Hook runs unconditionally (no pillar -> empty id -> no fetch). One instance
  // feeds both the Tasks tab badge and the TasksTab list, so they share a fetch.
  const pillarTasks = usePillarTasks(pillar?.id ?? "");
  if (!pillar) return <Navigate to="/admin/clients" replace />;

  // Default to the first tab (Overview) when no tab or an unknown tab is given.
  const active: PillarTab = pillar.tabs.find((t) => t.id === (tabId ?? "overview")) ?? pillar.tabs[0];
  const Icon = pillarIcon(pillar.icon);

  return (
    <div className="pk-root">
      <div className="pk-head">
        <div className="pk-head-ic">
          <Icon />
        </div>
        <div className="pk-head-body">
          <div className="pk-kicker">
            {pillar.num ? (
              <>
                Pillar <span className="pk-num">{pillar.num}</span>
              </>
            ) : (
              "Hub"
            )}
          </div>
          <div className="pk-title">{pillar.label}</div>
          <div className="pk-tagline">{pillar.tagline}</div>
        </div>
        {pillar.scoreboard && (
          <div className="pk-head-side">
            <Scoreboard fields={pillar.scoreboard} />
          </div>
        )}
      </div>

      <nav className="pk-tabs">
        {pillar.tabs.map((t) => (
          <Link
            key={t.id}
            to={`/admin/pillar/${pillar.id}/${t.id}`}
            className={`pk-tab${t.id === active.id ? " on" : ""}`}
          >
            {t.label}
            {t.kind === "tasks" && (
              <span className="pk-tabcount">
                {pillarTasks.loading ? pillar.tasks.length : pillarTasks.tasks.length}
              </span>
            )}
            {t.kind === "team" && <span className="pk-tabcount">{pillar.team.length}</span>}
          </Link>
        ))}
      </nav>

      {active.kind === "overview" && <OverviewTab pillar={pillar} />}
      {active.kind === "lanes" && <LanesTab pillar={pillar} />}
      {active.kind === "team" && <TeamTab pillar={pillar} />}
      {active.kind === "tasks" && <TasksTab tasks={pillarTasks} />}
      {active.kind === "reporting" && <ReportingTab pillar={pillar} />}
      {active.kind === "stack" && <StackTab pillar={pillar} />}
      {active.kind === "build" && <BuildTab />}
    </div>
  );
}
