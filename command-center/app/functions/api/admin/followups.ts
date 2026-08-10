import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import {
  CONVERSION_ASSET_SELECT,
  patchColumns,
  toConversionAsset,
  type ConversionAssetPatch,
  type ConversionAssetRow,
} from "../../lib/conversionAssets";

// Conversion assets (0093, 0095, 0096).
//
//   GET    /api/admin/followups?tenantId=...          -> { pages }
//   POST   /api/admin/followups?tenantId=...          -> { page }
//   PATCH  /api/admin/followups?tenantId=...&id=...   -> { page }
//   DELETE /api/admin/followups?tenantId=...&id=...   -> { ok: true }
//
// The path and the `pages` key are historical: these were follow-up pages
// before the SMS went universal. Renaming a live route buys nothing a comment
// does not, and the shape on the wire is the same either way.
//
// Unlike the ad workspace (0091) there IS a POST here, because an asset is a
// published artefact at a real URL rather than the current state of some work.
// A client has three at once, none of them a version of the other, so one
// cannot be upserted over the top of its siblings.
//
// Every write carries tenantId AND is filtered by it, so an id belonging to
// another client cannot be reached by guessing it. That matters more here than
// in most admin routes: these rows are per-client and the operator switches
// client with a picker, so a stale id in a retried request is a real shape.
//
// Admin-only: gated centrally in api/_middleware.ts. This must never become
// client-reachable. It holds copy that has not shipped.

// The tenant and (where required) the row id, or a Response explaining what is
// missing. Every handler starts here so the checks cannot drift apart.
function params(request: Request, needId: boolean) {
  const url = new URL(request.url);
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim();
  if (!tenantId) return { error: Response.json({ error: "tenantId is required" }, { status: 400 }) };
  const id = (url.searchParams.get("id") ?? "").trim();
  if (needId && !id) return { error: Response.json({ error: "id is required" }, { status: 400 }) };
  return { tenantId, id };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const p = params(ctx.request, false);
  if (p.error) return p.error;

  const { data, error } = await client
    .from("followup_pages")
    .select(CONVERSION_ASSET_SELECT)
    .eq("tenant_id", p.tenantId)
    // Oldest first. The SEND order is not sortable in SQL (it is the order of
    // ASSET_KINDS, not alphabetical), so the screen places each row into its
    // slot and this ordering only has to be stable.
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // No rows is the normal state for a client nobody has built for yet, not a
  // 404: the screen shows three empty slots.
  const pages = ((data ?? []) as unknown as ConversionAssetRow[]).map(toConversionAsset);
  return Response.json({ pages });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const p = params(ctx.request, false);
  if (p.error) return p.error;

  let body: ConversionAssetPatch = {};
  try {
    body = (await ctx.request.json()) as ConversionAssetPatch;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const insert = { tenant_id: p.tenantId, ...patchColumns(body) };

  const { data, error } = await client
    .from("followup_pages")
    .insert(insert)
    .select(CONVERSION_ASSET_SELECT)
    .single();

  if (error || !data) return Response.json({ error: conflict(error) }, { status: 500 });
  return Response.json({ page: toConversionAsset(data as unknown as ConversionAssetRow) });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const p = params(ctx.request, true);
  if (p.error) return p.error;

  let body: ConversionAssetPatch = {};
  try {
    body = (await ctx.request.json()) as ConversionAssetPatch;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update = patchColumns(body);
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from("followup_pages")
    .update(update)
    .eq("id", p.id)
    // Scoped to the tenant as well as the id, so a stale id from another
    // client updates nothing instead of updating someone else's asset.
    .eq("tenant_id", p.tenantId)
    .select(CONVERSION_ASSET_SELECT)
    .maybeSingle();

  if (error) return Response.json({ error: conflict(error) }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ page: toConversionAsset(data as unknown as ConversionAssetRow) });
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const p = params(ctx.request, true);
  if (p.error) return p.error;

  const { error } = await client
    .from("followup_pages")
    .delete()
    .eq("id", p.id)
    .eq("tenant_id", p.tenantId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};

// The database errors an operator can actually cause, said in their words.
// 23505 on this table is one of two unique indexes, and "duplicate key value
// violates unique constraint" tells somebody who opened the same slot in two
// tabs nothing about what to do next.
//
// The index NAME is what separates them. Both are per-tenant, and the kind one
// is the likelier of the two now that slugs are fixed rather than typed.
function conflict(error: { code?: string; message?: string } | null): string {
  if (error?.code === "23505") {
    if (error.message?.includes("tenant_kind")) {
      return "This client already has that conversion asset. Open the existing one instead.";
    }
    return "That path is already used by another asset for this client.";
  }
  return error?.message ?? "could not save the asset";
}
