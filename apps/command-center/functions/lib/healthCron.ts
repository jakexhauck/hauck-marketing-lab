// Machine access to the connection health probe, and nothing else.
//
// The control room catches breakage when someone opens it. To catch it at 3am
// the probe has to run unattended, and Cloudflare Pages has no cron trigger, so
// the scheduler lives in a separate Worker and calls this app over HTTP. That
// means one route has to be reachable without an admin cookie, which is the
// single most security-sensitive thing in this whole feature.
//
// The gate is therefore deliberately narrow and stated in one pure function so
// it can be tested exhaustively:
//
//   - ONE exact pathname. Not a prefix, not a startsWith. A prefix rule here
//     would eventually be widened by someone in a hurry, and the route next
//     door reads every credential in the estate.
//   - GET only, and the handler behind it is read-only.
//   - Unset secret means CLOSED, never "everything matches".
//   - A short secret is refused rather than accepted, because this endpoint
//     enumerates exactly what is broken and would be a gift to anyone guessing.
//
// Passing this gate skips session verification. It never sets ctx.data.admin,
// so a caller holding the secret is not an admin and cannot become one: the
// only thing it buys is this one read-only snapshot.

/** The one route the scheduler may call. Compared with ===, never a prefix. */
export const HEALTH_CRON_PATH = "/api/admin/connections/health";

/** The header the scheduler sends the shared secret in. */
export const HEALTH_CRON_HEADER = "x-health-cron";

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
export function isHealthCronRequest(
  method: string,
  pathname: string,
  header: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const expected = (secret ?? "").trim();
  if (expected.length < MIN_SECRET_LENGTH) return false;
  if (method !== "GET") return false;
  if (pathname !== HEALTH_CRON_PATH) return false;
  const presented = (header ?? "").trim();
  if (!presented) return false;
  return timingSafeEqual(presented, expected);
}
