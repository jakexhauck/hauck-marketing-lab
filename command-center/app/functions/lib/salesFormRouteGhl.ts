import { ghlFetch, ghlJson, type GhlContext } from "./ghl";
import { listPipelines } from "./coldSmsAgency";
import type { DispositionStatus } from "./salesDisposition";
import { onboardingMove, resolveFormRoute } from "./salesFormRoute";

// The post-call form's answer, written to the agency sub-account's boards.
// Rules in salesFormRoute.ts. Five outside calls at most.

interface Opp {
  id: string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactId?: string;
  contact?: { id?: string };
  updatedAt?: string;
}

export type FormRouteResult =
  | { ok: true; salesOpportunityId: string }
  | { ok: false; error: string };

// The contact's cards on one pipeline. GHL has ignored search filters before,
// so both are checked here too (coldSmsAgency.removeColdSmsCardsIn).
async function contactCards(agency: GhlContext, pipelineId: string, contactId: string): Promise<Opp[]> {
  const res = await ghlJson<{ opportunities?: Opp[] }>(
    agency,
    `/opportunities/search?location_id=${encodeURIComponent(agency.locationId)}` +
      `&contact_id=${encodeURIComponent(contactId)}&pipeline_id=${encodeURIComponent(pipelineId)}&limit=20`,
  );
  return (res.opportunities ?? [])
    .filter((o) => o.pipelineId === pipelineId && (o.contactId ?? o.contact?.id) === contactId)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

async function moveCard(agency: GhlContext, id: string, pipelineId: string, stageId: string): Promise<void> {
  const res = await ghlFetch(agency, `/opportunities/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ pipelineId, pipelineStageId: stageId }),
  });
  if (!res.ok) throw new Error(`move ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function createCard(
  agency: GhlContext,
  contactId: string,
  name: string,
  pipelineId: string,
  stageId: string,
): Promise<string> {
  const res = await ghlJson<{ opportunity?: { id: string } }>(agency, "/opportunities/", {
    method: "POST",
    body: JSON.stringify({
      locationId: agency.locationId,
      contactId,
      name,
      pipelineId,
      pipelineStageId: stageId,
      status: "open",
    }),
  });
  if (!res.opportunity?.id) throw new Error("create returned no opportunity");
  return res.opportunity.id;
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

    const { pipelineId, stageId } = route.sales;
    const cards = await contactCards(agency, pipelineId, input.contactId);
    const card = cards.find((c) => c.id === input.opportunityId) ?? cards[0];
    let salesOpportunityId: string;
    if (card) {
      if (card.pipelineStageId !== stageId) await moveCard(agency, card.id, pipelineId, stageId);
      salesOpportunityId = card.id;
    } else {
      salesOpportunityId = await createCard(agency, input.contactId, input.name, pipelineId, stageId);
    }

    if (route.onboarding) {
      const onb = route.onboarding;
      const existing = (await contactCards(agency, onb.pipelineId, input.contactId)).map((o) => ({
        id: o.id,
        stageId: o.pipelineStageId ?? "",
      }));
      const move = onboardingMove(onb, existing);
      if (move.kind === "create") await createCard(agency, input.contactId, input.name, onb.pipelineId, onb.stageId);
      else if (move.kind === "move") await moveCard(agency, move.opportunityId, onb.pipelineId, onb.stageId);
    }
    return { ok: true, salesOpportunityId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : String(err) };
  }
}
