import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import {
  createContact,
  createOpportunity,
  fetchAllOpportunities,
  shapeOpportunity,
} from "../../lib/ghl";

interface CreateLeadBody {
  name?: string;
  phone?: string;
  email?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  value?: number | null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const url = new URL(ctx.request.url);
  const pipelineId = url.searchParams.get("pipelineId");

  const all = await fetchAllOpportunities(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    { pipelineId },
  );

  const leads = all.map(shapeOpportunity);
  leads.sort(
    (a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt),
  );

  return Response.json({ leads, total: leads.length });
};

// Create a lead: a GHL contact, then an opportunity for it on the chosen
// pipeline stage. Name + pipeline + stage are required; phone/email/value are
// optional. Permission gating (pipeline edit) happens in the middleware.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  const body = await readJsonBody<CreateLeadBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (!body.pipelineId || !body.pipelineStageId) {
    return Response.json(
      { error: "pipelineId and pipelineStageId are required" },
      { status: 400 },
    );
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const monetaryValue =
    typeof body.value === "number" && Number.isFinite(body.value)
      ? body.value
      : undefined;

  const contactId = await createContact(gctx, { name, phone, email });
  const lead = await createOpportunity(gctx, {
    contactId,
    pipelineId: body.pipelineId,
    pipelineStageId: body.pipelineStageId,
    name,
    monetaryValue,
  });

  return Response.json({ ok: true, id: lead.id }, { status: 201 });
};
