// What goes in the GHL text to the owner for the Open Lead owner link.
//
// The custom value only names the client (location + key). Which lead the tap
// is about has to ride on the end, or /api/call-now and friends answer with an
// invalid-link page (parseCallNowParams needs c). Pasting the bare tag was the
// easy mistake, so Outcome Wiring copies this line instead (2026-10-10).
export function ownerLinkText(merge: string): string {
  return `${merge}&c={{contact.id}}`;
}

// The one link the new-lead text to the owner carries (Jake, 2026-10-12): the
// Open Lead custom value opens the outcome page, which has the Call button on top.
export const NEW_LEAD_TEXT = `New lead: {{contact.name}}
Open lead: ${ownerLinkText("{{custom_values.open_lead}}")}`;
