import type { SupabaseClient } from "@supabase/supabase-js";
import { manualStatusOrDefault, type ManualLeadStatus } from "./leadStatus";

// Reading and writing what a client typed on their own lead tracker: the status
// (lead_status) and the value of a job they closed (customer_jobs, marked
// entered_from='lead_tracker').
//
// Only ever used on a tenant with tenants.manual_lead_status. See 0102 and
// docs/build-plans/willis-manual-lead-status.md.
//
// The pure helpers here are separated from the queries so the rules that matter
// (what counts as a valid amount, what an untouched lead reads as) are testable
// without a database.

// The label written on a job typed from the tracker row. It appears on the
// customer's own page beside close-out jobs, so it says where it came from
// rather than inventing a description of work nobody described.
export const TRACKER_JOB_DESCRIPTION = "Completed job";
export const TRACKER_JOB_SOURCE = "lead_tracker";

// $1,000,000. Not a business rule, a fat-finger guard: the field takes dollars
// and writes cents, so one stray keystroke is the difference between a $450 job
// and a $45,000 one, and revenue and ROAS are computed straight off this.
export const MAX_JOB_VALUE_CENTS = 100_000_000;

export type JobValueError = "not_a_number" | "negative" | "too_large";

// dollars (what the owner types) -> cents (what the ledger stores). Returns
// null for an empty field, which means "clear the value", not "zero".
export function parseJobValue(
  input: unknown,
): { cents: number | null } | { error: JobValueError } {
  if (input === null || input === undefined || input === "") return { cents: null };

  const n = typeof input === "number" ? input : Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return { error: "not_a_number" };
  if (n < 0) return { error: "negative" };

  const cents = Math.round(n * 100);
  if (cents > MAX_JOB_VALUE_CENTS) return { error: "too_large" };
  return { cents };
}

export interface ManualLeadRow {
  status: ManualLeadStatus;
  jobValueCents: number | null;
}

// Every typed status for one tenant, keyed by GHL contact id. Absent contacts
// are not in the map at all; callers resolve that to New via
// manualStatusOrDefault, so "untouched" and "explicitly New" stay the same
// thing and neither needs a row.
export async function loadManualStatuses(
  client: SupabaseClient,
  tenantId: string,
): Promise<Map<string, ManualLeadStatus>> {
  const out = new Map<string, ManualLeadStatus>();
  const { data, error } = await client
    .from("lead_status")
    .select("contact_id, status")
    .eq("tenant_id", tenantId);
  if (error) {
    // A tracker that renders every lead as New is wrong but usable. One that
    // fails to render is not, and this is a read on the client's main screen.
    console.warn("[manualStatusStore] status read failed", error.message);
    return out;
  }
  for (const row of (data ?? []) as { contact_id: string; status: string }[]) {
    if (row.contact_id) out.set(row.contact_id, manualStatusOrDefault(row.status));
  }
  return out;
}

// The job values typed on tracker rows, keyed by contact. Deliberately NOT
// every customer_jobs row: a close-out or a hand-added backfill belongs to the
// customer's page, and showing it in the tracker's editable cell would invite
// an owner to overwrite a number they did not put there.
export async function loadTrackerJobValues(
  client: SupabaseClient,
  tenantId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await client
    .from("customer_jobs")
    .select("ghl_contact_id, value_cents")
    .eq("tenant_id", tenantId)
    .eq("entered_from", TRACKER_JOB_SOURCE);
  if (error) {
    console.warn("[manualStatusStore] job value read failed", error.message);
    return out;
  }
  for (const row of (data ?? []) as { ghl_contact_id: string; value_cents: number }[]) {
    if (row.ghl_contact_id) out.set(row.ghl_contact_id, row.value_cents ?? 0);
  }
  return out;
}

export async function saveManualStatus(
  client: SupabaseClient,
  tenantId: string,
  contactId: string,
  status: ManualLeadStatus,
  setBy: string | null,
): Promise<{ error: string | null }> {
  const { error } = await client.from("lead_status").upsert(
    {
      tenant_id: tenantId,
      contact_id: contactId,
      status,
      set_by: setBy,
      set_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,contact_id" },
  );
  return { error: error?.message ?? null };
}

// Write, update or clear the tracker's job row for one contact.
//
// Update in place rather than insert: an owner correcting $450 to $540 means
// the job was worth $540, not that they did two jobs. The partial unique index
// in 0102 makes that guarantee at the database rather than trusting this code.
export async function saveTrackerJobValue(
  client: SupabaseClient,
  tenantId: string,
  contactId: string,
  cents: number | null,
  completedOn: string,
  createdBy: string | null,
): Promise<{ error: string | null }> {
  if (cents === null) {
    const { error } = await client
      .from("customer_jobs")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("ghl_contact_id", contactId)
      .eq("entered_from", TRACKER_JOB_SOURCE);
    return { error: error?.message ?? null };
  }

  const { data: existing } = await client
    .from("customer_jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("ghl_contact_id", contactId)
    .eq("entered_from", TRACKER_JOB_SOURCE)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await client
      .from("customer_jobs")
      .update({ value_cents: cents, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await client.from("customer_jobs").insert({
    tenant_id: tenantId,
    ghl_contact_id: contactId,
    description: TRACKER_JOB_DESCRIPTION,
    value_cents: cents,
    completed_on: completedOn,
    entered_from: TRACKER_JOB_SOURCE,
    created_by: createdBy,
  });
  return { error: error?.message ?? null };
}
