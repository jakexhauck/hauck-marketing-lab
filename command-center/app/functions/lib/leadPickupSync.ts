import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { ghlFetch, ghlJson, type GhlContext } from "./ghl";
import { selectAllPages } from "./pagedSelect";
import { CLAUDE_SMALL_MODEL, writeWithClaude } from "./claude";
import {
  PICKUP_SCHEMA,
  PICKUP_SYSTEM,
  TRANSCRIPT_WAIT_MS,
  durationVerdict,
  isPickupAnswer,
  summarizeTouches,
  type ContactTouches,
  toTouch,
  transcriptText,
  type ExportCall,
  type TouchRow,
} from "./leadPickups";

// Copies a client's calls and inbound texts into lead_touches and decides, per
// outbound call, whether a person picked up. Run by the ads cron
// (api/admin/ads/pickups.ts). See leadPickups.ts for the rules.
//
// Everything here spends Cloudflare subrequests, which are capped per request,
// so the caller hands in one shared budget and each step takes from it. A
// client the budget does not reach is simply first in line next run.

const PAGE_SIZE = 100;
// A first run reads this far back. New clients have nothing older worth having.
const FIRST_RUN_DAYS = 30;

export interface SyncBudget {
  // Cloudflare subrequests left in this request (GHL, Claude and Supabase all count).
  calls: number;
}

export interface TenantTouchResult {
  inserted: number;
  judged: number;
  pending: number;
  stoppedEarly: boolean;
}

interface ExportPage {
  messages?: ExportCall[];
  nextCursor?: string | null;
}

async function exportRange(
  gctx: GhlContext,
  channel: "Call" | "SMS",
  from: string,
  to: string,
  budget: SyncBudget,
): Promise<ExportCall[] | null> {
  const all: ExportCall[] = [];
  let cursor: string | null = null;
  do {
    if (budget.calls <= 0) return null;
    budget.calls -= 1;
    const q = new URLSearchParams({
      locationId: gctx.locationId,
      channel,
      startDate: from,
      endDate: to,
      limit: String(PAGE_SIZE),
    });
    if (cursor) q.set("cursor", cursor);
    const page = await ghlJson<ExportPage>(gctx, `/conversations/messages/export?${q}`);
    const messages = page.messages ?? [];
    all.push(...messages);
    cursor = messages.length === PAGE_SIZE && page.nextCursor ? page.nextCursor : null;
  } while (cursor);
  return all;
}

