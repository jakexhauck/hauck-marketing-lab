import { useState } from "react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { PAID_ADS_CONTAINER } from "./shared";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { useAuth } from "../../context/AuthContext";
import { useClient } from "../../context/ClientContext";
import { useAdsTrackerQuery } from "../../hooks/useApi";
import type { AdTrackerLevel, AdTrackerRange, AdTrackerBreakdownRow } from "../../lib/api";
import { ErrorNote, LEVELS, RANGES, Spinner, money0, money2, pct, roas } from "./trackerShared";

// Paid Ads > Dashboard. The client tracking sheet's Dashboard tab, rebuilt as
// the sheet: the title block, the RESULTS band with its twelve columns on one
// row, then the BREAKDOWN band with its View by dropdown and per-ad table.
//
// Laid out deliberately like a spreadsheet, on Jake's instruction, because the
// clients already read this workbook every week and recognising it costs them
// nothing. Hence banded section headers, ruled cells, centred figures, real
// dropdowns rather than the app's segmented controls, and the raw Meta ID
// column the sheet carried.
//
// Every figure arrives computed from the server (functions/lib/adTrackerMetrics.ts,
// a verbatim port of the sheet's formulas). Nothing here is typed by anyone:
// spend from the nightly Meta snapshot, lead progress from the GHL pipeline,
// revenue from the app's own close-out ledger. A null ratio prints "-", never a
// fabricated zero, exactly as the sheet did.

const RESULT_COLUMNS = [
  "Leads",
  "Pickups",
  "Pickup Rate",
  "Bookings",
  "Booking Rate",
  "Sales",
  "Sales % (of leads)",
  "Close Rate (of bookings)",
  "Revenue",
  "Ad Spend",
  "ROAS",
];

const BREAKDOWN_COLUMNS = [
  "ID",
  "Spend",
  "Leads",
  "Bookings",
  "Sales",
  "Revenue",
  "ROAS",
  "Cost / Lead",
  "Cost / Booking",
];

// The sheet's section headers: a full-width band in the brand tint with the
// label letter-spaced. They are what makes the page scan as the workbook.
function Band({ children }: { children: string }) {
  return (
    <div className="border border-b-0 border-border bg-brand/10 px-3 py-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-brand">
      {children}
    </div>
  );
}

// A dropdown, because the sheet used data validation rather than buttons.
function Picker<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-[12.5px] font-semibold text-text focus:border-brand focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const TH = "border border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-muted";
const TD = "border border-border px-3 py-2.5 text-[13px] text-text tnum";

export default function AdsDashboard() {
  const { session } = useAuth();
  const { client } = useClient();
  const [range, setRange] = useState<AdTrackerRange>("all");
  const [level, setLevel] = useState<AdTrackerLevel>("ad");

  const query = useAdsTrackerQuery(range, level, Boolean(session));
  const data = query.data;
  const rows: AdTrackerBreakdownRow[] = data?.breakdown ?? [];
  const levelLabel = LEVELS.find((l) => l.id === level)!.label;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar tabs={PAID_ADS_TABS} />

        {query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !data ? (
          <Spinner />
        ) : (
          <>
            {/* Title block: the sheet's two merged rows at the top. */}
            <div className="mb-5 text-center">
              <h1 className="font-display text-[26px] font-extrabold uppercase tracking-[0.04em] text-text">
                {client.name}
              </h1>
              <p className="mt-1 text-[12.5px] text-faint">
                Performance overview: headline results plus campaign, ad set and ad breakdown
              </p>
            </div>

            {/* RESULTS */}
            <Band>Results</Band>
            <div className="mb-6 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-center">
                <thead>
                  <tr>
                    <th className={TH}>Date Range</th>
                    {RESULT_COLUMNS.map((c) => (
                      <th key={c} className={TH}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border px-3 py-2">
                      <Picker
                        options={RANGES}
                        value={range}
                        onChange={setRange}
                        label="Date range"
                      />
                    </td>
                    <td className={TD}>{data!.kpis.leads}</td>
                    <td className={TD}>{data!.kpis.pickups}</td>
                    <td className={TD}>{pct(data!.kpis.pickupRate)}</td>
                    <td className={TD}>{data!.kpis.bookings}</td>
                    <td className={TD}>{pct(data!.kpis.bookingRate)}</td>
                    <td className={TD}>{data!.kpis.sales}</td>
                    <td className={TD}>{pct(data!.kpis.salesPct)}</td>
                    <td className={TD}>{pct(data!.kpis.closeRate)}</td>
                    <td className={TD}>{money0(data!.kpis.revenue)}</td>
                    <td className={TD}>{money0(data!.kpis.spend)}</td>
                    <td className={`${TD} font-semibold`}>{roas(data!.kpis.roas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* BREAKDOWN */}
            <Band>Breakdown</Band>
            <div className="border border-b-0 border-border px-3 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold text-text">View by:</span>
                <Picker options={LEVELS} value={level} onChange={setLevel} label="View by" />
              </div>
              <p className="mt-2 max-w-[80ch] text-[12px] leading-relaxed text-faint">
                Pick a level to see performance per Campaign, Ad Set or Ad. Spend comes from the
                Meta Data tab; bookings and revenue are matched to ads via the lead's own ad
                details. Uses the date range selected above.
              </p>
              {/* Results above is never scoped, so the two will not add up.
                  Saying which campaign this is, out loud, is what stops that
                  reading as a bug. */}
              {data!.meta.liveCampaigns.length > 0 && (
                <p className="mt-1.5 text-[12px] text-faint">
                  Showing your live campaign
                  {data!.meta.liveCampaigns.length === 1 ? "" : "s"}:{" "}
                  <span className="font-semibold text-text">
                    {data!.meta.liveCampaigns.join(", ")}
                  </span>
                  . Paused campaigns are left out here, but their spend and leads still count in
                  Results above.
                </p>
              )}
              {data!.unattributed > 0 && (
                <p className="mt-1.5 text-[12px] text-faint">
                  {data!.unattributed} lead{data!.unattributed === 1 ? "" : "s"} in this range could
                  not be matched to an ad, so {data!.unattributed === 1 ? "it is" : "they are"}{" "}
                  counted in Results but not below.
                </p>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="border border-border px-4 py-6 text-center text-[13px] text-muted">
                {data!.meta.neverSynced
                  ? "Your ad numbers have not been pulled in yet."
                  : "No ad spend in this range."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-center">
                  <thead>
                    <tr>
                      <th className={`${TH} text-left`}>{levelLabel} Name</th>
                      {BREAKDOWN_COLUMNS.map((c) => (
                        <th key={c} className={TH}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface">
                        <td
                          className="max-w-[300px] border border-border px-3 py-2.5 text-left text-[13px] font-medium text-text"
                          title={r.name}
                        >
                          <span className="flex items-center gap-2">
                            {r.live && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-positive-tint px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-positive">
                                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                                Live
                              </span>
                            )}
                            <span className="truncate">{r.name || "-"}</span>
                          </span>
                        </td>
                        <td className={`${TD} text-faint`}>{r.id}</td>
                        <td className={TD}>{money0(r.spend)}</td>
                        <td className={TD}>{r.leads}</td>
                        <td className={TD}>{r.bookings}</td>
                        <td className={TD}>{r.sales}</td>
                        <td className={TD}>{money0(r.revenue)}</td>
                        <td className={`${TD} font-semibold`}>{roas(r.roas)}</td>
                        <td className={TD}>{money2(r.costPerLead)}</td>
                        <td className={TD}>{money2(r.costPerBooking)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
