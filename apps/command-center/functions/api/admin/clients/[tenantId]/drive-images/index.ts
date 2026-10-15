import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { listChildrenOfMany, resolveDriveAccount } from "../../../../../lib/driveComposio";
import { clientFolderFor, walkImages } from "../../../../../lib/clientDriveImages";

// GET /api/admin/clients/:tenantId/drive-images -> { folderUrl, images }
//
// Every image in the client's Drive folder, for the Image Converter page.
// folderUrl null = the client has no folder yet (Create client folder on Full
// Setup Checklist makes one).

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  try {
    const folder = await clientFolderFor(client, ctx.params.tenantId as string);
    if (!folder) return Response.json({ folderUrl: null, images: [] });
    const account = await resolveDriveAccount(ctx.env);
    const images = await walkImages(folder.folderId, (ids) => listChildrenOfMany(ctx.env, account, ids));
    return Response.json({ folderUrl: folder.url, images });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
