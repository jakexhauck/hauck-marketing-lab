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
// the input: mirrors functions/lib/setterMetrics.ts's Rates type, which
// types showRate/closeRate as the literal `null` so fabricating them is a
// type error there too.

export interface SetterRateTile {
  key: "totalLeads" | "contactRate" | "bookingRate" | "showRate" | "closeRate";
  label: string;
  formula: string;
  // true when there is no honest number to show: either the data source
  // doesn't exist yet (show/close), or the denominator is zero (no leads
  // loaded yet, so "contacted / leads" is 0/0, not 0).
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

export function computeSetterRateStrip(leads: RateLead[]): SetterRateTile[] {
  const total = leads.length;
  const contacted = leads.filter((l) => l.contacted).length;
  // "booked" is the same dial outcome a setter logs the moment they lock in
  // a time (functions/api/admin/setter/dials.ts's OUTCOMES), already carried
  // on every board card as lastOutcome. No appointments fetch required.
  const booked = leads.filter((l) => l.lastOutcome === "booked").length;

  const contactRate = safeRate(contacted, total);
  const bookingRate = safeRate(booked, total);

  return [
    {
      key: "totalLeads",
      label: "Total leads in",
      formula: "count of leads",
      pending: false,
      value: String(total),
      pendingReason: null,
    },
    {
      key: "contactRate",
      label: "Contact rate",
      formula: "contacted / leads",
      pending: contactRate === null,
      value: contactRate === null ? "" : formatPercent(contactRate),
      pendingReason: contactRate === null ? "No leads yet" : null,
    },
    {
      key: "bookingRate",
      label: "Booking rate",
      formula: "booked / leads",
      pending: bookingRate === null,
      value: bookingRate === null ? "" : formatPercent(bookingRate),
      pendingReason: bookingRate === null ? "No leads yet" : null,
    },
    {
      key: "showRate",
      label: "Show rate",
      formula: "showed / booked",
      pending: true,
      value: "",
      pendingReason: "Needs close-out flow",
    },
    {
      key: "closeRate",
      label: "Close rate",
      formula: "won / showed",
      pending: true,
      value: "",
      pendingReason: "Needs close-out flow",
    },
  ];
}
