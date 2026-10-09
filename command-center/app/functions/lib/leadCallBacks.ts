import type { SupabaseClient } from "@supabase/supabase-js";
import { ghlFetch, type GhlContext } from "./ghl";
import { CALL_BACK_TAG } from "./leadOutcome";
import type { SyncBudget } from "./leadPickupSync";

// Call-backs the owner chose on the new-lead page (lead_link_outcomes), once
// their time has passed: the lead is tagged call-back-due, and the snapshot's
// "Call Back Reminder" workflow (tag added) texts the owner the lead's links
// and removes the tag. Run by the hourly ads cron (api/admin/ads/pickups.ts),
// so a reminder lands within the hour after the time picked.
//
// Off then on, like the call link, so a tag a workflow never removed cannot
// stop the trigger firing again.

export async function remindCallBacks(
  client: SupabaseClient,
  tenantId: string,
  gctx: GhlContext,
  budget: SyncBudget,
  now = Date.now(),
): Promise<number> {
  budget.calls -= 1;
  const { data } = await client
    .from("lead_link_outcomes")
    .select("ghl_contact_id")
    .eq("tenant_id", tenantId)
    .eq("outcome", "call_back")
    .is("reminded_at", null)
    .lte("call_back_at", new Date(now).toISOString())
    .order("call_back_at", { ascending: true })
    .limit(10);

  let sent = 0;
  for (const r of (data ?? []) as { ghl_contact_id: string }[]) {
    // Two GHL calls and the write.
    if (budget.calls < 3) break;
    budget.calls -= 3;
    const path = `/contacts/${encodeURIComponent(r.ghl_contact_id)}/tags`;
    await ghlFetch(gctx, path, { method: "DELETE", body: JSON.stringify({ tags: [CALL_BACK_TAG] }) });
    const res = await ghlFetch(
      gctx,
      path,
      { method: "POST", body: JSON.stringify({ tags: [CALL_BACK_TAG] }) },
      { idempotentPost: true },
    );
    if (!res.ok) continue;
    await client
      .from("lead_link_outcomes")
      .update({ reminded_at: new Date(now).toISOString() })
      .eq("tenant_id", tenantId)
      .eq("ghl_contact_id", r.ghl_contact_id);
    sent += 1;
  }
  return sent;
}
