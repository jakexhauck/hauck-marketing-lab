import type { Env } from "../../lib/env";
import { requireAdmin, driveErrorResponse } from "../../lib/apiAuth";
import { getDriveAccessToken, getFileMeta, downloadFile, exportExtension, isValidFileId } from "../../lib/drive";
import { canAccess } from "../../lib/driveAccess";

// GET /api/drive/download?fileId=<id>
// Stream a file's bytes through the portal (so the browser never needs the
// agency token). Native Google docs are exported to PDF/xlsx/pptx. Access is
// checked against the admin's allowed roots before anything is fetched.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  const { adminId, supabase } = auth;

  const fileId = new URL(ctx.request.url).searchParams.get("fileId") ?? "";
  if (!isValidFileId(fileId)) return Response.json({ error: "invalid fileId" }, { status: 400 });

  try {
    const token = await getDriveAccessToken(ctx.env, supabase);
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
