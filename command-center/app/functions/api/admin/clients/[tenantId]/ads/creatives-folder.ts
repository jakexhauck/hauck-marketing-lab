import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { extractFolderId } from "../../../../../lib/driveDirect";
import { toCreativesFolder } from "../../../../../lib/creativesFolder";
import { listCreatives } from "../../../../../lib/creativesList";

// GET  /api/admin/clients/:tenantId/ads/creatives-folder -> { folderId, url, connected, files, error }
// PUT  /api/admin/clients/:tenantId/ads/creatives-folder { folderUrl } -> { folderId, url }
//
// Which Drive folder holds this client's ad creatives. Auth is enforced upstream
// in _middleware.ts (admin session only), which is why the write lives here and
// not on the client's own route: an operator sets the folder, a client only
// reads it.
//
// Sending an empty folderUrl clears the mapping. That is a real operation, not a
// validation failure: pointing a client at the wrong folder has to be undoable
// without a database round trip.

async function read(client: ReturnType<typeof getServiceClient>, tenantId: string) {
  return client!
    .from("tenants")
    .select("creatives_drive_folder_id")
    .eq("id", tenantId)
    .maybeSingle();
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await read(client, ctx.params.tenantId as string);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "client not found" }, { status: 404 });

  const folder = toCreativesFolder(data.creatives_drive_folder_id as string | null);
  const listing = await listCreatives(ctx.env, folder.folderId);

  return Response.json({ ...folder, ...listing });
};

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const body = (await ctx.request.json().catch(() => null)) as {
    folderUrl?: string;
    folderId?: string;
  } | null;

  // Two ways in. `folderId` is the picker, which already holds a real Drive id
  // and needs no parsing. `folderUrl` is the paste box, kept as the escape hatch
  // for a folder the picker cannot reach (shared with the agency but living in
  // somebody else's Drive, so it is not under My Drive).
  const picked = (body?.folderId ?? "").trim();
  const raw = (body?.folderUrl ?? "").trim();

  // Empty clears. Anything else must parse, because storing a string we could
  // not read is how a client ends up with an "Open in Drive" button that 404s.
  let folderId: string | null = null;
  if (picked) {
    folderId = extractFolderId(picked);
    if (!folderId) return Response.json({ error: "That is not a valid folder id." }, { status: 400 });
  } else if (raw) {
    folderId = extractFolderId(raw);
    if (!folderId) {
      return Response.json(
        {
          error:
            "That does not look like a Google Drive folder link. Open the folder in Drive and copy the address, or use Share > Copy link.",
        },
        { status: 400 },
      );
    }
  }

  const { data, error } = await client
    .from("tenants")
    .update({ creatives_drive_folder_id: folderId })
    .eq("id", tenantId)
    .select("creatives_drive_folder_id")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "client not found" }, { status: 404 });

  // The listing comes back with the save, so the grid fills in as soon as a
  // folder is pasted rather than after a second round trip.
  const folder = toCreativesFolder(data.creatives_drive_folder_id as string | null);
  const listing = await listCreatives(ctx.env, folder.folderId);

  return Response.json({ ...folder, ...listing });
};
