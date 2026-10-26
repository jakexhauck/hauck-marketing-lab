import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { formFacts } from "../../../../../lib/ghlSetup";

// GET /api/admin/clients/:tenantId/ghl-setup/form -> { facts: FormFacts | null }
//
// What the client's onboarding form says, shaped for the GHL pages' "Fill from
// form" buttons. Null when they have not filled it in.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { data, error } = await client.from("onboarding").select("intake").eq("tenant_id", ctx.params.tenantId as string).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const intake = (data as { intake?: Record<string, unknown> } | null)?.intake;
  const facts = intake && Object.keys(intake).length ? formFacts(intake) : null;
  return Response.json({ facts }, { headers: { "Cache-Control": "no-store" } });
};
