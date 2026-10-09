import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { deleteAdCreative, listAdCreatives } from "../../../../../../lib/adCreativeFiles";

// DELETE /api/admin/clients/:tenantId/ads/creative-files/:id -> { files }
//
// Removes the file from storage and its row. Scoped to the tenant in the path,
// so an id from another client is a 404. Owner only.

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const id = ctx.params.id as string;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "invalid id" }, { status: 400 });

  const out = await deleteAdCreative(client, tenantId, id);
  if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
  return Response.json({ files: await listAdCreatives(client, tenantId) });
};
