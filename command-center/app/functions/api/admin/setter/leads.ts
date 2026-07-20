import type { Env, ApiData } from "../../../lib/env";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlOpportunity,
} from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getServiceClient } from "../../../lib/supabase";
import { rollUpByContact, chunk, type ContactRollUp, type DialRow } from "../../../lib/setterMetrics";

// GET /api/admin/setter/leads?tenantId=&pipelineId= (admin-only, gated in
// _middleware.ts). Every opportunity in ONE pipeline (the board shows one
// pipeline's columns at a time), each merged with its dial history so the
// card can show attempts/contacted/last outcome without a second round-trip
// per lead.
//
// Deliberately excludes `tags`: fetching a contact's tags per card would be
// an N+1 contact fetch across the whole board (see ghl.ts:108-110, the same
// cost reason the list-view ApiLead omits attribution/tags). Tags belong to
// the per-lead detail endpoint (Task 5), which fetches one contact at a time.

interface GhlStage {
  id: string;
  name: string;
}
interface GhlPipeline {
  id: string;
  name: string;
  stages?: GhlStage[];
}
interface PipelinesResponse {
  pipelines: GhlPipeline[];
}

export interface ApiSetterLead {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  city: string;
  stageName: string;
  createdAt: string;
  attempts: number;
  firstDialedAt: string | null;
  contacted: boolean;
  lastOutcome: string | null;
}

// Pure: shape one live opportunity plus its already-computed dial roll-up
// into a board card. No I/O, so this (and rollUpByContact, tested in
// setterMetrics.test.ts) is the unit-testable core of the route.
export function shapeSetterLead(
  o: GhlOpportunity,
  stageNames: Map<string, string>,
  rollUps: Map<string, ContactRollUp>,
): ApiSetterLead {
  const contactId = o.contact?.id ?? o.contactId ?? "";
  const fullName =
    o.contact?.name ||
    [o.contact?.firstName, o.contact?.lastName].filter(Boolean).join(" ").trim();
  const rollUp = rollUps.get(contactId);
  return {
    id: o.id,
    contactId,
    name: o.name || fullName || "Unknown",
    phone: o.contact?.phone ?? "",
    city: o.contact?.city ?? "",
    stageName: stageNames.get(o.pipelineStageId ?? "") ?? "",
    createdAt: o.createdAt ?? new Date().toISOString(),
    attempts: rollUp?.attempts ?? 0,
    firstDialedAt: rollUp?.firstDialedAt ?? null,
    contacted: rollUp?.contacted ?? false,
    lastOutcome: rollUp?.lastOutcome ?? null,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = url.searchParams.get("tenantId");
  const pipelineId = url.searchParams.get("pipelineId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  if (!pipelineId) return Response.json({ error: "missing_pipeline_id" }, { status: 400 });

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);

    // Stage names are resolved live, by id, from THIS tenant's pipeline list
    // (never a hardcoded map): a stage rename in the CRM is reflected on the
    // very next load.
    const pipeData = await ghlJson<PipelinesResponse>(
      gctx,
      `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
    );
    const pipeline = (pipeData.pipelines ?? []).find((p) => p.id === pipelineId);
    if (!pipeline) return Response.json({ error: "pipeline_not_found" }, { status: 404 });
    const stageNames = new Map<string, string>();
    for (const s of pipeline.stages ?? []) stageNames.set(s.id, s.name);

    const truncated = { value: false };
    const opps = await fetchAllOpportunities(gctx, { pipelineId, truncated });

    const contactIds = [
      ...new Set(opps.map((o) => o.contact?.id ?? o.contactId).filter((id): id is string => !!id)),
    ];

    let rollUps = new Map<string, ContactRollUp>();
    if (contactIds.length) {
      const client = getServiceClient(ctx.env);
      if (client) {
        // Batched: postgrest-js serializes .in() straight into the URL query
        // string, and a pipeline holding a few hundred leads would otherwise
        // build one contact_id=in.(...) list far past what Supabase's edge
        // will accept, failing the whole board (see chunk's header comment
        // in ../../../lib/setterMetrics.ts). Run the batches in parallel,
        // then merge before rolling up.
        const DIALS_BATCH_SIZE = 100;
        const results = await Promise.all(
          chunk(contactIds, DIALS_BATCH_SIZE).map((batch) =>
            client
              .from("setter_dials")
              .select("contact_id, dialed_at, spoke, outcome")
              .eq("tenant_id", tenantId)
              .in("contact_id", batch),
          ),
        );
        const firstError = results.find((r) => r.error)?.error;
        if (firstError) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
        const dials = results.flatMap((r) => (r.data ?? []) as DialRow[]);
        rollUps = rollUpByContact(dials);
      }
    }

    const leads = opps.map((o) => shapeSetterLead(o, stageNames, rollUps));

    return Response.json({ leads, truncated: truncated.value });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
