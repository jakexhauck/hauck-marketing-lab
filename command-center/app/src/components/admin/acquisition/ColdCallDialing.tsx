import { useMemo, type ReactNode } from "react";
import { useAdminLeadsByIds } from "../../../hooks/useAdminLeads";
import { useColdCallLive } from "../../../hooks/useColdCall";
import CallWorkspace from "./CallWorkspace";

// Cold Call > Power dialer.
//
// The same calling workspace as every stage page, minus the queue. There is no
// list here because there is nothing to choose: the phone decides who is on it,
// and this page's job is to record what happened to whoever that was.
//
// It starts EMPTY, deliberately (Jake, 2026-08-18). A worklist of prospects
// here would be a second answer to "who do I call next", which the stage pages
// already answer, and the dialer is not going to read it. Nobody appears until
// GoHighLevel rings them.
//
// It is the page to have open while dialing from GoHighLevel. The stage pages
// answer "who should I call next"; this one answers "what became of the call I
// just had", which is a different question and the one that was being answered
// against the wrong prospect.
//
// Everything below the top is identical to the stage pages, deliberately and by
// construction rather than by resemblance: the same CallWorkspace, so the same
// six outcomes, the same script attribution, the same callback picker, the same
// booking panel, the same writes. Nothing about how a call is recorded forks
// here, because two ways of recording a pitch_no is two numbers to argue over.
export default function ColdCallDialing({
  callerId = "",
  scriptSlot,
}: {
  callerId?: string;
  // The dialing script, which this page reads inline above the card rather than
  // out of a floating panel. Built by ColdCallSection, which owns the toggle in
  // the header; passed straight through, because nothing on this page has an
  // opinion about it beyond where it goes.
  scriptSlot?: ReactNode;
}) {
  const live = useColdCallLive();
  const calls = useMemo(() => live.data?.calls ?? [], [live.data]);

  // Only the prospects the phone has actually been on get fetched.
  //
  // This page used to read the whole lead book and keep the two or three rows
  // it needed. At 746 leads that request stopped completing: Cloudflare killed
  // the Worker for exceeding its CPU budget (error 1102) before the handler ran,
  // and the page reported it as "Could not load the book". Asking for the ids it
  // wants makes the request small enough to always answer, and it gets smaller
  // as the scraper grows the book rather than larger.
  const wantedIds = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const call of calls) {
      if (!call.leadId || seen.has(call.leadId)) continue;
      seen.add(call.leadId);
      out.push(call.leadId);
    }
    return out;
  }, [calls]);

  const leadsQuery = useAdminLeadsByIds(wantedIds);
  const all = leadsQuery.data?.leads ?? [];

  // The prospects behind the calls waiting on an outcome, newest call first, so
  // the card starts on the one that just happened.
  //
  // Ordered by the CALL rather than by anything about the lead: this page is a
  // record of the last twenty minutes of the phone, not a view of the book.
  const queue = useMemo(() => {
    const byId = new Map(all.map((lead) => [lead.id, lead]));
    const seen = new Set<string>();
    const out = [];
    for (const call of calls) {
      if (!call.leadId || seen.has(call.leadId)) continue;
      const lead = byId.get(call.leadId);
      if (!lead) continue;
      if (callerId && lead.assignedTo !== callerId) continue;
      seen.add(call.leadId);
      out.push(lead);
    }
    return out;
  }, [all, calls, callerId]);

  // Nobody on the phone is the ordinary state of this page between calls, and
  // the query is disabled then. Neither "Loading..." nor an error belongs there:
  // CallWorkspace's own empty state says what to do next.
  if (wantedIds.length > 0) {
    if (leadsQuery.isPending) return <div className="pk-empty">Loading...</div>;
    if (leadsQuery.isError) {
      return <div className="pk-empty">Could not load the book. Reload to try again.</div>;
    }
  }

  return (
    <CallWorkspace
      leads={queue}
      hideQueue
      scriptSlot={scriptSlot}
      queueTitle="On the phone"
      emptyTitle="No calls waiting"
      emptyHint="Dial from GoHighLevel and the call appears here within a few seconds."
    />
  );
}
