import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { canAccess, driveErrorResponse } from "../../../lib/driveAccess";
import { getAccessToken, listFolderChildren, isValidFileId } from "../../../lib/driveDirect";

// GET /api/admin/assets/list?folderId=<id>
// List the children of a folder after confirming it is at or under one of the
// admin's allowed client roots.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const adminId = ctx.data.admin!.id;

  const folderId = new URL(ctx.request.url).searchParams.get("folderId") ?? "";
  if (!isValidFileId(folderId)) return Response.json({ error: "invalid folderId" }, { status: 400 });

  try {
    const token = await getAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, folderId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const files = await listFolderChildren(token, folderId);
    return Response.json({ files });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
