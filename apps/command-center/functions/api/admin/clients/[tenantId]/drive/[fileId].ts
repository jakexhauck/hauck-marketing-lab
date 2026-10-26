import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { updateDriveFile } from "../../../../../lib/driveComposio";
import { isValidFileId } from "../../../../../lib/driveDirect";
import { cleanDriveName, openClientDrive, type ClientDrive } from "../../../../../lib/clientDrive";

// PATCH  /api/admin/clients/:tenantId/drive/:fileId { name } -> rename
// DELETE /api/admin/clients/:tenantId/drive/:fileId          -> Drive trash
//
// Only for a file under the client's folder, and never the folder itself: its
// "🤝 | Name" is how the app finds it again (lib/clientDriveFolder.ts).

async function guard(ctx: Parameters<PagesFunction<Env, string, ApiData>>[0]): Promise<Response | ClientDrive> {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const fileId = ctx.params.fileId as string;
  if (!isValidFileId(fileId)) return Response.json({ error: "bad file id" }, { status: 400 });
  const drive = await openClientDrive(ctx.env, client, ctx.params.tenantId as string);
  if (!drive) return Response.json({ error: "This client has no Drive folder." }, { status: 404 });
  if (fileId === drive.root.folderId) {
    return Response.json({ error: "The client's own folder stays as it is." }, { status: 400 });
  }
  if (!(await drive.contains(fileId))) {
    return Response.json({ error: "That file is not in this client's folder." }, { status: 403 });
  }
  return drive;
}

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = (await ctx.request.json().catch(() => ({}))) as { name?: unknown };
  const name = cleanDriveName(body.name);
  if (!name) return Response.json({ error: "a name is required" }, { status: 400 });
  try {
    const drive = await guard(ctx);
    if (drive instanceof Response) return drive;
    const fileId = ctx.params.fileId as string;
    await updateDriveFile(ctx.env, drive.account, fileId, { name });
    await logAdminAction(getServiceClient(ctx.env)!, ctx.data.admin!.id, "drive.rename", ctx.params.tenantId as string, { id: fileId, name });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};

export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  try {
    const drive = await guard(ctx);
    if (drive instanceof Response) return drive;
    const fileId = ctx.params.fileId as string;
    await updateDriveFile(ctx.env, drive.account, fileId, { trashed: true });
    await logAdminAction(getServiceClient(ctx.env)!, ctx.data.admin!.id, "drive.trash", ctx.params.tenantId as string, { id: fileId });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
