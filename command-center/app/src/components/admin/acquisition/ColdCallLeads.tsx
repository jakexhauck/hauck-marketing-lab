import { useMemo } from "react";
import type { ColdCallStage } from "../../../lib/coldCallStages";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import CallWorkspace from "./CallWorkspace";
import ColdCallManage from "./ColdCallManage";

// A Cold Call stage page.
//
// A stage is either a queue or a list, and the stage itself decides which. The
// queue is the same one Callbacks uses: the list on the left, the person being
// called on the right, four buttons for how it went. Pressing one records the
// outcome and hands over the next, so nobody chooses who to call.
//
// There is no switch between "the book" and "the queue" any more. A stage page
// is the work; the book is its own page.

// callerId "" means everyone (the owner looking at the whole operation);
// otherwise the section is scoped to one person.
export default function ColdCallLeads({
  stage,
  callerId = "",
}: {
  stage: ColdCallStage;
  callerId?: string;
}) {
  const leadsQuery = useAdminLeadsQuery();

  const all = leadsQuery.data?.leads ?? [];
  // One stage, one page. The status IS the stage, so this is the whole filter.
  const queue = useMemo(
    () =>
      all
        .filter((l) => (callerId ? l.assignedTo === callerId : true))
        .filter((l) => l.status === stage.label),
    [all, callerId, stage.label],
  );

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading the list...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load the list. Reload to try again.</div>;
  }

  // A stage nobody dials straight from is a list to read.
  if (!stage.queue) return <ColdCallManage callerId={callerId} status={stage.label} />;

  return (
    <CallWorkspace
      leads={queue}
      queueTitle="To call"
      emptyTitle={`Nobody in ${stage.label}`}
      emptyHint="Every prospect in this stage has been worked."
    />
  );
}
