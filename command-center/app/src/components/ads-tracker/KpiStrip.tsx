// The headline KPI strip from the sheet's Dashboard: the full funnel plus the
// money line, as a row of labelled tiles. Figures are mono tabular so columns
// of numbers line up. Driven by a computed Funnel; no data fetching here.

import type { Funnel } from "../../lib/adsTracker";
import { gbp, pct, roasX, intNum } from "./format";

interface Tile {
  label: string;
  value: string;
  accent?: "revenue" | "roas";
}

export default function KpiStrip({ funnel }: { funnel: Funnel }) {
  const tiles: Tile[] = [
    { label: "Leads", value: intNum(funnel.leads) },
    { label: "Pickups", value: intNum(funnel.pickups) },
    { label: "Pickup Rate", value: pct(funnel.pickupRate) },
    { label: "Bookings", value: intNum(funnel.bookings) },
    { label: "Booking Rate", value: pct(funnel.bookingRate) },
    { label: "Sales", value: intNum(funnel.sales) },
    { label: "Sales % (of leads)", value: pct(funnel.salesPctOfLeads) },
    { label: "Close Rate (of bookings)", value: pct(funnel.closeRate) },
    { label: "Revenue", value: gbp(funnel.revenue), accent: "revenue" },
    { label: "Ad Spend", value: gbp(funnel.adSpend) },
    { label: "ROAS", value: roasX(funnel.roas), accent: "roas" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-sm)]"
        >
          <div
            className={
              "font-display text-[22px] font-semibold tabular-nums tracking-[-0.02em] " +
              (t.accent === "revenue"
                ? "text-positive"
                : t.accent === "roas"
                  ? "text-brand-text"
                  : "text-text")
            }
          >
            {t.value}
          </div>
          <div className="mt-1 text-[11.5px] font-medium leading-tight text-muted">
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}
