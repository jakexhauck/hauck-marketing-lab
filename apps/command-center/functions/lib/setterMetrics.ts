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

// Split an array into groups of at most `size`, preserving order. Used by
// functions/api/admin/setter/leads.ts to keep the setter_dials .in() lookup
// within a URL length Supabase's edge will accept: postgrest-js serializes
// .in("contact_id", ids) straight into the query string, CRM ids are 24
// characters each, and a pipeline holding a few hundred leads would
// otherwise send one query string tens of kilobytes long.
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
