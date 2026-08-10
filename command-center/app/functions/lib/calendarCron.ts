import { MIN_SECRET_LENGTH } from "./adsCron";

// Machine access to the Google Calendar sync, and nothing else.
//
// Third sibling of lib/healthCron.ts and lib/adsCron.ts, written to be read
// beside them. Cloudflare Pages has no cron trigger, so the scheduler lives in
// a separate Worker and calls this app over HTTP, which means one more route
// has to be reachable without an admin cookie.
//
// It gets its OWN path and its OWN secret rather than being added to the ads
// gate. That gate's own comment explains why: one exact pathname, never a
// prefix and never a list, because a list is the thing somebody widens in a
// hurry, and the route next door reads every credential in the estate.
//
// What the handler behind it writes: blocked slots in a client's GoHighLevel
// calendar, and rows in gcal_busy_blocks. Nothing from the request body reaches
// either, because the handler reads no body at all. Its only input is the
// client's own Google Calendar, so replaying a captured request re-runs the
// same diff and converges on the same state rather than duplicating anything.
//
// Passing this gate skips session verification. It never sets ctx.data.admin,
// so a caller holding the secret is not an admin and cannot become one.

/** The one route the scheduler may call. Compared with ===, never a prefix. */
export const CALENDAR_CRON_PATH = "/api/admin/calendar/sync";

/** The header the scheduler sends the shared secret in. */
export const CALENDAR_CRON_HEADER = "x-calendar-cron";

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
export function isCalendarCronRequest(
  method: string,
  pathname: string,
  header: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const expected = (secret ?? "").trim();
  if (expected.length < MIN_SECRET_LENGTH) return false;
  if (method !== "POST") return false;
  if (pathname !== CALENDAR_CRON_PATH) return false;
  const presented = (header ?? "").trim();
  if (!presented) return false;
  return timingSafeEqual(presented, expected);
}
