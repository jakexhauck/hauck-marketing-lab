import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { createDriveItem, listChildrenOfMany } from "../../../../../lib/driveComposio";
import { isValidFileId } from "../../../../../lib/driveDirect";
import { cleanDriveName, folderPath, newItemMime, openClientDrive } from "../../../../../lib/clientDrive";

// GET  /api/admin/clients/:tenantId/drive?folder=<id> -> { root, path, files }
// POST /api/admin/clients/:tenantId/drive { kind, name, parent } -> { file }
//
// Client > Folder (lib/clientDrive.ts). No folder param lists the client's
// folder itself. root null = no folder linked yet.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  try {
    const drive = await openClientDrive(ctx.env, client, ctx.params.tenantId as string);
    if (!drive) return Response.json({ root: null, path: [], files: [] });
    const folder = new URL(ctx.request.url).searchParams.get("folder") || drive.root.folderId;
    if (!isValidFileId(folder)) return Response.json({ error: "bad folder id" }, { status: 400 });

    const path = await folderPath(folder, drive.root.folderId, drive.root.name, drive.metaOf);
    if (!path) return Response.json({ error: "That folder is not in this client's folder." }, { status: 403 });
    const files = (await listChildrenOfMany(ctx.env, drive.account, [folder])).get(folder) ?? [];
    return Response.json({ root: drive.root, path, files });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const body = (await ctx.request.json().catch(() => ({}))) as { kind?: unknown; name?: unknown; parent?: unknown };
  const mime = newItemMime(body.kind);
  const name = cleanDriveName(body.name);
  const parent = typeof body.parent === "string" ? body.parent : "";
  if (!mime || !name || !isValidFileId(parent)) return Response.json({ error: "kind, name and parent are required" }, { status: 400 });
  try {
    const drive = await openClientDrive(ctx.env, client, tenantId);
    if (!drive) return Response.json({ error: "This client has no Drive folder." }, { status: 404 });
    if (!(await drive.contains(parent))) {
      return Response.json({ error: "That folder is not in this client's folder." }, { status: 403 });
    }
    const file = await createDriveItem(ctx.env, drive.account, parent, name, mime);
    await logAdminAction(client, ctx.data.admin!.id, "drive.create", tenantId, { kind: body.kind, name, id: file.id });
    return Response.json({ file });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
