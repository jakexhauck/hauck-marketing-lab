// Lanes tab content for a pillar. Renders the lanes as a clean, spacious list
// (not card blocks): one row per lane, status dot, name, one-line description,
// motion pill where relevant, and a chevron into the lane workspace. Pipeline
// pillars get numbered rows; Service Delivery splits into Deploy and Manage
// sections. Tab content only: the parent AdminPillar provides the page shell.

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Pillar, PillarLane } from "../../../lib/pillars";
import { liveStatus } from "../../../lib/pillarStatus";
import { StatusDot } from "../PillarKit";

function LaneRow({ pillarId, lane, index }: { pillarId: string; lane: PillarLane; index?: number }) {
  return (
    <Link className="pk-li" to={`/admin/pillar/${pillarId}/lane/${lane.id}`}>
      {index !== undefined && <span className="pk-li-idx">{index}</span>}
      <div className="pk-li-main">
        <div className="pk-li-label">
          <StatusDot status={liveStatus(lane)} />
          {lane.label}
        </div>
        <div className="pk-li-sub">{lane.what}</div>
      </div>
      <div className="pk-li-meta">
        {lane.motion && <span className={"pk-motion pk-motion-" + lane.motion}>{lane.motion}</span>}
        <span className="pk-li-chev">
          <ChevronRight />
        </span>
      </div>
    </Link>
  );
}

export default function LanesTab({ pillar }: { pillar: Pillar }) {
  // Pipeline: a numbered list, front to back.
  if (pillar.shape === "pipeline") {
    return (
      <div className="pk-list">
        {pillar.lanes.map((lane, i) => (
          <LaneRow key={lane.id} pillarId={pillar.id} lane={lane} index={i + 1} />
        ))}
      </div>
    );
  }

  // Service Delivery: two labelled sections, Deploy then Manage.
  if (pillar.id === "service") {
    const deploy = pillar.lanes.filter((lane) => lane.motion === "deploy");
    const manage = pillar.lanes.filter((lane) => lane.motion === "manage");
    return (
      <div>
        <div className="pk-list-sec-h">Deploy (clone)</div>
        <div className="pk-list">
          {deploy.map((lane) => (
            <LaneRow key={lane.id} pillarId={pillar.id} lane={lane} />
          ))}
        </div>
        <div className="pk-list-sec-h">Manage (ongoing)</div>
        <div className="pk-list">
          {manage.map((lane) => (
            <LaneRow key={lane.id} pillarId={pillar.id} lane={lane} />
          ))}
        </div>
      </div>
    );
  }

  // Everything else: a single clean list.
  return (
    <div className="pk-list">
      {pillar.lanes.map((lane) => (
        <LaneRow key={lane.id} pillarId={pillar.id} lane={lane} />
      ))}
    </div>
  );
}
