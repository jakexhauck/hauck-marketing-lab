import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";
import { toCreativesFolder } from "../../lib/creativesFolder";
import { listCreatives } from "../../lib/creativesList";

// GET /api/ads/creatives-folder -> { folderId, url, connected, files, error }
//
// The client's own view of their ad creatives: where the folder is, and what is
// in it. READ ONLY on purpose: the folder is chosen by an operator on the admin
// route, and a client must not be able to repoint themselves at someone else's
// folder.
//
// Scoped to the session tenant, so this can only ever return the caller's own
// folder regardless of what they send.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const { data, error } = await client
    .from("tenants")
    .select("creatives_drive_folder_id")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const folder = toCreativesFolder(data?.creatives_drive_folder_id as string | null);
  const listing = await listCreatives(ctx.env, folder.folderId);

  return Response.json({ ...folder, ...listing });
};
