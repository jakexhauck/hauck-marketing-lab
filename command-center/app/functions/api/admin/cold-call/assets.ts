import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { sanitizeScriptHtml, MAX_SCRIPT_HTML } from "../../../lib/setterScript";
import {
  cleanCategory,
  cleanName,
  isAssetKind,
  statsByScript,
  type ScriptDialRow,
} from "../../../lib/coldCallAssets";

// GET    /api/admin/cold-call/assets   -> every live script and asset, with the
//                                         per-variation numbers
// POST   /api/admin/cold-call/assets   -> create one            (owner)
// PATCH  /api/admin/cold-call/assets   -> rename / rewrite / reorder / archive
//                                         (owner)
// DELETE /api/admin/cold-call/assets   -> remove one            (owner)
//
// The shelf a cold caller reads from: four variations of the pitch, plus
// whatever else Jake files under his own headings. Migration 0058.
//
// A caller may GET (they read these while dialing) and nothing else. The role
// allowlist in functions/lib/adminRoles.ts already says so; the owner check on
// each write below is the second lock on the same door, matching the single
// script endpoint this replaces.
//
// The sanitizer is the trust boundary, inherited unchanged from 0044/0048: every
// write goes through sanitizeScriptHtml, so the column can only ever hold markup
// the floating panel is safe to render verbatim.
//
// The numbers on the GET are DERIVED from cold_call_dials on every read, never
// stored. That is the whole reason the script test is worth having: nobody can
// type a number next to their favourite script.

const SELECT =
  "id, kind, category, name, html, sort_order, archived_at, updated_at";

interface AssetRow {
  id: string;
  kind: string;
  category: string;
  name: string;
  html: string;
  sort_order: number;
  archived_at: string | null;
  updated_at: string;
}

function shape(row: AssetRow, stats: ReturnType<typeof statsByScript>) {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    name: row.name,
    html: row.html,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    // Only a script is the unit of the test, so only a script carries numbers.
    // A zeroed object rather than null, so a variation nobody has dialed yet
    // renders as a measured nothing rather than a missing thing.
    stats:
      row.kind === "script"
        ? (stats[row.id] ?? { dials: 0, pickups: 0, booked: 0, bookingRate: null })
        : null,
  };
}

function ownerOnly(ctx: { data: ApiData }): Response | null {
  if (ctx.data.admin?.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  // The caller's picker wants live rows only; Settings asks for everything so an
  // archived variation can still be seen and restored.
  const includeArchived = url.searchParams.get("archived") === "1";

  let query = client.from("cold_call_assets").select(SELECT);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[cold-call/assets] read failed", error.message);
    return Response.json({ error: "could not read the shelf" }, { status: 500 });
  }

  // Two small columns for the whole history of the test. Fine at this volume; if
  // the dial table ever grows past comfort, window this by date rather than
  // sampling it, because a script test with half its dials missing is worse than
  // no script test.
  const { data: dialRows } = await client
    .from("cold_call_dials")
    .select("script_id, outcome")
    .not("script_id", "is", null);

  const stats = statsByScript((dialRows ?? []) as ScriptDialRow[]);
  const assets = ((data ?? []) as AssetRow[]).map((r) => shape(r, stats));

  return Response.json({ assets });
};

interface PostBody {
  kind?: unknown;
  name?: unknown;
  category?: unknown;
  html?: unknown;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  if (!isAssetKind(body.kind)) return Response.json({ error: "bad_kind" }, { status: 400 });
  const name = cleanName(body.name);
  if (!name) {
    return Response.json({ error: "Give it a name so it can be told apart." }, { status: 400 });
  }
  // A script belongs to the test, not to a folder, so it never carries one.
  const category = body.kind === "asset" ? cleanCategory(body.category) : "";

  const html = typeof body.html === "string" ? body.html : "";
  if (html.length > MAX_SCRIPT_HTML) {
    return Response.json({ error: "too_long" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const adminId = ctx.data.admin!.id;

  // New rows go to the bottom of their own kind. Reading the current maximum is
  // a race in theory and not in practice: one owner, one Settings page.
  const { data: last } = await client
    .from("cold_call_assets")
    .select("sort_order")
    .eq("kind", body.kind)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await client
    .from("cold_call_assets")
    .insert({
      kind: body.kind,
      category,
      name,
      html: await sanitizeScriptHtml(html),
      sort_order: sortOrder,
      updated_by: adminId,
    })
    .select(SELECT)
    .single();
  if (error || !data) {
    console.error("[cold-call/assets] insert failed", error?.message);
    return Response.json({ error: "could not add that" }, { status: 500 });
  }

  await logAdminAction(client, adminId, "coldcall.asset.create", null, {
    kind: body.kind,
    name,
  });

  return Response.json({ asset: shape(data as AssetRow, {}) }, { status: 201 });
};

interface PatchBody {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  html?: unknown;
  sortOrder?: unknown;
  // true archives, false restores. Absent leaves it alone.
  archived?: unknown;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<PatchBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: existing } = await client
    .from("cold_call_assets")
    .select("id, kind")
    .eq("id", id)
    .maybeSingle();
  const current = existing as { id: string; kind: string } | null;
  if (!current) return Response.json({ error: "not found" }, { status: 404 });

  // Only the fields actually sent are touched, so the autosaving editor can
  // PATCH html alone without clearing a name typed in another field.
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.data.admin!.id,
  };

  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) {
      return Response.json({ error: "Give it a name so it can be told apart." }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.category !== undefined && current.kind === "asset") {
    patch.category = cleanCategory(body.category);
  }
  if (body.html !== undefined) {
    if (typeof body.html !== "string") {
      return Response.json({ error: "missing_html" }, { status: 400 });
    }
    if (body.html.length > MAX_SCRIPT_HTML) {
      return Response.json({ error: "too_long" }, { status: 400 });
    }
    patch.html = await sanitizeScriptHtml(body.html);
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n)) return Response.json({ error: "bad_order" }, { status: 400 });
    patch.sort_order = n;
  }
  if (body.archived !== undefined) {
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }

  const { data, error } = await client
    .from("cold_call_assets")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error || !data) {
    console.error("[cold-call/assets] update failed", error?.message);
    return Response.json({ error: "could not save that" }, { status: 500 });
  }

  return Response.json({ asset: shape(data as AssetRow, {}) });
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<{ id?: unknown }>(ctx.request);
  const id = body && typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  // A variation with dials against it is the record of a test that was run.
  // Deleting it detaches those dials from the thing they measured, so it is
  // refused and archiving is offered instead. This is the only place the
  // difference between archive and delete is enforced rather than merely
  // recommended.
  const { count } = await client
    .from("cold_call_dials")
    .select("id", { count: "exact", head: true })
    .eq("script_id", id);
  if ((count ?? 0) > 0) {
    return Response.json(
      {
        error:
          `${count} recorded ${count === 1 ? "dial was" : "dials were"} made from this script. ` +
          "Archive it instead, so its numbers survive.",
      },
      { status: 409 },
    );
  }

  const { error } = await client.from("cold_call_assets").delete().eq("id", id);
  if (error) {
    console.error("[cold-call/assets] delete failed", error.message);
    return Response.json({ error: "could not remove that" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "coldcall.asset.delete", null, { id });

  return Response.json({ ok: true });
};
