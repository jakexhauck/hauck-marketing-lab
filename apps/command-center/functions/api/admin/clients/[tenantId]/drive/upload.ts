import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { uploadDriveFile } from "../../../../../lib/driveComposio";
import { isValidFileId } from "../../../../../lib/driveDirect";
import { cleanDriveName, openClientDrive } from "../../../../../lib/clientDrive";

// POST /api/admin/clients/:tenantId/drive/upload?parent=<id>&name=<name>
// The body is the file's raw bytes, its type in Content-Type. -> { file }
//
// Read whole rather than streamed: Google wants a length on the upload, and
// Cloudflare caps a request at 100 MB anyway, well inside a Worker's memory.
const MAX_BYTES = 95 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const qs = new URL(ctx.request.url).searchParams;
  const parent = qs.get("parent") ?? "";
  const name = cleanDriveName(qs.get("name"));
  if (!isValidFileId(parent) || !name) return Response.json({ error: "parent and name are required" }, { status: 400 });
  if (Number(ctx.request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return Response.json({ error: "Over 95 MB. Upload that one in Google Drive." }, { status: 413 });
  }
  try {
    const drive = await openClientDrive(ctx.env, client, tenantId);
    if (!drive) return Response.json({ error: "This client has no Drive folder." }, { status: 404 });
    if (!(await drive.contains(parent))) {
      return Response.json({ error: "That folder is not in this client's folder." }, { status: 403 });
    }
    const mime = ctx.request.headers.get("content-type") || "application/octet-stream";
    const file = await uploadDriveFile(ctx.env, drive.account, parent, name, mime, await ctx.request.arrayBuffer());
    await logAdminAction(client, ctx.data.admin!.id, "drive.upload", tenantId, { name, id: file.id });
    return Response.json({ file });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
