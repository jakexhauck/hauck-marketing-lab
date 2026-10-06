import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";

// POST /api/admin/setter/script/undo   body { tenantId }
// Puts back the script that "Write from template" replaced. One step only: the
// restored script has nothing behind it. Owner only.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (!admin || admin.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await readJsonBody<{ tenantId?: string }>(ctx.request);
  const tenantId = (body?.tenantId ?? "").trim();
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: row, error: readErr } = await client
    .from("setter_scripts")
    .select("previous_html")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
  const previous = (row as { previous_html?: string | null } | null)?.previous_html;
  if (previous === null || previous === undefined) return Response.json({ error: "Nothing to undo" }, { status: 400 });

  const { data, error } = await client
    .from("setter_scripts")
    .update({ html: previous, previous_html: null, updated_at: new Date().toISOString(), updated_by: admin.id })
    .eq("tenant_id", tenantId)
    .select("html, updated_at")
    .single();
  if (error || !data) return Response.json({ error: error?.message ?? "could not undo" }, { status: 500 });

  await logAdminAction(client, admin.id, "setter.script.undo", tenantId);
  return Response.json({
    html: (data as { html: string }).html,
    updatedAt: (data as { updated_at: string | null }).updated_at,
  });
};
