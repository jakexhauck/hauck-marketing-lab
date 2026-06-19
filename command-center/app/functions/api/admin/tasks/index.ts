import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// Shape returned to the admin console. tenantId null means an agency-wide task;
// the matching tenant name is joined in so the UI can label the category chip
// without a second round-trip.
interface TaskRow {
  id: string;
  tenant_id: string | null;
  title: string;
  due_date: string | null;
  completed: boolean;
  created_at: string;
  tenants: { name: string } | null;
}

function toTask(row: TaskRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientName: row.tenants?.name ?? null,
    title: row.title,
    dueDate: row.due_date,
    completed: row.completed,
    createdAt: row.created_at,
  };
}

// GET /api/admin/tasks  (admin-only, gated in _middleware.ts)
// Every agency task, open ones first. Shared across admins.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("admin_tasks")
    .select("id, tenant_id, title, due_date, completed, created_at, tenants(name)")
    .order("completed", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tasks = ((data ?? []) as unknown as TaskRow[]).map(toTask);
  return Response.json({ tasks });
};

interface CreateBody {
  title?: string;
  // The client this task is for. Omit or null for an agency-wide task.
  tenantId?: string | null;
  // ISO date (YYYY-MM-DD) or omit for no due date.
  dueDate?: string | null;
}

// POST /api/admin/tasks  (admin-only) — add a task.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  const insert = {
    title,
    tenant_id: body.tenantId ? body.tenantId : null,
    due_date: body.dueDate ? body.dueDate : null,
    created_by: ctx.data.admin!.id,
  };

  const { data, error } = await client
    .from("admin_tasks")
    .insert(insert)
    .select("id, tenant_id, title, due_date, completed, created_at, tenants(name)")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not create task" }, { status: 500 });
  }

  return Response.json({ task: toTask(data as unknown as TaskRow) }, { status: 201 });
};