// The current state of one call, for a row first seen before it finished.
async function fetchCall(gctx: GhlContext, messageId: string): Promise<ExportCall | null> {
  const res = await ghlFetch(gctx, `/conversations/messages/${encodeURIComponent(messageId)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as ExportCall & { message?: ExportCall };
  return body.message ?? body;
}

async function fetchTranscript(gctx: GhlContext, messageId: string): Promise<string> {
  const res = await ghlFetch(
    gctx,
    `/conversations/locations/${encodeURIComponent(gctx.locationId)}/messages/${encodeURIComponent(messageId)}/transcription`,
  );
  // 400 CONVERSATIONS_MSG_RECORDING_NOT_FOUND is the normal answer when
  // recording or transcription is off for the client. Duration takes over.
  if (!res.ok) return "";
  return transcriptText(await res.json());
}

interface PendingRow {
  id: string;
  ghl_message_id: string;
  status: string;
  duration_sec: number | null;
}

async function judge(
  env: Env,
  gctx: GhlContext,
  row: PendingRow,
  budget: SyncBudget,
): Promise<Pick<TouchRow, "picked_up" | "method" | "status" | "duration_sec"> | null> {
  let status = row.status;
  let duration = row.duration_sec;

  if (status !== "completed") {
    if (budget.calls <= 0) return null;
    budget.calls -= 1;
    const fresh = await fetchCall(gctx, row.ghl_message_id);
    status = String(fresh?.status ?? fresh?.meta?.call?.status ?? status).toLowerCase();
    if (typeof fresh?.meta?.call?.duration === "number") duration = fresh.meta.call.duration;
    if (status !== "completed") {
      return { picked_up: false, method: "status", status, duration_sec: duration };
    }
  }

  if (budget.calls <= 0) return null;
  budget.calls -= 1;
  const transcript = await fetchTranscript(gctx, row.ghl_message_id);
  if (transcript && budget.calls > 0) {
    budget.calls -= 1;
    const verdict = await writeWithClaude(env, {
      system: PICKUP_SYSTEM,
      input: `Transcript:\n${transcript}`,
      schema: PICKUP_SCHEMA,
      check: isPickupAnswer,
      maxTokens: 200,
      model: CLAUDE_SMALL_MODEL,
    });
    if (verdict.ok) {
      return { picked_up: verdict.data.picked_up, method: "ai", status, duration_sec: duration };
    }
    // Claude down or refusing: fall through to duration rather than leave the
    // call pending forever.
  }
  return { picked_up: durationVerdict(duration), method: "duration", status, duration_sec: duration };
}

export async function syncTenantTouches(
  env: Env,
  client: SupabaseClient,
  tenantId: string,
  gctx: GhlContext,
  budget: SyncBudget,
  now = Date.now(),
): Promise<TenantTouchResult> {
  const result: TenantTouchResult = { inserted: 0, judged: 0, pending: 0, stoppedEarly: false };

  budget.calls -= 1;
  const { data: state } = await client
    .from("lead_touch_sync")
    .select("synced_through")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  // Five minutes of overlap: a message stamped just before the last run's end
  // can land in the export a moment late. Re-reading it is free (the insert
  // ignores duplicates).
  const fromMs = state?.synced_through
    ? Date.parse(state.synced_through as string) - 5 * 60_000
    : now - FIRST_RUN_DAYS * 86_400_000;
  const from = new Date(fromMs).toISOString();
  const to = new Date(now).toISOString();

  const calls = await exportRange(gctx, "Call", from, to, budget);
  const texts = calls ? await exportRange(gctx, "SMS", from, to, budget) : null;
  if (!calls || !texts) {
    // Ran out mid-read. Nothing is stored and the window is not advanced, so
    // the next run reads the same range again whole.
    result.stoppedEarly = true;
    return result;
  }

  const rows = [
    ...calls.map((m) => toTouch(m, "call")),
    ...texts.map((m) => toTouch(m, "sms")),
  ].filter((r): r is TouchRow => r !== null);

  if (rows.length > 0) {
    budget.calls -= 1;
    const { data: inserted, error } = await client
      .from("lead_touches")
      .upsert(
        rows.map((r) => ({ ...r, tenant_id: tenantId })),
        { onConflict: "tenant_id,ghl_message_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(`lead_touches insert: ${error.message}`);
    result.inserted = inserted?.length ?? 0;
  }

  budget.calls -= 2;
  await client
    .from("lead_touch_sync")
    .upsert({ tenant_id: tenantId, synced_through: to, updated_at: to }, { onConflict: "tenant_id" });

  const { data: pending } = await client
    .from("lead_touches")
    .select("id, ghl_message_id, status, duration_sec")
    .eq("tenant_id", tenantId)
    .is("picked_up", null)
    .lt("occurred_at", new Date(now - TRANSCRIPT_WAIT_MS).toISOString())
    .order("occurred_at", { ascending: true })
    .limit(25);

  for (const row of (pending ?? []) as PendingRow[]) {
    // Each verdict costs up to three calls plus the write.
    if (budget.calls < 4) {
      result.stoppedEarly = true;
      break;
    }
    const verdict = await judge(env, gctx, row, budget);
    if (!verdict) {
      result.stoppedEarly = true;
      break;
    }
    budget.calls -= 1;
    await client
      .from("lead_touches")
      .update({ ...verdict, checked_at: new Date().toISOString() })
      .eq("id", row.id);
    result.judged += 1;
  }
  result.pending = Math.max(0, (pending?.length ?? 0) - result.judged);
  return result;
}

// Every touch a client has, reduced to one called / picked-up pair per contact
// for the dashboard. Paged: a plain select stops at 1000 rows without a word.
export async function loadContactTouches(
  client: SupabaseClient,
  tenantId: string,
): Promise<Map<string, ContactTouches>> {
  const rows = await selectAllPages<Record<string, unknown>>((from, to) =>
    client
      .from("lead_touches")
      .select("id, ghl_contact_id, kind, direction, picked_up")
      .eq("tenant_id", tenantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return summarizeTouches(
    rows.map((r) => ({
      ghl_contact_id: String(r.ghl_contact_id ?? ""),
      kind: r.kind === "sms" ? "sms" : "call",
      direction: r.direction === "inbound" ? "inbound" : "outbound",
      picked_up: typeof r.picked_up === "boolean" ? r.picked_up : null,
    })),
  );
}
