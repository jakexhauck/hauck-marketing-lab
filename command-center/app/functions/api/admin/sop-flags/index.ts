import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// SOP triage flags for the admin SOP Hub checkboxes (migration 0017).
// A row's presence means "considered for an SOP checklist". Shared across
// admins. Admin-only: gated centrally in api/_middleware.ts.

// GET /api/admin/sop-flags — every considered SOP as { catKey, slug }.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  // Degrade gracefully when Supabase is unconfigured: the hub still renders,
  // just with no saved ticks, instead of erroring the whole page.
  if (!client) return Response.json({ flags: [] });

  const { data, error } = await client
    .from("admin_sop_flags")
    .select("cat_key, slug")
    .eq("considered", true);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const flags = (data ?? []).map((r) => ({ catKey: r.cat_key as string, slug: r.slug as string }));
  return Response.json({ flags });
};

interface FlagBody {
  catKey?: string;
  slug?: string;
  // true ticks the box (upsert the row); false unticks it (delete the row).
  considered?: boolean;
}

// POST /api/admin/sop-flags — set one SOP's considered state.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: FlagBody = {};
  try {
    body = (await ctx.request.json()) as FlagBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const catKey = (body.catKey ?? "").trim();
  const slug = (body.slug ?? "").trim();
  if (!catKey || !slug) {
    return Response.json({ error: "catKey and slug are required" }, { status: 400 });
  }

  if (body.considered) {
    const { error } = await client
      .from("admin_sop_flags")
      .upsert(
        { cat_key: catKey, slug, considered: true, updated_at: new Date().toISOString() },
        { onConflict: "cat_key,slug" },
      );
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await client
      .from("admin_sop_flags")
      .delete()
      .eq("cat_key", catKey)
      .eq("slug", slug);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
};
