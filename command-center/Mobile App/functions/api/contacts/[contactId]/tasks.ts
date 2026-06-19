import { tenantTimezone, type Env, type ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlJson } from "../../../lib/ghl";
import { startOfDayOffsetMs } from "../../../lib/tz";

interface GhlTask {
  id: string;
  title: string;
  body?: string;
  dueDate?: string;
  completed?: boolean;
  assignedTo?: string;
}

interface TasksResp {
  tasks?: GhlTask[];
}

interface CreateBody {
  title?: string;
  body?: string;
  dueDate?: string;
}

// Open tasks first, then soonest-due at top; completed tasks sink to the bottom.
function sortTasks(tasks: GhlTask[]): GhlTask[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.completed ? 1 : 0;
    const bDone = b.completed ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return +new Date(a.dueDate ?? 0) - +new Date(b.dueDate ?? 0);
  });
}

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const data = await ghlJson<TasksResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/tasks`,
  );

  return Response.json({ tasks: sortTasks(data.tasks ?? []) });
};

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const input = await readJsonBody<CreateBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    return Response.json({ error: "empty_title" }, { status: 400 });
  }

  // GHL requires a dueDate on task creation. Default to 23:59 today in the
  // tenant's timezone when the client did not supply one, so a quick
  // follow-up never fails to save or lands on the wrong day.
  let dueDate = typeof input.dueDate === "string" ? input.dueDate.trim() : "";
  if (!dueDate) {
    const zone = tenantTimezone(ctx.env);
    dueDate = new Date(startOfDayOffsetMs(zone, 1) - 60_000).toISOString();
  }

  // GHL requires `completed` on create; omitting it 422s.
  const payload: Record<string, unknown> = { title, dueDate, completed: false };
  if (typeof input.body === "string" && input.body.trim()) {
    payload.body = input.body.trim();
  }

  const created = await ghlJson<{ task?: GhlTask }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/tasks`,
    { method: "POST", body: JSON.stringify(payload) },
  );

  return Response.json({ task: created.task ?? null });
};
