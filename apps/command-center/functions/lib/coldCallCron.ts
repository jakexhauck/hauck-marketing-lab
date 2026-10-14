import { MIN_SECRET_LENGTH } from "./adsCron";

// Machine access to the power dialer sync, and nothing else.
//
// Fourth sibling of lib/healthCron.ts, lib/adsCron.ts and lib/calendarCron.ts,
// written to be read beside them. Cloudflare Pages has no cron trigger, so the
// scheduler lives in a separate Worker and calls this app over HTTP, which means
// one more route has to be reachable without an admin cookie.
//
// It gets its OWN path and its OWN secret rather than being added to an existing
// gate. The ads gate's comment explains why: one exact pathname, never a prefix
// and never a list, because a list is the thing somebody widens in a hurry, and
// the route next door reads every credential in the estate.
//
// What the handler behind it writes: `pending` rows in cold_call_dials for calls
// GoHighLevel's phone system has already reported, and, where a prospect is not
// in the book yet, the lead row that call belongs to. Nothing from the request
// body reaches either, because the handler reads no body at all. Its only input
// is GoHighLevel's own conversation history, and the unique index on
// call_message_id means replaying a captured request re-records nothing.
//
// Passing this gate skips session verification. It never sets ctx.data.admin,
// so a caller holding the secret is not an admin and cannot become one.

/** The one route the scheduler may call. Compared with ===, never a prefix. */
export const COLD_CALL_CRON_PATH = "/api/admin/cold-call/sync";

/** The header the scheduler sends the shared secret in. */
export const COLD_CALL_CRON_HEADER = "x-cold-call-cron";

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
 * Every condition has to hold. A `false` falls through to the normal gate,
 * which answers 401, so a wrong secret is indistinguishable from no secret.
 */
export function isColdCallCronRequest(
  method: string,
  pathname: string,
  header: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const expected = (secret ?? "").trim();
  if (expected.length < MIN_SECRET_LENGTH) return false;
  if (method !== "POST") return false;
  if (pathname !== COLD_CALL_CRON_PATH) return false;
  const presented = (header ?? "").trim();
  if (!presented) return false;
  return timingSafeEqual(presented, expected);
}
