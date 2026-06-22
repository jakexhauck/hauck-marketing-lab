import type { Env } from "../../lib/env";
import { requireAdmin, driveErrorResponse } from "../../lib/apiAuth";
import { getDriveAccessToken, deleteFile, isValidFileId } from "../../lib/drive";
import { canAccess } from "../../lib/driveAccess";

// POST /api/drive/delete  (JSON: fileId)
// Move a file/folder to the Drive trash (recoverable), after an access check.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  const { adminId, supabase } = auth;

  let body: { fileId?: string } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const fileId = String(body.fileId ?? "");
  if (!isValidFileId(fileId)) return Response.json({ error: "invalid fileId" }, { status: 400 });

  try {
    const token = await getDriveAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, fileId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const result = await deleteFile(token, fileId);
    return Response.json({ ok: true, alreadyGone: result.alreadyGone });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
