import { SALES_NO_REASONS, type SalesNoReason } from "../../../../functions/lib/salesCalls";
import type { OfferSplitRow, SourceSplitRow } from "../../../../functions/lib/salesCalls";
import { formatMoney } from "../../../lib/salesTracker";
import { formatPct } from "../../../lib/trackerMonth";

// The three questions the Sales Data grid could not answer, under the grid.
//
// All three are counted per MEETING rather than per day, which is why the
// endpoint sends them whole instead of the client summing the day rows: a rate
// summed from daily rates is not the month's rate.

// WHERE THE MEETINGS CAME FROM.
//
// Every page in the pillar could say "13 booked, 3 closed". None of them could
// say that 10 of those came off the phones and closed 1, while 3 came in on their
// own and closed 2. That difference is the one that decides where the next hour
// goes, and it was sitting unread in a column the row already displayed as a
// chip.
export function SourceSplit({ sources }: { sources: SourceSplitRow[] }) {
  // Nothing to compare means nothing to say. One source is the whole month, and
  // a table with a single row would be a heading over a number the funnel above
  // already gave.
  if (sources.length < 2) return null;

  return (
    <section className="mt-5">
      <div className="pk-list-sec-h">Where the meetings came from</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="py-1.5 pr-3 font-semibold">Source</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Booked</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Showed</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Show %</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Closed</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Close %</th>
              <th className="py-1.5 pr-3 text-right font-semibold">New MRR</th>
              <th className="py-1.5 text-right font-semibold">Cash</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((row) => (
              <tr key={row.source} className="border-t border-border">
                <td className="py-2 pr-3 font-semibold">{row.source}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.booked}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.showed}</td>
                {/* "-" rather than 0% wherever nothing has been recorded yet: a
                    source whose meetings are all still to come has no rate, and
                    printing zero would read as a source that never turns up. */}
                <td className="py-2 pr-3 text-right tabular-nums text-muted">
                  {formatPct(row.showRate)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.closed}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted">
                  {formatPct(row.closeRate)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.mrr ? formatMoney(row.mrr) : ""}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.cash ? formatMoney(row.cash) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// WHICH OFFER CLOSES.
//
// The reason the offer is asked for on every outcome and not only on the wins.
// Every other split on this page counts meetings by where they came from, which
// answers where the next hour goes; this one answers what to put on the table
// when you get there, and whether the setup fee is worth what it costs in
// deals.
//
// Shown from ONE row, unlike the source table. A single source is the whole
// month restated, but a single offer is a real finding: it says Jake has been
// pitching one thing, and the close rate on it is the number he came for.
export function OfferSplit({ offers }: { offers: OfferSplitRow[] }) {
  if (offers.length === 0) return null;

  const pitched = offers.reduce((sum, row) => sum + row.pitched, 0);

  return (
    <section className="mt-5">
      <div className="pk-list-sec-h">Which offer closes ({pitched} pitched)</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="py-1.5 pr-3 font-semibold">Offer</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Pitched</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Closed</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Close %</th>
              <th className="py-1.5 pr-3 text-right font-semibold">New MRR</th>
              <th className="py-1.5 text-right font-semibold">Cash</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((row) => (
              <tr key={row.variant} className="border-t border-border">
                <td className="py-2 pr-3">
                  {/* The family in bold and the shape under it. One line would
                      either lose which variant it was or run to sixty
                      characters, and the variant is the entire point. */}
                  <div className="font-semibold">{row.family}</div>
                  <div className="text-[11.5px] leading-snug text-faint">{row.label}</div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.pitched}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.closed}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted">
                  {formatPct(row.closeRate)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.mrr ? formatMoney(row.mrr) : ""}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.cash ? formatMoney(row.cash) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// WHY THEY SAID NO.
//
// The reason has been asked for on every no since the record panel started
// asking, and this is the only place it is added up. Deliberately the same shape
// as Cold Call's objection counts, because it answers the same question one step
// further down the funnel: that panel says what stops a call, this says what
// stops a sale.
export function NoReasons({ reasons }: { reasons: Record<string, number> }) {
  const rows = Object.entries(reasons)
    // Unknown keys are dropped rather than shown raw: a reason retired from the
    // list should stop being counted, not appear as a slug nobody recognises.
    .filter(([key, n]) => n > 0 && key in SALES_NO_REASONS)
    .sort((a, b) => b[1] - a[1]);

  if (rows.length === 0) return null;

  const total = rows.reduce((sum, [, n]) => sum + n, 0);
  const most = rows[0][1];

  return (
    <section className="mt-5">
      <div className="pk-list-sec-h">
        Why they said no ({total})
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map(([key, n]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-[190px] shrink-0 text-[13px]">
              {SALES_NO_REASONS[key as SalesNoReason].label}
            </span>
            {/* A bar against the most common reason, so the shape of the month is
                readable without doing arithmetic on eight numbers. */}
            <span className="h-2 min-w-[2px] flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-[var(--danger)]"
                style={{ width: `${Math.round((n / most) * 100)}%`, opacity: 0.55 }}
              />
            </span>
            <span className="font-data w-[28px] shrink-0 text-right text-[13px] font-semibold tabular-nums">
              {n}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
