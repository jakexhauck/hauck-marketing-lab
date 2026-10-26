import type { Env, ApiData } from "../../../../../../lib/env";
import { ghlJson, type GhlContext } from "../../../../../../lib/ghl";
import { shapeMedia } from "../../../../../../lib/ghlSetup";
import { downloadDriveFile, fileParents, getFileMeta, resolveDriveAccount } from "../../../../../../lib/driveComposio";
import { isValidFileId } from "../../../../../../lib/driveDirect";
import { clientFolderFor, isUnderFolder } from "../../../../../../lib/clientDriveImages";
import { fail, loc, setupCtx, type SetupCtx } from "../_shared";

// GET  /api/admin/clients/:tenantId/ghl-setup/media?parentId= -> { folders, files }
// POST /api/admin/clients/:tenantId/ghl-setup/media
//        JSON { driveFileIds: string[], parentId? }  (Import from Drive)
//        multipart { file, parentId? }              (Upload)
//      -> { uploaded: number }
//
// Client > GHL > Media (checklist B1: the logo and job photos into GHL's Media
// Storage, where the follow-up texts pick their photos).

const MAX_IMPORT = 20;
const MAX_BYTES = 25 * 1024 * 1024;
const HEIC = /^image\/hei[cf]/i;

async function list(g: GhlContext, type: "file" | "folder", parentId: string) {
  const q = `altType=location&altId=${loc(g)}&type=${type}&sortBy=updatedAt&sortOrder=desc&limit=200${parentId ? `&parentId=${encodeURIComponent(parentId)}` : ""}`;
  return shapeMedia(await ghlJson<unknown>(g, `/medias/files?${q}`), type);
}

// GHL's upload is multipart. ghlFetch would label any body as JSON, so this one
// call builds its own request.
async function upload(g: GhlContext, blob: Blob, name: string, parentId: string): Promise<void> {
  const form = new FormData();
  form.set("file", blob, name);
  form.set("name", name);
  if (parentId) form.set("parentId", parentId);
  const res = await fetch("https://services.leadconnectorhq.com/medias/upload-file", {
    method: "POST",
    headers: { Authorization: `Bearer ${g.token}`, Version: "2021-07-28", Accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new Error(`GHL POST /medias/upload-file returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// A Drive file's bytes, only when it sits in this client's folder (the agency
// Drive account reads every client's folder). HEIC goes as Drive's JPEG
// preview, which GHL and phones both show.
async function driveFile(s: SetupCtx, fileId: string): Promise<{ blob: Blob; name: string }> {
  const folder = await clientFolderFor(s.client, s.tenantId);
  if (!folder) throw new Error("This client has no Drive folder.");
  const account = await resolveDriveAccount(s.env);
  const meta = (await getFileMeta(s.env, account, fileId, "id,name,mimeType,size,thumbnailLink,parents")) as {
    name: string;
    mimeType: string;
    size?: string;
    thumbnailLink?: string;
    parents?: string[];
  } | null;
  if (!meta) throw new Error("A Drive file was not found.");
  const parentsOf = (id: string) => (id === fileId ? Promise.resolve(meta.parents ?? []) : fileParents(s.env, account, id));
  if (!(await isUnderFolder(fileId, folder.folderId, parentsOf))) throw new Error(`${meta.name} is not in this client's folder.`);
  if (Number(meta.size ?? 0) > MAX_BYTES) throw new Error(`${meta.name} is over 25 MB.`);
  let res: Response;
  let name = meta.name;
  if (HEIC.test(meta.mimeType) && meta.thumbnailLink) {
    res = await fetch(meta.thumbnailLink.replace(/=s\d+$/, "=s2400"));
    name = name.replace(/\.hei[cf]$/i, "") + ".jpg";
  } else {
    res = await downloadDriveFile(s.env, account, fileId);
  }
  if (!res.ok) throw new Error(`Drive would not hand over ${meta.name} (${res.status}).`);
  return { blob: await res.blob(), name };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  const parentId = new URL(ctx.request.url).searchParams.get("parentId") ?? "";
  try {
    const [folders, files] = await Promise.all([list(s.g, "folder", parentId), list(s.g, "file", parentId)]);
    return Response.json({ folders, files }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const s = await setupCtx(ctx);
  if (s instanceof Response) return s;
  try {
    if ((ctx.request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await ctx.request.formData();
      const file = form.get("file") as unknown as File | string | null;
      if (!file || typeof file === "string" || !file.size) return Response.json({ error: "No file." }, { status: 400 });
      if (file.size > MAX_BYTES) return Response.json({ error: "That file is over 25 MB." }, { status: 413 });
      await upload(s.g, file, file.name, String(form.get("parentId") ?? ""));
      return Response.json({ uploaded: 1 });
    }

    const body = (await ctx.request.json().catch(() => null)) as { driveFileIds?: unknown; parentId?: unknown } | null;
    const ids = Array.isArray(body?.driveFileIds) ? body.driveFileIds.filter((x): x is string => typeof x === "string" && isValidFileId(x)) : [];
    if (!ids.length) return Response.json({ error: "Pick at least one photo." }, { status: 400 });
    if (ids.length > MAX_IMPORT) return Response.json({ error: `At most ${MAX_IMPORT} at a time.` }, { status: 400 });
    const parentId = typeof body?.parentId === "string" ? body.parentId : "";
    // One at a time: GHL rate limits per sub-account, and a half-done import
    // should say how far it got.
    let uploaded = 0;
    for (const id of ids) {
      try {
        const f = await driveFile(s, id);
        await upload(s.g, f.blob, f.name, parentId);
        uploaded++;
      } catch (err) {
        return Response.json({ uploaded, error: `${uploaded} of ${ids.length} uploaded, then: ${(err as Error).message}` }, { status: 502 });
      }
    }
    return Response.json({ uploaded });
  } catch (err) {
    return fail(err);
  }
};
