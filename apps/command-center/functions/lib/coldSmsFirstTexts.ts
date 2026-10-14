// The day each cold SMS prospect was first texted (0159).
//
// GHL stamps the opportunity and the conversation at IMPORT, and a batch
// imported in the afternoon is often texted the next morning, so neither date
// is the day the text went out. The earliest OUTBOUND message is, and GHL's
// message export lists every message by day with its contact. This walks that
// export forward from the last day it finished and keeps each contact's first
// sighting.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ghlJson, type GhlContext } from "./ghl";

const PAGE = 500;
// Before the first cold text went out. A fresh table backfills from here.
const START_DAY = "2026-09-01";

interface ExportMessage {
  contactId?: string;
  direction?: string;
  dateAdded?: string;
}

interface ExportPage {
  messages?: ExportMessage[];
  nextCursor?: string | null;
  total?: number;
}

export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Each contact's earliest outbound message in a batch of export rows. Pure.
export function earliestOutbound(messages: ExportMessage[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of messages) {
    if (m.direction !== "outbound" || !m.contactId || !m.dateAdded) continue;
    const t = +new Date(m.dateAdded);
    if (!Number.isFinite(t)) continue;
    const have = out.get(m.contactId);
    if (!have || t < +new Date(have)) out.set(m.contactId, new Date(t).toISOString());
  }
  return out;
}

// Reads the export forward from synced_until (0160) in windows of at most a day,
// a page budget at a time. The watermark moves only past a window read to its
// last page, so a short read is retried rather than skipped. Ten minutes of
// overlap covers a text GHL stamps a moment late; a contact already on file is
// left alone, so the overlap can never move a first text later.
const WINDOW = 24 * 60 * 60 * 1000;
const OVERLAP = 10 * 60 * 1000;

export async function syncFirstTexts(
  db: SupabaseClient,
  agency: GhlContext,
  opts: { pages: number; now?: number },
): Promise<{ added: number; caughtUp: boolean }> {
  const now = opts.now ?? Date.now();
  const { data: state } = await db.from("cold_sms_sync_state").select("synced_until").eq("id", true).maybeSingle();
  let from = state?.synced_until ? +new Date(String(state.synced_until)) - OVERLAP : +new Date(`${START_DAY}T00:00:00.000Z`);

  let pages = opts.pages;
  let added = 0;
  let readTo: number | null = null;

  while (from < now && pages > 0) {
    const to = Math.min(now, from + WINDOW);
    const firsts = new Map<string, string>();
    let cursor: string | null = null;
    let complete = false;
    do {
      if (pages <= 0) break;
      pages -= 1;
      const q = new URLSearchParams({
        locationId: agency.locationId,
        channel: "SMS",
        startDate: new Date(from).toISOString(),
        endDate: new Date(to).toISOString(),
        limit: String(PAGE),
      });
      if (cursor) q.set("cursor", cursor);
      const page: ExportPage = await ghlJson<ExportPage>(agency, `/conversations/messages/export?${q}`);
      const rows = page.messages ?? [];
      for (const [id, at] of earliestOutbound(rows)) {
        const have = firsts.get(id);
        if (!have || at < have) firsts.set(id, at);
      }
      cursor = rows.length === PAGE && page.nextCursor ? page.nextCursor : null;
      if (!cursor) complete = true;
    } while (cursor);

    // Insert-if-absent: a contact already on file was texted earlier.
    const rows = [...firsts].map(([contact_id, first_text_at]) => ({ contact_id, first_text_at }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error, count } = await db
        .from("cold_sms_first_texts")
        .upsert(rows.slice(i, i + 500), { onConflict: "contact_id", ignoreDuplicates: true, count: "exact" });
      if (error) throw new Error(`cold_sms_first_texts write failed: ${error.message}`);
      added += count ?? 0;
    }

    if (!complete) break;
    readTo = to;
    from = to;
  }

  if (readTo !== null) {
    await db
      .from("cold_sms_sync_state")
      .upsert({ id: true, synced_until: new Date(readTo).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "id" });
  }
  return { added, caughtUp: readTo !== null && readTo >= now };
}

// contactId -> first text time, for the cards on screen.
export async function loadFirstTexts(db: SupabaseClient, contactIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(contactIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db
      .from("cold_sms_first_texts")
      .select("contact_id, first_text_at")
      .in("contact_id", ids.slice(i, i + 150));
    if (error) throw new Error(`cold_sms_first_texts read failed: ${error.message}`);
    for (const r of (data ?? []) as { contact_id: string; first_text_at: string }[]) out.set(r.contact_id, r.first_text_at);
  }
  return out;
}

// Every contact first texted between two instants. Paged by range because a
// PostgREST read silently stops at 1000 rows and a busy day is more than that.
export async function contactsTextedBetween(db: SupabaseClient, startIso: string, endIso: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("cold_sms_first_texts")
      .select("contact_id, first_text_at")
      .gte("first_text_at", startIso)
      .lt("first_text_at", endIso)
      .order("contact_id")
      .range(from, from + 999);
    if (error) throw new Error(`cold_sms_first_texts read failed: ${error.message}`);
    const rows = (data ?? []) as { contact_id: string; first_text_at: string }[];
    for (const r of rows) out.set(r.contact_id, r.first_text_at);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function firstTextDays(db: SupabaseClient, tz: string): Promise<{ day: string; texted: number }[]> {
  const { data, error } = await db.rpc("cold_sms_first_text_days", { tz });
  if (error) throw new Error(`cold_sms_first_text_days failed: ${error.message}`);
  return ((data ?? []) as { day: string; texted: number | string }[]).map((r) => ({ day: String(r.day), texted: Number(r.texted) }));
}

// Midnight-to-midnight of a calendar day in a zone, as UTC instants.
export function zoneDayRange(day: string, zone: string): { start: string; end: string } {
  const [y, m, d] = day.split("-").map(Number);
  const at = (yy: number, mm: number, dd: number) => {
    const wall = Date.UTC(yy, mm - 1, dd);
    let ms = wall;
    for (let i = 0; i < 2; i++) {
      const p = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
      }).formatToParts(new Date(ms));
      const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
      ms += wall - Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    }
    return ms;
  };
  const start = at(y, m, d);
  const end = at(y, m, d + 1);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}
