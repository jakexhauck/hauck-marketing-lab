import { useState } from "react";
import { useAdminAdTrackerQuery } from "../../../../hooks/useApi";
import type {
  AdTrackerBreakdownRow,
  AdTrackerLevel,
  AdTrackerRange,
} from "../../../../lib/api";

// Paid Ads > Ad Tracking. The rebuilt tracker, ported from the Local Ads School
// client sheet's Dashboard tab (docs/build-plans/ad-tracker-rebuild.md).
//
// Nothing on this page is typed. Spend comes from the nightly Meta snapshot,
// lead progress from GHL stage names, revenue from the app's own close-out
// ledger. Every ratio arrives computed from the server.
//
// Replaces AdTrackingPanel.tsx, which was 13 hand-typed numbers per day.

const RANGES: { id: AdTrackerRange; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "7", label: "7 Days" },
  { id: "30", label: "30 Days" },
  { id: "90", label: "90 Days" },
];

const LEVELS: { id: AdTrackerLevel; label: string }[] = [
  { id: "campaign", label: "Campaign" },
  { id: "adset", label: "Ad Set" },
  { id: "ad", label: "Ad" },
];

// A null ratio means the denominator was zero. Render "-", never 0: claiming a
// measured zero we never measured is how a dashboard starts lying.
function pct(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function money2(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function roas(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}x`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="adt-kpi">
      <span className="adt-kpi-label">{label}</span>
      <span className="adt-kpi-value">{value}</span>
      {hint ? <span className="adt-kpi-hint">{hint}</span> : null}
    </div>
  );
}

export default function AdTrackerPanel({ tenantId }: { tenantId: string }) {
  const [range, setRange] = useState<AdTrackerRange>("all");
  const [level, setLevel] = useState<AdTrackerLevel>("ad");

  const query = useAdminAdTrackerQuery(tenantId, range, level);

  if (query.isLoading && !query.data) {
    return <div className="pk-empty">Loading ad tracking...</div>;
  }
  if (query.isError) {
    return <div className="pk-empty">Could not load this client's ad tracking.</div>;
  }

  const data = query.data!;
  const { kpis } = data;
  const rows: AdTrackerBreakdownRow[] = data.breakdown;

  return (
    <div className="adt-wrap">
      <AdTrackerStyle />

      <header className="adt-head">
        <div>
          <h3 className="adt-title">Performance</h3>
          <p className="adt-sub">
            Headline results plus campaign, ad set and ad breakdown. Spend from Meta;
            bookings and revenue matched to ads via the lead's first-touch attribution.
          </p>
        </div>
        <div className="adt-seg" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.id === range ? "adt-seg-on" : ""}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <section className="adt-kpis">
        <Kpi label="Leads" value={String(kpis.leads)} />
        <Kpi label="Pickups" value={String(kpis.pickups)} hint={pct(kpis.pickupRate)} />
        <Kpi label="Bookings" value={String(kpis.bookings)} hint={pct(kpis.bookingRate)} />
        <Kpi label="Sales" value={String(kpis.sales)} hint={pct(kpis.salesPct)} />
        <Kpi label="Close Rate" value={pct(kpis.closeRate)} />
        <Kpi label="Revenue" value={money(kpis.revenue)} />
        <Kpi label="Ad Spend" value={money(kpis.spend)} />
        <Kpi label="ROAS" value={roas(kpis.roas)} />
      </section>

      <header className="adt-head adt-head-sub">
        <div>
          <h3 className="adt-title">Breakdown</h3>
          <p className="adt-sub">
            {data.unattributed > 0
              ? `${data.unattributed} lead${data.unattributed === 1 ? "" : "s"} in this range carried no ad, so ${data.unattributed === 1 ? "it is" : "they are"} counted above but not below.`
              : "Every lead in this range is attributed to an ad."}
          </p>
        </div>
        <div className="adt-seg" role="group" aria-label="Breakdown level">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={l.id === level ? "adt-seg-on" : ""}
              onClick={() => setLevel(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="pk-empty">
          {data.meta.neverSynced
            ? "No Meta spend has been pulled in yet."
            : "No ad spend in this range."}
        </div>
      ) : (
        <div className="adt-scroll">
          <table className="adt-table">
            <thead>
              <tr>
                <th className="adt-name">{LEVELS.find((l) => l.id === level)!.label}</th>
                <th>Spend</th>
                <th>Leads</th>
                <th>Bookings</th>
                <th>Sales</th>
                <th>Revenue</th>
                <th>ROAS</th>
                <th>Cost / Lead</th>
                <th>Cost / Booking</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="adt-name" title={row.id}>
                    {row.name || row.id}
                  </td>
                  <td>{money2(row.spend)}</td>
                  <td>{row.leads}</td>
                  <td>{row.bookings}</td>
                  <td>{row.sales}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{roas(row.roas)}</td>
                  <td>{money2(row.costPerLead)}</td>
                  <td>{money2(row.costPerBooking)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Scoped to .adt-wrap so it cannot leak into the other cockpit panels, matching
// how DailyTracker scopes its own styles.
function AdTrackerStyle() {
  return (
    <style>{`
.adt-wrap { display: flex; flex-direction: column; gap: 18px; }
.adt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.adt-head-sub { margin-top: 6px; }
.adt-title { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.adt-sub { margin: 4px 0 0; font-size: 12px; line-height: 1.5; opacity: 0.65; max-width: 62ch; }

.adt-seg { display: inline-flex; border: 1px solid var(--pk-line, rgba(148,163,184,0.28)); border-radius: 9px; overflow: hidden; flex-shrink: 0; }
.adt-seg button { appearance: none; background: transparent; border: 0; padding: 6px 13px; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; color: inherit; opacity: 0.6; }
.adt-seg button + button { border-left: 1px solid var(--pk-line, rgba(148,163,184,0.28)); }
.adt-seg button:hover { opacity: 0.9; }
.adt-seg .adt-seg-on { background: var(--pk-accent-soft, rgba(99,102,241,0.14)); opacity: 1; font-weight: 600; }

.adt-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 10px; }
.adt-kpi { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 1px solid var(--pk-line, rgba(148,163,184,0.22)); border-radius: 11px; background: var(--pk-surface, rgba(148,163,184,0.05)); }
.adt-kpi-label { font-size: 11px; font-weight: 500; opacity: 0.6; letter-spacing: 0.01em; }
.adt-kpi-value { font-size: 21px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; }
.adt-kpi-hint { font-size: 11px; opacity: 0.55; }

.adt-scroll { overflow-x: auto; border: 1px solid var(--pk-line, rgba(148,163,184,0.22)); border-radius: 11px; }
.adt-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 880px; }
.adt-table th, .adt-table td { padding: 9px 12px; text-align: right; white-space: nowrap; }
.adt-table th { font-weight: 600; font-size: 11px; letter-spacing: 0.02em; opacity: 0.7; border-bottom: 1px solid var(--pk-line, rgba(148,163,184,0.22)); }
.adt-table tbody tr + tr td { border-top: 1px solid var(--pk-line, rgba(148,163,184,0.14)); }
.adt-table tbody tr:hover td { background: var(--pk-surface, rgba(148,163,184,0.06)); }
.adt-table .adt-name { text-align: left; max-width: 300px; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
`}</style>
  );
}
