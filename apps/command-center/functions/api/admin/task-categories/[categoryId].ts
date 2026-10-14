import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  DEFAULT_CATEGORY_COLOR,
  isValidColor,
  normalizeCategoryName,
} from "../../../lib/taskCategories";

const SELECT = "id, name, color, sort_order, created_at";

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

function toCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    color: isValidColor(row.color) ? row.color : DEFAULT_CATEGORY_COLOR,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function isDuplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

interface PatchBody {
  name?: string;
  color?: string;
}

// PATCH /api/admin/task-categories/:categoryId  (admin-only): rename or
// recolour. Only the fields present in the body are touched.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const categoryId = ctx.params.categoryId as string;

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string") {
    const name = normalizeCategoryName(body.name);
    // Clearing a name would leave an unlabelled chip, so an empty rename is a
    // rejection rather than a write.
    if (!name) return Response.json({ error: "name cannot be empty" }, { status: 400 });
    update.name = name;
  }

  if (body.color !== undefined) {
    if (!isValidColor(body.color)) {
      return Response.json({ error: "invalid color" }, { status: 400 });
    }
    update.color = body.color;
  }

  const { data, error } = await client
    .from("admin_task_categories")
    .update(update)
    .eq("id", categoryId)
    .select(SELECT)
    .single();

  if (isDuplicate(error)) {
    return Response.json({ error: `"${update.name as string}" already exists` }, { status: 409 });
  }
  if (error || !data) {
    return Response.json({ error: error?.message ?? "category not found" }, { status: 404 });
  }

  const category = toCategory(data as unknown as CategoryRow);
  await logAdminAction(client, ctx.data.admin!.id, "task_category.update", null, { categoryId });

  return Response.json({ category });
};

// DELETE /api/admin/task-categories/:categoryId  (admin-only): remove one.
//
// The tasks filed under it are NOT deleted. admin_tasks.category_id is
// ON DELETE SET NULL (0063), so they fall back to Uncategorised and stay in the
// checklist. Deleting a label must never delete the work.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const categoryId = ctx.params.categoryId as string;
  const { error } = await client.from("admin_task_categories").delete().eq("id", categoryId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "task_category.delete", null, { categoryId });

  return Response.json({ ok: true });
};
