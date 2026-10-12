// What goes in the GHL text to the owner for one of the three owner links.
//
// The custom value only names the client (location + key). Which lead the tap
// is about has to ride on the end, or /api/call-now and friends answer with an
// invalid-link page (parseCallNowParams needs c). Pasting the bare tag was the
// easy mistake, so Outcome Wiring copies this line instead (2026-10-10).
export function ownerLinkText(merge: string): string {
  return `${merge}&c={{contact.id}}`;
}
