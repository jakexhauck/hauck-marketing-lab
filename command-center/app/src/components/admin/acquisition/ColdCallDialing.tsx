import { useCallback, useMemo, useState } from "react";
import type { AdminLead } from "../../../lib/api";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import { useColdCallLive } from "../../../hooks/useColdCall";
import { formatTime } from "../../../lib/callbackTimes";
import { COLD_CALL_STAGES, stageByLabel } from "../../../lib/coldCallStages";
import CallWorkspace, { type QueueBadge } from "./CallWorkspace";

// Cold Call > Dialing: the day's calling in one list.
//
// GoHighLevel's power dialer works a list of its own and answers for itself, so
// by the time a call ends the only thing left for a person to do is say what
// became of it. This page is that list and nothing else: every prospect still
// owed a call, across every stage at once, in the order they should be rung.
// Press an outcome and they are gone from it.
//
// It exists because the stage pages ask the wrong question during a session.
// Each of them is one stage, so working a shift means four tabs and a memory of
// which one the phone is on. GoHighLevel's own Manual Actions queue is the same
// idea and cannot be read: it has no API, on the private token or the
// Marketplace app, so this is built from the book instead. The book holds the
// same people, because every stage tag is pushed to GoHighLevel from it.
//
// Everything below the list is the shared CallWorkspace, deliberately and by
// construction rather than by resemblance: the same six outcomes, the same
// script attribution, the same callback picker, the same booking panel, the
// same writes. Nothing about how a call is recorded forks here.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Where each stage sits in the pipeline, used below to order what is left of a
// list that holds all of them at once.
const STAGE_ORDER = new Map<string, number>(
  COLD_CALL_STAGES.map((stage, i) => [stage.label as string, i]),
);

// A callback that is owed now: the day has arrived or has passed. One with a
// date still ahead is not work today and is not on this page at all.
function callbackDue(lead: AdminLead, now: string): boolean {
  return lead.status === "Call Back" && Boolean(lead.followUpDate) && lead.followUpDate! <= now;
}

// The order of the day, and the whole argument of this page.
//
// 0  the phone is on them RIGHT NOW. Whatever else is owed, the call happening
//    this second is the one about to need an answer.
// 1  a callback that is due or overdue. A promise made to somebody who spoke to
//    us beats any number of strangers.
// 2+ the pipeline in its own order: New Lead, then the two no-answer stages.
//    A callback with no date agreed sorts last, since it is owed but not owed
//    at any particular moment.
function rank(lead: AdminLead, now: string, ringing: Set<string>): number {
  if (ringing.has(lead.id)) return 0;
  if (callbackDue(lead, now)) return 1;
  return 2 + (STAGE_ORDER.get(lead.status) ?? 99);
}

export default function ColdCallDialing({ callerId = "" }: { callerId?: string }) {
  const leadsQuery = useAdminLeadsQuery();
  const live = useColdCallLive();
  const now = today();

  // Prospects judged since this page was opened.
  //
  // The list is every stage at once, so a stage change cannot be what removes
  // somebody from it: a no-answer moves a prospect from New Lead to No Answer
  // Day 1, and both are on this page. Held here, in the open, rather than
  // inferred from lastContact, which a lead carries from the day it was
  // imported and would hide a fresh list on the morning it arrives.
  //
  // Deliberately not persisted. A reload is a fresh shift, and a no-answer IS
  // callable again later in the day, which is what No Answer Day 1 means.
  const [logged, setLogged] = useState<Set<string>>(() => new Set());
  const drop = useCallback((leadId: string) => {
    setLogged((prev) => {
      const next = new Set(prev);
      next.add(leadId);
      return next;
    });
  }, []);

  const all = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data]);

  // Who the dialer has rung and nobody has judged yet, by lead. These sort to
  // the very top: they are the calls the shift is behind on.
  const ringing = useMemo(() => {
    const ids = new Set<string>();
    for (const call of live.data?.calls ?? []) if (call.leadId) ids.add(call.leadId);
    return ids;
  }, [live.data]);

  const queue = useMemo(() => {
    const out = all.filter((lead) => {
      if (callerId && lead.assignedTo !== callerId) return false;
      if (logged.has(lead.id)) return false;
      // A prospect with no number is not a call, whatever else they are.
      if (!lead.phone.trim()) return false;
      const stage = stageByLabel(lead.status);
      // Booked and Not Interested have left the dialing operation, and a status
      // from the retired vocabulary is not a stage anybody works.
      if (!stage || stage.terminal || !stage.queue) return false;
      // A callback agreed for next Tuesday is not today's work.
      if (lead.status === "Call Back" && lead.followUpDate && lead.followUpDate > now) return false;
      return true;
    });

    return out.sort((a, b) => {
      const byRank = rank(a, now, ringing) - rank(b, now, ringing);
      if (byRank !== 0) return byRank;
      // Inside a rank: the longest-overdue callback first, then whoever has been
      // left alone longest. A queue that reshuffles under a caller is worse than
      // one ordered by something arbitrary, so both keys are stable.
      const byDate = (a.followUpDate ?? "9999-12-31").localeCompare(b.followUpDate ?? "9999-12-31");
      if (byDate !== 0) return byDate;
      const byTouch = (a.lastContact ?? "").localeCompare(b.lastContact ?? "");
      if (byTouch !== 0) return byTouch;
      return a.id.localeCompare(b.id);
    });
  }, [all, callerId, logged, now, ringing]);

  // The chip says the one thing about this row that is not on the row already.
  // On a single-stage page that is when a callback is due; here it is also which
  // stage a prospect is in, because the list holds all of them.
  const badgeFor = useCallback(
    (lead: AdminLead): QueueBadge | null => {
      if (ringing.has(lead.id)) return { text: "On the phone", tone: "now" };
      if (lead.status === "Call Back") {
        if (!lead.followUpDate) return { text: "No date", tone: "late" };
        if (lead.followUpDate < now) return { text: "Overdue", tone: "late" };
        const at = formatTime(lead.followUpTime);
        return { text: at ? `Today ${at}` : "Today", tone: "now" };
      }
      return { text: stageByLabel(lead.status)?.short ?? lead.status, tone: "soon" };
    },
    [now, ringing],
  );

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading the list...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load the book. Reload to try again.</div>;
  }

  return (
    <CallWorkspace
      leads={queue}
      queueTitle="To call"
      emptyTitle="Nothing left to dial"
      emptyHint="Every prospect owed a call today has had one. Import more, or reload for a fresh list."
      badgeFor={badgeFor}
      onLogged={drop}
    />
  );
}
