// Machine access to the Meta spend sync, and nothing else.
//
// The Paid Ads Dashboard is only honest if ad spend is fresh: every ROAS, cost
// per lead and cost per booking on it divides by that number. Cloudflare Pages
// has no cron trigger, so the scheduler lives in a separate Worker
// (workers/ads-cron) and calls this app over HTTP, which means one route has to
// be reachable without an admin cookie.
//
// This is the same gate as lib/healthCron.ts with two deliberate differences,
// both of which make it the more dangerous of the two:
//
//   - It allows POST, because the sync is a POST.
//   - The handler behind it WRITES. It writes exactly one thing: upserts into
//     meta_ad_days, built from Meta's own Graph API response. No part of the
//     request body reaches the database, because the handler reads no body at
//     all; the only caller-supplied values are `tenantId` and `days` in the
//     query string, and both are already validated by the handler. The upsert
//     is keyed on (tenant_id, date, ad_id), so replaying a captured request is
//     a no-op rather than a way to duplicate or corrupt rows.
//
// Everything else is held identical to the health gate on purpose, so the two
// can be read side by side and any divergence is visible:
//
//   - ONE exact pathname. Not a prefix, not a startsWith. A prefix rule here
//     would eventually be widened by someone in a hurry, and the route next
//     door reads every credential in the estate.
//   - Unset secret means CLOSED, never "everything matches".
//   - A short secret is refused rather than accepted.
//
// Passing this gate skips session verification. It never sets ctx.data.admin,
// so a caller holding the secret is not an admin and cannot become one: the
// only thing it buys is this one sync.

/** The one route the scheduler may call. Compared with ===, never a prefix. */
export const ADS_CRON_PATH = "/api/admin/ads/sync";

/** The header the scheduler sends the shared secret in. */
export const ADS_CRON_HEADER = "x-ads-cron";

/**
 * Shortest secret the gate will honour. A scheduled endpoint is a quiet place
 * to brute-force, so anything a human might type by hand is refused outright.
 * Generate one with `openssl rand -hex 32`.
 */
export const MIN_SECRET_LENGTH = 32;

/**
 * Compare without leaking, through timing, how much of the secret was right.
 *
 * The early length check leaks only the length, which is not the secret and is
 * fixed by policy anyway. Everything after it runs over the full string.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * May this request skip the admin session gate?
 *
 * Every condition has to hold. Called before any other auth decision in
 * `_middleware.ts`; a `false` here simply falls through to the normal gate,
 * which answers 401, so a wrong secret is indistinguishable from no secret.
 */
export function isAdsCronRequest(
  method: string,
  pathname: string,
  header: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const expected = (secret ?? "").trim();
  if (expected.length < MIN_SECRET_LENGTH) return false;
  if (method !== "POST") return false;
  if (pathname !== ADS_CRON_PATH) return false;
  const presented = (header ?? "").trim();
  if (!presented) return false;
  return timingSafeEqual(presented, expected);
}
