import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { ghlJson, type GhlContext } from "./ghl";
import { composioUserId, listSyncableBusy, type SyncableBusyEvent } from "./googleCalendar";

// Pushing a client's real commitments into the calendar their customers book
// into, so a slot they are not free for is never offered.
//
// The direction that does NOT exist here is GoHighLevel's own Google
// integration. That is configured inside GHL, per user, by hand, with no API to
// start it, and using it would mean sending a client into GoHighLevel's UI. So
// we own the sync instead: they link Google once in our app, and this keeps the
// two sides agreeing every fifteen minutes.

// How far ahead to protect. Sixty days is past any estimate a client is booking
// today, and short enough that one sync is a handful of API calls rather than a
// year of a busy diary.
export const SYNC_HORIZON_DAYS = 60;

// The calendar a client's busy time blocks, matched by NAME. Ids are
// per-location, so name matching is what lets the next client work without a
// remap, exactly as clientPipelines.ts matches the agency's Cold Calling board.
//
// "Home Estimate" is the live name on the wired sub-account, alongside Job,
// Phone Appointment and Window Cleaning Service. The looser "estimate" fallback
// catches a client who called theirs "Free Estimate" or "Estimate Visit".
const CALENDAR_NAME_PATTERNS = ["home estimate", "estimate"];

export interface GhlCalendar {
  id: string;
  name?: string;
}

// Exported for tests. Returns null rather than guessing: blocking the wrong
// calendar would quietly strip availability from a service the client sells.
export function pickEstimateCalendar(
  calendars: GhlCalendar[],
  overrideId?: string | null,
): GhlCalendar | null {
  if (overrideId) {
    return calendars.find((c) => c.id === overrideId) ?? null;
  }
  for (const pattern of CALENDAR_NAME_PATTERNS) {
    const hit = calendars.find((c) =>
      String(c.name ?? "")
        .toLowerCase()
        .includes(pattern),
    );
    if (hit) return hit;
  }
  return null;
}

export interface ExistingBlock {
  gcal_event_id: string;
  ghl_block_id: string;
  starts_at: string;
  ends_at: string;
}

export interface BlockPlan {
  create: SyncableBusyEvent[];
  // A meeting that moved: same Google event, different times.
  update: { event: SyncableBusyEvent; blockId: string }[];
  // A meeting that was cancelled, or fell out of the window.
  remove: ExistingBlock[];
}

function sameInstant(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  // Unparseable timestamps are treated as different, which schedules an update.
  // Rewriting a block we did not need to is harmless; skipping one we did is a
  // double booking.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x === y;
}

// Exported for tests, and the only place the sync decides anything.
//
// Pure on purpose: every interesting failure mode here (a moved meeting
// creating a second block, a cancelled one leaving its block behind, our own
// mirrored appointments being blocked on top of themselves) is a diffing bug,
// and a diffing bug is only cheap to find if the diff can be tested without a
// network.
export function planBlocks(
  events: SyncableBusyEvent[],
  existing: ExistingBlock[],
): BlockPlan {
  // Events we put in their Google Calendar by mirroring a GHL appointment are
  // NOT real commitments. Blocking them would block the appointment against
  // itself, and the double-block would compound on every run.
  const real = events.filter((e) => !e.isMirror);

  const byId = new Map(existing.map((b) => [b.gcal_event_id, b]));
  const seen = new Set<string>();

  const create: SyncableBusyEvent[] = [];
  const update: { event: SyncableBusyEvent; blockId: string }[] = [];

  for (const event of real) {
    seen.add(event.id);
    const prior = byId.get(event.id);
    if (!prior) {
      create.push(event);
      continue;
    }
    if (!sameInstant(prior.starts_at, event.start) || !sameInstant(prior.ends_at, event.end)) {
      update.push({ event, blockId: prior.ghl_block_id });
    }
  }

  // Anything we hold a block for that is no longer a real busy event: cancelled,
  // marked free, deleted, or now recognised as one of our own mirrors.
  const remove = existing.filter((b) => !seen.has(b.gcal_event_id));

  return { create, update, remove };
}

// The title a client sees on the blocked slot inside GHL. Deliberately not the
// Google event's own title: the calendar is shared with whoever works their
// account, and "Doctor, 2pm" is not ours to republish.
export const BLOCK_TITLE = "Unavailable";

