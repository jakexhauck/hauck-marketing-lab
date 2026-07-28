import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  DEFAULT_CATEGORY_COLOR,
  isValidColor,
  normalizeCategoryName,
} from "../../../lib/taskCategories";

// The operator's own task categories (0063). Read by the admin Tasks tab to
// draw its filter chips and its per-row dropdown; written by the same tab's
// "Manage categories" panel. Admin-only, gated in _middleware.ts.

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

const SELECT = "id, name, color, sort_order, created_at";

function toCategory(row: CategoryRow) {
  return {
    id: row.id,
    name: row.name,
    // A row written before a palette token was renamed still has to render, so
    // an unrecognised colour falls back rather than reaching the page unstyled.
    color: isValidColor(row.color) ? row.color : DEFAULT_CATEGORY_COLOR,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// Postgres unique_violation: the lower(name) index caught a duplicate.
function isDuplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

// GET /api/admin/task-categories: the whole list in display order.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("admin_task_categories")
    .select(SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const categories = ((data ?? []) as unknown as CategoryRow[]).map(toCategory);
  return Response.json({ categories });
};

interface CreateBody {
  name?: string;
  color?: string;
}

// POST /api/admin/task-categories: add one. Appends to the end of the list.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // Unlike a task, a category with no name is meaningless: it would be an
  // unlabelled chip nobody could file anything under on purpose.
  const name = normalizeCategoryName(body.name ?? "");
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  if (body.color !== undefined && !isValidColor(body.color)) {
    return Response.json({ error: "invalid color" }, { status: 400 });
  }

  // Append: one past the highest position. A read-then-write race would only
  // tie two rows, which the created_at tiebreak in the ordering resolves.
  const { data: last } = await client
    .from("admin_task_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await client
    .from("admin_task_categories")
    .insert({
      name,
      color: body.color ?? DEFAULT_CATEGORY_COLOR,
      sort_order: nextOrder,
    })
    .select(SELECT)
    .single();

  if (isDuplicate(error)) {
    return Response.json({ error: `"${name}" already exists` }, { status: 409 });
  }
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not create category" }, { status: 500 });
  }

  const category = toCategory(data as unknown as CategoryRow);
  await logAdminAction(client, ctx.data.admin!.id, "task_category.create", null, {
    categoryId: category.id,
  });

  return Response.json({ category }, { status: 201 });
};
