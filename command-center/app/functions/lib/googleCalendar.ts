import type { Env } from "./env";
import {
  composioConfigured,
  deleteConnectedAccount,
  executeTool,
  listConnectedAccounts,
  proxyCall,
} from "./composio";

// Google Calendar semantics on top of the Composio transport.
//
// The client links their own calendar from the Jobs page; Composio holds the
// resulting token keyed by the tenant id it was linked under. That is what
// gives per-client isolation without a credentials table on our side.
//
// The CLIENT-facing routes read availability only (anonymous "Busy" blocks).
// The admin Setter Suite route reads event titles too (getBusyEvents below),
// a deliberate distinction: the setter working the client's calendar needs to
// know WHAT is blocking a slot; the client's own customers never do.

export interface BusyInterval {
  start: string;
  end: string;
}

export interface BusyEvent extends BusyInterval {
  title: string;
}

export interface GcalConnection {
  connected: boolean;
  accountId: string | null;
  status: string;
}

const FREE_SLOTS_TOOL = "GOOGLECALENDAR_FIND_FREE_SLOTS";

// The key a client's Google grant is stored under in Composio.
//
// TenantContext deliberately carries no row id, only slug + mode, and mixing
// the two modes is exactly the test/live bleed that env.ts warns about. So the
// mode is part of the key: a client's test workspace must never resolve to the
// calendar their live workspace linked, and vice versa.
export function composioUserId(tenant: { slug: string; mode: string }): string {
  return `${tenant.mode}:${tenant.slug}`;
}

// Composio's status enum has seven values; only ACTIVE can execute tools.
const ACTIVE = "ACTIVE";

// An absent or broken connection is a normal state, not a failure: most clients
// will not have linked anything. This must never throw, or the Jobs tab breaks
// for everyone who has not opted in.
export async function getConnection(env: Env, tenantId: string): Promise<GcalConnection> {
  if (!composioConfigured(env)) {
    return { connected: false, accountId: null, status: "not_configured" };
  }
  try {
    const accounts = await listConnectedAccounts(env, tenantId);
    const active = accounts.find((a) => a.status === ACTIVE);
    if (active) return { connected: true, accountId: active.id, status: ACTIVE };

    // A half-finished or expired link: report it so the UI can offer a retry
    // rather than pretending the client never started.
    const first = accounts[0];
    if (first) return { connected: false, accountId: first.id, status: first.status };

    return { connected: false, accountId: null, status: "none" };
  } catch {
    return { connected: false, accountId: null, status: "error" };
  }
}

// Unlink drops every account for this tenant, including stale non-ACTIVE ones,
// so a retry after a failed link starts from clean state.
export async function disconnect(env: Env, tenantId: string): Promise<void> {
  const accounts = await listConnectedAccounts(env, tenantId);
  for (const a of accounts) {
    await deleteConnectedAccount(env, a.id);
  }
}

// Exported for tests. The tool's payload nesting is the least stable part of
// this integration, so it is isolated here and tolerant of shape drift: an
// unreadable response means "no busy time known", never a crash.
export function parseBusy(raw: unknown): BusyInterval[] {
  const root = raw as { response_data?: unknown; calendars?: unknown } | null;
  const wrapper = (root?.response_data ?? root) as { calendars?: unknown } | null;
  const calendars = wrapper?.calendars;
  if (!calendars || typeof calendars !== "object") return [];

  const out: BusyInterval[] = [];
  for (const entry of Object.values(calendars as Record<string, { busy?: unknown }>)) {
    const busy = entry?.busy;
    if (!Array.isArray(busy)) continue;
    for (const b of busy) {
      const start = (b as BusyInterval)?.start;
      const end = (b as BusyInterval)?.end;
      if (typeof start === "string" && typeof end === "string") out.push({ start, end });
    }
  }
  return out;
}

export async function getBusy(
  env: Env,
  tenantId: string,
  opts: { timeMin: string; timeMax: string; timezone: string },
): Promise<BusyInterval[]> {
  const conn = await getConnection(env, tenantId);
  if (!conn.connected) return [];
  try {
    const raw = await executeTool(env, FREE_SLOTS_TOOL, tenantId, {
      items: ["primary"],
      time_min: opts.timeMin,
      time_max: opts.timeMax,
      timezone: opts.timezone,
    });
    return parseBusy(raw);
  } catch {
    // Composio shares a rate-limit quota across all its customers on managed
    // auth, so a throttled read is a real possibility. Degrade to no busy time
    // rather than failing the calendar.
    return [];
  }
}

