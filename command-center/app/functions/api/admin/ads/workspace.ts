import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  AD_WORKSPACE_SELECT,
  emptyWorkspace,
  patchColumns,
  toAdWorkspace,
  type AdWorkspacePatch,
  type AdWorkspaceRow,
} from "../../../lib/adWorkspace";

// The ad builder's one workspace per client (0091).
//
//   GET   /api/admin/ads/workspace?tenantId=...  -> { workspace }
//   PATCH /api/admin/ads/workspace?tenantId=...  -> { workspace }
//
// There is no POST. A workspace is not created, it simply exists: a client who
// has never been written for reads as an empty one and the first PATCH upserts
// the row. That is why tenant_id is the primary key.
//
// Admin-only: gated centrally in api/_middleware.ts. This must never become
// client-reachable. It holds competitor research and copy that has not launched.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const { data, error } = await client
    .from("ad_workspace")
    .select(AD_WORKSPACE_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // No row is the normal state for a client nobody has written for yet, not a
  // 404: the three pages open ready to type.
  const workspace = data
    ? toAdWorkspace(data as unknown as AdWorkspaceRow)
    : emptyWorkspace(tenantId);

  return Response.json({ workspace });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  let body: AdWorkspacePatch = {};
  try {
    body = (await ctx.request.json()) as AdWorkspacePatch;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update = patchColumns(body);
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  // Upsert, because the first edit to a client is also the row's creation. The
  // conflict target is the primary key, so a second writer updates rather than
  // failing on a duplicate.
  const { data, error } = await client
    .from("ad_workspace")
    .upsert({ tenant_id: tenantId, ...update }, { onConflict: "tenant_id" })
    .select(AD_WORKSPACE_SELECT)
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "could not save the workspace" },
      { status: 500 },
    );
  }

  return Response.json({ workspace: toAdWorkspace(data as unknown as AdWorkspaceRow) });
};
