import { useMemo } from "react";
import type { AdminLead } from "../../../lib/api";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import CallWorkspace, { type QueueBadge } from "./CallWorkspace";

// Cold Call > Callbacks: everyone who said "call me back on Thursday".
//
// The same workspace as the Leads queue, because it is the same job: a list on
// the left, the person being called on the right, four buttons for how it went.
// Only the list differs, and the chip that says when they are due.
//
// Separate from the cold queue on purpose. These are the warmest conversations
// he has, and a callback buried in a list of strangers is a lost deal. Overdue
// sorts to the top, since a missed callback is worse than an unmade cold call.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// "Overdue", "Today", "Tomorrow", then the date. Relative wording only where it
// is unambiguous; past a couple of days out, a date is clearer than "in 4 days".
function whenBadge(date: string, now: string): QueueBadge {
  if (date < now) return { text: "Overdue", tone: "late" };
  if (date === now) return { text: "Today", tone: "now" };
  const d = new Date(`${date}T00:00:00`);
  const n = new Date(`${now}T00:00:00`);
  const days = Math.round((d.getTime() - n.getTime()) / 86_400_000);
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  return {
    text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    tone: "soon",
  };
}

// callerId "" means everyone; otherwise only that person's assigned rows. A
// caller's own request is already scoped server-side, so this is the owner's
// lens rather than a security boundary.
export default function ColdCallCallbacks({ callerId = "" }: { callerId?: string }) {
  const leadsQuery = useAdminLeadsQuery();
  const now = today();

  const due = useMemo(() => {
    const leads = leadsQuery.data?.leads ?? [];
    return leads
      .filter((l) => (callerId ? l.assignedTo === callerId : true))
      .filter((l) => l.followUpDate && l.status !== "Dead" && l.status !== "Closed")
      .sort((a, b) => (a.followUpDate ?? "").localeCompare(b.followUpDate ?? ""));
  }, [leadsQuery.data, callerId]);

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading callbacks...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load callbacks. Reload to try again.</div>;
  }

  return (
    <CallWorkspace
      leads={due}
      queueTitle="Due back"
      emptyTitle="No callbacks due"
      emptyHint={'They appear here when a call ends in "Callback".'}
      badgeFor={(lead: AdminLead) => whenBadge(lead.followUpDate!, now)}
    />
  );
}
