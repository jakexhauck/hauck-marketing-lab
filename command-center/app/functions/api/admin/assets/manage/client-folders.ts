import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { isFullAccess } from "../../../../lib/driveAccess";
import { extractFolderId } from "../../../../lib/driveDirect";

// Manage the client -> Drive folder map. Owner-only (a full-access admin).
//   GET                                       -> list all mappings
//   POST { action:"add", name, folderUrl, tenantId? }
//   POST { action:"remove", id }

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  if (!(await isFullAccess(supabase, ctx.data.admin!.id))) return Response.json({ error: "forbidden" }, { status: 403 });

  const { data } = await supabase
    .from("client_folders")
    .select("id, tenant_id, name, folder_id, web_view_link, sort")
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  return Response.json({ folders: data ?? [] });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const adminId = ctx.data.admin!.id;
  if (!(await isFullAccess(supabase, adminId))) return Response.json({ error: "forbidden" }, { status: 403 });

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

    const { data, error } = await supabase
      .from("client_folders")
      .insert({ name, folder_id: folderId, tenant_id: body.tenantId || null, created_by: adminId })
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
