import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { downloadDriveFile, fileParents, getFileMeta, resolveDriveAccount } from "../../../../../lib/driveComposio";
import { isValidFileId } from "../../../../../lib/driveDirect";
import { clientFolderFor, isUnderFolder } from "../../../../../lib/clientDriveImages";

// GET /api/admin/clients/:tenantId/drive-images/:fileId -> the image's bytes
//
// Only for a file inside this client's Drive folder: the agency account reads
// far more than one client's folder, so the id is walked up to it first.
//
// HEIC (iPhone photos) cannot be decoded by Chrome, so for those Drive's own
// rendered preview is sent instead, at up to 2400px: plenty for a text photo,
// and already a format the browser reads.

const HEIC = /^image\/hei[cf]/i;
const PREVIEW_EDGE = 2400;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const fileId = ctx.params.fileId as string;
  if (!isValidFileId(fileId)) return Response.json({ error: "bad file id" }, { status: 400 });
  try {
    const folder = await clientFolderFor(client, ctx.params.tenantId as string);
    if (!folder) return Response.json({ error: "This client has no Drive folder." }, { status: 404 });
    const account = await resolveDriveAccount(ctx.env);
    const meta = (await getFileMeta(ctx.env, account, fileId, "id,mimeType,thumbnailLink,parents")) as {
      mimeType: string;
      thumbnailLink?: string;
      parents?: string[];
    } | null;
    if (!meta) return Response.json({ error: "File not found." }, { status: 404 });

    const parentsOf = (id: string) =>
      id === fileId ? Promise.resolve(meta.parents ?? []) : fileParents(ctx.env, account, id);
    if (!(await isUnderFolder(fileId, folder.folderId, parentsOf))) {
      return Response.json({ error: "That file is not in this client's folder." }, { status: 403 });
    }

    let upstream: Response;
    if (HEIC.test(meta.mimeType) && meta.thumbnailLink) {
      upstream = await fetch(meta.thumbnailLink.replace(/=s\d+$/, `=s${PREVIEW_EDGE}`));
      if (!upstream.ok) throw new Error(`Drive preview failed (${upstream.status}).`);
    } else {
      upstream = await downloadDriveFile(ctx.env, account, fileId);
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? meta.mimeType,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
