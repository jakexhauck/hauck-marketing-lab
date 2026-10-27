import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { listChildrenOfMany, listFolders, resolveDriveAccount } from "../../../../../lib/driveComposio";
import { clientFolderFor, walkImages } from "../../../../../lib/clientDriveImages";
import { driveFileIdsInApp } from "../../../../../lib/adCreativeFiles";
import { isCreativeMime, pickFinishedCreatives, toDriveCreatives } from "../../../../../lib/finishedCreatives";

// GET /api/admin/clients/:tenantId/ads/drive-creatives -> { folderUrl, finishedUrl, files }
//
// Client > Grok Bot > Add Creatives: every image and video in the client's
// Drive "Finished Creatives" folder, subfolders included, each marked inApp once
// it is on their Creatives page. The browser does the copying (drive-images/:id
// down, the creative-files upload up), so a video over 50 MB is shrunk on the
// way exactly as the Creatives drop zone does it.
//
// folderUrl null = no Drive folder linked. finishedUrl null = none inside it.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  try {
    const folder = await clientFolderFor(client, tenantId);
    if (!folder) return Response.json({ folderUrl: null, finishedUrl: null, files: [] });
    const account = await resolveDriveAccount(ctx.env);
    const finished = pickFinishedCreatives(await listFolders(ctx.env, account, folder.folderId));
    if (!finished) return Response.json({ folderUrl: folder.url, finishedUrl: null, files: [] });

    const [found, inApp] = await Promise.all([
      walkImages(finished.id, (ids) => listChildrenOfMany(ctx.env, account, ids), isCreativeMime),
      driveFileIdsInApp(client, tenantId),
    ]);
    return Response.json({
      folderUrl: folder.url,
      finishedUrl: `https://drive.google.com/drive/folders/${finished.id}`,
      files: toDriveCreatives(found, inApp),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
