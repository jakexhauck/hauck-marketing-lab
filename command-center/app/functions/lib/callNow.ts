// "Tap to call" link texted to a client's owner when a lead lands.
//
// The owner dials from their personal cell otherwise, and a personal-cell call
// is invisible: no recording, no pickup on the dashboard. So the text carries a
// link instead of the lead's number. Tapping it tags the lead `call-now`, and a
// GoHighLevel "Call Now" workflow (Call action) rings the owner and bridges them
// to the lead on the business number. GoHighLevel places the call; this app only
// applies the tag, because a link in an internal SMS cannot tell GoHighLevel
// which lead it belongs to.
//
// The link names the location and contact in the clear, so it is guarded by a
// per-location key: HMAC(SESSION_SECRET, "call-now:<location>"). One key per
// sub-account lets a GoHighLevel workflow paste it as a constant, since a
// workflow cannot compute a signature per contact. Derived, not a new secret,
// so there is nothing extra to store or rotate. The worst a leaked key does is
// ring that client's owner about one of their own leads.

export const CALL_NOW_TAG = "call-now";

const ID = /^[A-Za-z0-9]{8,64}$/;

export async function callNowKey(secret: string, locationId: string): Promise<string> {
  return linkKey(secret, "call-now", locationId);
}

// The same per-location key for any owner link texted from a workflow, scoped by
// purpose so a leaked call-now key opens nothing else. "call-now" keeps the
// exact message it always signed, so keys already pasted into GHL still work.
export async function linkKey(secret: string, purpose: string, locationId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}:${locationId}`)),
  );
  // 16 bytes is plenty for a link guard and keeps the SMS short.
  return [...sig.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CallNowParams {
  locationId: string;
  contactId: string;
  key: string;
}

export function parseCallNowParams(url: URL): CallNowParams | null {
  const locationId = (url.searchParams.get("l") ?? "").trim();
  const contactId = (url.searchParams.get("c") ?? "").trim();
  const key = (url.searchParams.get("k") ?? "").trim().toLowerCase();
  if (!ID.test(locationId) || !ID.test(contactId) || !/^[0-9a-f]{32}$/.test(key)) return null;
  return { locationId, contactId, key };
}

export function keysMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// GET renders a button and only the POST tags the lead. iMessage and most SMS
// apps fetch a link to draw its preview, so a GET that tagged would ring the
// owner the moment the text arrived, before they had tapped anything.
export function callNowPage(opts: { title: string; button?: { action: string } }): string {
  const button = opts.button
    ? `<form method="post" action="${escapeHtml(opts.button.action)}"><button type="submit">Call now</button></form>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Call now</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1D19;color:#fff;font-family:Inter,system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box}
h1{font-family:Poppins,Inter,system-ui,sans-serif;font-weight:600;font-size:22px;margin:0 0 24px}
button{background:#4DBB83;color:#0A1D19;border:0;border-radius:14px;font:600 20px Poppins,Inter,system-ui,sans-serif;padding:18px 48px;cursor:pointer}
</style></head><body><main><h1>${escapeHtml(opts.title)}</h1>${button}</main></body></html>`;
}
