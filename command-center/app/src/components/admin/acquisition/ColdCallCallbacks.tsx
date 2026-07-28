import { useMemo } from "react";
import type { AdminLead } from "../../../lib/api";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import { formatTime } from "../../../lib/callbackTimes";
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
// The agreed time rides along with the day (0063). "Today" on its own sends
// somebody to the phone now; "Today 2:30 pm" is the difference between keeping
// the promise and breaking it by four hours.
function whenBadge(date: string, now: string, time?: string | null): QueueBadge {
  const at = formatTime(time);
  const withTime = (text: string) => (at ? `${text} ${at}` : text);

  if (date < now) return { text: "Overdue", tone: "late" };
  if (date === now) return { text: withTime("Today"), tone: "now" };
  const d = new Date(`${date}T00:00:00`);
  const n = new Date(`${now}T00:00:00`);
  const days = Math.round((d.getTime() - n.getTime()) / 86_400_000);
  if (days === 1) return { text: withTime("Tomorrow"), tone: "soon" };
  return {
    text: withTime(d.toLocaleDateString(undefined, { month: "short", day: "numeric" })),
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
      // The stage is the list: a lead is a callback because it sits in Call
      // Back, not because it happens to carry a date. Undated rows sort last
      // rather than vanishing, since a callback with no date is still owed.
      .filter((l) => l.status === "Call Back")
      .sort((a, b) => (a.followUpDate ?? "9999-12-31").localeCompare(b.followUpDate ?? "9999-12-31"));
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
      badgeFor={(lead: AdminLead) =>
        lead.followUpDate
          ? whenBadge(lead.followUpDate, now, lead.followUpTime)
          : { text: "No date", tone: "late" }
      }
    />
  );
}
