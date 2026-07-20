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

export function rollUpByContact(dials: DialRow[]): Map<string, ContactRollUp> {
  const out = new Map<string, ContactRollUp>();
  // Input sort order is not trusted, so the latest timestamp per contact is
  // tracked alongside rather than assumed from array position.
  const latestAt = new Map<string, string>();

  for (const d of dials) {
    const cur = out.get(d.contact_id) ?? {
      attempts: 0, firstDialedAt: null, contacted: false, lastOutcome: null,
    };
    cur.attempts += 1;
    if (cur.firstDialedAt === null || d.dialed_at < cur.firstDialedAt) {
      cur.firstDialedAt = d.dialed_at;
    }
    const seen = latestAt.get(d.contact_id);
    if (seen === undefined || d.dialed_at >= seen) {
      cur.lastOutcome = d.outcome;
      latestAt.set(d.contact_id, d.dialed_at);
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
