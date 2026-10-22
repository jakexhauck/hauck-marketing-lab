import type { Env, ApiData } from "../../lib/env";
import type { RunnerBriefBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { agentSaveBrief, readBrief } from "../../lib/clientBriefs";
import { readPages } from "../../lib/briefPagesStore";
import { readTasks } from "../../lib/clientTasks";
import { isUuid } from "../../lib/agentItems";
import { composioBriefOps, syncBriefToDrive } from "../../lib/briefDrive";

// POST /api/agent-runner/brief  body { messageId, body, version }
//   -> 200 { section }, or 409 { section } with the current text when the
//      version is stale (Jake edited it since the claim).
//
// An agent rewrites its OWN Client Brief section. The section is the agent of
// the claimed message's chat, read on the server (lib/clientBriefs.ts); the
// request has no way to name another. The Google Doc is rewritten after the
// answer, as on Jake's saves. Behind the runner gate in api/_middleware.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: RunnerBriefBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await agentSaveBrief(client, body);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  if ("conflict" in res) return Response.json({ section: res.conflict }, { status: 409 });
  ctx.waitUntil(syncBriefToDrive(client, res.tenantId, composioBriefOps(ctx.env)));
  return Response.json({ section: res.saved });
};

// GET /api/agent-runner/brief?tenant=<uuid> -> { sections, pages, tasks }
//
// One client's whole brief, read only: the Manager's weekly review reads it
// through the bridge's client_brief tool. Nothing here writes.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenant");
  if (!isUuid(tenantId)) return Response.json({ error: "tenant required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const [sections, pages, tasks] = await Promise.all([readBrief(client, tenantId), readPages(client, tenantId), readTasks(client, tenantId)]);
  return Response.json({
    sections: sections.filter((s) => s.body.trim()).map((s) => ({ section: s.section, body: s.body })),
    pages: pages.map((p) => ({ page: p.page, version: p.version, data: p.data })),
    tasks: tasks.map((t) => ({ key: t.key, name: t.name, owner: t.owner, state: t.state, evidence: t.evidence })),
  });
};
