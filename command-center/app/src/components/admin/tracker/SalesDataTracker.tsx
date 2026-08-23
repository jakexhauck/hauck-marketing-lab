import { useState } from "react";
import { TrackerMonthNav } from "./DailyTracker";
import SalesSheet from "./SalesSheet";
import { PillarTitleActions } from "../../pillars/PillarKit";
import { useSalesDataQuery } from "../../../hooks/useApi";
import type { SalesDataResponse } from "../../../lib/api";
import { monthKey, cursorForToday, type MonthCursor, type TodayRef } from "../../../lib/trackerMonth";

// The Sales pillar's Sales Data tab: the agency's sales calls, month by month.
//
// This page is a CLONE of the sales tracking sheet Jake works from, down to the
// fills. It used to be a day grid, one row per calendar day with the month's
// meetings counted into it, and before that it was a form somebody typed. Both
// are gone: Jake reads his month a call at a time, so the page shows calls.
//
// It is still a REPORT and it still has no editing loop. Opening it reconciles
// the GoHighLevel calendars, every cell is read-only, and the seven columns the
// app has nowhere to read from yet render blank rather than inviting a number
// nobody can check. What that buys is that this page and the Sales Calls funnel
// are the same rows counted the same way, so they cannot drift.

export default function SalesDataTracker() {
  // "Today" is read once on mount and then injected everywhere, so the month
  // math stays deterministic and a tab left open overnight does not quietly
  // disagree with itself mid-render.
  const [today] = useState<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  });
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorForToday(today));

  const { data, isError } = useSalesDataQuery(monthKey(cursor));

  return (
    <div className="sdt">
      {/* The month stepper rides on the page's title line rather than taking a
          band of its own, which is what lets the sheet start at the top. */}
      <PillarTitleActions>
        <TrackerMonthNav cursor={cursor} today={today} onMonthChange={setCursor} />
      </PillarTitleActions>

      {isError && (
        <div className="pk-empty">
          Sales Data could not be loaded. Nothing has been lost: reload to try again.
        </div>
      )}

      <StatusLine data={data ?? null} />

      <SalesSheet calls={data?.calls ?? []} timeZone={data?.timeZone ?? "UTC"} />
    </div>
  );
}

// What the page just did, and anything that makes a count on it mean less than
// it looks. Same job as the Sales Calls status line: a month that silently
// failed to reach the calendar looks exactly like a quiet month.
//
// No read button, same as Sales Calls and the Sales board: the month reconciles
// itself on load, on focus and on a timer (useSalesDataQuery), so nothing here
// is waiting to be asked.
function StatusLine({ data }: { data: SalesDataResponse | null }) {
  const warnings: string[] = [];
  const sync = data?.sync ?? null;

  if (data && !data.configured) {
    warnings.push(
      "The agency GoHighLevel account is not connected, so this month is only what was already stored.",
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
      `${sync.failedCalendarIds.length} calendar could not be read, so meetings may be missing from this month.`,
    );
  }

  // Meetings the calendar gave no time belong to no month, so they appear on no
  // sheet. Said out loud rather than silently dropped: a meeting missing from a
  // month should be visible as a meeting missing from a month.
  if (data && data.undated > 0) {
    warnings.push(
      `${data.undated} meeting has no time on it, so it is on no month's sheet.`,
    );
  }

  const changed =
    sync && sync.ok && (sync.added > 0 || sync.updated > 0)
      ? [
          sync.added > 0 ? `${sync.added} new` : null,
          sync.updated > 0 ? `${sync.updated} updated` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  // Nothing new and nothing wrong means nothing on the page.
  if (!changed && warnings.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      {changed && <span className="text-[12px] text-muted">{changed} from the calendar.</span>}

      {warnings.map((w) => (
        <span key={w} className="text-[12px] font-semibold text-[var(--warning)]">
          {w}
        </span>
      ))}
    </div>
  );
}
