// What goes in the GHL text to the owner for the Open Lead owner link.
//
// The custom value only names the client (location + key). Which lead the tap
// is about has to ride on the end, or /api/call-now and friends answer with an
// invalid-link page (parseCallNowParams needs c). Pasting the bare tag was the
// easy mistake, so the Open Lead row on Custom Values copies this line instead.
export function ownerLinkText(merge: string): string {
  return `${merge}&c={{contact.id}}`;
}
