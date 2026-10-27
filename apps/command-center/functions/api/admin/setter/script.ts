import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  sanitizeScriptHtml,
  scriptColumn,
  validateScriptBody,
  type ScriptBody,
} from "../../../lib/setterScript";

// GET/PATCH /api/admin/setter/script (admin-only, gated in _middleware.ts).
// One formatted dialing script per client, backing the Setter Suite's
// Settings tab and the cockpit's script overlay. See migration 0044 and
// functions/lib/setterScript.ts (the sanitizer is the trust boundary; every
// write passes through it, so reads render verbatim).
//
// ?doc=notes (GET) or doc: "notes" (PATCH) is the client's notes instead, the
// second document in the same row (0185, Client Setting, Jake 2026-10-27).

// GET never 404s: a client with no saved script comes back as empty html,
// so "no script yet" is a rendering decision, not an error state.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const params = new URL(ctx.request.url).searchParams;
  const tenantId = params.get("tenantId");
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  const column = scriptColumn(params.get("doc"));

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("setter_scripts")
    .select(`${column}, updated_at`)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) return Response.json({ html: "", updatedAt: null });
  const row = data as unknown as Record<string, string | null>;
  return Response.json({ html: row[column] ?? "", updatedAt: row.updated_at });
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
  const column = scriptColumn(body.doc);

  // Only the one column: an upsert updates what it is given, so saving the
  // notes never touches the script and the other way round.
  const { data, error } = await client
    .from("setter_scripts")
    .upsert(
      { tenant_id: tenantId, [column]: html, updated_at: new Date().toISOString(), updated_by: adminId },
      { onConflict: "tenant_id" },
    )
    .select(`${column}, updated_at`)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save script" }, { status: 500 });
  }

  await logAdminAction(client, adminId, column === "notes_html" ? "setter.notes.update" : "setter.script.update", tenantId, {
    bytes: html.length,
  });

  // Read back what actually landed (sanitized), so the editor reconciles
  // against the stored document rather than what it optimistically sent.
  const row = data as unknown as Record<string, string | null>;
  return Response.json({ html: row[column] ?? "", updatedAt: row.updated_at });
};
