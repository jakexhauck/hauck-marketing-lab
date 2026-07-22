import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  sanitizeScriptHtml,
  validateScriptBody,
  type ScriptBody,
} from "../../../lib/setterScript";

// GET/PATCH /api/admin/setter/script (admin-only, gated in _middleware.ts).
// One formatted dialing script per client, backing the Setter Suite's
// Settings tab and the cockpit's script overlay. See migration 0044 and
// functions/lib/setterScript.ts (the sanitizer is the trust boundary; every
// write passes through it, so reads render verbatim).

const SELECT = "html, updated_at";

// GET never 404s: a client with no saved script comes back as empty html,
// so "no script yet" is a rendering decision, not an error state.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("setter_scripts")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) return Response.json({ html: "", updatedAt: null });
  return Response.json({
    html: (data as { html: string }).html,
    updatedAt: (data as { updated_at: string | null }).updated_at,
  });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<ScriptBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const validation = validateScriptBody(body);
  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = body.tenantId!.trim();
  const adminId = ctx.data.admin!.id;
  // Sanitize BEFORE the write, so the column can only ever hold markup the
  // cockpit is safe to render verbatim.
  const html = await sanitizeScriptHtml(body.html!);

  const { data, error } = await client
    .from("setter_scripts")
    .upsert(
      { tenant_id: tenantId, html, updated_at: new Date().toISOString(), updated_by: adminId },
      { onConflict: "tenant_id" },
    )
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save script" }, { status: 500 });
  }

  await logAdminAction(client, adminId, "setter.script.update", tenantId, {
    bytes: html.length,
  });

  // Read back what actually landed (sanitized), so the editor reconciles
  // against the stored document rather than what it optimistically sent.
  return Response.json({
    html: (data as { html: string }).html,
    updatedAt: (data as { updated_at: string | null }).updated_at,
  });
};
