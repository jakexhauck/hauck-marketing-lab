import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { deriveCoupling, isValidStatus, type TaskStatus } from "../../../lib/taskStatus";

// Shape returned to the admin console. tenantId null means an agency-wide task;
// the matching tenant name is joined in so the UI can label the category chip
// without a second round-trip.
interface TaskRow {
  id: string;
  tenant_id: string | null;
  pillar_id: string | null;
  category_id: string | null;
  title: string;
  note: string | null;
  due_date: string | null;
  completed: boolean;
  status: TaskStatus;
  updates: string | null;
  created_at: string;
  tenants: { name: string } | null;
}

const SELECT =
  "id, tenant_id, pillar_id, category_id, title, note, due_date, completed, status, updates, created_at, tenants(name)";

function toTask(row: TaskRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    pillarId: row.pillar_id,
    categoryId: row.category_id,
    clientName: row.tenants?.name ?? null,
    title: row.title,
    note: row.note,
    dueDate: row.due_date,
    completed: row.completed,
    // Rows written before 0032 land as 'todo' via the column default.
    status: isValidStatus(row.status) ? row.status : "todo",
    updates: row.updates,
    createdAt: row.created_at,
  };
}

// GET /api/admin/tasks  (admin-only, gated in _middleware.ts)
// Two scopes, by the optional ?pillarId query param:
//   ?pillarId=<id>  -> that pillar's tasks, open first then seed/added order.
//   (omitted)       -> the standalone agency/client tasks only (pillar_id null),
//                      so seeded pillar tasks never leak into the /admin/tasks page.
//                      Ordered by the drag-to-reorder position (0046), newest
//                      first as the tiebreak for rows that share one.
// Shared across admins.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const pillarId = new URL(ctx.request.url).searchParams.get("pillarId");

  let query = client.from("admin_tasks").select(SELECT).order("completed", { ascending: true });
  query = pillarId
    ? query.eq("pillar_id", pillarId).order("created_at", { ascending: true })
    : query
        .is("pillar_id", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

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
  // A row in admin_task_categories (0063). Omit or null for uncategorised.
  categoryId?: string | null;
  // Optional context line shown under the title.
  note?: string | null;
  // ISO date (YYYY-MM-DD) or omit for no due date.
  dueDate?: string | null;
  // The Operations checklist pill. Omit for 'todo'.
  status?: string;
  // The checklist's free-text "Updates" cell.
  updates?: string | null;
}

// POST /api/admin/tasks  (admin-only): add a task.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // The Operations checklist adds a blank row and focuses it, so a create with
  // no title key at all is valid. Callers that DO send a title still have to
  // send a non-empty one, which keeps the old behaviour intact.
  const title = (body.title ?? "").trim();
  if ("title" in body && !title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  if (body.status !== undefined && !isValidStatus(body.status)) {
    return Response.json({ error: "invalid status" }, { status: 400 });
  }

  const pillarId = body.pillarId ? body.pillarId : null;
  const note = body.note && body.note.trim() ? body.note.trim() : null;
  // A new row starts unchecked at 'todo'; creating one straight at 'done'
  // checks it off, via the same coupling the PATCH route uses.
  const coupled = deriveCoupling(
    { completed: false, status: "todo" },
    { status: body.status as TaskStatus | undefined },
  );

  // New rows land at the bottom of their scope's list: one past the highest
  // sort_order (0046). A read-then-write race would only tie two rows, which
  // the created_at tiebreak resolves, so no lock is needed for one operator.
  const { data: last } = await client
    .from("admin_tasks")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const insert = {
    title,
    pillar_id: pillarId,
    category_id: body.categoryId ? body.categoryId : null,
    note,
    // A pillar task is never also a client task.
    tenant_id: pillarId ? null : body.tenantId ? body.tenantId : null,
    due_date: body.dueDate ? body.dueDate : null,
    completed: coupled.completed,
    status: coupled.status,
    updates: body.updates && body.updates.trim() ? body.updates.trim() : null,
    created_by: ctx.data.admin!.id,
    sort_order: nextOrder,
  };

  const { data, error } = await client
    .from("admin_tasks")
    .insert(insert)
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not create task" }, { status: 500 });
  }

  const task = toTask(data as unknown as TaskRow);
  await logAdminAction(client, ctx.data.admin!.id, "task.create", task.tenantId, {
    taskId: task.id,
  });

  return Response.json({ task }, { status: 201 });
};
