import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAndVerifyTenant, type SyncTenantRow } from "./metaSync";
import type { DayMismatch } from "./metaReconcile";

// Has this client's advertising launched, and are the numbers we hold for it
// proven against Meta? One answer for the client's Paid Ads pages (which show
// "coming soon" until launch) and the admin cockpit (which shows the proof).
//
// "Launched" is not a switch anyone has to remember to flip. It is a fact Meta
// already knows: the ad account has recorded real spend. The reconciler writes
// the first such day to meta_sync_status.first_spend_date, and a client is
// launched from that day on. Linking an ad account is not launching; an account
// with campaigns built but nothing spent is still "coming soon".
//
// Asking also REFRESHES. When the last sync is older than FRESH_MINUTES the
// sync runs right here, before the page reads a single number. The nightly
// cron missed 2026-09-22 and two days of spend were missing from the
// dashboard until someone noticed; now the first person to open the page
// fixes it, and sees the fixed numbers.

export const FRESH_MINUTES = 60;
const SYNC_DAYS = 7;

export interface AdsStatus {
  // Meta has recorded spend on this client's ad account.
  launched: boolean;
  hasAdAccount: boolean;
  firstSpendDate: string | null;
  syncedAt: string | null;
  checkedAt: string | null;
  // null = never checked. false = a day still disagrees with Meta, or the last
  // check could not reach Meta (see `error`).
  verified: boolean | null;
  daysChecked: number;
  storedSpend: number;
  metaSpend: number;
  storedLeads: number;
  metaLeads: number;
  mismatches: DayMismatch[];
  error: string | null;
}

interface StatusRow {
  synced_at: string | null;
  checked_at: string | null;
  ok: boolean;
  days_checked: number;
  stored_spend: unknown;
  meta_spend: unknown;
  stored_leads: number;
  meta_leads: number;
  first_spend_date: string | null;
  mismatches: DayMismatch[] | null;
  error: string | null;
}

export function isStale(syncedAt: string | null, now: number = Date.now()): boolean {
  if (!syncedAt) return true;
  const t = Date.parse(syncedAt);
  return !Number.isFinite(t) || now - t > FRESH_MINUTES * 60_000;
}

export function toAdsStatus(hasAdAccount: boolean, row: StatusRow | null): AdsStatus {
  const firstSpendDate = hasAdAccount ? row?.first_spend_date ?? null : null;
  return {
    launched: Boolean(firstSpendDate),
    hasAdAccount,
    firstSpendDate,
    syncedAt: row?.synced_at ?? null,
    checkedAt: row?.checked_at ?? null,
    verified: row?.checked_at ? row.ok : null,
    daysChecked: row?.days_checked ?? 0,
    storedSpend: Number(row?.stored_spend ?? 0),
    metaSpend: Number(row?.meta_spend ?? 0),
    storedLeads: row?.stored_leads ?? 0,
    metaLeads: row?.meta_leads ?? 0,
    mismatches: row?.mismatches ?? [],
    error: row?.error ?? null,
  };
}

async function readRow(client: SupabaseClient, tenantId: string): Promise<StatusRow | null> {
  const { data, error } = await client
    .from("meta_sync_status")
    .select(
      "synced_at, checked_at, ok, days_checked, stored_spend, meta_spend, stored_leads, meta_leads, first_spend_date, mismatches, error",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as StatusRow | null) ?? null;
}

export async function loadAdsStatus(
  client: SupabaseClient,
  tenant: SyncTenantRow,
  token: string | null,
  opts: { refresh?: boolean } = {},
): Promise<AdsStatus> {
  const hasAdAccount = Boolean(tenant.meta_ad_account_id?.trim());
  if (!hasAdAccount) return toAdsStatus(false, null);

  let row = await readRow(client, tenant.id);
  if (opts.refresh !== false && token && isStale(row?.synced_at ?? null)) {
    // Never throws: a failure is recorded on the status row and read back.
    await syncAndVerifyTenant(client, token, tenant, SYNC_DAYS);
    row = await readRow(client, tenant.id);
  }
  return toAdsStatus(true, row);
}
