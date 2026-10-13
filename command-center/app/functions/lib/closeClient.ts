import type { SupabaseClient } from "@supabase/supabase-js";
import { createTenantWithOwner, seedOnboardingRecord } from "./clientCreate";
import { CHECKLIST_TASKS } from "../../src/lib/onboarding";
import { mintResumeToken } from "./intake";
import { splitName, trackerPrefill } from "./pendingClients";
import { BILLING_COLUMNS, toBillingDto } from "./clientBilling";
import { PENDING_COLUMNS, type PendingRow } from "./pendingClientsStore";

// A deal closed in Sales Data becomes a client on the spot (2026-10-13, Jake).
//
// The close makes the tenant (held at 'setup', no login yet), writes its Client
// Tracker row, and opens an onboarding form for it prefilled from the call. That
// form's resume link is the personal link Jake sends. Submitting it fills THIS
// client (intakeApprove.ts:adoptClosedClient), so nothing is matched by name.

export interface CloseNames {
  fullName: string;
  businessName: string;
}

export interface CloseCall {
  id: string;
  prospect_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  scheduled_at: string | null;
  cash_collected: number | string | null;
}

// What the onboarding form opens already filled in.
export function closeAnswers(names: CloseNames, call: Pick<CloseCall, "email" | "phone">): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: string | null) => {
    const clean = (value ?? "").trim();
    if (clean) out[key] = clean;
  };
  put("name", names.businessName);
  put("contactName", names.fullName);
  put("contactEmail", call.email);
  put("contactPhone", call.phone);
  return out;
}

// The form URL with the resume token, which the funnel reads as ?r=.
export function onboardingLink(funnel: string | null, token: string): string | null {
  if (!funnel) return null;
  const url = new URL(funnel);
  url.searchParams.set("r", token);
  return url.toString();
}

// The personal link while the form is still open. Null once it is submitted.
export async function openFormToken(client: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await client
    .from("intake_submissions")
    .select("resume_token")
    .eq("for_tenant_id", tenantId)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { resume_token: string } | null)?.resume_token ?? null;
}

export async function closeClient(
  client: SupabaseClient,
  call: CloseCall,
  names: CloseNames,
  timeZone: string,
): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  const fullName = names.fullName.trim();
  const businessName = names.businessName.trim() || fullName;
  if (!businessName) return { ok: false, error: "A business name is required." };
  const person = splitName(fullName);
  const now = new Date().toISOString();

  const { data: pendingData, error: pendErr } = await client
    .from("pending_clients")
    .select(PENDING_COLUMNS)
    .eq("sales_call_id", call.id)
    .maybeSingle();
  if (pendErr) return { ok: false, error: pendErr.message };
  const pending = pendingData as unknown as PendingRow | null;

  // Already a client: keep the names current. The tenant and its form are only
  // renamed while that form is still open, so reopening an old close never
  // renames a client who is already set up.
  if (pending?.tenant_id) {
    const tenantId = pending.tenant_id;
    await client
      .from("pending_clients")
      .update({ ...person, business_name: businessName, updated_at: now })
      .eq("id", pending.id);
    await client
      .from("client_billing")
      .upsert({ tenant_id: tenantId, ...person, updated_at: now }, { onConflict: "tenant_id" });
    const token = await openFormToken(client, tenantId);
    if (token) {
      await client.from("tenants").update({ name: businessName, app_name: businessName }).eq("id", tenantId);
      const { data: form } = await client
        .from("intake_submissions")
        .select("answers")
        .eq("resume_token", token)
        .maybeSingle();
      await client
        .from("intake_submissions")
        .update({
          answers: { ...((form as { answers?: object } | null)?.answers ?? {}), ...closeAnswers({ fullName, businessName }, call) },
          updated_at: now,
        })
        .eq("resume_token", token);
    }
    return { ok: true, tenantId };
  }

  let tenantId: string;
  try {
    const created = await createTenantWithOwner(client, { name: businessName, onboardingStatus: "setup" });
    tenantId = created.tenantId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  await seedOnboardingRecord(client, tenantId, {}, CHECKLIST_TASKS.map((t) => t.key));

  // The tracker row: anything already saved for this close, else the prefill
  // off the call, with the names from the form on top.
  const cash = call.cash_collected === null ? null : Number(call.cash_collected);
  const base = pending
    ? toBillingDto(pending)
    : trackerPrefill(
        {
          prospectName: fullName,
          scheduledAt: call.scheduled_at,
          cashCollected: Number.isFinite(cash) ? cash : null,
        },
        timeZone,
      );
  const tracker = {
    first_name: person.firstName,
    last_name: person.lastName,
    date_closed: base.dateClosed,
    upfront_cash: base.upfrontCash,
    total_cash_collected: base.totalCashCollected,
  };

  const { error: billErr } = await client
    .from("client_billing")
    .upsert(
      { ...(pending ? pickBilling(pending) : {}), ...tracker, tenant_id: tenantId, updated_at: now },
      { onConflict: "tenant_id" },
    );
  if (billErr) return { ok: false, error: billErr.message };

  const { error: rowErr } = await client.from("pending_clients").upsert(
    {
      ...tracker,
      sales_call_id: call.id,
      tenant_id: tenantId,
      business_name: businessName,
      email: call.email ?? "",
      phone: call.phone ?? "",
      updated_at: now,
    },
    { onConflict: "sales_call_id" },
  );
  if (rowErr) return { ok: false, error: rowErr.message };

  const { error: formErr } = await client.from("intake_submissions").insert({
    resume_token: mintResumeToken(),
    answers: closeAnswers({ fullName, businessName }, call),
    furthest_step: 1,
    status: "in_progress",
    for_tenant_id: tenantId,
  });
  if (formErr) return { ok: false, error: formErr.message };

  return { ok: true, tenantId };
}

// The tracker columns a pending row already holds, as client_billing takes them.
function pickBilling(row: PendingRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BILLING_COLUMNS.split(",").map((k) => k.trim())) {
    if (key !== "updated_at" && key in row) out[key] = (row as unknown as Record<string, unknown>)[key];
  }
  return out;
}
