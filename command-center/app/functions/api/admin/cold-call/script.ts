import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { sanitizeScriptHtml, MAX_SCRIPT_HTML } from "../../../lib/setterScript";

// GET/PATCH /api/admin/cold-call/script (admin session gated in _middleware.ts,
// role gated in lib/adminRoles: a cold caller may GET, only an owner may write).
//
// The agency's own cold-calling script: exactly one, so there is no tenantId
// here, unlike the per-client setter script this is modelled on. Migration 0048
// pins the row to id='agency'.
//
// The sanitizer from the setter script (functions/lib/setterScript.ts) is reused
// verbatim and remains the trust boundary: every write goes through it, so the
// column can only hold markup the script panel is safe to render.

const ROW_ID = "agency";
const SELECT = "html, updated_at";

// GET never 404s: no script yet comes back as empty html, so "nothing written"
// is a rendering decision rather than an error the caller has to handle.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("cold_call_script")
    .select(SELECT)
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) return Response.json({ html: "", updatedAt: null });
  return Response.json({
    html: (data as { html: string }).html,
    updatedAt: (data as { updated_at: string | null }).updated_at,
  });
};

interface Body {
  html?: string;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  // Writing the script is an owner's job. The role allowlist already refuses a
  // cold caller's PATCH; this is the second lock on the same door.
  if (ctx.data.admin?.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await readJsonBody<Body>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (typeof body.html !== "string") {
    return Response.json({ error: "missing_html" }, { status: 400 });
  }
  if (body.html.length > MAX_SCRIPT_HTML) {
    return Response.json({ error: "too_long" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const adminId = ctx.data.admin!.id;
  // Sanitize BEFORE the write, so the column can only ever hold safe markup.
  const html = await sanitizeScriptHtml(body.html);

  const { data, error } = await client
    .from("cold_call_script")
    .upsert(
      { id: ROW_ID, html, updated_at: new Date().toISOString(), updated_by: adminId },
      { onConflict: "id" },
    )
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save script" }, { status: 500 });
  }

  await logAdminAction(client, adminId, "coldcall.script.update", null, {
    length: html.length,
  });

  return Response.json({
    html: (data as { html: string }).html,
    updatedAt: (data as { updated_at: string | null }).updated_at,
  });
};
