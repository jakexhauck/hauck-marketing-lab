import type { Env } from "../../lib/env";
import { requireAdmin, driveErrorResponse } from "../../lib/apiAuth";
import { getDriveAccessToken, listFolderChildren, isValidFileId, isFolder } from "../../lib/drive";
import { canAccess } from "../../lib/driveAccess";

// GET /api/drive/list?folderId=<id>
// List the children of a folder, after confirming the folder is at or under one
// of the admin's allowed client roots. Folders come first (the lib orders them).
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  const { adminId, supabase } = auth;

  const folderId = new URL(ctx.request.url).searchParams.get("folderId") ?? "";
  if (!isValidFileId(folderId)) return Response.json({ error: "invalid folderId" }, { status: 400 });

  try {
    const token = await getDriveAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, folderId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const children = await listFolderChildren(token, folderId);
    return Response.json({
      files: children.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: isFolder(f),
        webViewLink: f.webViewLink ?? null,
        iconLink: f.iconLink ?? null,
        thumbnailLink: f.thumbnailLink ?? null,
        modifiedTime: f.modifiedTime ?? null,
        size: f.size ?? null,
      })),
    });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
