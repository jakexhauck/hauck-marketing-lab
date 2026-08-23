import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// GET /api/admin/onboarding/:tenantId  -> saved fields + intake + status
// (the token is never returned; hasToken says only whether one is on file)
export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: row } = await client
    .from("onboarding")
    .select("fields, intake, status, provision_result")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const { data: tenant } = await client
    .from("tenants")
    .select("name, ghl_location_id, ghl_token, onboarding_status")
    .eq("id", tenantId)
    .maybeSingle();

  const fields = ((row?.fields ?? {}) as Record<string, string>);
  const loc = tenant?.ghl_location_id as string | undefined;
  if (loc && loc !== "pending" && loc !== "env") fields.ghl_location_id = loc;
  const tok = tenant?.ghl_token as string | undefined;
  const hasToken = Boolean(tok && tok !== "pending" && tok !== "env");

  // The login the client chose, read back from the form they filled in.
  //
  // The PASSWORD is the point of this lookup. It is never in `intake` (the
  // funnel hashes it on arrival and strips it from the saved answers), so the
  // client sheet had a Login section that could not show the one thing Jake
  // opens it for: getting an owner signed in while he has them on the phone.
  //
  // Same rule as GET /api/admin/intake/:id, which has returned it since
  // migration 0081: admin-gated in _middleware.ts, never on a list endpoint,
  // and never anywhere the client's own app can reach. Null for anyone who
  // signed up before 0081, and for a client created by hand rather than through
  // the funnel. Jake reaffirmed this tradeoff on 2026-08-22.
  const { data: submission } = await client
    .from("intake_submissions")
    .select("login_email, password_plain")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Response.json({
    fields,
    intake: (row?.intake ?? {}) as Record<string, string>,
    loginEmail: (submission?.login_email as string | null) ?? null,
    password: (submission?.password_plain as string | null) ?? null,
    status: (row?.status as string) ?? "draft",
    hasToken,
    provisionResult: row?.provision_result ?? null,
    name: (tenant?.name as string) ?? "",
    // 'setup' while the client is held at the holding screen, 'live' once Go
    // Live has been pressed. Drives the Go Live block at the foot of the record.
    onboardingStatus: (tenant?.onboarding_status as string) ?? "live",
  });
};

// PUT /api/admin/onboarding/:tenantId  body { fields?, intake? }
//
// The two halves save independently: the setup values (pushed to GHL) and the
// client's intake answers (never pushed anywhere) are edited by separate Save
// buttons, so a body carrying one must leave the other exactly as it was. Only
// the keys present in the body reach the upsert.
export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  let body: { fields?: Record<string, string>; intake?: Record<string, string> };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const fields = body.fields ?? {};

  const tenantPatch: Record<string, string> = {};
  if (typeof fields.ghl_location_id === "string" && fields.ghl_location_id.trim()) {
    tenantPatch.ghl_location_id = fields.ghl_location_id.trim();
  }
  if (typeof fields.ghl_token === "string" && fields.ghl_token.trim()) {
    tenantPatch.ghl_token = fields.ghl_token.trim();
  }
  if (Object.keys(tenantPatch).length > 0) {
    await client.from("tenants").update(tenantPatch).eq("id", tenantId);
  }

  // Never store the raw token in onboarding.fields.
  const stored = { ...fields };
  delete stored.ghl_token;

  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };
  if (body.fields) patch.fields = stored;
  if (body.intake) patch.intake = body.intake;

  const { error } = await client
    .from("onboarding")
    .upsert(patch, { onConflict: "tenant_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};
