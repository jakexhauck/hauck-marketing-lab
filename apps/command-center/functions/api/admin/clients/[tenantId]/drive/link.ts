import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { listFolders, resolveDriveAccount } from "../../../../../lib/driveComposio";
import { clientDriveRoot, matchClientFolder } from "../../../../../lib/clientDriveFolder";
import { clientFolderFor } from "../../../../../lib/clientDriveImages";
import { folderLinkProblem } from "../../../../../lib/missionControl";

// GET  /api/admin/clients/:tenantId/drive/link -> { linked, suggested, folders }
// POST /api/admin/clients/:tenantId/drive/link { folderId } -> { linked }
//
// The first step of the Brief's Mission Control wizard (Jake, 2026-10-27):
// which of the client folders in the root is this client's. Linking writes the
// client_folders row Client > Folder and the Brief both read.

type Holder = { tenant_id: string; folder_id: string };

async function holders(client: NonNullable<ReturnType<typeof getServiceClient>>): Promise<Holder[]> {
  const { data, error } = await client.from("client_folders").select("tenant_id, folder_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as Holder[];
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  try {
    const linked = await clientFolderFor(client, tenantId);
    if (linked) return Response.json({ linked: { id: linked.folderId, name: linked.name }, suggested: null, folders: [] });

    const { data: tenant } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const account = await resolveDriveAccount(ctx.env);
    const [folders, held, names] = await Promise.all([
      listFolders(ctx.env, account, clientDriveRoot(ctx.env)),
      holders(client),
      client.from("tenants").select("id, name"),
    ]);
    const nameOf = new Map(((names.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
    const heldBy = new Map(held.map((h) => [h.folder_id, nameOf.get(h.tenant_id) ?? "another client"]));
    const suggested = tenant ? matchClientFolder(folders, (tenant as { name: string }).name)?.id ?? null : null;
    return Response.json({
      linked: null,
      suggested,
      folders: folders
        .map((f) => ({ id: f.id, name: f.name, takenBy: heldBy.get(f.id) ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const body = (await ctx.request.json().catch(() => ({}))) as { folderId?: unknown };
  const folderId = typeof body.folderId === "string" ? body.folderId : "";
  try {
    const { data: tenant } = await client.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    if (!tenant) return Response.json({ error: "Client not found." }, { status: 404 });
    const account = await resolveDriveAccount(ctx.env);
    const folders = await listFolders(ctx.env, account, clientDriveRoot(ctx.env));
    const problem = folderLinkProblem(folderId, folders, await holders(client), tenantId);
    if (problem) return Response.json({ error: problem }, { status: 409 });

    const folder = folders.find((f) => f.id === folderId)!;
    const { error } = await client.from("client_folders").insert({
      tenant_id: tenantId,
      name: (tenant as { name: string }).name,
      folder_id: folderId,
      web_view_link: `https://drive.google.com/drive/folders/${folderId}`,
      created_by: ctx.data.admin?.id ?? null,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (ctx.data.admin) await logAdminAction(client, ctx.data.admin.id, "drive.link", tenantId, { folderId, name: folder.name });
    return Response.json({ linked: { id: folderId, name: folder.name } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
