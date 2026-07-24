import type { Env, ApiData } from "../../lib/env";
import { ghlJson, fetchAllOpportunities, type GhlContext } from "../../lib/ghl";
import {
  resolveSalesPipeline,
  resolveServiceFieldId,
  shapeHandoff,
  sortHandoffs,
  type ApiHandoff,
  type HandoffStatus,
} from "./shared";

// GET /api/handoffs (owner endpoint): the owner's Sales -> Leads board, live
// against the tenant's real Sales pipeline. Every opportunity sitting in a
// handoff-lifecycle stage (Handed Off, Estimate/Job Booked, Won, Lost, Follow
// Up) becomes a lead card; opps in any other stage (e.g. Job Completed) are left
// off rather than mislabelled. See ./shared.ts for the stage <-> status map.

// Bound on the per-contact enrichment reads used to fill address/service on
// booked leads (for the Job pre-fill). Estimate/Job leads are a small slice of
// the board, but this caps the fan-out even on a busy account.
const ENRICH_CAP = 25;

interface EnrichContactResponse {
  contact?: {
    address1?: string;
    city?: string;
    state?: string;
    customFields?: { id?: string; value?: unknown }[];
  };
}

// Read one contact's address + service custom field for a booked lead. Best
// effort: a failed read leaves both null, never fails the whole list.
async function enrich(
  gctx: GhlContext,
  contactId: string,
  serviceFieldId: string | null,
): Promise<{ address: string | null; service: string | null }> {
  try {
    const data = await ghlJson<EnrichContactResponse>(
      gctx,
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    const c = data.contact ?? {};
    const address =
      [c.address1, c.city, c.state].filter((p) => p && String(p).trim()).join(", ") || null;
    let service: string | null = null;
    if (serviceFieldId) {
      const field = (c.customFields ?? []).find((f) => f.id === serviceFieldId);
      if (field && typeof field.value === "string" && field.value.trim()) {
        service = field.value.trim();
      }
    }
    return { address, service };
  } catch {
    return { address: null, service: null };
  }
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  if (!t) return Response.json({ error: "unauthorized" }, { status: 401 });
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const sales = await resolveSalesPipeline(gctx);
  if (!sales) return Response.json({ handoffs: [], configError: "pipeline_not_found" });

  const opps = await fetchAllOpportunities(gctx, { pipelineId: sales.pipelineId });

  // Keep only opps whose stage maps to a handoff status, carrying that status.
  const staged = opps
    .map((o) => {
      const status = o.pipelineStageId
        ? sales.statusByStageId.get(o.pipelineStageId)
        : undefined;
      return status ? { opp: o, status } : null;
    })
    .filter((x): x is { opp: (typeof opps)[number]; status: HandoffStatus } => x !== null);

  // Enrich the booked leads (estimate/job) with address + service so a Job
  // booking pre-fills what the estimate captured. Bounded and parallel.
  const bookedForEnrich = staged
    .filter((s) => (s.status === "estimate_set" || s.status === "job_booked") && s.opp.contactId)
    .slice(0, ENRICH_CAP);
  let enrichment = new Map<string, { address: string | null; service: string | null }>();
  if (bookedForEnrich.length > 0) {
    const serviceFieldId = await resolveServiceFieldId(gctx);
    const results = await Promise.all(
      bookedForEnrich.map(async (s) => {
        const id = s.opp.contactId as string;
        return [id, await enrich(gctx, id, serviceFieldId)] as const;
      }),
    );
    enrichment = new Map(results);
  }

  const handoffs: ApiHandoff[] = staged.map((s) => {
    const extra = s.opp.contactId ? enrichment.get(s.opp.contactId) : undefined;
    return shapeHandoff(s.opp, s.status, extra ?? {});
  });

  return Response.json({ handoffs: sortHandoffs(handoffs) });
};
