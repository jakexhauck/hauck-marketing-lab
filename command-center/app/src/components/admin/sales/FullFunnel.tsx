import type { SalesCounts, SalesRates } from "../../../lib/salesTracker";
import { formatMoney } from "../../../lib/salesTracker";
import { formatPct } from "../../../lib/trackerMonth";

// The month, calendar through to cash, on one line.
//
// Every count here is read from the meetings on the agency sales calendars, so
// the strip says one thing about one population: of the meetings that were
// booked, how many happened, how many closed, and what that was worth.
//
// It used to open with Dials -> Talked -> Booked, counted from the call cards,
// with a drawn seam between the two halves because they are two populations and
// a rate across them would be arithmetic on sand. That half is gone: the dialing
// month is Acquisition > Cold Call's to report, and Sales asking the same
// question in a second place meant two pages could answer it differently.
//
// Rates are drawn as the links BETWEEN the counts rather than as numbers of
// their own, matching the Sales Calls funnel: a rate is a relationship between
// two counts, not a third count.

export default function FullFunnel({
  totals,
  rates,
}: {
  totals: SalesCounts;
  rates: SalesRates;
}) {
  return (
    <div className="mb-5 rounded-[var(--radius-lg)] border border-border px-5 py-4">
      <div className="flex flex-wrap items-end gap-x-1 gap-y-3">
        <Step value={totals.onCalendar} label="On calendar" />
        <Link value={formatPct(rates.showUpPct)} label="showed" />
        <Step value={totals.taken} label="Showed" />
        <Link value={formatPct(rates.closePct)} label="closed" />
        <Step value={totals.closed} label="Closed" />

        {/* Two money figures, not one. New MRR is what the month's closes are
            worth every month from here; cash is what actually arrived. An agency
            selling retainers reads almost nothing from the second on its own,
            which is why the first leads. */}
        <div className="ml-auto flex items-end gap-6">
          <div>
            <div className="font-data text-[22px] font-semibold leading-none">
              {formatMoney(totals.mrr)}
            </div>
            <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">
              New MRR
            </div>
          </div>
          <div>
            <div className="font-data text-[22px] font-semibold leading-none">
              {formatMoney(totals.cash)}
            </div>
            <div className="mt-1.5 text-[11.5px] uppercase tracking-wider text-muted">
              Cash collected
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-faint">
        Counted from the meetings on the sales calendars, wherever they were
        booked from.
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
