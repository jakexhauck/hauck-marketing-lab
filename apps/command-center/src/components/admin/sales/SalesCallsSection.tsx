import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarRange } from "lucide-react";
import { useSalesCallsQuery, useRecordSalesCallOutcome } from "../../../hooks/useSalesCalls";
import { daysLate, groupFor, totalsFor } from "../../../../functions/lib/salesCalls";
import type { SalesMeeting } from "../../../lib/api";
import { Funnel, MeetingRow } from "./meetingUi";
import CallModal from "./CallModal";

// Sales > Sales Calls.
//
// Cold Call ends at Booked, and Cold Call > Booked shows a caller the meetings
// they set. This is the other end of the same record and it is Jake's page:
// every meeting on the sales calendars, whoever booked it, and whether or not
// this app was involved in booking it.
//
// Two things happen here that do not happen on the caller's page:
//
//   1. The calendars are READ on load, on focus and on a timer, so a meeting
//      booked on a phone, by a workflow, or moved to next Tuesday inside
//      GoHighLevel is on this page without anybody re-typing it or asking for
//      it.
//   2. Recording an outcome TAGS THE CONTACT in GoHighLevel, and Jake's own
//      workflow moves the card on the Sales board from there. The app writes no
//      stage: same arrangement as the Setter Suite and Cold Call, and the
//      reason is in docs/build-plans/sales-call-tags.md.
//
// The order is the order of work, not the order of the calendar. Meetings whose
// slot has passed with nothing recorded lead the page, because they are the
// only rows that are a job. Everything else is a record, and records go
// underneath.
export default function SalesCallsSection() {
  const query = useSalesCallsQuery();
  const record = useRecordSalesCallOutcome();
  const [params, setParams] = useSearchParams();

  // Which call is open, in the URL rather than in a useState.
  //
  // It costs nothing and buys three things: a refresh mid-call comes back into
  // the call, browser Back closes the panel instead of leaving the page, and a
  // link still opens the right one. It is also what the old On Call tab used,
  // so every link anybody saved to a call still lands on that call, now as a
  // panel over this list.
  const openId = params.get("meeting") ?? "";

  const open = (meeting: SalesMeeting) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("meeting", meeting.id);
      // The tab this used to point at is gone. Dropped rather than left to rot,
      // so an old link does not carry a dead tab id back into the address bar.
      next.delete("tab");
      return next;
    });
  };

  // Replaced, not pushed: closing a call is undoing the open, and a Back button
  // that walked through every call you looked at would be a worse way out than
  // the one on the panel.
  const close = () => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("meeting");
        return next;
      },
      { replace: true },
    );
  };

  const data = query.data;
  const allMeetings = useMemo(() => data?.meetings ?? [], [data]);

  // Which calendar's meetings to show. "" is all of them.
  const [calendarId, setCalendarId] = useState("");

  // The calendars that actually appear in the data, rather than every calendar
  // on the account: a picker offering one the app never reads would filter to a
  // permanently empty page and look broken.
  //
  // Keyed by id and labelled by name, so a renamed calendar keeps its meetings
  // and a deleted one still has a label (both are stored per meeting, 0066).
  const calendars = useMemo(() => {
    const byId = new Map<string, string>();
    for (const m of allMeetings) {
      if (!m.calendarId) continue;
      // Last name wins: the sync rewrites it every pass, so the freshest one on
      // the page is the current one.
      byId.set(m.calendarId, m.calendarName || m.calendarId);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allMeetings]);

  // Meetings with no calendar recorded are only hidden once a specific calendar
  // is chosen. Under "All calendars" they stay visible: a row from before 0066
  // is still a real meeting, and silently dropping it would make the funnel
  // disagree with itself for no reason a reader could see.
  const meetings = useMemo(
    () => (calendarId ? allMeetings.filter((m) => m.calendarId === calendarId) : allMeetings),
    [allMeetings, calendarId],
  );

  const { dueBack, awaiting, upcoming, recorded, totals } = useMemo(() => {
    const now = Date.now();
    const countable = meetings.map((m) => ({
      scheduledAt: m.scheduledAt,
      outcome: m.outcome,
      cashCollected: m.cashCollected,
      followUpAt: m.followUpAt,
      // Carried so the funnel can total New MRR beside the cash. Already parsed
      // by the endpoint, so it arrives as a deal or null.
      deal: m.deal,
    }));
    const bucket = (name: string) =>
      meetings.filter((_m, i) => groupFor(countable[i], now) === name);
    return {
      // Most overdue first: the promise that has been broken longest is the one
      // to make good on first.
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

  // The call the panel is showing, if the id in the URL still names one worth
  // opening.
  //
  // Read from ALL the meetings rather than the filtered ones, so changing the
  // calendar picker mid-call does not shut the call. And read against the same
  // groupFor the list below is grouped by, so "which calls open" and "which
  // calls are still work" can never be two different answers: everything except
  // the Recorded block opens, including a due-back, which carries a follow_up
  // outcome and is very much still a call to make.
  const openMeeting = useMemo(() => {
    if (!openId) return null;
    const m = allMeetings.find((x) => x.id === openId);
    if (!m) return null;
    const group = groupFor(
      {
        scheduledAt: m.scheduledAt,
        outcome: m.outcome,
        cashCollected: m.cashCollected,
        followUpAt: m.followUpAt,
        deal: m.deal,
      },
      Date.now(),
    );
    return group === "recorded" ? null : m;
  }, [allMeetings, openId]);

  if (query.isLoading) return <div className="pk-empty">Reading the calendar...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load the sales calls. Reload to try again.</div>;
  }

  return (
    <div>
      {/* The call, over the top of the list. Mounted last but painted over
          everything: it portals to <body>, so where it sits in this tree is
          only about which state it reads. */}
      {openMeeting && <CallModal meeting={openMeeting} onClose={close} />}

      <StatusLine
        configured={data?.configured ?? false}
        sync={data?.sync ?? null}
        pipeline={data?.pipeline ?? null}
        calendars={calendars}
        calendarId={calendarId}
        onCalendarChange={setCalendarId}
      />

      {meetings.length === 0 ? (
        <div className="pk-empty">
          {calendarId
            ? "No meetings on that calendar in this window."
            : "No sales calls yet. They land here the moment one is booked, whether it was booked from a cold call or straight into the calendar."}
        </div>
      ) : (
        <>
          <Funnel totals={totals} awaiting={awaiting.length} />

          {/* Promises to come back, and the day has arrived. Above "needs an
              answer" because this one has a person on the other end who was
              told a date. */}
          {dueBack.length > 0 && (
            <>
              <div className="pk-list-sec-h">Due back ({dueBack.length})</div>
              <div className="pk-list">
                {dueBack.map((m) => (
                  <MeetingRow
                    key={m.id}
                    meeting={m}
                    recordable
                    record={record}
                    showProvenance
                    onOpen={open}
                  />
                ))}
              </div>
            </>
          )}

          {awaiting.length > 0 && (
            <>
              <div className="pk-list-sec-h">Needs an answer ({awaiting.length})</div>
              <div className="pk-list">
                {awaiting.map((m) => (
                  <MeetingRow
                    key={m.id}
                    meeting={m}
                    recordable
                    record={record}
                    showProvenance
                    onOpen={open}
                  />
                ))}
              </div>
            </>
          )}

          {upcoming.length > 0 && (
            <>
              <div className="pk-list-sec-h">Coming up</div>
              <div className="pk-list">
                {upcoming.map((m) => (
                  <MeetingRow
                    key={m.id}
                    meeting={m}
                    record={record}
                    showProvenance
                    onOpen={open}
                  />
                ))}
              </div>
            </>
          )}

          {recorded.length > 0 && (
            <>
              <div className="pk-list-sec-h">Recorded</div>
              <div className="pk-list">
                {recorded.map((m) => (
                  <MeetingRow key={m.id} meeting={m} recordable record={record} showProvenance />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// What the page just did, and anything about the connection that makes a count
// on it mean less than it looks.
//
// This is not decoration. Every number below it is only as true as the last
// calendar read, and a page that silently fell back to its own database looks
// exactly like a page that is up to date.
//
// There is no read button: the calendars are reconciled on load, again whenever
// the tab is looked at, and on a timer while it is open (useSalesCallsQuery). A
// button there would only pull forward a read the page was already going to do.
function StatusLine({
  configured,
  sync,
  pipeline,
  calendars,
  calendarId,
  onCalendarChange,
}: {
  configured: boolean;
  sync: NonNullable<ReturnType<typeof useSalesCallsQuery>["data"]>["sync"];
  pipeline: { id: string; name: string; missing: string[] } | null;
  calendars: { id: string; name: string }[];
  calendarId: string;
  onCalendarChange: (id: string) => void;
}) {
  const warnings: string[] = [];

  if (!configured) {
    warnings.push(
      "The agency GoHighLevel account is not connected, so nothing here is being read from the calendar.",
    );
  } else if (sync && sync.ok === false) {
    warnings.push(`The calendar could not be read: ${sync.error}`);
  } else if (sync && sync.ok && sync.calendarsRead === 0) {
    warnings.push(
      "No sales calendar was found in GoHighLevel. Name one demo, discovery or sales, or set AGENCY_SALES_CALENDAR_IDS.",
    );
  }

  // Nothing here about meetings with no calendar recorded. It was true, it was
  // amber, and it described a gap the next read of the calendar closes on its
  // own: a note about the data catching up, not about anything being wrong.

  if (sync && sync.ok && sync.failedCalendarIds.length > 0) {
    warnings.push(
      `${sync.failedCalendarIds.length} calendar could not be read, so meetings may be missing.`,
    );
  }

  if (configured && !pipeline) {
    warnings.push(
      'No board named "Sales" was found in GoHighLevel, so there is nothing for your tag workflows to move.',
    );
  } else if (pipeline && pipeline.missing.length > 0) {
    warnings.push(
      `${pipeline.name} has no ${pipeline.missing.join(" or ")} stage, so a workflow has nowhere to move those outcomes to.`,
    );
  }

  // What the read actually did, in a sentence. Only when something changed:
  // "0 added, 0 updated" is noise on every load of a quiet week.
  const changed =
    sync && sync.ok && (sync.added > 0 || sync.updated > 0)
      ? [
          sync.added > 0 ? `${sync.added} new` : null,
          sync.updated > 0 ? `${sync.updated} updated` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  // Nothing to say, so nothing on the page, not an empty row.
  //
  // Every part of this line is conditional: the picker only appears on a second
  // calendar, the count only when something changed, the warnings only when
  // something is wrong. On a quiet load with one calendar all three are absent,
  // and the div was still drawing its own bottom margin: an inch of nothing
  // between the header and the first call, on the ordinary case.
  //
  // The line explaining that an outcome tags the contact and a workflow moves
  // the card used to fill that gap by always being there. It described the
  // plumbing, it was true on every load, and it was read once. What is left is
  // what CHANGED and what is WRONG: a status line says something new or it says
  // nothing at all.
  if (calendars.length <= 1 && !changed && warnings.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* The calendar picker leads the row: it decides what everything below it
          is about, so it reads before the numbers rather than after them.
          Hidden entirely when the account has only one sales calendar, since a
          filter with a single option is a control that cannot do anything. */}
      {calendars.length > 1 && (
        <label className="inline-flex items-center gap-1.5">
          <CalendarRange size={13} aria-hidden className="text-faint" />
          <span className="sr-only">Calendar</span>
          <select
            className="pk-select !w-auto"
            value={calendarId}
            onChange={(e) => onCalendarChange(e.target.value)}
          >
            <option value="">All calendars</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {changed && <span className="text-[12px] text-muted">{changed} from the calendar.</span>}

      {warnings.map((w) => (
        <span key={w} className="text-[12px] font-semibold text-[var(--warning)]">
          {w}
        </span>
      ))}
    </div>
  );
}
