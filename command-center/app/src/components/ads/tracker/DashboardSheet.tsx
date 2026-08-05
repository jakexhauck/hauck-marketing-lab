import type {
  AdTrackerBreakdownRow,
  AdTrackerLevel,
  AdTrackerRange,
  AdTrackerResponse,
} from "../../../lib/api";
import {
  LEVELS,
  RANGES,
  Segmented,
  money0,
  money2,
  pct,
  roas,
} from "../../../routes/paid-ads/trackerShared";

// The Paid Ads Dashboard sheet: the RESULTS band and the BREAKDOWN band.
//
// Rendered by BOTH the client's own /marketing/paid-ads page and the admin
// cockpit's Paid Ads > Dashboard tab, which is the point: the client and the
// operator looking at the same account must see the same sheet, not two
// interpretations of it. Everything app-specific (Shell, the page bar, the
// client picker, the Refresh spend button) stays outside this file.
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
//
// shrink-0, like every other block here: the client's PAGE_CONTAINER is a
// `flex flex-col` with min-h-0, so any child left at the default flex-shrink:1
// gets squashed to fit the viewport instead of scrolling. See the Results
// wrapper below for what that looked like.
function Band({ children }: { children: string }) {
  return (
    <div
      className={
        // Phone: a plain section kicker, no fill, no border, no boxed band.
        // The workbook banding is what makes the DESKTOP page recognisable as
        // the sheet, but on a 390px screen a full-width tinted bar above a
        // stack of cards is just a coloured stripe, and two of them made the
        // page read as a form rather than a report.
        "mb-2 mt-1 shrink-0 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint " +
        // Desktop keeps the sheet exactly as it was.
        "lg:mb-0 lg:mt-0 lg:border lg:border-b-0 lg:border-border lg:bg-brand/10 lg:px-3 lg:py-2 lg:text-[11.5px] lg:font-bold lg:tracking-[0.08em] lg:text-brand"
      }
    >
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

// Breakdown's cells. Dense on purpose: that table is a list, sometimes a long
// one, so it stays compact.
const TH = "border border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-muted";
const TD = "border border-border px-3 py-2.5 text-[13px] text-text tnum";

// Results' cells. Its own scale, a step up from Breakdown's dense list: taller
// and wider cells, with the type sized to match so the figures sit in
// proportion to the box rather than rattling around inside it.
const RESULT_TH =
  "border border-border bg-surface-2 px-4 py-3.5 text-[12.5px] font-semibold text-muted";
const RESULT_TD = "border border-border px-4 py-6 text-[16px] text-text tnum";

// One figure on a phone card, with its label above it. The sheet's tables carry
// their labels in a header row; a card has no header row, so each figure has to
// name itself.
function Stat({
  label,
  value,
  strong = false,
  wide = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  wide?: boolean;
}) {
  return (
    // bg-surface over the grid's bg-border, so the 1px gap between cells IS the
    // rule. Bordering each cell instead would double every interior line to 2px
    // while the outer edge stayed 1px.
    <div className={`min-w-0 bg-surface px-3 py-2.5 ${wide ? "col-span-2" : ""}`}>
      <div className="truncate text-[11px] text-muted" title={label}>
        {label}
      </div>
      <div className={`truncate text-[16px] text-text tnum ${strong ? "font-semibold" : ""}`}>
        {value}
      </div>
    </div>
  );
}

// The three figures that answer "did the ads make money": their own card, their
// own scale, above the funnel counts. ROAS takes the full width as the verdict.
function Headline({
  label,
  value,
  accent = false,
  wide = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={
        "min-w-0 rounded-[12px] border px-3.5 py-3 " +
        (wide ? "col-span-2 " : "") +
        (accent ? "border-brand/30 bg-brand/5" : "border-border bg-surface")
      }
    >
      <div className="truncate text-[11.5px] text-muted">{label}</div>
      <div
        className={
          "truncate font-data text-[22px] font-semibold tracking-tight tnum " +
          (accent ? "text-brand" : "text-text")
        }
      >
        {value}
      </div>
    </div>
  );
}

// A Breakdown figure on a phone card. Denser than Stat: Breakdown is a list,
// sometimes a long one, so its cards stay compact the way its table does.
function BreakdownStat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-faint">{label}</dt>
      <dd className={`truncate text-text tnum ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

export default function DashboardSheet({
  data,
  range,
  onRange,
  level,
  onLevel,
}: {
  data: AdTrackerResponse;
  range: AdTrackerRange;
  onRange: (r: AdTrackerRange) => void;
  level: AdTrackerLevel;
  onLevel: (l: AdTrackerLevel) => void;
}) {
  const rows: AdTrackerBreakdownRow[] = data.breakdown ?? [];
  const levelLabel = LEVELS.find((l) => l.id === level)!.label;

  return (
    <>
      {/* No title block. The client name and its strap line were both cut so
          RESULTS is the first thing on the page: the sidebar and the section
          bar already say whose account this is, and the heading was pushing the
          numbers below the fold. */}

      {/* RESULTS */}
      <Band>Results</Band>
      {/* shrink-0 is load-bearing, not tidiness. This div is a child of
          PAGE_CONTAINER, a `flex flex-col` with min-h-0, so it defaults to
          flex-shrink:1 and gets compressed when the page is taller than the
          viewport. overflow-x-auto forces overflow-y to `auto` as well (CSS
          turns a `visible` counterpart into `auto`), so that compression
          CLIPPED the figures: the data row rendered sliced in half, with $469
          and 0.00x cut through the middle. The page must overflow into its
          scroll column, never squash.

          No bottom margin: the two bands butt straight together so the page
          reads as one continuous sheet, the way the workbook does. */}
      {/* Phone: the same eleven figures as a grid, plus the range picker above
          them. Twelve columns at min-w-[900px] in a ~408px column meant the
          client saw Leads and Pickups and had to drag for the rest, including
          ROAS, which is the number the page exists for. The grid keeps the
          sheet's ruled-cell look so it still reads as the workbook. */}
      {/* Phone: the app's own segmented range control rather than a native
          <select>. The dropdown was the sheet's data-validation cell, but on a
          phone it read as an unstyled form field in the middle of a report, and
          the Lead Tracker one tab away already sets the range with exactly this
          control. Same gesture on both pages now. */}
      <div className="mb-3 shrink-0 overflow-x-auto lg:hidden" style={{ scrollbarWidth: "none" }}>
        <Segmented options={RANGES} value={range} onChange={onRange} label="Date range" />
      </div>

      {/* Phone: the money line first and big, then the funnel, then the rates.
          Eleven equal cells in a hairline grid meant ROAS (the number the page
          exists for) carried exactly the same weight as Pickup Rate, and the
          reader had to hunt for it. */}
      <div className="mb-4 grid shrink-0 grid-cols-2 gap-2 lg:hidden">
        <Headline label="Revenue" value={money0(data.kpis.revenue)} />
        <Headline label="Ad Spend" value={money0(data.kpis.spend)} />
        <Headline label="ROAS" value={roas(data.kpis.roas)} accent wide />
      </div>
      <div className="mb-4 grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:hidden">
        <Stat label="Leads" value={String(data.kpis.leads)} />
        <Stat label="Pickups" value={String(data.kpis.pickups)} />
        <Stat label="Bookings" value={String(data.kpis.bookings)} />
        <Stat label="Sales" value={String(data.kpis.sales)} />
        <Stat label="Pickup Rate" value={pct(data.kpis.pickupRate)} />
        <Stat label="Booking Rate" value={pct(data.kpis.bookingRate)} />
        <Stat label="Sales % of leads" value={pct(data.kpis.salesPct)} />
        <Stat label="Close Rate of bookings" value={pct(data.kpis.closeRate)} />
      </div>

      <div className="hidden shrink-0 overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] border-collapse text-center">
          <thead>
            <tr>
              <th className={RESULT_TH}>Date Range</th>
              {RESULT_COLUMNS.map((c) => (
                <th key={c} className={RESULT_TH}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border px-4 py-6">
                <Picker options={RANGES} value={range} onChange={onRange} label="Date range" />
              </td>
              <td className={RESULT_TD}>{data.kpis.leads}</td>
              <td className={RESULT_TD}>{data.kpis.pickups}</td>
              <td className={RESULT_TD}>{pct(data.kpis.pickupRate)}</td>
              <td className={RESULT_TD}>{data.kpis.bookings}</td>
              <td className={RESULT_TD}>{pct(data.kpis.bookingRate)}</td>
              <td className={RESULT_TD}>{data.kpis.sales}</td>
              <td className={RESULT_TD}>{pct(data.kpis.salesPct)}</td>
              <td className={RESULT_TD}>{pct(data.kpis.closeRate)}</td>
              <td className={RESULT_TD}>{money0(data.kpis.revenue)}</td>
              <td className={RESULT_TD}>{money0(data.kpis.spend)}</td>
              <td className={`${RESULT_TD} font-semibold`}>{roas(data.kpis.roas)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* BREAKDOWN */}
      <Band>Breakdown</Band>
      {/* One control row: the View by picker with the live campaign name beside
          it. Every explanatory paragraph that used to sit under here was cut on
          Jake's instruction, so this band is now the control and the scope,
          nothing else. */}
      {/* Phone: segmented, on its own line, no "View by:" prefix. The label was
          a third of the row's width on a 390px screen to say what the three
          buttons already say. */}
      <div className="mb-3 shrink-0 lg:hidden">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <Segmented options={LEVELS} value={level} onChange={onLevel} label="View by" />
        </div>
        {data.meta.liveCampaigns.length > 0 && (
          <div className="mt-2 text-[12px] text-faint">
            Live campaign
            {data.meta.liveCampaigns.length === 1 ? "" : "s"}:{" "}
            <span className="font-semibold text-text">{data.meta.liveCampaigns.join(", ")}</span>
          </div>
        )}
      </div>

      <div className="hidden shrink-0 border border-b-0 border-border px-3 py-3 lg:block">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[12.5px] font-semibold text-text">View by:</span>
          <Picker options={LEVELS} value={level} onChange={onLevel} label="View by" />
          {data.meta.liveCampaigns.length > 0 && (
            <span className="text-[12px] text-faint">
              Showing your live campaign
              {data.meta.liveCampaigns.length === 1 ? "" : "s"}:{" "}
              <span className="font-semibold text-text">{data.meta.liveCampaigns.join(", ")}</span>
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="shrink-0 border border-border px-4 py-6 text-center text-[13px] text-muted">
          {data.meta.neverSynced
            ? "Your ad numbers have not been pulled in yet."
            : "No ad spend in this range."}
        </div>
      ) : (
        <>
        {/* Phone: a card per campaign / ad set / ad. Ten columns at
            min-w-[980px] is the widest table on the page, and the row's NAME
            (the thing that tells you which ad you are reading) sat in the
            leftmost column with the figures dragged off to the right of it. */}
        {/* No enclosing bordered box on a phone: the cards already have borders,
            so wrapping them in another one drew a frame around a frame. */}
        <div className="flex shrink-0 flex-col gap-2 lg:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-[12px] border border-border bg-surface px-3.5 py-3">
              <div className="flex items-start gap-2">
                {r.live && (
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-positive-tint px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-positive">
                    <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                    Live
                  </span>
                )}
                <span className="min-w-0 flex-1 text-[14px] font-semibold text-text">
                  {r.name || "-"}
                </span>
              </div>
              {/* The raw Meta ID is desktop-only. The sheet carried that column
                  and the operator uses it; under an ad name on a client's phone
                  it is a line of machine text with nothing to do. */}

              <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border/60 pt-2.5 text-[12.5px]">
                <BreakdownStat label="Spend" value={money0(r.spend)} />
                <BreakdownStat label="Leads" value={String(r.leads)} />
                <BreakdownStat label="Bookings" value={String(r.bookings)} />
                <BreakdownStat label="Sales" value={String(r.sales)} />
                <BreakdownStat label="Revenue" value={money0(r.revenue)} />
                <BreakdownStat label="ROAS" value={roas(r.roas)} strong />
                <BreakdownStat label="Cost / lead" value={money2(r.costPerLead)} />
                <BreakdownStat label="Cost / booking" value={money2(r.costPerBooking)} />
              </dl>
            </div>
          ))}
        </div>

        {/* shrink-0 for the same reason as Results above: without it this table
            is squashed and clipped rather than scrolled to. */}
        <div className="hidden shrink-0 overflow-x-auto lg:block">
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
        </>
      )}
    </>
  );
}
