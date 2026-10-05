import { useRef, useState } from "react";
import { computeScriptRow, type Cells } from "../../../lib/coldSms";
import { sheetPct } from "../../../lib/coldSmsSheet";
import {
  useColdSmsScriptCreate,
  useColdSmsScriptQuery,
  useColdSmsScriptUpdate,
  type ColdSmsScriptField,
} from "../../../hooks/useColdSms";

// Cold SMS > Script: the variation table under the monthly one on the sheet's
// SMS Tracking tab. It lies on its side like the sheet: metrics down the left,
// one column per variation, four of them.
//
// A variation is a row in cold_sms_script, in sort order. The four columns are
// always there to type into; the first edit in an empty one creates its row,
// and every empty column before it, so column N is always the Nth row.

const SLOTS = 4;

type NumField = Exclude<ColdSmsScriptField, "name">;

export default function SmsScriptSheet() {
  const { data, isError } = useColdSmsScriptQuery();
  const create = useColdSmsScriptCreate();
  const update = useColdSmsScriptUpdate();
  // Exactly what was typed, keyed "<slot>:<field>".
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Ids of rows created this session, by slot, so a second keystroke in a new
  // column does not create it twice while the refetch is in flight.
  const created = useRef<Record<number, Promise<string>>>({});

  const rows = data?.rows ?? [];
  const slots = Math.max(SLOTS, rows.length);

  const idFor = (slot: number): Promise<string> => {
    const existing = rows[slot]?.id;
    if (existing) return Promise.resolve(existing);
    if (!created.current[slot]) {
      // Every empty column to the left first, so sort order matches columns.
      const before = slot > rows.length ? idFor(slot - 1) : Promise.resolve("");
      const pending = before.then(() =>
        create.mutateAsync(`Variation ${slot + 1}`).then((r) => r.row.id),
      );
      // A failed create must not stick: the next keystroke tries again.
      pending.catch(() => delete created.current[slot]);
      created.current[slot] = pending;
    }
    return created.current[slot];
  };

  const valueFor = (slot: number, field: ColdSmsScriptField): string => {
    const draft = drafts[`${slot}:${field}`];
    if (draft !== undefined) return draft;
    const row = rows[slot];
    if (!row) return field === "name" ? `Variation ${slot + 1}` : "";
    const v = row[field];
    return v === null || v === undefined ? "" : String(v);
  };

  const edit = (slot: number, field: ColdSmsScriptField, value: string) => {
    setDrafts((prev) => ({ ...prev, [`${slot}:${field}`]: value }));
    // An emptied name is refused by the API; keep the old one until it is typed.
    if (field === "name" && !value.trim()) return;
    void idFor(slot).then((id) => update.mutate({ id, field, value }));
  };

  const cellsFor = (slot: number): Cells => ({
    totalSent: valueFor(slot, "totalSent"),
    positiveReplies: valueFor(slot, "positiveReplies"),
    callsBooked: valueFor(slot, "callsBooked"),
  });

  const slotList = Array.from({ length: slots }, (_, i) => i);

  const inputRow = (label: string, tone: string, field: NumField) => (
    <tr>
      <td className={`bx ${tone}`}>{label}</td>
      {slotList.map((slot) => (
        <td key={slot} className={`bx ${tone}`}>
          <input
            type="text"
            inputMode="numeric"
            value={valueFor(slot, field)}
            aria-label={`${label}, variation ${slot + 1}`}
            onChange={(e) => edit(slot, field, e.target.value)}
          />
        </td>
      ))}
      <td />
    </tr>
  );

  const rateRow = (label: string, pick: (c: ReturnType<typeof computeScriptRow>) => number | null) => (
    <tr>
      <td className="bx syel">{label}</td>
      {slotList.map((slot) => (
        <td key={slot} className="bx syel c">
          {sheetPct(pick(computeScriptRow(cellsFor(slot))))}
        </td>
      ))}
      <td className="b">Don't Edit</td>
    </tr>
  );

  return (
    <div className="sms-sheet">
      <table>
        {/* Narrower than the sheet's 120/133/100 (Jake, 2026-10-05) so the
            box fits beside Daily on his 1920px screen. */}
        <colgroup>
          <col style={{ width: 110 }} />
          {slotList.map((slot) => (
            <col key={slot} style={{ width: 95 }} />
          ))}
          <col style={{ width: 72 }} />
        </colgroup>
        <tbody>
          {isError && (
            <tr>
              <td className="g empty" colSpan={slots + 2}>
                Could not load the script variations.
              </td>
            </tr>
          )}
          <tr>
            <td className="bx">Script</td>
            {slotList.map((slot) => (
              <td key={slot} className="bx b">
                <input
                  type="text"
                  value={valueFor(slot, "name")}
                  aria-label={`Variation ${slot + 1} name`}
                  onChange={(e) => edit(slot, "name", e.target.value)}
                />
              </td>
            ))}
            <td />
          </tr>
          {inputRow("Total Sent", "sblue", "totalSent")}
          {inputRow("Positive Replies", "sblue", "positiveReplies")}
          {rateRow("Positive Reply %", (c) => c.replyPct)}
          {inputRow("Calls Booked", "sgrn", "callsBooked")}
          {rateRow("Booking %", (c) => c.bookingPct)}
          {inputRow("Clients Closed", "sorg", "clientsClosed")}
        </tbody>
      </table>
    </div>
  );
}
