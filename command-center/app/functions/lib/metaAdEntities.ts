// The campaign / ad set / ad structure behind the Paid Ads breakdown, and which
// of them are live. Stored in meta_ad_entities (migration 0073) and refreshed by
// the same sync that fills meta_ad_days.
//
// meta_ad_days cannot answer either question on its own: it only knows about
// ads that SPENT, and a spend row for last Tuesday cannot honestly carry a
// status that describes today.

import { graphGetAll } from "./metaGraph";
import type { BreakdownLevel } from "./adTrackerMetrics";

// Meta's effective_status that means "this is running right now". Everything
// else (PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, ARCHIVED, DELETED, IN_PROCESS,
// WITH_ISSUES, ...) is not live. Deliberately a whitelist: a status we have
// never seen must read as not-live, never as live.
const LIVE_STATUS = "ACTIVE";

export interface AdEntity {
  id: string;
  level: BreakdownLevel;
  name: string;
  // Meta's effective_status, verbatim.
  status: string;
  // For a campaign this equals `id`, which is what lets one campaign filter
  // cover all three levels.
  campaignId: string;
  adsetId: string | null;
  live: boolean;
}

export interface AdEntityUpsert {
  tenant_id: string;
  level: BreakdownLevel;
  entity_id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string | null;
}

export function isLive(status: unknown): boolean {
  return String(status ?? "").toUpperCase() === LIVE_STATUS;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function entity(
  row: Record<string, unknown>,
  level: BreakdownLevel,
  campaignId: string,
  adsetId: string | null,
): AdEntity | null {
  const id = text(row.id).trim();
  if (!id) return null;
  const status = text(row.effective_status);
  return { id, level, name: text(row.name), status, campaignId, adsetId, live: isLive(status) };
}

// Pull the whole structure of one ad account: every campaign, ad set and ad,
// with its effective status.
//
// Three calls rather than one nested query on purpose. Meta's nested-field
// syntax pages the inner edges separately and silently truncates them, which is
// exactly the failure that would hide a client's ads with no error to show for
// it.
export async function fetchAdEntities(
  token: string,
  adAccount: string,
): Promise<AdEntity[]> {
  const account = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;

  const [campaigns, adsets, ads] = await Promise.all([
    graphGetAll(token, `/${account}/campaigns`, {
      limit: "200",
      fields: "id,name,effective_status",
    }),
    graphGetAll(token, `/${account}/adsets`, {
      limit: "200",
      fields: "id,name,effective_status,campaign_id",
    }),
    graphGetAll(token, `/${account}/ads`, {
      limit: "500",
      fields: "id,name,effective_status,adset_id,campaign_id",
    }),
  ]);

  const out: AdEntity[] = [];
  for (const c of campaigns) {
    const e = entity(c, "campaign", text(c.id).trim(), null);
    if (e) out.push(e);
  }
  for (const a of adsets) {
    const e = entity(a, "adset", text(a.campaign_id), text(a.id).trim());
    if (e) out.push(e);
  }
  for (const a of ads) {
    const e = entity(a, "ad", text(a.campaign_id), text(a.adset_id) || null);
    if (e) out.push(e);
  }
  return out;
}

export function buildEntityUpserts(entities: AdEntity[], tenantId: string): AdEntityUpsert[] {
  return entities.map((e) => ({
    tenant_id: tenantId,
    level: e.level,
    entity_id: e.id,
    name: e.name,
    status: e.status,
    campaign_id: e.campaignId,
    adset_id: e.adsetId,
  }));
}

// Database rows -> the shape the breakdown consumes.
export function toAdEntities(rows: Record<string, unknown>[]): AdEntity[] {
  const out: AdEntity[] = [];
  for (const row of rows) {
    const level = text(row.level);
    if (level !== "campaign" && level !== "adset" && level !== "ad") continue;
    const id = text(row.entity_id).trim();
    if (!id) continue;
    const status = text(row.status);
    out.push({
      id,
      level,
      name: text(row.name),
      status,
      campaignId: text(row.campaign_id),
      adsetId: text(row.adset_id) || null,
      live: isLive(status),
    });
  }
  return out;
}
