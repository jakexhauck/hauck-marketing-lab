import { useMemo } from "react";
import { useSalesMeetingsQuery, useRecordMeetingOutcome } from "../../../hooks/useColdCall";
import { daysLate, groupFor, totalsFor } from "../../../../functions/lib/salesCalls";
import { Funnel, MeetingRow } from "../sales/meetingUi";

// Cold Call > Booked: the meetings he set, and what became of them.
//
// This page used to end at "Already happened", which meant the app knew a
// meeting had been booked and never knew whether anybody turned up. A booking is
// not the result; it is the second-to-last step, and the step after it is the
// only one that says whether the dialing was worth doing.
//
// So the page is ordered by what is WORK rather than by what is chronological.
// Meetings whose slot has passed with nothing recorded come first, because they
// are the only rows anybody has to do something about. Upcoming and finished
// meetings are records, and records go underneath.
//
// The buttons, the funnel and the counting all come from elsewhere on purpose:
// the rules from functions/lib/salesCalls.ts, the surface from
// components/admin/sales/meetingUi.tsx, which Sales > Sales Calls also draws.
// This is the CALLER's end of that record, scoped to one person's prospects;
// Sales Calls is Jake's, showing every meeting on the calendar. Two ends of one
// table, and neither may own a private copy of what a show rate is.
function Warning({ text }: { text: string }) {
  return <div className="mb-3 text-[12px] font-semibold text-[var(--warning)]">{text}</div>;
}

export default function ColdCallBooked({ callerId = "" }: { callerId?: string }) {
  const query = useSalesMeetingsQuery(callerId);
  const record = useRecordMeetingOutcome();
  const meetings = useMemo(() => query.data?.meetings ?? [], [query.data]);

  // The page reads the calendars itself now, so a meeting booked inside
  // GoHighLevel lands here on its own. Said out loud only when that read went
  // wrong: an empty week and an unread calendar look identical, and one of them
  // is a prospect nobody is expecting.
  const sync = query.data?.sync ?? null;
  const syncWarning = !sync
    ? ""
    : sync.ok === false
      ? `The calendar could not be read: ${sync.error}`
      : sync.calendarsRead === 0
        ? "No sales calendar was found in GoHighLevel, so nothing here is being read from it."
        : sync.failedCalendarIds.length > 0
          ? `${sync.failedCalendarIds.length} calendar could not be read, so meetings may be missing.`
          : "";

  const { dueBack, awaiting, upcoming, recorded, totals } = useMemo(() => {
    const now = Date.now();
    const countable = meetings.map((m) => ({
      scheduledAt: m.scheduledAt,
      outcome: m.outcome,
      cashCollected: m.cashCollected,
      followUpAt: m.followUpAt,
    }));
    const bucket = (name: string) =>
      meetings.filter((_m, i) => groupFor(countable[i], now) === name);
    return {
      // Most overdue first. A caller sees their own promises here, same as Jake
      // sees his on Sales Calls.
      dueBack: bucket("due_back")
        .slice()
        .sort((a, b) => (daysLate(b.followUpAt, now) ?? 0) - (daysLate(a.followUpAt, now) ?? 0)),
      awaiting: bucket("awaiting"),
      // The list arrives newest first, which for meetings still to come means
      // furthest away first. Reversed, so the next one is at the top.
      upcoming: bucket("upcoming").slice().reverse(),
      recorded: bucket("recorded"),
      totals: totalsFor(countable),
    };
  }, [meetings]);

  if (query.isLoading) return <div className="pk-empty">Loading meetings...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load meetings. Reload to try again.</div>;
  }
  if (meetings.length === 0) {
    return (
      <div>
        {syncWarning && <Warning text={syncWarning} />}
        <div className="pk-empty">
          No meetings booked yet. They land here when a call ends in &quot;Booked&quot;.
        </div>
      </div>
    );
  }

  return (
    <div>
      {syncWarning && <Warning text={syncWarning} />}
      {/* The strip counts what is OVERDUE an answer, not everything undecided.
          A meeting three days out is undecided too, and calling it "still to
          record" would be nagging somebody about the future. */}
      <Funnel totals={totals} awaiting={awaiting.length} />

      {/* A promise to come back, on the day it was promised for. Above the
          undecided meetings: somebody was told a date. */}
      {dueBack.length > 0 && (
        <>
          <div className="pk-list-sec-h">Due back ({dueBack.length})</div>
          <div className="pk-list">
            {dueBack.map((m) => (
              <MeetingRow key={m.id} meeting={m} recordable record={record} />
            ))}
          </div>
        </>
      )}

      {awaiting.length > 0 && (
        <>
          <div className="pk-list-sec-h">Needs an answer ({awaiting.length})</div>
          <div className="pk-list">
            {awaiting.map((m) => (
              <MeetingRow key={m.id} meeting={m} recordable record={record} />
            ))}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="pk-list-sec-h">Coming up</div>
          <div className="pk-list">
            {upcoming.map((m) => (
              <MeetingRow key={m.id} meeting={m} record={record} />
            ))}
          </div>
        </>
      )}

      {/* Answered, and therefore read-only here: the outcome shows as text with
          no buttons under it. This list is the caller's record of what became of
          their bookings, not a place to revise it, and a row of live buttons
          under a settled answer invites a stray click that moves a card on the
          agency pipeline. A recorded answer that genuinely needs correcting is
          corrected on Sales > Sales Calls.

          "Due back" above deliberately keeps its buttons. A follow-up that has
          come due is unfinished work, and locking it would break the only loop
          this page exists to close. */}
      {recorded.length > 0 && (
        <>
          <div className="pk-list-sec-h">Recorded</div>
          <div className="pk-list">
            {recorded.map((m) => (
              <MeetingRow key={m.id} meeting={m} record={record} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
