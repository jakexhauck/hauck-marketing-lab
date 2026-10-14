import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { deriveCoupling, isValidStatus, type TaskStatus } from "../../../lib/taskStatus";

const SELECT =
  "id, tenant_id, pillar_id, category_id, title, note, due_date, completed, status, updates, created_at, tenants(name)";

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

interface PatchBody {
  title?: string;
  // null clears the client back to agency-wide; a string re-tags to a client.
  tenantId?: string | null;
  // A row in admin_task_categories (0063). null files the task under
  // Uncategorised; the row itself is never touched by a category change.
  categoryId?: string | null;
  // Optional context line under the title. Empty string clears it.
  note?: string | null;
  dueDate?: string | null;
  completed?: boolean;
  // The Operations checklist pill.
  status?: string;
  // The checklist's free-text "Updates" cell. Empty string clears it.
  updates?: string | null;
}

// PATCH /api/admin/tasks/:taskId  (admin-only): toggle done or edit a task.
// Only the fields present in the body are touched, so the same route handles a
// one-field checkbox toggle and a full edit.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const taskId = ctx.params.taskId as string;

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  if (body.status !== undefined && !isValidStatus(body.status)) {
    return Response.json({ error: "invalid status" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return Response.json({ error: "title cannot be empty" }, { status: 400 });
    update.title = title;
  }
  if ("tenantId" in body) update.tenant_id = body.tenantId ? body.tenantId : null;
  if ("categoryId" in body) update.category_id = body.categoryId ? body.categoryId : null;
  if ("note" in body) update.note = body.note && body.note.trim() ? body.note.trim() : null;
  if ("dueDate" in body) update.due_date = body.dueDate ? body.dueDate : null;
  if ("updates" in body) {
    update.updates = body.updates && body.updates.trim() ? body.updates.trim() : null;
  }

  // The checkbox and the status pill are two views of one fact. The client sends
  // both on a coupled change; this reads the stored pair and re-derives them so
  // a one-field write from anywhere else still lands consistent.
  if (typeof body.completed === "boolean" || body.status !== undefined) {
    const { data: current } = await client
      .from("admin_tasks")
      .select("completed, status")
      .eq("id", taskId)
      .single();
    const stored = current as { completed: boolean; status: string } | null;
    const storedStatus = stored?.status;
    const coupled = deriveCoupling(
      {
        completed: stored?.completed ?? false,
        status: isValidStatus(storedStatus) ? storedStatus : "todo",
      },
      { completed: body.completed, status: body.status as TaskStatus | undefined },
    );
    update.completed = coupled.completed;
    update.status = coupled.status;
  }

  const { data, error } = await client
    .from("admin_tasks")
    .update(update)
    .eq("id", taskId)
    .select(SELECT)
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "task not found" }, { status: 404 });
  }

  const task = toTask(data as unknown as TaskRow);
  await logAdminAction(client, ctx.data.admin!.id, "task.update", task.tenantId, { taskId });

  return Response.json({ task });
};

// DELETE /api/admin/tasks/:taskId  (admin-only): remove a task.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const taskId = ctx.params.taskId as string;
  const { error } = await client.from("admin_tasks").delete().eq("id", taskId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "task.delete", null, { taskId });

  return Response.json({ ok: true });
};
