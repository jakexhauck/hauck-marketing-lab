import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { canAccess, driveErrorResponse } from "../../../lib/driveAccess";
import { getAccessToken, trashFile, isValidFileId } from "../../../lib/driveDirect";

// POST /api/admin/assets/delete  (JSON: fileId)
// Move a file/folder to the Drive trash (recoverable), after an access check.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const adminId = ctx.data.admin!.id;

  let body: { fileId?: string } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const fileId = String(body.fileId ?? "");
  if (!isValidFileId(fileId)) return Response.json({ error: "invalid fileId" }, { status: 400 });

  try {
    const token = await getAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, fileId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const result = await trashFile(token, fileId);
    return Response.json({ ok: true, alreadyGone: result.alreadyGone });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
