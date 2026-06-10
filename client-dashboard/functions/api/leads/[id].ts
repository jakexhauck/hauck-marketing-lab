import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { ghlFetch, ghlJson, shapeOpportunity, type GhlOpportunity } from "../../lib/ghl";

interface PatchBody {
  pipelineStageId?: string;
  status?: "open" | "won" | "lost" | "abandoned";
  value?: number | null;
  notes?: string | null;
}

export const onRequestGet: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const id = ctx.params.id as string;
  const data = await ghlJson<{ opportunity: GhlOpportunity }>(
    gctx,
    `/opportunities/${encodeURIComponent(id)}`,
  );
  const lead = shapeOpportunity(data.opportunity);

  // GHL's opportunity response omits the contact's phone/email, so the lead
  // detail's call/email actions would be dead. Enrich from the contact record.
  if (lead.contactId && (!lead.phone || !lead.email)) {
    try {
      const c = await ghlJson<{
        contact: { phone?: string; email?: string };
      }>(gctx, `/contacts/${encodeURIComponent(lead.contactId)}`);
      lead.phone = lead.phone || c.contact?.phone || "";
      lead.email = lead.email || c.contact?.email || "";
    } catch {
      // best-effort enrichment; leave blanks if the lookup fails
    }
  }

  return Response.json({ lead });
};

export const onRequestPatch: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const id = ctx.params.id as string;
  const body = await readJsonBody<PatchBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const ghlBody: Record<string, unknown> = {};
  if (body.pipelineStageId !== undefined) ghlBody.pipelineStageId = body.pipelineStageId;
  if (body.status !== undefined) ghlBody.status = body.status;
  // null means "leave the value alone"; clearing to zero requires an explicit 0.
  if (typeof body.value === "number") ghlBody.monetaryValue = body.value;

  // `notes` is not a writable opportunity field in GHL v2 (the old PUT mapping
  // was a silent no-op), so notes become contact notes below instead.
  let opportunity: GhlOpportunity;
  if (Object.keys(ghlBody).length > 0) {
    const res = await ghlFetch(gctx, `/opportunities/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(ghlBody),
    });
    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: "ghl_error", status: res.status, body: text.slice(0, 500) }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }
    const updated = (await res.json()) as { opportunity: GhlOpportunity };
    opportunity = updated.opportunity;
  } else {
    // Note-only PATCH: nothing to write on the opportunity itself.
    const data = await ghlJson<{ opportunity: GhlOpportunity }>(
      gctx,
      `/opportunities/${encodeURIComponent(id)}`,
    );
    opportunity = data.opportunity;
  }

  const noteTexts: string[] = [];
  if (body.status === "won") {
    noteTexts.push(
      typeof body.value === "number"
        ? `Marked won in the dashboard. Value: $${body.value}.`
        : "Marked won in the dashboard.",
    );
  }
  const userNote = typeof body.notes === "string" ? body.notes.trim() : "";
  if (userNote) noteTexts.push(userNote);

  if (noteTexts.length > 0) {
    const contactId = opportunity.contact?.id ?? opportunity.contactId;
    if (!contactId) {
      console.warn(`[lead.note] opportunity ${id} has no contact id, skipping note`);
    } else {
      // Off the response path: the win must never fail or stall on the note.
      ctx.waitUntil(
        (async () => {
          for (const text of noteTexts) {
            const noteRes = await ghlFetch(
              gctx,
              `/contacts/${encodeURIComponent(contactId)}/notes`,
              { method: "POST", body: JSON.stringify({ body: text }) },
            ).catch((e) => {
              console.warn("[lead.note]", e);
              return null;
            });
            if (noteRes && !noteRes.ok) {
              console.warn(`[lead.note] POST /contacts/${contactId}/notes returned ${noteRes.status}`);
            }
          }
        })(),
      );
    }
  }

  return Response.json({ lead: shapeOpportunity(opportunity) });
};
