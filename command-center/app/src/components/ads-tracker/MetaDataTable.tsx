// The META DATA tab from the sheet: daily Meta performance pulled per ad. Read
// only ("Don't edit this tab"). Shows the raw spend + reach figures that feed
// the funnel's Ad Spend.

import type { MetaRow } from "../../lib/adsTracker";
import { gbp2, intNum } from "./format";

const TH =
  "border-y border-divider px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.01em] text-faint";
const THR = TH + " text-right";
const TD = "px-4 py-3 text-[13px] text-text";
const TDR = TD + " text-right tabular-nums";

export default function MetaDataTable({ rows }: { rows: MetaRow[] }) {
  return (
    <section className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Date</th>
            <th className={TH}>Day</th>
            <th className={TH}>Ad Name</th>
            <th className={THR}>Spend</th>
            <th className={THR}>Impressions</th>
            <th className={THR}>Reach</th>
            <th className={THR}>Link Clicks</th>
            <th className={THR}>CTR</th>
            <th className={THR}>CPM</th>
            <th className={TH}>Campaign</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-divider last:border-0 hover:bg-surface-2">
              <td className={TD + " tabular-nums text-muted"}>{r.date}</td>
              <td className={TD + " text-muted"}>{r.day}</td>
              <td className={TD + " font-medium"}>{r.adName}</td>
              <td className={TDR}>{gbp2(r.spend)}</td>
              <td className={TDR + " text-muted"}>{intNum(r.impressions)}</td>
              <td className={TDR + " text-muted"}>{intNum(r.reach)}</td>
              <td className={TDR + " text-muted"}>{intNum(r.linkClicks)}</td>
              <td className={TDR + " text-muted"}>{r.ctr.toFixed(2)}%</td>
              <td className={TDR + " text-muted"}>{gbp2(r.cpm)}</td>
              <td className={TD + " text-muted"}>{r.campaignName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
