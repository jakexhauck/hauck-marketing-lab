// Lanes tab content for a pillar. Renders the lanes as small emoji boxes in a
// responsive grid: emoji, name, one-line description, status dot, and a motion
// pill where relevant. Pipeline pillars get a step number per box; Service
// Delivery splits into Deploy and Manage sections. A box links to its lane
// workspace, or to lane.to when set (Paid Ads points at the tracker). Tab
// content only: the parent AdminPillar provides the page shell.

import { Link } from "react-router-dom";
import type { Pillar, PillarLane } from "../../../lib/pillars";
import { liveStatus } from "../../../lib/pillarStatus";
import { StatusDot } from "../PillarKit";

function LaneBox({ pillarId, lane, index }: { pillarId: string; lane: PillarLane; index?: number }) {
  const href = lane.to ?? `/admin/pillar/${pillarId}/lane/${lane.id}`;
  return (
    <Link className="pk-lane" to={href}>
      <span className="pk-lane-emoji" aria-hidden>
        {lane.emoji}
      </span>
      {index !== undefined && <span className="pk-lane-idx">{index}</span>}
      <div className="pk-lane-top">
        <StatusDot status={liveStatus(lane)} />
        <span className="pk-lane-label">{lane.label}</span>
      </div>
      <div className="pk-lane-what">{lane.what}</div>
      {lane.motion && (
        <div className="pk-lane-foot">
          <span className={"pk-motion pk-motion-" + lane.motion}>{lane.motion}</span>
        </div>
      )}
    </Link>
  );
}

export default function LanesTab({ pillar }: { pillar: Pillar }) {
  // Pipeline: numbered boxes, front to back.
  if (pillar.shape === "pipeline") {
    return (
      <div className="pk-lanes">
        {pillar.lanes.map((lane, i) => (
          <LaneBox key={lane.id} pillarId={pillar.id} lane={lane} index={i + 1} />
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
        <div className="pk-lanes">
          {deploy.map((lane) => (
            <LaneBox key={lane.id} pillarId={pillar.id} lane={lane} />
          ))}
        </div>
        <div className="pk-list-sec-h">Manage (ongoing)</div>
        <div className="pk-lanes">
          {manage.map((lane) => (
            <LaneBox key={lane.id} pillarId={pillar.id} lane={lane} />
          ))}
        </div>
      </div>
    );
  }

  // Everything else: a single grid of boxes.
  return (
    <div className="pk-lanes">
      {pillar.lanes.map((lane) => (
        <LaneBox key={lane.id} pillarId={pillar.id} lane={lane} />
      ))}
    </div>
  );
}
