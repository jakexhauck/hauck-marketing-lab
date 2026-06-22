import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { canAccess, driveErrorResponse } from "../../../lib/driveAccess";
import { getAccessToken, getFileMeta, downloadFile, exportExtension, isValidFileId } from "../../../lib/driveDirect";

// GET /api/admin/assets/download?fileId=<id>
// Stream a file's bytes through the command center (so the browser never needs
// the agency token). Native Google docs are exported to a portable format.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const adminId = ctx.data.admin!.id;

  const fileId = new URL(ctx.request.url).searchParams.get("fileId") ?? "";
  if (!isValidFileId(fileId)) return Response.json({ error: "invalid fileId" }, { status: 400 });

  try {
    const token = await getAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, fileId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const meta = await getFileMeta(token, fileId, "id,name,mimeType,size");
    if (!meta) return Response.json({ error: "not found" }, { status: 404 });

    const upstream = await downloadFile(token, fileId, meta.mimeType);
    const ext = exportExtension(meta.mimeType);
    const filename = ext ? `${meta.name}.${ext}` : meta.name;

    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/octet-stream");
    headers.set("content-disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    const len = upstream.headers.get("content-length");
    if (len) headers.set("content-length", len);
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
