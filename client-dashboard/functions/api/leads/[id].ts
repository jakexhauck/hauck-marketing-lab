import type { Env, ApiData } from "../../lib/env";
import { ghlFetch, ghlJson, shapeOpportunity, type GhlOpportunity } from "../../lib/ghl";
import { admin } from "../../lib/supabase-admin";

interface PatchBody {
  pipelineStageId?: string;
  status?: "open" | "won" | "lost" | "abandoned";
  value?: number | null;
  notes?: string | null;
}

export const onRequestGet: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const id = ctx.params.id as string;
  const data = await ghlJson<{ opportunity: GhlOpportunity }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/opportunities/${encodeURIComponent(id)}`,
  );
  return Response.json({ lead: shapeOpportunity(data.opportunity) });
};

export const onRequestPatch: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const id = ctx.params.id as string;
  const body = (await ctx.request.json()) as PatchBody;

  const ghlBody: Record<string, unknown> = {};
  if (body.pipelineStageId !== undefined) ghlBody.pipelineStageId = body.pipelineStageId;
  if (body.status !== undefined) ghlBody.status = body.status;
  if (body.value !== undefined) ghlBody.monetaryValue = body.value ?? 0;
  if (body.notes !== undefined) ghlBody.notes = body.notes ?? "";

  const res = await ghlFetch(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/opportunities/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(ghlBody) },
  );

  await admin(ctx.env)
    .from("activity_log")
    .insert({
      tenant_id: t.id,
      user_id: ctx.data.userId,
      action: "lead.update",
      lead_id: id,
      payload: { request: body, ghlStatus: res.status },
    });

  if (!res.ok) {
    const text = await res.text();
    return new Response(
      JSON.stringify({ error: "ghl_error", status: res.status, body: text.slice(0, 500) }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  if (body.status === "won" && typeof body.value === "number") {
    const noteBody = `Marked Won. $${body.value}. Via Hauck Dashboard.`;
    await ghlFetch(
      { token: t.ghl_token, locationId: t.ghl_location_id },
      `/opportunities/${encodeURIComponent(id)}/notes`,
      { method: "POST", body: JSON.stringify({ body: noteBody }) },
    ).catch((e) => console.warn("[lead.note]", e));
  }

  const updated = (await res.json()) as { opportunity: GhlOpportunity };
  return Response.json({ lead: shapeOpportunity(updated.opportunity) });
};
