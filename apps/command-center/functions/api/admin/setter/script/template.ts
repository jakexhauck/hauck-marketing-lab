import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { exportDocHtml, resolveDriveAccount } from "../../../../lib/driveComposio";
import { MAX_SCRIPT_HTML, sanitizeScriptHtml } from "../../../../lib/setterScript";
import {
  DIALING_TEMPLATE_DOC_ID,
  countCompanyTokens,
  docExportToScript,
  fillCompanyName,
} from "../../../../lib/scriptTemplate";

// POST /api/admin/setter/script/template   body { tenantId }
//
// Setter Suite > Settings > Write from template. Reads the dialing script
// template from Drive (functions/lib/scriptTemplate.ts), fills in this client's
// company name, sanitizes it like any script save, and replaces the client's
// script. The one it replaced is kept for Undo (./undo.ts). Owner only.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (!admin || admin.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await readJsonBody<{ tenantId?: string }>(ctx.request);
  const tenantId = (body?.tenantId ?? "").trim();
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenant } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const name = ((tenant as { name?: string } | null)?.name ?? "").trim();
  if (!name) return Response.json({ error: "Client not found" }, { status: 404 });

  let exported: string;
  try {
    exported = await exportDocHtml(ctx.env, await resolveDriveAccount(ctx.env), DIALING_TEMPLATE_DOC_ID);
  } catch (err) {
    return Response.json({ error: `Could not read the template from Drive: ${(err as Error).message}` }, { status: 502 });
  }

  const script = docExportToScript(exported);
  const filled = countCompanyTokens(script);
  const html = await sanitizeScriptHtml(fillCompanyName(script, name));
  if (html.length > MAX_SCRIPT_HTML) return Response.json({ error: "The template is too long" }, { status: 400 });

  const { data: current } = await client.from("setter_scripts").select("html").eq("tenant_id", tenantId).maybeSingle();
  const previous = (current as { html?: string } | null)?.html ?? null;

  const { data, error } = await client
    .from("setter_scripts")
    .upsert(
      {
        tenant_id: tenantId,
        html,
        previous_html: previous,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      },
      { onConflict: "tenant_id" },
    )
    .select("html, updated_at")
    .single();
  if (error || !data) return Response.json({ error: error?.message ?? "could not save script" }, { status: 500 });

  await logAdminAction(client, admin.id, "setter.script.template", tenantId, { filled });
  return Response.json({
    html: (data as { html: string }).html,
    updatedAt: (data as { updated_at: string | null }).updated_at,
    filled,
    canUndo: previous !== null,
  });
};
