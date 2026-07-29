import type { Env, ApiData } from "../../../lib/env";
import { readContactDnd, type ContactDnd } from "../../../lib/dnd";
import {
  ghlJson,
  fetchAllContacts,
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
// Tags ARE included, which an earlier note here said they could not be. That
// note assumed a per-contact fetch; the opportunity SEARCH response carries
// contact.tags inline (verified against the live account 2026-07-28), so the
// board gets them for free in the request it already makes. They are load-
// bearing now: the follow-up tag a lead should receive, and whether a booked
// appointment has been confirmed, are both tag-derived since the CRM rebuild.

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
  // When this opportunity last moved (status change, else any update). The
  // Results tab sorts and windows "recently won" by it; GHL's opportunity
  // search carries no per-stage-entry time, so this is the honest proxy.
  updatedAt: string | null;
  attempts: number;
  firstDialedAt: string | null;
  contacted: boolean;
  lastOutcome: string | null;
  // The contact's CRM tags, as the opportunity search returned them. Empty
  // when the location's response omits them, never undefined, so callers can
  // treat "no tags" and "tags not supplied" the same way: as no evidence.
  tags: string[];
  // Channels the CRM has switched off for this contact, or null when their
  // record was not in the roster we read.
  //
  // Unlike tags, this does NOT ride along on the opportunity search: that
  // response carries only {id, name, companyName, email, phone, tags, score}
  // (verified live 2026-07-29, on a contact we know has SMS blocked). So the
  // contact roster is fetched alongside, exactly as the inbox does.
  //
  // null means "not in the roster", never "reachable". Nothing may render it
  // as an all-clear.
  dnd: ContactDnd | null;
}

// Pure: shape one live opportunity plus its already-computed dial roll-up
// into a board card. No I/O, so this (and rollUpByContact, tested in
// setterMetrics.test.ts) is the unit-testable core of the route.
export function shapeSetterLead(
  o: GhlOpportunity,
  stageNames: Map<string, string>,
  rollUps: Map<string, ContactRollUp>,
  dnd?: Map<string, ContactDnd>,
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
    updatedAt: o.lastStatusChangeAt ?? o.updatedAt ?? null,
    attempts: rollUp?.attempts ?? 0,
    firstDialedAt: rollUp?.firstDialedAt ?? null,
    contacted: rollUp?.contacted ?? false,
    lastOutcome: rollUp?.lastOutcome ?? null,
    tags: o.contact?.tags ?? [],
    dnd: dnd?.get(contactId) ?? null,
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
    // The contact roster rides alongside purely for DND, which the opportunity
    // search does not carry. Degrades to an empty roster on failure: a board
    // without the DND chips is still a working board, and every lead then
    // reports null (unknown), which renders as no claim rather than a false
    // all-clear.
    const [opps, contacts] = await Promise.all([
      fetchAllOpportunities(gctx, { pipelineId, truncated }),
      fetchAllContacts(gctx).catch(() => []),
    ]);
    const dndIndex = new Map<string, ContactDnd>();
    for (const c of contacts) {
      if (!c.id) continue;
      const d = readContactDnd(c);
      if (d) dndIndex.set(c.id, d);
    }

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

    const leads = opps.map((o) => shapeSetterLead(o, stageNames, rollUps, dndIndex));

    return Response.json({ leads, truncated: truncated.value });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
