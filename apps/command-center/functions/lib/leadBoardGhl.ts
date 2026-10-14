// GHL side of the Leads board: finding the board pipeline, and the four contact
// fields that carry a booking's date to GHL so a "Custom Date Reminder"
// workflow can text the customer. The app is the source of truth for bookings;
// GHL only ever receives a copy.
//
// Fields are found BY NAME and created when missing, so setting up a client is
// "load the snapshot, link it" and nobody adds fields by hand.

import { ghlFetch, ghlJson, type GhlContext } from "./ghl";
import { resolveBoardPipeline, type BoardPipeline, type BookingKind } from "./leadBoard";

interface PipelinesResponse {
  pipelines?: { id: string; name: string; stages?: { id: string; name: string; position?: number; color?: string }[] }[];
}

export async function loadBoardPipeline(gctx: GhlContext): Promise<BoardPipeline | null> {
  const data = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  return resolveBoardPipeline(data.pipelines ?? []);
}

export const BOOKING_FIELDS: Record<BookingKind, { date: string; time: string }> = {
  estimate: { date: "Estimate Date", time: "Estimate Time" },
  job: { date: "Job Date", time: "Job Time" },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

interface FieldDef {
  id: string;
  name?: string;
}

// Field ids by name, per location. Short-lived: a field created a moment ago
// must be found on the next write, and ids never change once made.
const fieldCache = new Map<string, { ids: Map<string, string>; expiresAt: number }>();

// Make sure all four booking fields exist on the location; return their ids by
// normalised name.
//
// The Marketplace app holds locations/customFields.write but NOT .readonly, so
// it cannot list fields. It does not need to: creating a field that already
// exists answers 400 with meta.existingId (verified on Test v2, 2026-10-08), so
// "create" is also "find". Safe to repeat, which is why it may retry.
export async function ensureBookingFields(gctx: GhlContext): Promise<Map<string, string>> {
  const hit = fieldCache.get(gctx.locationId);
  if (hit && hit.expiresAt > Date.now()) return hit.ids;

  const loc = encodeURIComponent(gctx.locationId);
  const wanted: { name: string; dataType: "DATE" | "TEXT" }[] = [];
  for (const k of ["estimate", "job"] as BookingKind[]) {
    wanted.push({ name: BOOKING_FIELDS[k].date, dataType: "DATE" });
    wanted.push({ name: BOOKING_FIELDS[k].time, dataType: "TEXT" });
  }

  const ids = new Map<string, string>();
  for (const w of wanted) {
    const res = await ghlFetch(
      gctx,
      `/locations/${loc}/customFields`,
      { method: "POST", body: JSON.stringify({ name: w.name, dataType: w.dataType, model: "contact" }) },
      { idempotentPost: true },
    );
    const body = (await res.json().catch(() => null)) as
      | { customField?: FieldDef; meta?: { existingId?: string } }
      | null;
    const id = body?.customField?.id ?? body?.meta?.existingId;
    if (id) ids.set(norm(w.name), id);
    else console.warn(`[pipeline-board] could not create or find field "${w.name}" (${res.status})`);
  }

  if (ids.size === wanted.length) {
    fieldCache.set(gctx.locationId, { ids, expiresAt: Date.now() + 60 * 60_000 });
  }
  return ids;
}

// "2026-10-10" and "10:30 AM" for an instant, in the client's zone.
export function bookingFieldValues(startsAt: string, zone: string): { date: string; time: string } {
  const d = new Date(startsAt);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(d);
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time };
}

// Copy a booking's date + time onto the contact. Best effort: the booking is
// already saved in the app; a failed copy only costs the reminder text, so it
// is logged and never fails the move.
export async function copyBookingToContact(
  gctx: GhlContext,
  contactId: string,
  kind: BookingKind,
  startsAt: string,
  zone: string,
): Promise<boolean> {
  try {
    const ids = await ensureBookingFields(gctx);
    const dateId = ids.get(norm(BOOKING_FIELDS[kind].date));
    const timeId = ids.get(norm(BOOKING_FIELDS[kind].time));
    if (!dateId || !timeId) return false;
    const v = bookingFieldValues(startsAt, zone);
    await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}`, {
      method: "PUT",
      body: JSON.stringify({ customFields: [{ id: dateId, value: v.date }, { id: timeId, value: v.time }] }),
    });
    return true;
  } catch (e) {
    console.warn("[pipeline-board] booking copy to contact failed", e);
    return false;
  }
}
