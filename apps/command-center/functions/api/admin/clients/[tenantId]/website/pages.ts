import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { sanitizeWebsitePages, toPageItems } from "../../../../../lib/websitePages";

// Admin-tenant mirror of /api/website/pages for the Fulfillment cockpit
// (Web Design > Pages). Reads and writes the client's manual page list on the
// tenant row (tenants.website_pages, 0028) instead of GoHighLevel. Auth is
// enforced upstream (admin session only); do not re-check here.
//
// GET  /api/admin/clients/:tenantId/website/pages
//   -> { site: null, pages: [...], unavailable: false }
// PUT  /api/admin/clients/:tenantId/website/pages   body { pages: [{name,path}] }
//   -> { ok: true, pages: [...] }   (the sanitized, saved list)

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const pages = toPageItems(sanitizeWebsitePages(tenant.website_pages));
  return Response.json({ site: null, pages, unavailable: false });
};

interface PutBody {
  pages?: unknown;
}

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: PutBody = {};
  try {
    body = (await ctx.request.json()) as PutBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // sanitizeWebsitePages tolerates any shape: trims, forces leading slashes,
  // drops blank rows, caps the list. The stored value is always clean.
  const rows = sanitizeWebsitePages(body.pages);

  const { error } = await client
    .from("tenants")
    .update({ website_pages: rows })
    .eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.website_pages.update", tenantId, {
    count: rows.length,
  });

  return Response.json({ ok: true, pages: toPageItems(rows) });
};
