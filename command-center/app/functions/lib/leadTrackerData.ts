// The shared load + assemble behind every Paid Ads tab (Dashboard, Lead
// Tracker, Pipeline Stats). One GHL + Supabase fetch, assembled into the shape
// adTrackerMetrics consumes, so the tabs never each re-pull the same live data.
//
// The Meta Data tab does NOT use this: it reads meta_ad_days straight and needs
// no GHL call. See functions/api/ads/meta-data.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ghlJson,
  fetchAllOpportunities,
  fetchAllContacts,
  type GhlContext,
  type GhlContactRecord,
} from "./ghl";
import { firstTouchAttribution, type AdAttribution } from "./adAttribution";
import { toSpendRows } from "./metaAdDays";
import { toAdEntities, type AdEntity } from "./metaAdEntities";
import { makeInternalConversationFilter } from "./internalRecipients";
import {
  assembleLeads,
  trackerPipelineRole,
  type PipelineRole,
  type TrackerLead,
  type TrackerOpportunity,
  type TrackerSpendRow,
} from "./adTrackerMetrics";
import type { ClientLeadStatus } from "./leadStatus";

export interface TrackerData {
  leads: TrackerLead[];
  spendRows: TrackerSpendRow[];
  // Meta's structure as it stands today: every campaign, ad set and ad with its
  // live status. Empty until a sync has run, which the breakdown treats as
  // "do not filter" rather than "nothing exists".
  entities: AdEntity[];
  // Contacts holding a card in the Trash pipeline (shown as "Lost").
  lostContacts: Set<string>;
  // One opportunity id per contact (Sales preferred) for the close-out link.
  oppIdByContact: Map<string, string>;
  contactById: Map<string, GhlContactRecord>;
  attributionByContact: Map<string, AdAttribution | null>;
  // ad id -> a spend row carrying that ad's names, for labelling lead rows.
  adMeta: Map<string, TrackerSpendRow>;
  opportunitiesCount: number;
  // True while a contact belongs to an internal notification recipient, so
  // callers can drop those from lead lists and counts.
  isInternal: (x: { contactId?: string }) => boolean;
}

interface PipelineDef {
  id: string;
  name?: string;
  stages?: { id: string; name?: string }[];
}

// Load everything the KPI/breakdown/lead-list math needs. Spend is fetched in
// full (not windowed): the maths windows it in-memory via rollup()/breakdown(),
// and the Pipeline Stats tab needs three windows from one fetch.
export async function loadTrackerData(
  gctx: GhlContext,
  client: SupabaseClient,
  tenantId: string,
  internalRecipients: unknown,
): Promise<TrackerData> {
  const { pipelines = [] } = await ghlJson<{ pipelines?: PipelineDef[] }>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );

  const stageNames = new Map<string, string>();
  const wanted: { id: string; role: PipelineRole }[] = [];
  for (const p of pipelines) {
    const role = trackerPipelineRole(p.name ?? "");
    if (!role) continue;
    wanted.push({ id: p.id, role });
    for (const s of p.stages ?? []) stageNames.set(s.id, s.name ?? "");
  }

  const [oppSets, contacts, jobsRes, spendRes, entityRes] = await Promise.all([
    Promise.all(wanted.map((p) => fetchAllOpportunities(gctx, { pipelineId: p.id }))),
    fetchAllContacts(gctx),
    client.from("customer_jobs").select("ghl_contact_id, value_cents").eq("tenant_id", tenantId),
    client
      .from("meta_ad_days")
      .select(
        "date, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, spend, impressions, reach, link_clicks, leads",
      )
      .eq("tenant_id", tenantId),
    client
      .from("meta_ad_entities")
      .select("level, entity_id, name, status, campaign_id, adset_id")
      .eq("tenant_id", tenantId),
  ]);

  if (jobsRes.error) throw new Error(jobsRes.error.message);
  if (spendRes.error) throw new Error(spendRes.error.message);
  if (entityRes.error) throw new Error(entityRes.error.message);

  const attributionByContact = new Map(
    contacts.map((c) => [c.id, firstTouchAttribution(c.attributions)]),
  );

  const jobValueByContact = new Map<string, number>();
  for (const row of jobsRes.data ?? []) {
    const id = String(row.ghl_contact_id ?? "");
    if (!id) continue;
    const dollars = Number(row.value_cents ?? 0) / 100;
    jobValueByContact.set(id, (jobValueByContact.get(id) ?? 0) + dollars);
  }

  const lostContacts = new Set<string>();
  const oppIdByContact = new Map<string, string>();
  const opportunities: TrackerOpportunity[] = [];
  wanted.forEach((p, i) => {
    for (const o of oppSets[i]) {
      const contactId = (o.contactId ?? o.contact?.id ?? "").trim();
      opportunities.push({
        id: o.id,
        contactId,
        pipelineStageId: o.pipelineStageId ?? "",
        createdAt: o.createdAt ?? "",
      });
      if (!contactId) continue;
      if (p.role === "trash") lostContacts.add(contactId);
      // Prefer a lead-journey card for the close-out link, else keep the first.
      if (p.role === "lead" || !oppIdByContact.has(contactId)) {
        oppIdByContact.set(contactId, o.id);
      }
    }
  });

  // Per-tenant stage overrides, set on Fulfillment > GHL > Connection. Only the
  // stages an operator has explicitly corrected are in here; everything else
  // keeps deriving its status from the stage NAME, which is what makes a new
  // client work without a remap. A failed read is not fatal: falling back to
  // name matching is the behaviour that predates this table.
  const statusOverrides = new Map<string, ClientLeadStatus>();
  const { data: overrideRows, error: overrideErr } = await client
    .from("ghl_stage_map")
    .select("stage_id, lead_status")
    .eq("tenant_id", tenantId);
  if (overrideErr) {
    console.warn("[tracker] stage overrides unavailable:", overrideErr.message);
  } else {
    for (const row of overrideRows ?? []) {
      const stageId = String((row as Record<string, unknown>).stage_id ?? "");
      const status = String((row as Record<string, unknown>).lead_status ?? "");
      if (stageId && status) statusOverrides.set(stageId, status as ClientLeadStatus);
    }
  }

  const leads = assembleLeads(
    opportunities,
    stageNames,
    attributionByContact,
    jobValueByContact,
    statusOverrides,
  );
  const spendRows = toSpendRows((spendRes.data ?? []) as Record<string, unknown>[]);

  const adMeta = new Map<string, TrackerSpendRow>();
  for (const r of spendRows) if (!adMeta.has(r.adId)) adMeta.set(r.adId, r);

  return {
    leads,
    spendRows,
    entities: toAdEntities((entityRes.data ?? []) as Record<string, unknown>[]),
    lostContacts,
    oppIdByContact,
    contactById: new Map(contacts.map((c) => [c.id, c])),
    attributionByContact,
    adMeta,
    opportunitiesCount: opportunities.length,
    isInternal: makeInternalConversationFilter(contacts, internalRecipients),
  };
}
