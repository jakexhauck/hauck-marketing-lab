import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { copyDriveFile, findDocNameContains, resolveDriveAccount } from "../../../../lib/driveComposio";
import {
  MISSION_CONTROL_NAME_PART,
  MISSION_CONTROL_TEMPLATE_ID,
  missionControlDocName,
  missionControlEmbedUrl,
  missionControlFolder,
} from "../../../../lib/missionControl";

// GET  /api/admin/clients/:tenantId/mission-control -> { hasFolder, doc }
// POST /api/admin/clients/:tenantId/mission-control -> { hasFolder, doc }, copying the template when there is none
//
// doc is { id, url } or null. The Brief page embeds doc.url.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  try {
    const { data: tenant, error } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!tenant) return Response.json({ error: "Client not found." }, { status: 404 });
    const account = await resolveDriveAccount(ctx.env);
    const folder = await missionControlFolder(ctx.env, client, account, tenantId, (tenant as { name: string }).name);
    if (!folder) return Response.json({ hasFolder: false, doc: null });
    const found = await findDocNameContains(ctx.env, account, folder.folderId, MISSION_CONTROL_NAME_PART);
    return Response.json({ hasFolder: true, doc: found ? { id: found.id, url: missionControlEmbedUrl(found.id) } : null });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  try {
    const { data: tenant, error } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!tenant) return Response.json({ error: "Client not found." }, { status: 404 });
    const name = (tenant as { name: string }).name;
    const account = await resolveDriveAccount(ctx.env);
    const folder = await missionControlFolder(ctx.env, client, account, tenantId, name);
    if (!folder) return Response.json({ error: "This client has no Drive folder." }, { status: 409 });
    // A second click (or a bot that got there first) reuses the doc already there.
    const existing = await findDocNameContains(ctx.env, account, folder.folderId, MISSION_CONTROL_NAME_PART);
    if (existing) return Response.json({ hasFolder: true, doc: { id: existing.id, url: missionControlEmbedUrl(existing.id) } });

    const copy = await copyDriveFile(ctx.env, account, MISSION_CONTROL_TEMPLATE_ID, folder.folderId, missionControlDocName(name));
    return Response.json({ hasFolder: true, doc: { id: copy.id, url: missionControlEmbedUrl(copy.id) } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
