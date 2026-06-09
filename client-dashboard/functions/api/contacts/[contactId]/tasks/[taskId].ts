import type { Env, ApiData } from "../../../../lib/env";
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
}

export const onRequestPut: PagesFunction<
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

  const input = (await ctx.request.json()) as UpdateBody;
  const title = input.title?.trim();
  if (!title) {
    return Response.json({ error: "empty_title" }, { status: 400 });
  }

  // GHL's task update requires both title and dueDate, so always send them.
  const payload: Record<string, unknown> = { title };
  if (input.dueDate?.trim()) payload.dueDate = input.dueDate.trim();
  if (input.body !== undefined) payload.body = input.body.trim();

  const updated = await ghlJson<{ task?: GhlTask }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );

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
