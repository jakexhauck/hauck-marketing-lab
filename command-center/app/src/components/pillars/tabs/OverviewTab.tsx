// Overview tab content for a pillar. For most pillars: the goal, scoreboard, and
// a "Needs attention" list of lanes still planned or flagging a setup gap. For
// Operations (the hub) it is the agency command deck: the greeting hero and the
// live clients board (moved here from the old standalone Clients page), then the
// needs-attention list. Tab content only: the parent AdminPillar provides the
// page shell.

import type { Pillar } from "../../../lib/pillars";
import { Scoreboard, NeedsSetup } from "../PillarKit";
import AdminClients from "../../../routes/admin/AdminClients";

function NeedsAttention({ pillar }: { pillar: Pillar }) {
  const needsAttention = pillar.lanes.filter(
    (lane) => lane.status === "planned" || typeof lane.needsSetup === "string",
  );
  return (
    <div className="pk-section">
      <div className="pk-section-h">Needs attention</div>
      {needsAttention.length > 0 ? (
        needsAttention.map((lane) => (
          <NeedsSetup key={lane.id}>
            {`${lane.label}: ${lane.needsSetup ?? "Not set up yet."}`}
          </NeedsSetup>
        ))
      ) : (
        <div className="pk-li-sub">Everything in this pillar is set up.</div>
      )}
    </div>
  );
}

export default function OverviewTab({ pillar }: { pillar: Pillar }) {
  // Operations is the command deck: the greeting hero + the live clients board.
  if (pillar.id === "operations") {
    return (
      <div>
        <AdminClients />
        <NeedsAttention pillar={pillar} />
      </div>
    );
  }

  return (
    <div>
      {pillar.goal && <div className="pk-goal">{pillar.goal}</div>}
      <Scoreboard fields={pillar.scoreboard ?? []} />
      <NeedsAttention pillar={pillar} />
    </div>
  );
}