export interface SyncResult {
  tenantId: string;
  status: "synced" | "not_connected" | "no_calendar" | "unreadable" | "error";
  created: number;
  updated: number;
  removed: number;
  detail?: string;
}

export async function syncTenantCalendar(
  env: Env,
  client: SupabaseClient,
  tenant: {
    id: string;
    slug: string;
    ghl_location_id: string;
    ghl_token: string;
    estimate_calendar_id?: string | null;
  },
  mode: string,
): Promise<SyncResult> {
  const base: SyncResult = { tenantId: tenant.id, status: "synced", created: 0, updated: 0, removed: 0 };
  const userId = composioUserId({ slug: tenant.slug, mode });

  const now = Date.now();
  const events = await listSyncableBusy(env, userId, {
    timeMin: new Date(now).toISOString(),
    timeMax: new Date(now + SYNC_HORIZON_DAYS * 86_400_000).toISOString(),
  });

  // null means the read failed or the client never linked a calendar. Both must
  // leave existing blocks alone: an empty list would read as "they are free"
  // and strip every protection they have.
  if (events === null) return { ...base, status: "not_connected" };

  const gctx: GhlContext = { token: tenant.ghl_token, locationId: tenant.ghl_location_id };

  let calendar: GhlCalendar | null = null;
  try {
    const data = await ghlJson<{ calendars?: GhlCalendar[] }>(
      gctx,
      `/calendars/?locationId=${encodeURIComponent(tenant.ghl_location_id)}`,
    );
    calendar = pickEstimateCalendar(data.calendars ?? [], tenant.estimate_calendar_id);
  } catch (err) {
    return { ...base, status: "unreadable", detail: (err as Error).message };
  }
  if (!calendar) return { ...base, status: "no_calendar" };

  const { data: existingRows } = await client
    .from("gcal_busy_blocks")
    .select("gcal_event_id, ghl_block_id, starts_at, ends_at")
    .eq("tenant_id", tenant.id);

  const plan = planBlocks(events, (existingRows ?? []) as ExistingBlock[]);
  const result = { ...base };

  for (const event of plan.create) {
    try {
      const created = await ghlJson<{ id?: string; event?: { id?: string } }>(
        gctx,
        "/calendars/events/block-slots",
        {
          method: "POST",
          body: JSON.stringify({
            calendarId: calendar.id,
            locationId: tenant.ghl_location_id,
            startTime: event.start,
            endTime: event.end,
            title: BLOCK_TITLE,
          }),
        },
      );
      const blockId = created.id ?? created.event?.id ?? "";
      if (!blockId) continue;
      await client.from("gcal_busy_blocks").upsert(
        {
          tenant_id: tenant.id,
          gcal_event_id: event.id,
          ghl_block_id: blockId,
          ghl_calendar_id: calendar.id,
          starts_at: event.start,
          ends_at: event.end,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,gcal_event_id" },
      );
      result.created += 1;
    } catch (err) {
      // One bad event must not abandon the rest of the diary.
      console.warn("[calendar-sync] block create failed", (err as Error).message);
    }
  }

  for (const { event, blockId } of plan.update) {
    try {
      await ghlJson(gctx, `/calendars/events/block-slots/${encodeURIComponent(blockId)}`, {
        method: "POST",
        body: JSON.stringify({
          calendarId: calendar.id,
          startTime: event.start,
          endTime: event.end,
          title: BLOCK_TITLE,
        }),
      });
      await client
        .from("gcal_busy_blocks")
        .update({
          starts_at: event.start,
          ends_at: event.end,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenant.id)
        .eq("gcal_event_id", event.id);
      result.updated += 1;
    } catch (err) {
      console.warn("[calendar-sync] block update failed", (err as Error).message);
    }
  }

  for (const block of plan.remove) {
    try {
      await ghlJson(gctx, `/calendars/events/${encodeURIComponent(block.ghl_block_id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      // A block already gone from GHL still needs its row dropped, or the sync
      // retries the same delete forever.
      console.warn("[calendar-sync] block delete failed", (err as Error).message);
    }
    await client
      .from("gcal_busy_blocks")
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("gcal_event_id", block.gcal_event_id);
    result.removed += 1;
  }

  return result;
}
