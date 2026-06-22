import type { Env } from "../../../lib/env";
import { requireAdmin, driveErrorResponse } from "../../../lib/apiAuth";
import { isFullAccess } from "../../../lib/driveAccess";
import { getDriveAccessToken, getFileMeta, extractFolderId, FOLDER_MIME } from "../../../lib/drive";

// Manage the client -> Drive folder map. Only a full-access admin (the owner)
// may add or remove these. Reused by the Assets admin panel.
//
//   GET  /api/drive/admin/client-folders                 -> list all mappings
//   POST { action:"add", name, folderUrl, tenantId? }    -> add a mapping
//   POST { action:"remove", id }                          -> remove a mapping

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const guard = await requireFullAdmin(ctx.request, ctx.env);
  if (guard instanceof Response) return guard;
  const { supabase } = guard;
  const { data } = await supabase
    .from("client_folders")
    .select("id, tenant_id, name, folder_id, web_view_link, sort")
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  return Response.json({ folders: data ?? [] });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const guard = await requireFullAdmin(ctx.request, ctx.env);
  if (guard instanceof Response) return guard;
  const { adminId, supabase } = guard;

  let body: { action?: string; id?: string; name?: string; folderUrl?: string; tenantId?: string } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  if (body.action === "remove") {
    if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
    const { error } = await supabase.from("client_folders").delete().eq("id", body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.action === "add") {
    const name = (body.name ?? "").trim();
    const folderId = extractFolderId(body.folderUrl ?? "");
    if (!name) return Response.json({ error: "name required" }, { status: 400 });
    if (!folderId) return Response.json({ error: "could not read a Drive folder id from that link" }, { status: 400 });

    // Verify the agency account can actually see the folder before saving it,
    // so a bad/private link fails loudly here instead of in the browser later.
    try {
      const token = await getDriveAccessToken(ctx.env, supabase);
      const meta = await getFileMeta(token, folderId, "id,name,mimeType");
      if (!meta) return Response.json({ error: "folder not found, or the agency account can't see it" }, { status: 400 });
      if (meta.mimeType !== FOLDER_MIME) return Response.json({ error: "that link is a file, not a folder" }, { status: 400 });
    } catch (err) {
      return driveErrorResponse(err);
    }

    const { data, error } = await supabase
      .from("client_folders")
      .insert({
        name,
        folder_id: folderId,
        tenant_id: body.tenantId || null,
        created_by: adminId,
      })
      .select("id, tenant_id, name, folder_id, web_view_link, sort")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return Response.json({ error: "that folder is already mapped" }, { status: 409 });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true, folder: data });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
};

async function requireFullAdmin(req: Request, env: Env) {
  const auth = await requireAdmin(req, env);
  if (auth instanceof Response) return auth;
  if (!(await isFullAccess(auth.supabase, auth.adminId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return auth;
}
