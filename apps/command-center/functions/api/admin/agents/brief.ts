import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isUuid } from "../../../lib/agentItems";
import { readBrief, readBriefDrive, saveBriefSection, seedClientSection } from "../../../lib/clientBriefs";
import { readPages } from "../../../lib/briefPagesStore";
import { composioBriefOps, syncBriefToDrive } from "../../../lib/briefDrive";
import { isBriefSectionId } from "../../../../src/lib/clientBrief";
import type { BriefResponse } from "../../../../src/lib/agentWire";

// GET /api/admin/agents/brief?tenant=<uuid>  -> BriefResponse
// PUT /api/admin/agents/brief?tenant=<uuid>  body { section, body, version }
//   -> 200 { section }, or 409 { section } with the current one when the
//      version is stale (someone, usually an agent, saved since it was read).
//
// The Client Brief (lib/clientBriefs.ts). Jake may edit any section. A save is
// answered as soon as it is stored; the Google Doc is rewritten after
// (waitUntil), so Drive can never block or fail a save. Owner only, checked
// here.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = new URL(ctx.request.url).searchParams.get("tenant");
  if (!isUuid(tenantId)) return Response.json({ error: "tenant required" }, { status: 400 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  // Brief v2: an empty Client section is written from the onboarding form the
  // first time anyone opens the brief, then Drive is brought up to date.
  const { sections, seeded } = await seedClientSection(client, tenantId, await readBrief(client, tenantId));
  if (seeded) ctx.waitUntil(syncBriefToDrive(client, tenantId, composioBriefOps(ctx.env)));
  const [drive, pages] = await Promise.all([readBriefDrive(client, tenantId), readPages(client, tenantId)]);
  const out: BriefResponse = { sections, drive, pages };
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = new URL(ctx.request.url).searchParams.get("tenant");
  if (!isUuid(tenantId)) return Response.json({ error: "tenant required" }, { status: 400 });
  let body: { section?: unknown; body?: unknown; version?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!isBriefSectionId(body.section) || typeof body.body !== "string" || typeof body.version !== "number") {
    return Response.json({ error: "section, body and version required" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await saveBriefSection(client, {
    tenantId,
    section: body.section,
    body: body.body,
    version: body.version,
    by: "jake",
  });
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  if ("conflict" in res) return Response.json({ section: res.conflict }, { status: 409 });
  ctx.waitUntil(syncBriefToDrive(client, tenantId, composioBriefOps(ctx.env)));
  return Response.json({ section: res.saved });
};
