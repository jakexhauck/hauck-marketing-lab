import type { Env } from "../../lib/env";
import { requireAdmin, driveErrorResponse } from "../../lib/apiAuth";
import { getDriveAccessToken, createFolder, isValidFileId } from "../../lib/drive";
import { canAccess } from "../../lib/driveAccess";

// POST /api/drive/create-folder  (JSON: parentId, name)
// Create a subfolder inside a folder the admin may access.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  const { adminId, supabase } = auth;

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
    const token = await getDriveAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, parentId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const created = await createFolder(token, parentId, name);
    return Response.json({ ok: true, folder: created });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
