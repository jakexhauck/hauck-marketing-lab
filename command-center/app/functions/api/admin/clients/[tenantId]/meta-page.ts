import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { resolveMetaToken } from "../../../../lib/metaToken";
import { listReachablePages } from "../../../../lib/metaPages";

// GET /api/admin/clients/:tenantId/meta-page   { pageId, pages: [{ id, name }] }
// PUT /api/admin/clients/:tenantId/meta-page   body { pageId }
//
// The client's Facebook Page, for Create in Meta on a lead form. The list is
// every Page the agency system user can reach (tokens never leave the server).
// Owner only.

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { data, error } = await client
    .from("tenants")
    .select("meta_page_id")
    .eq("id", ctx.params.tenantId as string)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const token = await resolveMetaToken(ctx.env);
  let pages: { id: string; name: string }[] = [];
  let pagesError: string | null = null;
  if (token) {
    try {
      pages = (await listReachablePages(token)).map(({ id, name }) => ({ id, name }));
    } catch (err) {
      pagesError = (err as Error).message;
    }
  } else {
    pagesError = "Meta is not connected";
  }
  return Response.json({
    pageId: (data as { meta_page_id?: string | null } | null)?.meta_page_id ?? null,
    pages,
    pagesError,
  });
};

export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  let body: { pageId?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
  if (pageId && !/^\d{5,25}$/.test(pageId)) return Response.json({ error: "Not a Page id" }, { status: 400 });
  const { error } = await client
    .from("tenants")
    .update({ meta_page_id: pageId || null })
    .eq("id", ctx.params.tenantId as string);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, pageId: pageId || null });
};
