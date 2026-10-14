import { ghlFetch, ghlJson, type GhlContext } from "./ghl";
import { listPipelines } from "./coldSmsAgency";
import type { DispositionStatus } from "./salesDisposition";
import { planCardMove, resolveFormRoute, type Card } from "./salesFormRoute";

// The post-call form's answer, written to the agency sub-account's boards.
// Rules in salesFormRoute.ts. Four outside calls at most.

interface Opp {
  id: string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactId?: string;
  contact?: { id?: string };
  updatedAt?: string;
}

export type FormRouteResult =
  | { ok: true; opportunityId: string }
  | { ok: false; error: string };

// The contact's cards on one pipeline, newest first. GHL has ignored search
// filters before, so both are checked here too (coldSmsAgency.removeColdSmsCardsIn).
async function contactCards(agency: GhlContext, pipelineId: string, contactId: string): Promise<Card[]> {
  const res = await ghlJson<{ opportunities?: Opp[] }>(
    agency,
    `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
      `&contact_id=${encodeURIComponent(contactId)}&pipeline_id=${encodeURIComponent(pipelineId)}&limit=20`,
  );
  return (res.opportunities ?? [])
    .filter((o) => o.pipelineId === pipelineId && (o.contactId ?? o.contact?.id) === contactId)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .map((o) => ({ id: o.id, stageId: o.pipelineStageId ?? "" }));
}

export async function routeSalesForm(
  agency: GhlContext,
  input: {
    status: DispositionStatus;
    contactId: string;
    // The card this meeting last moved, tried first when the contact has two.
    opportunityId: string | null;
    name: string;
  },
): Promise<FormRouteResult> {
  try {
    const route = resolveFormRoute(input.status, await listPipelines(agency));
    if (!route.ok) return route;

    const [salesCards, onboardingCards] = await Promise.all([
      contactCards(agency, route.salesPipelineId, input.contactId),
      route.onboarding ? contactCards(agency, route.onboarding.pipelineId, input.contactId) : Promise.resolve([]),
    ]);
    const move = planCardMove(route, salesCards, onboardingCards, input.opportunityId);
    const { pipelineId, stageId } = route.target;

    if (move.kind === "none") return { ok: true, opportunityId: move.opportunityId };
    if (move.kind === "move") {
      const res = await ghlFetch(agency, `/opportunities/${encodeURIComponent(move.opportunityId)}`, {
        method: "PUT",
        body: JSON.stringify({ pipelineId, pipelineStageId: stageId }),
      });
      if (!res.ok) throw new Error(`move ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { ok: true, opportunityId: move.opportunityId };
    }
    const res = await ghlJson<{ opportunity?: { id: string } }>(agency, "/opportunities/", {
      method: "POST",
      body: JSON.stringify({
        locationId: agency.locationId,
        contactId: input.contactId,
        name: input.name,
        pipelineId,
        pipelineStageId: stageId,
        status: "open",
      }),
    });
    if (!res.opportunity?.id) throw new Error("create returned no opportunity");
    return { ok: true, opportunityId: res.opportunity.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : String(err) };
  }
}
