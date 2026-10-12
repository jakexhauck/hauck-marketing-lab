// The URL Jake pastes into a GHL Trigger Link for one of the three owner links.
//
// The link value only names the client (location + key). Which lead the tap
// is about has to ride on the end, or /api/call-now and friends answer with an
// invalid-link page (parseCallNowParams needs c). GHL fills {{contact.id}} per
// contact when the trigger link is sent, so the owner text uses the trigger
// link instead of the custom value tag (2026-10-12).
export function ownerLinkText(url: string): string {
  return `${url}&c={{contact.id}}`;
}
