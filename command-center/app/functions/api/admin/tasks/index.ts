import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// Shape returned to the admin console. tenantId null means an agency-wide task;
// the matching tenant name is joined in so the UI can label the category chip
// without a second round-trip.
interface TaskRow {
  id: string;
  tenant_id: string | null;
  pillar_id: string | null;
  title: string;
  note: string | null;
  due_date: string | null;
  completed: boolean;
  created_at: string;
  tenants: { name: string } | null;
}

const SELECT = "id, tenant_id, pillar_id, title, note, due_date, completed, created_at, tenants(name)";

function toTask(row: TaskRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    pillarId: row.pillar_id,
    clientName: row.tenants?.name ?? null,
    title: row.title,
    note: row.note,
    dueDate: row.due_date,
    completed: row.completed,
    createdAt: row.created_at,
  };
}

// GET /api/admin/tasks  (admin-only, gated in _middleware.ts)
// Two scopes, by the optional ?pillarId query param:
//   ?pillarId=<id>  -> that pillar's tasks, open first then seed/added order.
//   (omitted)       -> the standalone agency/client tasks only (pillar_id null),
//                      so seeded pillar tasks never leak into the /admin/tasks page.
// Shared across admins.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const pillarId = new URL(ctx.request.url).searchParams.get("pillarId");

  let query = client.from("admin_tasks").select(SELECT).order("completed", { ascending: true });
  query = pillarId
    ? query.eq("pillar_id", pillarId).order("created_at", { ascending: true })
    : query.is("pillar_id", null).order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tasks = ((data ?? []) as unknown as TaskRow[]).map(toTask);
  return Response.json({ tasks });
};

interface CreateBody {
  title?: string;
  // The client this task is for. Omit or null for an agency-wide task.
  tenantId?: string | null;
  // A pillar id (operations, outreach, ...) makes this a pillar task. When set,
  // tenant_id is forced null: a task is a pillar task or a client task, never both.
  pillarId?: string | null;
  // Optional context line shown under the title.
  note?: string | null;
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

  const pillarId = body.pillarId ? body.pillarId : null;
  const note = body.note && body.note.trim() ? body.note.trim() : null;

  const insert = {
    title,
    pillar_id: pillarId,
    note,
    // A pillar task is never also a client task.
    tenant_id: pillarId ? null : body.tenantId ? body.tenantId : null,
    due_date: body.dueDate ? body.dueDate : null,
    created_by: ctx.data.admin!.id,
  };

  const { data, error } = await client
    .from("admin_tasks")
    .insert(insert)
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not create task" }, { status: 500 });
  }

  return Response.json({ task: toTask(data as unknown as TaskRow) }, { status: 201 });
};
