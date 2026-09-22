import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdAccount } from "./metaGraph";
import { buildAdDayUpserts, fetchAccountTimezone, fetchAdDays, trailingWindow } from "./metaAdDays";
import { buildEntityUpserts, fetchAdEntities } from "./metaAdEntities";
import { replaceAdDays } from "./metaAdDayStore";
import { reconcileTenant, statusRow, type DayMismatch } from "./metaReconcile";

// One client's Meta sync, end to end: pull the trailing window, write it so it
// equals Meta exactly, refresh the account structure, then PROVE the whole
// stored history against Meta's own account totals (lib/metaReconcile.ts) and
// record the verdict in meta_sync_status.
//
// Lived inline in api/admin/ads/sync.ts until 2026-09-22. It moved so the Paid
// Ads pages can run the same thing on a stale client without waiting for the
// nightly cron, which is how a missed cron night stopped being able to leave a
// client looking at two-day-old spend.

const CHUNK = 500;

export interface SyncTenantRow {
  id: string;
  name?: string | null;
  meta_ad_account_id?: string | null;
  meta_timezone?: string | null;
}

export interface SyncResult {
  tenantId: string;
  name: string;
  rows?: number;
  // Stored rows in the window that Meta no longer reports, removed.
  deleted?: number;
  // Campaigns + ad sets + ads whose structure and live status were refreshed.
  entities?: number;
  // The reconciliation verdict: true only when every day matches Meta.
  verified?: boolean;
  repairedDays?: number;
  mismatches?: DayMismatch[];
  skipped?: string;
  error?: string;
}

// Refresh the account's structure: every campaign, ad set and ad, with the
// status Meta reports today. This is what lets the client breakdown scope
// itself to the live campaign and mark the ads actually running.
//
// Replaced whole rather than merged. A campaign deleted in Meta must disappear
// here too, or the page keeps filtering toward a campaign that no longer exists,
// and the client sees an empty breakdown with no explanation.
async function syncEntities(
  client: SupabaseClient,
  tenantId: string,
  token: string,
  account: string,
): Promise<number> {
  const entities = await fetchAdEntities(token, account);
  const upserts = buildEntityUpserts(entities, tenantId);
  if (upserts.length === 0) return 0;

  const now = new Date().toISOString();
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now }));
    const { error } = await client
      .from("meta_ad_entities")
      .upsert(chunk, { onConflict: "tenant_id,entity_id" });
    if (error) throw new Error(error.message);
  }

  // Anything not in this pull no longer exists in the account. Deleting by
  // "older than this run" rather than by id list keeps the statement small
  // however many ads the client has.
  const { error: pruneError } = await client
    .from("meta_ad_entities")
    .delete()
    .eq("tenant_id", tenantId)
    .lt("updated_at", now);
  if (pruneError) throw new Error(pruneError.message);

  return upserts.length;
}

async function recordFailure(client: SupabaseClient, tenantId: string, error: string) {
  // Only the verdict columns: first_spend_date and the last good totals stay,
  // so one failed check does not flip a launched client back to "coming soon".
  const { error: writeError } = await client.from("meta_sync_status").upsert(
    { tenant_id: tenantId, checked_at: new Date().toISOString(), ok: false, error: error.slice(0, 500) },
    { onConflict: "tenant_id" },
  );
  if (writeError) console.warn(`[metaSync] status write failed`, writeError.message);
}

export async function syncAndVerifyTenant(
  client: SupabaseClient,
  token: string,
  tenant: SyncTenantRow,
  days: number,
): Promise<SyncResult> {
  const name = tenant.name ?? tenant.id;
  // No env fallback: a client with no account of its own is skipped, rather
  // than having another client's spend synced into its tracker.
  let account = resolveAdAccount(tenant.meta_ad_account_id ?? undefined, undefined);
  if (!account) return { tenantId: tenant.id, name, skipped: "no ad account" };
  if (!account.startsWith("act_")) account = `act_${account}`;

  // The account's reporting timezone, FIRST, because the insights window below
  // is a calendar range in that zone and asking for the wrong days is not a
  // recoverable error, just a quietly short answer. Falls back to whatever was
  // cached on the tenant, then to UTC.
  const fetchedZone = await fetchAccountTimezone(token, account);
  const zone = fetchedZone ?? tenant.meta_timezone ?? "UTC";
  if (fetchedZone && fetchedZone !== (tenant.meta_timezone ?? null)) {
    const { error: zoneError } = await client
      .from("tenants")
      .update({ meta_timezone: fetchedZone })
      .eq("id", tenant.id);
    if (zoneError) console.warn(`[metaSync] ${name}: timezone write failed`, zoneError.message);
  }

  try {
    const { since, until } = trailingWindow(days, zone);
    const rows = await fetchAdDays(token, account, days, zone);
    const upserts = buildAdDayUpserts(rows, tenant.id);
    // buildAdDayUpserts drops a row it cannot key or parse. Dropping it here
    // would store a day short by that ad's spend, so the whole sync refuses.
    if (upserts.length !== rows.length) {
      throw new Error(`Meta returned ${rows.length - upserts.length} ad rows that could not be read`);
    }
    const written = await replaceAdDays(client, tenant.id, since, until, upserts);
    // Structure and status, for the client breakdown's live-campaign scope.
    // Same try block: if Meta will not talk to us, neither half is trustworthy.
    const entities = await syncEntities(client, tenant.id, token, account);
    const syncedAt = new Date().toISOString();

    const check = await reconcileTenant(client, token, tenant.id, account, zone);
    const { error: statusError } = await client
      .from("meta_sync_status")
      .upsert(statusRow(tenant.id, check, syncedAt), { onConflict: "tenant_id" });
    if (statusError) throw new Error(`status write: ${statusError.message}`);

    return {
      tenantId: tenant.id,
      name,
      rows: written.written,
      deleted: written.deleted,
      entities,
      verified: check.ok,
      repairedDays: check.repairedDays,
      mismatches: check.mismatches,
    };
  } catch (err) {
    // One client's broken ad account must not abort the others.
    const message = String((err as Error)?.message ?? err).slice(0, 300);
    await recordFailure(client, tenant.id, message);
    return { tenantId: tenant.id, name, error: message };
  }
}

// A readable one-liner for error_log when the check still disagrees.
export function describeMismatches(mismatches: DayMismatch[]): string {
  return mismatches
    .slice(0, 5)
    .map(
      (m) =>
        `${m.date}: ours $${m.ours.spend.toFixed(2)} / ${m.ours.leads} leads, Meta $${m.meta.spend.toFixed(2)} / ${m.meta.leads} leads`,
    )
    .join("; ");
}
