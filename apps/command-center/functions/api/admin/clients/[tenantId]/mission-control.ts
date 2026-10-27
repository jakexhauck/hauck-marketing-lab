import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { copyDriveFile, findDocNameContains, getFileMeta, resolveDriveAccount } from "../../../../lib/driveComposio";
import { isValidFileId } from "../../../../lib/driveDirect";
import { openClientDrive } from "../../../../lib/clientDrive";
import {
  GOOGLE_DOC_MIME,
  MISSION_CONTROL_NAME_PART,
  MISSION_CONTROL_TEMPLATE_ID,
  missionControlDocName,
  missionControlEmbedUrl,
  missionControlFolder,
} from "../../../../lib/missionControl";

// GET  /api/admin/clients/:tenantId/mission-control -> { hasFolder, doc }
// POST /api/admin/clients/:tenantId/mission-control { docId } -> { hasFolder, doc }, the doc the CSM picked
// POST /api/admin/clients/:tenantId/mission-control -> { hasFolder, doc }, copying the template when there is none
//
// doc is { id, url } or null. The Brief page embeds doc.url. A picked doc
// (tenants.mission_control_doc_id) wins; with none, the doc is found by name.

type Tenant = { name: string; mission_control_doc_id: string | null };

const docOf = (id: string) => ({ id, url: missionControlEmbedUrl(id) });

async function loadTenant(client: NonNullable<ReturnType<typeof getServiceClient>>, tenantId: string): Promise<Tenant | null> {
  const { data, error } = await client.from("tenants").select("name, mission_control_doc_id").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Tenant | null) ?? null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  try {
    const tenant = await loadTenant(client, tenantId);
    if (!tenant) return Response.json({ error: "Client not found." }, { status: 404 });
    if (tenant.mission_control_doc_id) return Response.json({ hasFolder: true, doc: docOf(tenant.mission_control_doc_id) });
    const account = await resolveDriveAccount(ctx.env);
    const folder = await missionControlFolder(ctx.env, client, account, tenantId, tenant.name);
    if (!folder) return Response.json({ hasFolder: false, doc: null });
    const found = await findDocNameContains(ctx.env, account, folder.folderId, MISSION_CONTROL_NAME_PART);
    return Response.json({ hasFolder: true, doc: found ? docOf(found.id) : null });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const body = (await ctx.request.json().catch(() => ({}))) as { docId?: unknown };
  try {
    const tenant = await loadTenant(client, tenantId);
    if (!tenant) return Response.json({ error: "Client not found." }, { status: 404 });

    const save = async (docId: string, how: "picked" | "created") => {
      const { error } = await client.from("tenants").update({ mission_control_doc_id: docId }).eq("id", tenantId);
      if (error) throw new Error(error.message);
      if (ctx.data.admin) await logAdminAction(client, ctx.data.admin.id, `brief.doc.${how}`, tenantId, { docId });
      return Response.json({ hasFolder: true, doc: docOf(docId) });
    };

    // The CSM's pick: a Google Doc inside this client's linked folder, nowhere else.
    if (body.docId !== undefined) {
      const docId = typeof body.docId === "string" ? body.docId : "";
      if (!isValidFileId(docId)) return Response.json({ error: "Pick a doc." }, { status: 400 });
      const drive = await openClientDrive(ctx.env, client, tenantId);
      if (!drive) return Response.json({ error: "Link the client's folder first." }, { status: 409 });
      if (!(await drive.contains(docId))) return Response.json({ error: "That doc is not in this client's folder." }, { status: 403 });
      const meta = await getFileMeta(ctx.env, drive.account, docId, "id,mimeType");
      if (meta?.mimeType !== GOOGLE_DOC_MIME) return Response.json({ error: "That is not a Google Doc." }, { status: 400 });
      return await save(docId, "picked");
    }

    const account = await resolveDriveAccount(ctx.env);
    const folder = await missionControlFolder(ctx.env, client, account, tenantId, tenant.name);
    if (!folder) return Response.json({ error: "This client has no Drive folder." }, { status: 409 });
    // A second click (or a bot that got there first) reuses the doc already there.
    const existing = await findDocNameContains(ctx.env, account, folder.folderId, MISSION_CONTROL_NAME_PART);
    if (existing) return await save(existing.id, "picked");

    const copy = await copyDriveFile(ctx.env, account, MISSION_CONTROL_TEMPLATE_ID, folder.folderId, missionControlDocName(tenant.name));
    return await save(copy.id, "created");
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
