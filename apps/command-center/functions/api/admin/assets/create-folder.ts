import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { canAccess, driveErrorResponse } from "../../../lib/driveAccess";
import { getAccessToken, createFolder, isValidFileId } from "../../../lib/driveDirect";

// POST /api/admin/assets/create-folder  (JSON: parentId, name)
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const adminId = ctx.data.admin!.id;

  let body: { parentId?: string; name?: string } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const parentId = String(body.parentId ?? "");
  const name = (body.name ?? "").trim();
  if (!isValidFileId(parentId)) return Response.json({ error: "invalid parentId" }, { status: 400 });
  if (!name) return Response.json({ error: "name required" }, { status: 400 });

  try {
    const token = await getAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, parentId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const folder = await createFolder(token, parentId, name);
    return Response.json({ ok: true, folder });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
