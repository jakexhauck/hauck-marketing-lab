import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { useSalesCallsQuery, useRecordSalesCallOutcome } from "../../../hooks/useSalesCalls";
import { groupFor, totalsFor } from "../../../../functions/lib/salesCalls";
import { Funnel, MeetingRow } from "./meetingUi";

// Sales > Sales Calls.
//
// Cold Call ends at Booked, and Cold Call > Booked shows a caller the meetings
// they set. This is the other end of the same record and it is Jake's page:
// every meeting on the sales calendars, whoever booked it, and whether or not
// this app was involved in booking it.
//
// Two things happen here that do not happen on the caller's page:
//
//   1. The calendars are READ on load, so a meeting booked on a phone, by a
//      workflow, or moved to next Tuesday inside GoHighLevel is on this page
//      without anybody re-typing it.
//   2. Recording an outcome MOVES THE CARD on the agency Sales Pipeline. That
//      board used to hold zero opportunities while the app quietly knew about
//      every meeting; every outcome here now lands on it.
//
// The order is the order of work, not the order of the calendar. Meetings whose
// slot has passed with nothing recorded lead the page, because they are the
// only rows that are a job. Everything else is a record, and records go
// underneath.
export default function SalesCallsSection() {
  const query = useSalesCallsQuery();
  const record = useRecordSalesCallOutcome();

  const data = query.data;
  const meetings = useMemo(() => data?.meetings ?? [], [data]);

  const { awaiting, upcoming, recorded, totals } = useMemo(() => {
    const now = Date.now();
    const countable = meetings.map((m) => ({
      scheduledAt: m.scheduledAt,
      outcome: m.outcome,
      cashCollected: m.cashCollected,
    }));
    const bucket = (name: string) =>
      meetings.filter((_m, i) => groupFor(countable[i], now) === name);
    return {
      awaiting: bucket("awaiting"),
      // The list arrives newest first, which for meetings still to come means
      // furthest away first. Reversed, so the next one is at the top.
      upcoming: bucket("upcoming").slice().reverse(),
      recorded: bucket("recorded"),
      totals: totalsFor(countable),
    };
  }, [meetings]);

  if (query.isLoading) return <div className="pk-empty">Reading the calendar...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load the sales calls. Reload to try again.</div>;
  }

  return (
    <div>
      <StatusLine
        configured={data?.configured ?? false}
        sync={data?.sync ?? null}
        pipeline={data?.pipeline ?? null}
        refreshing={query.isFetching}
        onRefresh={() => void query.refetch()}
      />

      {meetings.length === 0 ? (
        <div className="pk-empty">
          No sales calls yet. They land here the moment one is booked, whether it
          was booked from a cold call or straight into the calendar.
        </div>
      ) : (
        <>
          <Funnel totals={totals} awaiting={awaiting.length} />

          {awaiting.length > 0 && (
            <>
              <div className="pk-list-sec-h">Needs an answer ({awaiting.length})</div>
              <div className="pk-list">
                {awaiting.map((m) => (
                  <MeetingRow key={m.id} meeting={m} recordable record={record} showProvenance />
                ))}
              </div>
            </>
          )}

          {upcoming.length > 0 && (
            <>
              <div className="pk-list-sec-h">Coming up</div>
              <div className="pk-list">
                {upcoming.map((m) => (
                  <MeetingRow key={m.id} meeting={m} record={record} showProvenance />
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
function StatusLine({
  configured,
  sync,
  pipeline,
  refreshing,
  onRefresh,
}: {
  configured: boolean;
  sync: NonNullable<ReturnType<typeof useSalesCallsQuery>["data"]>["sync"];
  pipeline: { id: string; name: string; missing: string[] } | null;
  refreshing: boolean;
  onRefresh: () => void;
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

  if (sync && sync.ok && sync.failedCalendarIds.length > 0) {
    warnings.push(
      `${sync.failedCalendarIds.length} calendar could not be read, so meetings may be missing.`,
    );
  }

  if (configured && !pipeline) {
    warnings.push(
      "No Sales Pipeline found in GoHighLevel, so recording an outcome will not move a card.",
    );
  } else if (pipeline && pipeline.missing.length > 0) {
    warnings.push(
      `The Sales Pipeline has no ${pipeline.missing.join(" or ")} stage, so those outcomes will not move a card.`,
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

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        className="pk-btn-cancel inline-flex items-center gap-1.5"
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw size={13} aria-hidden className={refreshing ? "animate-spin" : undefined} />
        {refreshing ? "Reading the calendar..." : "Read the calendar"}
      </button>

      {changed && <span className="text-[12px] text-muted">{changed} from the calendar.</span>}

      {pipeline && warnings.length === 0 && (
        <span className="text-[12px] text-faint">
          Outcomes route to {pipeline.name}.
        </span>
      )}

      {warnings.map((w) => (
        <span key={w} className="text-[12px] font-semibold text-[var(--warning)]">
          {w}
        </span>
      ))}
    </div>
  );
}
