// Supabase side of the Leads board (0150): bookings, follow-ups, outcomes, and
// the won amount into customer_jobs (which Revenue and ROAS already read).
// Every write is scoped by tenant_id; the endpoints resolve it from the session.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingKind, LostReason, MovePlan } from "./leadBoard";

export interface TenantBoardRow {
  id: string;
  zone: string;
}

export async function loadTenantForBoard(
  client: SupabaseClient,
  slug: string,
  fallbackZone: string,
): Promise<TenantBoardRow | null> {
  const { data } = await client.from("tenants").select("id, meta_timezone").eq("slug", slug).maybeSingle();
  if (!data) return null;
  return { id: data.id as string, zone: (data.meta_timezone as string | null) || fallbackZone };
}

export interface BoardRows {
  bookings: { ghl_opportunity_id: string; kind: BookingKind; starts_at: string }[];
  followups: { ghl_opportunity_id: string; due_at: string; note: string }[];
  outcomes: { ghl_opportunity_id: string; lost_reason: LostReason | null; attempts: number }[];
}

export async function loadBoardRows(client: SupabaseClient, tenantId: string): Promise<BoardRows> {
  const [b, f, o] = await Promise.all([
    client
      .from("lead_bookings")
      .select("ghl_opportunity_id, kind, starts_at")
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled"),
    client
      .from("lead_followups")
      .select("ghl_opportunity_id, due_at, note")
      .eq("tenant_id", tenantId)
      .is("done_at", null),
    client.from("lead_outcomes").select("ghl_opportunity_id, lost_reason, attempts").eq("tenant_id", tenantId),
  ]);
  return {
    bookings: (b.data ?? []) as BoardRows["bookings"],
    followups: (f.data ?? []) as BoardRows["followups"],
    outcomes: (o.data ?? []) as BoardRows["outcomes"],
  };
}

interface Who {
  tenantId: string;
  opportunityId: string;
  contactId: string | null;
  by: string | null;
  zone: string;
}

// The local calendar date of an instant in a zone, "YYYY-MM-DD".
function zonedDate(ms: number, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function check(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}

// Apply an ok plan's app-side writes. Called only after the GHL stage move
// succeeded, so the app never records a move GHL refused.
export async function applyPlanWrites(
  client: SupabaseClient,
  who: Who,
  plan: Extract<MovePlan, { ok: true }>,
): Promise<void> {
  const now = new Date().toISOString();
  const scope = { tenant_id: who.tenantId, ghl_opportunity_id: who.opportunityId };

  if (plan.closeBookings.length > 0) {
    await check(
      "close bookings",
      client
        .from("lead_bookings")
        .update({ status: "done", updated_at: now })
        .match(scope)
        .eq("status", "scheduled")
        .in("kind", plan.closeBookings),
    );
  }

  if (plan.booking) {
    // Reschedule = the same scheduled row with a new time.
    const { data: open } = await client
      .from("lead_bookings")
      .select("id")
      .match(scope)
      .eq("kind", plan.booking.kind)
      .eq("status", "scheduled")
      .maybeSingle();
    if (open) {
      await check(
        "reschedule",
        client.from("lead_bookings").update({ starts_at: plan.booking.startsAt, updated_at: now }).eq("id", open.id),
      );
    } else {
      await check(
        "book",
        client.from("lead_bookings").insert({
          ...scope,
          ghl_contact_id: who.contactId,
          kind: plan.booking.kind,
          starts_at: plan.booking.startsAt,
          source: "app",
          created_by: who.by,
        }),
      );
    }
  }

  if (plan.closeFollowUp) {
    await check(
      "close follow-up",
      client.from("lead_followups").update({ done_at: now }).match(scope).is("done_at", null),
    );
  }

  if (plan.followUp) {
    const { data: open } = await client
      .from("lead_followups")
      .select("id")
      .match(scope)
      .is("done_at", null)
      .maybeSingle();
    if (open) {
      await check(
        "update follow-up",
        client.from("lead_followups").update({ due_at: plan.followUp.dueAt, note: plan.followUp.note }).eq("id", open.id),
      );
    } else {
      await check(
        "follow-up",
        client.from("lead_followups").insert({
          ...scope,
          ghl_contact_id: who.contactId,
          due_at: plan.followUp.dueAt,
          note: plan.followUp.note,
          created_by: who.by,
        }),
      );
    }
  }

  if (plan.lostReason) {
    await check(
      "lost reason",
      client.from("lead_outcomes").upsert({ ...scope, lost_reason: plan.lostReason, updated_at: now }),
    );
  }

  if (plan.wonValue && who.contactId) {
    // One customer_jobs row per won opportunity: re-marking Won corrects the
    // amount instead of counting the job twice in Revenue.
    const valueCents = Math.round(plan.wonValue * 100);
    const { data: existing } = await client
      .from("customer_jobs")
      .select("id")
      .eq("tenant_id", who.tenantId)
      .eq("source_opportunity_id", who.opportunityId)
      .maybeSingle();
    if (existing) {
      await check(
        "won amount",
        client.from("customer_jobs").update({ value_cents: valueCents, updated_at: now }).eq("id", existing.id),
      );
    } else {
      await check(
        "won job",
        client.from("customer_jobs").insert({
          tenant_id: who.tenantId,
          ghl_contact_id: who.contactId,
          description: "Won",
          value_cents: valueCents,
          completed_on: zonedDate(Date.now(), who.zone),
          source_opportunity_id: who.opportunityId,
          created_by: who.by,
        }),
      );
    }
  }
}

// +1 call attempt; returns the new count.
export async function bumpAttempts(client: SupabaseClient, tenantId: string, opportunityId: string): Promise<number> {
  const { data } = await client
    .from("lead_outcomes")
    .select("attempts")
    .eq("tenant_id", tenantId)
    .eq("ghl_opportunity_id", opportunityId)
    .maybeSingle();
  const attempts = ((data?.attempts as number | undefined) ?? 0) + 1;
  await check(
    "attempts",
    client.from("lead_outcomes").upsert({
      tenant_id: tenantId,
      ghl_opportunity_id: opportunityId,
      attempts,
      updated_at: new Date().toISOString(),
    }),
  );
  return attempts;
}

export { zonedDate };
