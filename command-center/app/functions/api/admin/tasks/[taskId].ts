import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

interface PatchBody {
  title?: string;
  // null clears the category back to agency-wide; a string re-tags to a client.
  tenantId?: string | null;
  dueDate?: string | null;
  completed?: boolean;
}

// PATCH /api/admin/tasks/:taskId  (admin-only) — toggle done or edit a task.
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

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.completed === "boolean") update.completed = body.completed;
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return Response.json({ error: "title cannot be empty" }, { status: 400 });
    update.title = title;
  }
  if ("tenantId" in body) update.tenant_id = body.tenantId ? body.tenantId : null;
  if ("dueDate" in body) update.due_date = body.dueDate ? body.dueDate : null;

  const { data, error } = await client
    .from("admin_tasks")
    .update(update)
    .eq("id", taskId)
    .select("id, tenant_id, title, due_date, completed, created_at, tenants(name)")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "task not found" }, { status: 404 });
  }

  const row = data as unknown as {
    id: string;
    tenant_id: string | null;
    title: string;
    due_date: string | null;
    completed: boolean;
    created_at: string;
    tenants: { name: string } | null;
  };
  return Response.json({
    task: {
      id: row.id,
      tenantId: row.tenant_id,
      clientName: row.tenants?.name ?? null,
      title: row.title,
      dueDate: row.due_date,
      completed: row.completed,
      createdAt: row.created_at,
    },
  });
};

// DELETE /api/admin/tasks/:taskId  (admin-only) — remove a task.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const taskId = ctx.params.taskId as string;
  const { error } = await client.from("admin_tasks").delete().eq("id", taskId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};
