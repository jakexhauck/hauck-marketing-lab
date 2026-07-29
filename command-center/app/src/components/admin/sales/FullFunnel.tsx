import type { DialTotals } from "../../../../functions/lib/salesDataRollup";
import type { SalesCounts, SalesRates } from "../../../lib/salesTracker";
import { formatMoney } from "../../../lib/salesTracker";
import { formatPct, pct } from "../../../lib/trackerMonth";

// The month, dialing through to cash, on one line.
//
// Cold Call counts dials and bookings. Sales Data counts meetings and closes.
// Until this existed nothing joined them, so the question the whole operation
// turns on ("does picking up the phone make money") had no page. Now it has a
// row.
//
// TWO HALVES, COUNTED FROM DIFFERENT TABLES, and the strip says so rather than
// implying one pours neatly into the other:
//
//   Dials -> Talked -> Booked      every attempt logged on the call card
//   On calendar -> ... -> Cash     every meeting on the sales calendars
//
// Booked and On calendar are therefore allowed to disagree, and the gap is the
// interesting part: it is the meetings that came from somewhere other than the
// phones. That is why there is no rate drawn between them; a percentage there
// would be dividing two populations that are not the same population.
//
// Rates are drawn as the links BETWEEN the counts rather than as numbers of
// their own, matching the Sales Calls funnel: a rate is a relationship between
// two counts, not a third count.

export default function FullFunnel({
  dials,
  totals,
  rates,
}: {
  dials: DialTotals;
  totals: SalesCounts;
  rates: SalesRates;
}) {
  // Of the calls that were answered, how many booked. Not of every dial: a
  // number nobody picked up cannot have said no to a meeting.
  const bookRate = pct(dials.booked, dials.talked);
  const pickupRate = pct(dials.talked, dials.dials);

  return (
    <div className="mb-5 rounded-[var(--radius-lg)] border border-border px-5 py-4">
      <div className="flex flex-wrap items-end gap-x-1 gap-y-3">
        <Step value={dials.dials} label="Dials" />
        <Link value={formatPct(pickupRate)} label="answered" />
        <Step value={dials.talked} label="Talked" />
        <Link value={formatPct(bookRate)} label="booked" />
        <Step value={dials.booked} label="Booked" />

        {/* The seam between the two halves. Drawn, not papered over. */}
        <Seam />

        <Step value={totals.onCalendar} label="On calendar" />
        <Link value={formatPct(rates.showUpPct)} label="showed" />
        <Step value={totals.taken} label="Showed" />
        <Link value={formatPct(rates.closePct)} label="closed" />
        <Step value={totals.closed} label="Closed" />

        <div className="ml-auto">
          <div className="font-data text-[22px] font-semibold leading-none">
            {formatMoney(totals.cash)}
          </div>
          <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">
            Cash collected
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-faint">
        Dials, Talked and Booked are counted from the calls logged on the call
        card. Everything from On calendar is counted from the meetings on the
        sales calendars, so the two need not match: the difference is the
        meetings that came from somewhere other than the phones.
      </p>
    </div>
  );
}

function Step({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-2">
      <div className="font-data text-[22px] font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

// The rate between two steps. Deliberately quieter than the counts either side:
// it describes them, it is not one of them.
function Link({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1 pb-1 text-center">
      <div className="text-[12px] font-semibold text-muted">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

// Where the dialing numbers stop and the meeting numbers start.
function Seam() {
  return (
    <div className="mx-2 flex flex-col items-center pb-1" aria-hidden>
      <span className="h-8 w-px bg-[var(--border)]" />
    </div>
  );
}
