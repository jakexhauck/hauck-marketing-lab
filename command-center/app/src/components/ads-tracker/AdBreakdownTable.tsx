// The per-ad breakdown from the sheet's Dashboard: one row per ad with spend,
// the funnel counts attributed to it, revenue, ROAS, and the cost efficiency
// figures. Read-only; computed upstream by computeAdBreakdown.

import type { AdBreakdownRow } from "../../lib/adsTracker";
import { gbp, gbp2, roasX, intNum } from "./format";

const TH =
  "border-y border-divider px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.01em] text-faint";
const THR = TH + " text-right";
const TD = "px-4 py-3 text-[13.5px] text-text";
const TDR = TD + " text-right tabular-nums";

export default function AdBreakdownTable({ rows }: { rows: AdBreakdownRow[] }) {
  return (
    <section className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Ad Name</th>
            <th className={THR}>Spend</th>
            <th className={THR}>Leads</th>
            <th className={THR}>Bookings</th>
            <th className={THR}>Sales</th>
            <th className={THR}>Revenue</th>
            <th className={THR}>ROAS</th>
            <th className={THR}>Cost / Lead</th>
            <th className={THR}>Cost / Booking</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.adId} className="border-b border-divider last:border-0 hover:bg-surface-2">
              <td className={TD + " font-medium"}>{r.adName}</td>
              <td className={TDR}>{gbp(r.spend)}</td>
              <td className={TDR}>{intNum(r.leads)}</td>
              <td className={TDR}>{intNum(r.bookings)}</td>
              <td className={TDR}>{intNum(r.sales)}</td>
              <td className={TDR + " font-semibold text-positive"}>{gbp(r.revenue)}</td>
              <td className={TDR + " font-semibold text-brand-text"}>{roasX(r.roas)}</td>
              <td className={TDR + " text-muted"}>{r.leads ? gbp2(r.costPerLead) : "--"}</td>
              <td className={TDR + " text-muted"}>{r.bookings ? gbp2(r.costPerBooking) : "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
