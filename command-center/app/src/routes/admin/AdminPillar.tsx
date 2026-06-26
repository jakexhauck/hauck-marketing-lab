import { Fragment } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getPillar, liveStatus } from "../../lib/pillarStatus";
import type { Pillar, PillarLane } from "../../lib/pillars";
import { PillarStyle, StatusDot, HermesSlot, Scoreboard, pillarIcon } from "../../components/pillars/PillarKit";

// One pillar page. Everything renders from the pillars config via getPillar, so
// the header, lane board, and scoreboard all stay in sync with lib/pillars.ts.
// Operations is the hub (no num); the value-chain pillars carry a display number.
// Pipeline pillars flow left to right with arrows; lane pillars render a grid,
// and Service Delivery splits its grid into Deploy (clone) and Manage (ongoing).

// A single lane card. Links into the lane workspace route.
function LaneCard({ pillar, lane }: { pillar: Pillar; lane: PillarLane }) {
  return (
    <Link
      className={"pk-lane" + (lane.future ? " pk-lane-future" : "")}
      to={`/admin/pillar/${pillar.id}/${lane.id}`}
    >
      <div className="pk-lane-top">
        <span className="pk-lane-label">{lane.label}</span>
        <StatusDot status={liveStatus(lane)} />
      </div>
      <div className="pk-lane-what">{lane.what}</div>
      <div className="pk-lane-foot">
        {lane.motion && (
          <span className={"pk-motion pk-motion-" + lane.motion}>{lane.motion}</span>
        )}
        <HermesSlot compact />
      </div>
    </Link>
  );
}

export default function AdminPillar() {
  const { pillarId } = useParams();
  const pillar = getPillar(pillarId ?? "");
  if (!pillar) return <Navigate to="/admin/clients" replace />;

  const Icon = pillarIcon(pillar.icon);
  const kicker = pillar.num ? `Pillar ${pillar.num}` : "Hub";

  return (
    <div className="pk-root">
      <PillarStyle />

      <Link className="pk-back" to="/admin/clients">
        <ArrowLeft />
        Back
      </Link>

      <div className="pk-head">
        <div className="pk-head-ic">
          <Icon />
        </div>
        <div className="pk-head-body">
          <div className="pk-kicker">{kicker}</div>
          <div className="pk-title">{pillar.label}</div>
          <div className="pk-tagline">{pillar.tagline}</div>
          {pillar.goal && <div className="pk-goal">{pillar.goal}</div>}
        </div>
        <div className="pk-head-side">
          <HermesSlot />
          {pillar.scoreboard && <Scoreboard fields={pillar.scoreboard} />}
        </div>
      </div>

      {pillar.shape === "pipeline" ? (
        <div className="pk-section">
          <div className="pk-flow">
            {pillar.lanes.map((lane, i) => (
              <Fragment key={lane.id}>
                <LaneCard pillar={pillar} lane={lane} />
                {i < pillar.lanes.length - 1 && (
                  <div className="pk-flow-arrow">
                    <ArrowRight />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      ) : pillar.id === "service" ? (
        <>
          <LaneSection
            pillar={pillar}
            heading="Deploy (clone)"
            lanes={pillar.lanes.filter((l) => l.motion === "deploy")}
          />
          <LaneSection
            pillar={pillar}
            heading="Manage (ongoing)"
            lanes={pillar.lanes.filter((l) => l.motion === "manage")}
          />
        </>
      ) : (
        <div className="pk-section">
          <div className="pk-lanes">
            {pillar.lanes.map((lane) => (
              <LaneCard key={lane.id} pillar={pillar} lane={lane} />
            ))}
          </div>
        </div>
      )}

      <div className="pk-build">
        <b>Build space.</b> New assets, SOPs, and tools for this pillar go here.
      </div>
    </div>
  );
}

// A titled grid of lanes, used by Service Delivery to separate Deploy from Manage.
function LaneSection({ pillar, heading, lanes }: { pillar: Pillar; heading: string; lanes: PillarLane[] }) {
  if (!lanes.length) return null;
  return (
    <div className="pk-section">
      <div className="pk-section-h">{heading}</div>
      <div className="pk-lanes">
        {lanes.map((lane) => (
          <LaneCard key={lane.id} pillar={pillar} lane={lane} />
        ))}
      </div>
    </div>
  );
}
