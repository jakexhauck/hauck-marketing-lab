// Guards the service worker's precache against Cloudflare's SPA fallback.
//
// 2026-10-10 white screen: a new worker installed while the deploy was still
// reaching every edge. The edge without the new bundle answered
// /assets/index-<hash>.js with index.html and a 200, Workbox stored that page
// as the script, and every load after ran HTML as JavaScript. The hash in the
// file name never changes, so it never healed on its own.
//
// An HTML body for a .js or .css address is never right. Refusing it fails the
// worker's install, so the previous worker (and the previous, working bundle)
// stays in charge and the install is retried on the next visit.

const CODE_FILE = /\.(js|mjs|css)$/i;

export function isPoisonedPrecache(r: { url: string; contentType: string | null }): boolean {
  const path = new URL(r.url).pathname;
  return CODE_FILE.test(path) && (r.contentType ?? "").toLowerCase().includes("text/html");
}
