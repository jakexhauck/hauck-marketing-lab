// Pure math for the Setter Suite's headline rate strip (Task 9). Built from
// the exact leads array the board already has on screen (one pipeline's
// worth of functions/api/admin/setter/leads.ts's ApiSetterLead): no new
// fetch, no new endpoint, nothing sampled.
//
// The client specified five rates, word for word, in this order:
//   Total leads in, Contact rate, Booking rate, Show rate, Close rate.
// Only the first three have data behind them. Show rate (showed / booked)
// and Close rate (won / showed) need the Estimate and Job close-out flows,
// which do not exist yet, so they are ALWAYS pending here, independent of
// the input.

export interface SetterRateTile {
  key: "totalLeads" | "contactRate" | "bookingRate" | "showRate" | "closeRate";
  label: string;
  formula: string;
  // true when there is no honest number to show: either the data source
  // doesn't exist yet (show/close), the leads fetch hasn't resolved yet
  // (loading), the leads fetch errored (failed), or the denominator is zero
  // (no leads loaded yet, so "contacted / leads" is 0/0, not 0).
  pending: boolean;
  // Formatted display value, e.g. "42%" or "7". Empty when pending: a
  // pending tile never renders a number, not even "0%".
  value: string;
  pendingReason: string | null;
}

interface RateLead {
  contacted: boolean;
  lastOutcome: string | null;
}

// The three states the leads fetch that feeds this strip can be in. A single
// explicit value instead of a `loading`/`failed` boolean pair: booleans can
// contradict each other (both true, both false with data absent) and every
// prior bug in this file came from conflating two of these three. "ready"
// means the fetch resolved successfully, independent of whether it resolved
// to zero leads.
export type SetterRateStripStatus = "loading" | "failed" | "ready";

// A 0-denominator fraction is undefined, not zero: returning null here (never
// NaN, never Infinity, never a fabricated 0) is what lets the caller render
// "No leads yet" instead of a lying "0%".
function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// "Could not load leads", "Loading leads..." and "No leads yet" all render a
// pending tile, but they are three different claims: the fetch errored, the
// fetch is still in flight, or the fetch succeeded and there truly are zero
// leads. Conflating any two of them is the synthetic-zero failure this file
// exists to prevent. Loading and failed get their own copy on every
// leads-derived tile; Show/Close are pending for an unrelated reason (no
// close-out flow exists yet) and never borrow this copy, in any state.
const FAILED_REASON = "Could not load leads";
const LOADING_REASON = "Loading leads...";
const CLOSE_OUT_REASON = "Needs close-out flow";

export function computeSetterRateStrip(
  leads: RateLead[],
  status: SetterRateStripStatus = "ready",
): SetterRateTile[] {
  const total = leads.length;
  const contacted = leads.filter((l) => l.contacted).length;
  // "booked" is the same dial outcome a setter logs the moment they lock in
  // a time (functions/api/admin/setter/dials.ts's OUTCOMES), already carried
  // on every board card as lastOutcome. No appointments fetch required.
  const booked = leads.filter((l) => l.lastOutcome === "booked").length;

  // Only a "ready" fetch has an honest denominator to divide by. While
  // loading or failed, `leads` cannot be trusted (it is `[]` by convention,
  // but even a non-empty array must not turn into a number here), so both
  // rates go straight to null regardless of what was passed in.
  const contactRate = status === "ready" ? safeRate(contacted, total) : null;
  const bookingRate = status === "ready" ? safeRate(booked, total) : null;

  const statusReason = status === "loading" ? LOADING_REASON : status === "failed" ? FAILED_REASON : null;

  return [
    {
      key: "totalLeads",
      label: "Total leads in",
      formula: "count of leads",
      pending: status !== "ready",
      value: status === "ready" ? String(total) : "",
      pendingReason: statusReason,
    },
    {
      key: "contactRate",
      label: "Contact rate",
      formula: "contacted / leads",
      pending: contactRate === null,
      value: contactRate === null ? "" : formatPercent(contactRate),
      pendingReason: contactRate === null ? (statusReason ?? "No leads yet") : null,
    },
    {
      key: "bookingRate",
      label: "Booking rate",
      formula: "booked / leads",
      pending: bookingRate === null,
      value: bookingRate === null ? "" : formatPercent(bookingRate),
      pendingReason: bookingRate === null ? (statusReason ?? "No leads yet") : null,
    },
    {
      key: "showRate",
      label: "Show rate",
      formula: "showed / booked",
      pending: true,
      value: "",
      pendingReason: CLOSE_OUT_REASON,
    },
    {
      key: "closeRate",
      label: "Close rate",
      formula: "won / showed",
      pending: true,
      value: "",
      pendingReason: CLOSE_OUT_REASON,
    },
  ];
}
