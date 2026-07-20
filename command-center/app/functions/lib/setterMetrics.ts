export type DialRow = {
  contact_id: string;
  dialed_at: string;
  spoke: boolean;
  outcome: string;
};

export type ContactRollUp = {
  attempts: number;
  firstDialedAt: string | null;
  contacted: boolean;
  lastOutcome: string | null;
};

// dialed_at comes from a Postgres timestamptz via Supabase. Unlike
// adTrackerMetrics's inRange (which only ever needs the first ten characters
// of a date, a bucket coarse enough that offset representation cannot flip
// the answer), here we need true chronological order down to the instant, so
// a string compare is not safe: "2026-07-20T23:00:00-04:00" (which is
// 2026-07-21T03:00:00Z) sorts as a LESSER string than "2026-07-21T00:30:00Z"
// even though it is the LATER instant. Comparing parsed epoch milliseconds
// instead makes the offset irrelevant. An unparseable or empty timestamp
// parses to NaN; it is kept (so attempts/outcome are never dropped) but is
// never allowed to out-rank a real, parseable timestamp for first/last
// ordering, since we have no way to know where in time it actually belongs.
function epochOf(iso: string): number {
  return Date.parse(iso);
}

export function rollUpByContact(dials: DialRow[]): Map<string, ContactRollUp> {
  const out = new Map<string, ContactRollUp>();
  // Input sort order is not trusted, so the earliest/latest timestamp per
  // contact is tracked alongside (as epoch ms) rather than assumed from
  // array position or derived by re-parsing the stored strings.
  const firstAt = new Map<string, number>();
  const latestAt = new Map<string, number>();

  for (const d of dials) {
    const cur = out.get(d.contact_id) ?? {
      attempts: 0, firstDialedAt: null, contacted: false, lastOutcome: null,
    };
    cur.attempts += 1;

    const epoch = epochOf(d.dialed_at);
    const firstEpoch = firstAt.get(d.contact_id);
    if (
      cur.firstDialedAt === null
      || (!Number.isNaN(epoch) && (firstEpoch === undefined || Number.isNaN(firstEpoch) || epoch < firstEpoch))
    ) {
      cur.firstDialedAt = d.dialed_at;
      firstAt.set(d.contact_id, epoch);
    }

    const seenEpoch = latestAt.get(d.contact_id);
    if (
      seenEpoch === undefined
      || (!Number.isNaN(epoch) && (Number.isNaN(seenEpoch) || epoch >= seenEpoch))
    ) {
      cur.lastOutcome = d.outcome;
      latestAt.set(d.contact_id, epoch);
    }

    if (d.spoke) cur.contacted = true;
    out.set(d.contact_id, cur);
  }
  return out;
}

export type Rates = {
  totalLeads: number;
  contactRate: number | null;
  bookingRate: number | null;
  showRate: null;
  closeRate: null;
};

export function computeRates(
  leads: { contactId: string }[],
  rollUps: Map<string, ContactRollUp>,
  appointments: { contactId: string }[],
): Rates {
  const total = leads.length;
  if (total === 0) {
    return { totalLeads: 0, contactRate: null, bookingRate: null, showRate: null, closeRate: null };
  }
  const contacted = leads.filter((l) => rollUps.get(l.contactId)?.contacted).length;
  const booked = new Set(appointments.map((a) => a.contactId));
  const bookedLeads = leads.filter((l) => booked.has(l.contactId)).length;
  return {
    totalLeads: total,
    contactRate: contacted / total,
    bookingRate: bookedLeads / total,
    // Both require the Estimate and Job Close-out flows, which do not exist.
    showRate: null,
    closeRate: null,
  };
}