// Exported for tests. Tolerant of the same response-shape drift as parseBusy:
// Composio sometimes wraps the payload in response_data. Only timed events
// count (all-day events have `date`, not `dateTime`; the interval grid cannot
// place them, and the freebusy fallback still covers the hours they block).
// Cancelled and "transparent" (marked-free) events are skipped, matching what
// freebusy would report.
export function parseBusyEvents(raw: unknown): BusyEvent[] {
  const root = raw as { response_data?: unknown; items?: unknown } | null;
  const wrapper = (root?.response_data ?? root) as { items?: unknown } | null;
  const items = wrapper?.items;
  if (!Array.isArray(items)) return [];

  const out: BusyEvent[] = [];
  for (const item of items) {
    const ev = item as {
      status?: string;
      transparency?: string;
      summary?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    } | null;
    if (!ev || ev.status === "cancelled" || ev.transparency === "transparent") continue;
    const start = ev.start?.dateTime;
    const end = ev.end?.dateTime;
    if (typeof start !== "string" || typeof end !== "string") continue;
    out.push({ start, end, title: typeof ev.summary === "string" ? ev.summary.trim() : "" });
  }
  return out;
}

// Busy time WITH titles, for the admin Setter Suite calendar. Same never-throw
// contract as getBusy: an empty array is the only failure mode, and the caller
// falls back to the anonymous freebusy read so the grid never quietly loses
// its blocked hours.
export async function getBusyEvents(
  env: Env,
  tenantUserId: string,
  opts: { timeMin: string; timeMax: string },
): Promise<BusyEvent[]> {
  const conn = await getConnection(env, tenantUserId);
  if (!conn.connected) return [];
  try {
    const raw = await executeTool(env, "GOOGLECALENDAR_EVENTS_LIST", tenantUserId, {
      calendarId: "primary",
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });
    return parseBusyEvents(raw);
  } catch {
    return [];
  }
}

// --- Mirroring app bookings into the client's calendar ----------------------

// Our marker on a mirrored event, so a reschedule moves the original rather
// than creating a second one.
//
// This has to go through the raw provider proxy: no Composio Google Calendar
// write tool exposes extendedProperties, though EVENTS_LIST can filter on it.
// The alternative would be storing a mapping table, which this build avoids.
const APPT_KEY = "hmlAppointmentId";

export interface MirrorInput {
  appointmentId: string;
  title: string;
  startIso: string;
  endIso: string;
  location?: string;
}

// Best effort by design. The booking has already succeeded in the system of
// record by the time this runs, and most clients will not have linked a
// calendar at all, so every failure path here is silent to the caller.
export async function mirrorAppointment(
  env: Env,
  tenantUserId: string,
  appt: MirrorInput,
): Promise<{ mirrored: boolean }> {
  const conn = await getConnection(env, tenantUserId);
  if (!conn.connected || !conn.accountId) return { mirrored: false };

  const body = {
    summary: appt.title,
    ...(appt.location ? { location: appt.location } : {}),
    start: { dateTime: appt.startIso },
    end: { dateTime: appt.endIso },
    extendedProperties: { private: { [APPT_KEY]: appt.appointmentId } },
  };

  let existingId = "";
  try {
    const found = await executeTool<{ items?: { id?: string }[] }>(
      env,
      "GOOGLECALENDAR_EVENTS_LIST",
      tenantUserId,
      {
        calendarId: "primary",
        privateExtendedProperty: `${APPT_KEY}=${appt.appointmentId}`,
        maxResults: 1,
      },
    );
    existingId = found?.items?.[0]?.id ?? "";
  } catch {
    // Lookup failure falls through to create. A duplicate event is a much
    // smaller problem than a booking that never reaches the client's calendar.
  }

  try {
    await proxyCall(env, {
      connectedAccountId: conn.accountId,
      endpoint: existingId
        ? `/calendars/primary/events/${encodeURIComponent(existingId)}`
        : "/calendars/primary/events",
      method: existingId ? "PATCH" : "POST",
      body,
    });
    return { mirrored: true };
  } catch {
    return { mirrored: false };
  }
}
