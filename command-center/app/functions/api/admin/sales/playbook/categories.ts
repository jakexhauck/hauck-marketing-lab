import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { cleanCategory, isPlaybookSection } from "../../../../lib/salesPlaybook";

// POST   /api/admin/sales/playbook/categories -> add a heading to a column
// PATCH  /api/admin/sales/playbook/categories -> rename it / move it
// DELETE /api/admin/sales/playbook/categories -> remove it
//
// The headings inside the three columns of Sales > On Call. Migration 0075.
//
// There is no GET: the categories come back on /api/admin/sales/playbook beside
// the prompts, because no page has ever wanted one without the other and two
// reads would give the two lists two different moments to disagree in.
//
// Deleting a heading does NOT delete the prompts under it. category_id is
// ON DELETE SET NULL, so they fall loose to the bottom of their column where
// they are visible and can be refiled. A delete that silently took five
// questions off a sales call would be the worst bug this page could have.

const SELECT = "id, section, name, sort_order";

interface CategoryRow {
  id: string;
  section: string;
  name: string;
  sort_order: number;
}

function shape(row: CategoryRow) {
  return {
    id: row.id,
    section: row.section as "discovery" | "pitch" | "objections",
    name: row.name,
    sortOrder: row.sort_order,
  };
}

function ownerOnly(ctx: { data: ApiData }): Response | null {
  if (ctx.data.admin?.role !== "owner") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

interface PostBody {
  section?: unknown;
  name?: unknown;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  if (!isPlaybookSection(body.section)) {
    return Response.json({ error: "bad_section" }, { status: 400 });
  }
  const name = cleanCategory(body.name);
  if (!name) {
    return Response.json({ error: "Give the heading a name." }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const adminId = ctx.data.admin!.id;

  const { data: last } = await client
    .from("sales_playbook_categories")
    .select("sort_order")
    .eq("section", body.section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await client
    .from("sales_playbook_categories")
    .insert({ section: body.section, name, sort_order: sortOrder, updated_by: adminId })
    .select(SELECT)
    .single();
  if (error || !data) {
    console.error("[sales/playbook/categories] insert failed", error?.message);
    return Response.json({ error: "could not add that" }, { status: 500 });
  }

  await logAdminAction(client, adminId, "sales.playbook.category.create", null, {
    section: body.section,
    name,
  });

  return Response.json({ category: shape(data as CategoryRow) }, { status: 201 });
};

interface PatchBody {
  id?: unknown;
  name?: unknown;
  sortOrder?: unknown;
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

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.data.admin!.id,
  };

  if (body.name !== undefined) {
    const name = cleanCategory(body.name);
    if (!name) return Response.json({ error: "Give the heading a name." }, { status: 400 });
    patch.name = name;
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isFinite(n)) return Response.json({ error: "bad_sort" }, { status: 400 });
    patch.sort_order = Math.trunc(n);
  }

  // The section is deliberately not patchable. Moving a heading between columns
  // would strand every prompt filed under it in the column it came from, which
  // is a worse answer than making a new heading and refiling them.
  const { data, error } = await client
    .from("sales_playbook_categories")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error) {
    console.error("[sales/playbook/categories] update failed", error.message);
    return Response.json({ error: "could not save that" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({ category: shape(data as CategoryRow) });
};

interface DeleteBody {
  id?: unknown;
}

// Removes the heading only. The prompts under it fall loose (ON DELETE SET
// NULL) and appear at the bottom of the same column, still on the call.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const denied = ownerOnly(ctx);
  if (denied) return denied;

  const body = await readJsonBody<DeleteBody>(ctx.request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { error } = await client.from("sales_playbook_categories").delete().eq("id", id);
  if (error) {
    console.error("[sales/playbook/categories] delete failed", error.message);
    return Response.json({ error: "could not remove that" }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "sales.playbook.category.delete", null, { id });

  return Response.json({ ok: true });
};
