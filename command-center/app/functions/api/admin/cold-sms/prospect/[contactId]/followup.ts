import type { Env, ApiData } from "../../../../../lib/env";
import { readJsonBody } from "../../../../../lib/body";
import { getServiceClient } from "../../../../../lib/supabase";
import { ghlFetch } from "../../../../../lib/ghl";
import {
  agencyGhlUserId,
  agencyTimezone,
  getAgencyGhlContext,
  isAgencyGhlConfigured,
} from "../../../../../lib/agencyGhl";
import { zoneDayRange } from "../../../../../lib/coldSmsFirstTexts";
import { followUpLabel, isDay } from "../../../../../lib/coldSmsFollowUp";

// POST /api/admin/cold-sms/prospect/:contactId/followup  { day: "YYYY-MM-DD" | null, business? }
// (owner only)
//
// Sets or clears a prospect's follow-up day from the card's right-click menu
// (Jake, 2026-10-13). Saved in cold_sms_followups (0161), which is what the board
// shows. A GHL task due 9am that day (Jake's zone) is made on the contact so GHL
// reminds him; changing the day deletes the old task and makes a new one, since
// GHL's task PUT replaces the whole task. Clearing deletes it.
//
// The saved day is the truth: a GHL task that will not save is reported, not
// fatal, so the board never loses a follow-up to a GHL hiccup.

const ID = /^[A-Za-z0-9]{8,64}$/;
const NINE_AM = 9 * 3600_000;

export const onRequestPost: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  const db = getServiceClient(ctx.env);
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  const contactId = String(ctx.params.contactId ?? "").trim();
  if (!ID.test(contactId)) return Response.json({ error: "bad_contact_id" }, { status: 400 });
  const body = await readJsonBody<{ day?: unknown; business?: unknown }>(ctx.request);
  const day = body?.day === null ? null : isDay(body?.day) ? (body!.day as string) : undefined;
  if (day === undefined) return Response.json({ error: "bad_day" }, { status: 400 });
  const business = typeof body?.business === "string" ? body.business.trim().slice(0, 120) : "";

  const agency = getAgencyGhlContext(ctx.env);
  const { data: had } = await db
    .from("cold_sms_followups")
    .select("ghl_task_id")
    .eq("contact_id", contactId)
    .maybeSingle();

  // The old task goes first, whether the day is changing or being cleared.
  const oldTask = (had?.ghl_task_id as string | null) ?? null;
  if (oldTask) {
    const del = await ghlFetch(agency, `/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(oldTask)}`, {
      method: "DELETE",
    });
    if (!del.ok && del.status !== 404) console.warn("[cold-sms/followup] old task", del.status);
  }

  if (day === null) {
    const { error } = await db.from("cold_sms_followups").delete().eq("contact_id", contactId);
    if (error) return Response.json({ error: "save_failed" }, { status: 500 });
    return Response.json({ ok: true, day: null });
  }

  let taskId: string | null = null;
  let taskFailed = false;
  const due = new Date(+new Date(zoneDayRange(day, agencyTimezone(ctx.env)).start) + NINE_AM);
  // GHL 422s a new task without `completed` (see setter/task.ts).
  const res = await ghlFetch(agency, `/contacts/${encodeURIComponent(contactId)}/tasks`, {
    method: "POST",
    body: JSON.stringify({
      title: `Follow up${business ? `: ${business}` : ""} (Cold SMS)`,
      dueDate: due.toISOString(),
      completed: false,
      assignedTo: agencyGhlUserId(ctx.env),
    }),
  });
  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { task?: { id?: string } };
    taskId = json.task?.id ?? null;
  } else {
    taskFailed = true;
    console.warn("[cold-sms/followup] task", res.status, (await res.text()).slice(0, 300));
  }

  const { error } = await db
    .from("cold_sms_followups")
    .upsert(
      { contact_id: contactId, follow_up_on: day, ghl_task_id: taskId, updated_at: new Date().toISOString() },
      { onConflict: "contact_id" },
    );
  if (error) return Response.json({ error: "save_failed" }, { status: 500 });
  return Response.json({ ok: true, day, label: followUpLabel(day), taskFailed });
};
