import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { ghlFetch, ghlJson } from "../../../../lib/ghl";

interface GhlTask {
  id: string;
  title: string;
  body?: string;
  dueDate?: string;
  completed?: boolean;
  assignedTo?: string;
}

interface UpdateBody {
  title?: string;
  body?: string;
  dueDate?: string;
  completed?: boolean;
}

export const onRequestPut: PagesFunction<
  Env,
  "contactId" | "taskId",
  ApiData
> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const contactId = ctx.params.contactId as string;
  const taskId = ctx.params.taskId as string;
  if (!contactId || !taskId) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }

  const input = await readJsonBody<UpdateBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });

  // Fetch-merge: GHL's task update requires title, dueDate, and completed on
  // every PUT, so a partial update must not drop the fields it leaves out.
  const taskPath = `/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(taskId)}`;
  const existing = await ghlJson<{ task?: GhlTask }>(gctx, taskPath);
  const current = existing.task;
  if (!current) {
    return Response.json({ error: "task_not_found" }, { status: 404 });
  }

  const title =
    (typeof input.title === "string" ? input.title.trim() : "") ||
    current.title?.trim() ||
    "";
  if (!title) {
    return Response.json({ error: "empty_title" }, { status: 400 });
  }

  let dueDate =
    (typeof input.dueDate === "string" ? input.dueDate.trim() : "") ||
    current.dueDate ||
    "";
  if (!dueDate) {
    const end = new Date();
    end.setHours(23, 59, 0, 0);
    dueDate = end.toISOString();
  }

  const completed =
    typeof input.completed === "boolean"
      ? input.completed
      : Boolean(current.completed);

  const payload: Record<string, unknown> = { title, dueDate, completed };
  if (input.body !== undefined) {
    payload.body = typeof input.body === "string" ? input.body.trim() : "";
  } else if (current.body !== undefined) {
    payload.body = current.body;
  }

  const updated = await ghlJson<{ task?: GhlTask }>(gctx, taskPath, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return Response.json({ task: updated.task ?? null });
};

export const onRequestDelete: PagesFunction<
  Env,
  "contactId" | "taskId",
  ApiData
> = async (ctx) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  const taskId = ctx.params.taskId as string;
  if (!contactId || !taskId) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }

  const res = await ghlFetch(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );

  if (!res.ok) {
    const text = await res.text();
    return new Response(
      JSON.stringify({
        error: "ghl_error",
        status: res.status,
        body: text.slice(0, 500),
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  return Response.json({ ok: true });
};
