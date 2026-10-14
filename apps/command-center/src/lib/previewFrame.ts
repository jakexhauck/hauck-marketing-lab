// Preview-frame mode: the app running inside the admin Fulfillment "Software"
// tab's iframe.
//
// The admin page frames the live client app so Jake can page through every
// surface of the product for one client. The frame is same-origin, so the
// browser attaches the admin's own hml_session cookie to every request. If we
// let that stand, the framed app would resolve as the admin (wrong tenant), and
// if we instead swapped the cookie for a preview one we would destroy the admin
// session that the surrounding page depends on.
//
// So the frame authenticates out-of-band: a short-lived, read-only preview
// token handed over in the URL fragment, held here in memory, and attached to
// every request as x-preview-token (which the server reads ahead of the cookie).
//
// Two deliberate choices:
//
//   Fragment, not query string. A fragment is never sent to the server, so the
//   token stays out of access logs, out of Referer headers, and out of any
//   proxy in between.
//
//   Memory, not storage. Nothing is persisted, so the token dies with the frame
//   and can never leak into a normal tab or outlive its 15-minute life.

const FRAGMENT_KEY = "preview_token";

let token: string | null = null;

// Read at module load, before any request can be made. Stripping the fragment
// immediately keeps the token out of the URL bar, out of the session history,
// and out of anything the user might copy or screenshot.
function readTokenFromFragment(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;

  const params = new URLSearchParams(hash.slice(1));
  const found = params.get(FRAGMENT_KEY);
  if (!found) return null;

  params.delete(FRAGMENT_KEY);
  const rest = params.toString();
  try {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`,
    );
  } catch {
    /* replaceState can throw in exotic embeddings; the token is already read */
  }
  return found;
}

token = readTokenFromFragment();

// True when this document is the admin Software tab's preview frame. Used to
// suppress affordances that make no sense in an inventory preview: currently the
// preview banner (App.tsx), which offers an "exit preview" this frame has no
// cookie to exit.
//
// Note the service worker is NOT suppressed here; it stays registered, and
// instead sw.ts skips its runtime caches for any request carrying a preview
// token, so one client's cached lists can never paint inside another's frame.
export function isPreviewFrame(): boolean {
  return token !== null;
}

// Headers to merge into every outbound request. Empty in a normal tab, so this
// is safe to call unconditionally from the shared fetch paths.
export function previewHeaders(): Record<string, string> {
  return token ? { "x-preview-token": token } : {};
}
