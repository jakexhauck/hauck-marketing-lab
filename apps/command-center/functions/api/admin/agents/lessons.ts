import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isAgentId } from "../../../../src/lib/agents";
import { brainLessons, parseTenantParam, queueLessonEdit, type BrainScope } from "../../../lib/agentItems";

// GET  /api/admin/agents/lessons?tenant=<uuid|agency>&agent=<id>&scope=client|agent|mega
//   -> { lessons: AgentLesson[], pendingEditIds: string[] }
// POST /api/admin/agents/lessons  body { lessonId, action: "edit" | "delete", text? } -> LessonEdit
//
// The Brain tab. Lessons are the app's mirror of the vault; mega is every
// lesson, each keeping its stored scope. pendingEditIds are LESSON ids with an
// edit still queued, so the page can show "Saving" on that row. An edit is
// only queued here: the PC runner applies it to the vault file and re-posts
// the mirror. Owner only, checked here.

const SCOPES: BrainScope[] = ["client", "agent", "mega"];

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(ctx.request.url);
  const tenantId = parseTenantParam(url.searchParams.get("tenant"));
  const agent = url.searchParams.get("agent");
  const scope = (url.searchParams.get("scope") ?? "client") as BrainScope;
  if (tenantId === undefined || !isAgentId(agent) || !SCOPES.includes(scope)) {
    return Response.json({ error: "tenant, agent and scope required" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  return Response.json(await brainLessons(client, scope, tenantId, agent), {
    headers: { "Cache-Control": "no-store" },
  });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: { lessonId?: unknown; action?: unknown; text?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
  const action = body.action;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!lessonId || (action !== "edit" && action !== "delete")) {
    return Response.json({ error: "lessonId and action required" }, { status: 400 });
  }
  if (action === "edit" && !text) return Response.json({ error: "text required" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const edit = await queueLessonEdit(client, { lessonId, action, text: text.slice(0, 2000) });
  if (!edit) return Response.json({ error: "lesson not found" }, { status: 404 });
  return Response.json(edit);
};
