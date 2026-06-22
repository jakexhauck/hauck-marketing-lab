import type { Env } from "../../../lib/env";
import { requireAdmin } from "../../../lib/apiAuth";
import { isFullAccess } from "../../../lib/driveAccess";

// Manage WHO sees which client folder. Owner-only (full-access admins).
//
//   GET  /api/drive/admin/access
//     -> { admins: [{ id, name, email, fullAccess, folderIds:[...] }], folders:[...] }
//   POST { action:"grant",  adminId, clientFolderId }
//   POST { action:"revoke", adminId, clientFolderId }
//   POST { action:"setFull", adminId, value:boolean }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const guard = await requireFullAdmin(ctx.request, ctx.env);
  if (guard instanceof Response) return guard;
  const { supabase } = guard;

  const [{ data: admins }, { data: folders }, { data: grants }, { data: full }] = await Promise.all([
    supabase.from("admin_accounts").select("id, name, email, status").eq("status", "active"),
    supabase.from("client_folders").select("id, name").order("name", { ascending: true }),
    supabase.from("folder_access").select("admin_id, client_folder_id"),
    supabase.from("drive_full_access").select("admin_id"),
  ]);

  const fullSet = new Set(((full as { admin_id: string }[]) ?? []).map((r) => r.admin_id));
  const grantsByAdmin = new Map<string, string[]>();
  for (const g of (grants as { admin_id: string; client_folder_id: string }[]) ?? []) {
    const list = grantsByAdmin.get(g.admin_id) ?? [];
    list.push(g.client_folder_id);
    grantsByAdmin.set(g.admin_id, list);
  }

  return Response.json({
    admins: ((admins as { id: string; name: string; email: string }[]) ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      fullAccess: fullSet.has(a.id),
      folderIds: grantsByAdmin.get(a.id) ?? [],
    })),
    folders: folders ?? [],
  });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const guard = await requireFullAdmin(ctx.request, ctx.env);
  if (guard instanceof Response) return guard;
  const { adminId, supabase } = guard;

  let body: { action?: string; adminId?: string; clientFolderId?: string; value?: boolean } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const target = body.adminId;
  if (!target) return Response.json({ error: "adminId required" }, { status: 400 });

  if (body.action === "grant" || body.action === "revoke") {
    if (!body.clientFolderId) return Response.json({ error: "clientFolderId required" }, { status: 400 });
    if (body.action === "grant") {
      const { error } = await supabase
        .from("folder_access")
        .upsert({ admin_id: target, client_folder_id: body.clientFolderId, granted_by: adminId }, { onConflict: "admin_id,client_folder_id" });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from("folder_access")
        .delete()
        .eq("admin_id", target)
        .eq("client_folder_id", body.clientFolderId);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  }

  if (body.action === "setFull") {
    if (body.value) {
      const { error } = await supabase.from("drive_full_access").upsert({ admin_id: target }, { onConflict: "admin_id" });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase.from("drive_full_access").delete().eq("admin_id", target);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
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
