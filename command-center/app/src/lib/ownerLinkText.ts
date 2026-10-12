// What goes in the GHL text to the owner for one of the three owner links.
//
// The custom value only names the client (location + key). Which lead the tap
// is about has to ride on the end, or /api/call-now and friends answer with an
// invalid-link page (parseCallNowParams needs c). Pasting the bare tag was the
// easy mistake, so Outcome Wiring copies this line instead (2026-10-10).
export function ownerLinkText(merge: string): string {
  return `${merge}&c={{contact.id}}`;
}

// The one link the new-lead text to the owner carries (Jake, 2026-10-12): the
// Lead Outcome Link opens the outcome page, which has the Call button on top.
export const NEW_LEAD_TEXT = `New lead: {{contact.name}}
Open lead: ${ownerLinkText("{{custom_values.lead_outcome_link}}")}`;

// Outcome Wiring's list: Lead Outcome first (the one in the text), then the
// two call links. Text Them Link is still pushed and still works for old texts,
// but nothing should be wired to it any more, so it is not shown.
const WIRING_ORDER = ["Lead Outcome Link", "Call Now Link", "Phone Appointment Call Now Link"];

export function wiringLinks<T extends { name: string }>(links: T[]): T[] {
  return WIRING_ORDER.flatMap((n) => links.filter((l) => l.name === n));
}
