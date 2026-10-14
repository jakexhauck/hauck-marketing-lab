import { useMemo, useState } from "react";
import { pct, toInt } from "../../../lib/trackerMonth";
import {
  SHEET_START,
  monthsBetween,
  sheetDailyEnd,
  sheetDays,
  sheetPct,
} from "../../../lib/coldSmsSheet";
import {
  useColdSmsDailyRange,
  useColdSmsDailyUpsert,
  type ColdSmsDailyField,
} from "../../../hooks/useColdSms";

// Cold SMS > Daily: columns A to I of the sheet's SMS Tracking tab. One row
// per day from 10/1/26, straight through month ends, with no totals row
// because the sheet has none.

type Cells = Record<ColdSmsDailyField, string>;

const EMPTY: Cells = { smsSent: "", positiveReplies: "", meetingsBooked: "", note: "" };

function localTodayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// null stays "" so a blank cell round-trips as blank, never as a made-up 0.
function cell(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export default function SmsDailySheet() {
  const [todayIso] = useState(localTodayIso);
  const days = useMemo(() => sheetDays(SHEET_START, sheetDailyEnd(todayIso)), [todayIso]);
  const months = useMemo(
    () => monthsBetween(days[0].iso, days[days.length - 1].iso),
    [days],
  );

  const daily = useColdSmsDailyRange(months);
  const upsert = useColdSmsDailyUpsert();
  // Exactly what was typed, keyed by ISO day, so a half-typed number is never
  // round-tripped through a parse while the cursor is still in the cell.
  const [drafts, setDrafts] = useState<Record<string, Partial<Cells>>>({});

  const saved = useMemo(() => {
    const byDay: Record<string, Cells> = {};
    for (const row of daily.rows) {
      byDay[row.day] = {
        smsSent: cell(row.smsSent),
        positiveReplies: cell(row.positiveReplies),
        meetingsBooked: cell(row.meetingsBooked),
        note: row.note ?? "",
      };
    }
    return byDay;
  }, [daily.rows]);

  const rowFor = (iso: string): Cells => ({ ...EMPTY, ...saved[iso], ...drafts[iso] });

  const edit = (iso: string, month: string, field: ColdSmsDailyField, value: string) => {
    setDrafts((prev) => ({ ...prev, [iso]: { ...prev[iso], [field]: value } }));
    upsert.mutate({ month, day: iso, field, value });
  };

  const input = (iso: string, month: string, field: ColdSmsDailyField, value: string) => (
    <input
      type="text"
      inputMode={field === "note" ? "text" : "numeric"}
      value={value}
      aria-label={`${field} ${iso}`}
      onChange={(e) => edit(iso, month, field, e.target.value)}
    />
  );

  return (
    <div className="sms-sheet">
      <table>
        <colgroup>
          {[114, 100, 100, 129, 100, 100, 100, 100, 176].map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="g" />
            <th className="g">Date</th>
            <th className="g dk">Initial SMS Sent</th>
            <th className="g dk">Positive Replies</th>
            <th className="g dk">Positive Reply Rate</th>
            <th className="g dk">Meetings Booked</th>
            <th className="g dk">Replies to Booking %</th>
            <th className="g dk">Booking To Sent %</th>
            <th className="g">Notes</th>
          </tr>
        </thead>
        <tbody>
          {daily.isError && (
            <tr>
              <td className="g empty" colSpan={9}>
                Could not load the daily numbers.
              </td>
            </tr>
          )}
          {days.map((d) => {
            const r = rowFor(d.iso);
            const sent = toInt(r.smsSent);
            const replies = toInt(r.positiveReplies);
            const booked = toInt(r.meetingsBooked);
            return (
              <tr key={d.iso}>
                <td className="g dow">{d.dow}</td>
                <td className="g r">{d.label}</td>
                <td className="g r">{input(d.iso, d.month, "smsSent", r.smsSent)}</td>
                <td className="g r">{input(d.iso, d.month, "positiveReplies", r.positiveReplies)}</td>
                <td className="g r yel">{sheetPct(pct(replies, sent))}</td>
                <td className="g r">{input(d.iso, d.month, "meetingsBooked", r.meetingsBooked)}</td>
                <td className="g r yel">{sheetPct(pct(booked, replies))}</td>
                <td className="g c yel">{sheetPct(pct(booked, sent))}</td>
                <td className="g">{input(d.iso, d.month, "note", r.note)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
