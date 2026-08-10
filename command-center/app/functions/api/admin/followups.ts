import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import {
  FOLLOWUP_PAGE_SELECT,
  cleanFollowupType,
  cleanStep,
  patchColumns,
  toFollowupPage,
  type FollowupPagePatch,
  type FollowupPageRow,
  type FollowupType,
} from "../../lib/followupPages";

// SMS follow-up asset pages (0093).
//
//   GET    /api/admin/followups?tenantId=...          -> { pages }
//   POST   /api/admin/followups?tenantId=...          -> { page }
//   PATCH  /api/admin/followups?tenantId=...&id=...   -> { page }
//   DELETE /api/admin/followups?tenantId=...&id=...   -> { ok: true }
//
// Unlike the ad workspace (0091) there IS a POST here, because a page is a
// published artefact at a real URL rather than the current state of some work.
// Two exist at once for new-lead follow ups and neither is a version of the
// other, so one cannot be upserted over the top of its sibling.
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
    .select(FOLLOWUP_PAGE_SELECT)
    .eq("tenant_id", p.tenantId)
    // The sequence order, which is the order they are sent in. Newest last:
    // this list reads as a sequence, not as a feed.
    .order("followup_type", { ascending: true })
    .order("step", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // No rows is the normal state for a client nobody has written for yet, not a
  // 404: the wizard opens ready to start one.
  const pages = ((data ?? []) as unknown as FollowupPageRow[]).map(toFollowupPage);
  return Response.json({ pages });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const p = params(ctx.request, false);
  if (p.error) return p.error;

  let body: FollowupPagePatch = {};
  try {
    body = (await ctx.request.json()) as FollowupPagePatch;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const type = cleanFollowupType(body.followupType);
  const insert = {
    tenant_id: p.tenantId,
    ...patchColumns(body, type),
    // Always present on a create, so a row can never exist without a sequence
    // or a step even if the body named neither.
    followup_type: type,
    step: cleanStep(body.step, type),
  };

  const { data, error } = await client
    .from("followup_pages")
    .insert(insert)
    .select(FOLLOWUP_PAGE_SELECT)
    .single();

  if (error || !data) return Response.json({ error: slugConflict(error) }, { status: 500 });
  return Response.json({ page: toFollowupPage(data as unknown as FollowupPageRow) });
};

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const p = params(ctx.request, true);
  if (p.error) return p.error;

  let body: FollowupPagePatch = {};
  try {
    body = (await ctx.request.json()) as FollowupPagePatch;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // step is clamped against the follow-up type, and one request can change
  // both, so the type AFTER this patch has to be resolved before the columns
  // are built. When the body does not name a type, the stored one is read
  // rather than assumed: defaulting to new-leads would silently cap an
  // estimate-assets page at step 2.
  let type: FollowupType;
  if (body.followupType !== undefined) {
    type = cleanFollowupType(body.followupType);
  } else {
    const { data: current } = await client
      .from("followup_pages")
      .select("followup_type")
      .eq("id", p.id)
      .eq("tenant_id", p.tenantId)
      .maybeSingle();
    if (!current) return Response.json({ error: "not found" }, { status: 404 });
    type = cleanFollowupType((current as { followup_type: string }).followup_type);
  }

  const update = patchColumns(body, type);
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from("followup_pages")
    .update(update)
    .eq("id", p.id)
    // Scoped to the tenant as well as the id, so a stale id from another
    // client updates nothing instead of updating someone else's page.
    .eq("tenant_id", p.tenantId)
    .select(FOLLOWUP_PAGE_SELECT)
    .maybeSingle();

  if (error) return Response.json({ error: slugConflict(error) }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ page: toFollowupPage(data as unknown as FollowupPageRow) });
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

// The one database error an operator can actually cause, said in their words.
// 23505 on this table is always the (tenant_id, slug) index, and "duplicate key
// value violates unique constraint" tells somebody who picked a URL twice
// nothing about what to do next.
function slugConflict(error: { code?: string; message?: string } | null): string {
  if (error?.code === "23505") return "That slug is already used by another page for this client.";
  return error?.message ?? "could not save the page";
}
