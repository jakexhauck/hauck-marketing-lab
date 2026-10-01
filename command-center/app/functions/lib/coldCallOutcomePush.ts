import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { pushColdCallOutcome, type LeadForPush } from "./agencyCrm";

// The GoHighLevel half of recording a cold call outcome: tags, the callback
// task, and off the dialer's list. Shared by the app's buttons
// (api/admin/cold-call/dials.ts) and GoHighLevel's own dispositions
// (api/crm/call-disposition.ts), so a prospect judged either way is tagged the
// same way.

export interface LeadPushSummary {
  ok: boolean;
  error: string | null;
}

// Look the lead up, push it, and record what happened on the row itself.
export async function pushLead(
  env: Env,
  client: SupabaseClient | null,
  leadId: string,
  outcome: string,
  followUpDate: string | null,
  followUpTime: string | null,
): Promise<LeadPushSummary | null> {
  if (!client) return null;

  const { data } = await client
    .from("leads")
    .select("id, first_name, last_name, phone, email, source, ghl_contact_id, business_name, website")
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;

  const row = data as Record<string, string | null>;
  const lead: LeadForPush = {
    id: row.id as string,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    source: row.source ?? "",
    businessName: row.business_name ?? "",
    website: row.website ?? "",
    ghlContactId: row.ghl_contact_id,
  };

  const result = await pushColdCallOutcome(env, {
    lead,
    outcome,
    attempt: outcome === "no_answer" ? await countNoAnswers(client, leadId) : 1,
    followUpDate,
    followUpTime,
  });

  // The account not being connected is not a failure to report on the lead: it
  // is a state of the whole install, and stamping every prospect with it would
  // be noise on 44 rows all saying the same thing.
  if (result.notConfigured) return null;

  await client
    .from("leads")
    .update({
      ghl_contact_id: result.contactId,
      // Only a clean push counts as synced; a half-push (contact made, tags
      // refused) leaves the old timestamp so it still reads as out of date.
      ...(result.ok ? { ghl_synced_at: new Date().toISOString() } : {}),
      ghl_error: result.error,
    })
    .eq("id", leadId);

  return { ok: result.ok, error: result.error };
}

// How many times this prospect has gone unanswered, including the dial just
// written. Counted from cold_call_dials rather than the lead's own no_answer
// column: that column is written by a separate request racing this one, and the
// tag it would pick is the difference between day 1 and day 2 follow-up.
//
// A failed count falls back to 1, which tags day 1: repeating the first day of a
// sequence is recoverable, skipping to day 2 on a first call is not.
async function countNoAnswers(
  client: SupabaseClient,
  leadId: string,
): Promise<number> {
  const { count, error } = await client
    .from("cold_call_dials")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("outcome", "no_answer");
  if (error || count === null) return 1;
  return Math.max(1, count);
}
