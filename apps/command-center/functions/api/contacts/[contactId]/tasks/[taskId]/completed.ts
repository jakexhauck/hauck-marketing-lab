import type { Env, ApiData } from "../../../../../lib/env";
import { readJsonBody } from "../../../../../lib/body";
import { ghlJson } from "../../../../../lib/ghl";

interface GhlTask {
  id: string;
  title: string;
  body?: string;
  dueDate?: string;
  completed?: boolean;
  assignedTo?: string;
}

interface CompleteBody {
  completed?: boolean;
}

// Dedicated completion toggle. GHL exposes PUT /tasks/{id}/completed which only
// needs { completed }, so the highest-frequency action does not have to resend
// the whole task.
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

  const input = await readJsonBody<CompleteBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });
  const completed = input.completed === true;

  const updated = await ghlJson<{ task?: GhlTask }>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(taskId)}/completed`,
    { method: "PUT", body: JSON.stringify({ completed }) },
  );

  return Response.json({ task: updated.task ?? null });
};
