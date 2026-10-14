import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { agencyTimezone } from "../../../../lib/agencyGhl";
import { closeClient, type CloseCall } from "../../../../lib/closeClient";

// POST /api/admin/client-tracker/close/:callId  { fullName, businessName }
//   -> { ok, tenantId }
//
// The post-call form saved as PIF or Deposit: makes the client and its personal
// onboarding form (lib/closeClient.ts). Safe to repeat; a second call only
// updates the names. Owner only, the same bar as the post-call form.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "not found" }, { status: 404 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const callId = String(ctx.params.callId ?? "");
  if (!UUID.test(callId)) return Response.json({ error: "bad id" }, { status: 400 });

  let body: { fullName?: unknown; businessName?: unknown };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const fullName = typeof body.fullName === "string" ? body.fullName.slice(0, 200) : "";
  const businessName = typeof body.businessName === "string" ? body.businessName.slice(0, 200) : "";

  const { data: call } = await client
    .from("sales_calls")
    .select("id, prospect_name, business_name, email, phone, scheduled_at, cash_collected")
    .eq("id", callId)
    .maybeSingle();
  if (!call) return Response.json({ error: "meeting not found" }, { status: 404 });

  const result = await closeClient(client, call as CloseCall, { fullName, businessName }, agencyTimezone(ctx.env));
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result);
};
