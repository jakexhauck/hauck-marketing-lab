import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { emptyPage, type AdsPage as Ads, type ResearchPage as Research } from "../../../lib/briefPages";
import { clientPath } from "../../../lib/clientNav";
import { useClientTasksQuery } from "../../../hooks/useApi";
import { DriveChip, OpenDoc, useBrief } from "../agents/BriefPanel";
import { useBriefLive } from "../agents/agentApi";
import { AdsPage } from "./AdsPage";
import { ChecklistPage } from "./ChecklistPage";
import { ClientInfoPage } from "./ClientInfoPage";
import { GhlPage } from "./GhlPage";
import { adsStats, MISSION_PAGES, resolveMissionPage } from "./missionHelpers";
import { MissionStyle } from "./missionStyle";
import { ResearchPage } from "./ResearchPage";

// The client's Brief as Mission Control (Jake, 2026-10-22;
// docs/build-plans/mission-control-brief.md, mockup docs/mockups/mission-control-brief.html).
// Five pages behind one pill bar, the page in the URL's sub segment so a link
// opens it. Research and Ads are the agents' typed pages, Client Information and
// GHL are read live, the checklist is the Director's own task list.
export function MissionBrief({ tenantId, brandColor, sub }: { tenantId: string; brandColor?: string; sub: string | null }) {
  const navigate = useNavigate();
  const page = resolveMissionPage(sub);
  const { q, sections, drive } = useBrief(tenantId);
  const live = useBriefLive(tenantId);
  const tasksQ = useClientTasksQuery(tenantId);
  const tasks = tasksQ.data?.tasks ?? [];
  const pages = q.data?.pages ?? [];
  const research = (pages.find((p) => p.page === "research")?.data as Research | undefined) ?? emptyPage("research");
  const ads = (pages.find((p) => p.page === "ads")?.data as Ads | undefined) ?? emptyPage("ads");
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;

  return (
    <div className="mcb" style={style}>
      <MissionStyle />
      <div className="mcb-head">
        <h2 className="mcb-title">Brief</h2>
        {q.data && <DriveChip drive={drive} sections={sections} pages={pages} />}
        <span className="mcb-grow" />
        <OpenDoc drive={drive} />
      </div>
      <nav className="mcb-pages" aria-label="Brief pages">
        {MISSION_PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`mcb-pg${p.id === page ? " on" : ""}`}
            aria-current={p.id === page ? "page" : undefined}
            onClick={() => navigate(clientPath(tenantId, "brief", p.id), { replace: true })}
          >
            {p.label}
          </button>
        ))}
      </nav>

      {q.isLoadingError ? (
        <div className="mcb-empty">Brief did not load.</div>
      ) : page === "client" ? (
        <ClientInfoPage key="client" tenantId={tenantId} live={live.data} liveLoading={live.isLoading} sections={sections} />
      ) : page === "checklist" ? (
        <ChecklistPage key="checklist" tenantId={tenantId} tasks={tasks} loading={tasksQ.isLoading} launchDate={adsStats(ads).launchDate} sections={sections} />
      ) : page === "research" ? (
        <ResearchPage key="research" tenantId={tenantId} page={research} sections={sections} />
      ) : page === "ads" ? (
        <AdsPage key="ads" tenantId={tenantId} page={ads} sections={sections} />
      ) : (
        <GhlPage key="ghl" tenantId={tenantId} live={live.data} liveLoading={live.isLoading} tasks={tasks} sections={sections} />
      )}
    </div>
  );
}
