import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { AD_CREATIVE_MAX_BYTES, AD_CREATIVES_BUCKET, checkUpload, driveFileIdsInApp, newPath, recordAdCreative } from "./adCreativeFiles";
import { clientFolderFor, walkImages } from "./clientDriveImages";
import { HEIC, PLAYABLE } from "./creativePlayable";
import { downloadDriveFile, getFileMeta, listChildrenOfMany, listFolders, resolveDriveAccount } from "./driveComposio";
import { isCreativeMime, pickFinishedCreatives, toDriveCreatives, type DriveCreative } from "./finishedCreatives";
import { mediaSize } from "./mediaSize";

// Client > Grok Bot > Add Creatives with no browser, for the Software
// connector's software_add_creatives (Jake, 2026-10-27: the bot "can't open
// the Command Center pages", and the connector should reach the whole software).
//
// The page copies in the browser so it can shrink a big video. A Worker has no
// video encoder, so here a file goes across as it is: down from Drive through
// Composio, straight into the ad-creatives bucket, and filed with its Drive id
// the same as the page files it. Width and height come from the file's own
// header (lib/mediaSize.ts). What only the browser can convert is skipped and
// named, never faked.

// A few per call: each file is a Composio download and an upload, and one call
// has a subrequest budget and a wall clock. The answer says how many are left.
export const MAX_COPY_PER_CALL = 5;
// Files that fail are tried past, up to this many tries, so a stuck one never
// holds up the rest of the folder call after call.
const MAX_TRIES_PER_CALL = MAX_COPY_PER_CALL * 2;
// Drive's own rendered preview for a HEIC, the size the page asks for too.
const HEIC_PREVIEW_EDGE = 2400;

const ON_THE_PAGE = "Add it on Client > Grok Bot > Add Creatives in the app, which converts it in the browser.";

export interface CopyPlan {
  copy: DriveCreative[];
  skipped: { name: string; reason: string }[];
  alreadyInApp: number;
  notFound: string[];
}

/** What can be copied, in Drive's order: the files named (by id or name), else everything not in the app yet. */
export function planCopy(files: DriveCreative[], pick: unknown): CopyPlan {
  if (pick !== undefined && pick !== null && !Array.isArray(pick)) throw new Error("files is a list of Drive file names or ids");
  const wanted = (pick as unknown[] | undefined)?.map((p) => String(p).trim()).filter(Boolean);
  const notFound: string[] = [];
  let chosen = files;
  if (wanted?.length) {
    const hits = new Set<DriveCreative>();
    for (const w of wanted) {
      const hit = files.find((f) => f.id === w) ?? files.find((f) => f.name.trim().toLowerCase() === w.toLowerCase());
      if (hit) hits.add(hit);
      else notFound.push(w);
    }
    chosen = files.filter((f) => hits.has(f));
  }
  const fresh = chosen.filter((f) => !f.inApp);
  const skipped: CopyPlan["skipped"] = [];
  const copyable: DriveCreative[] = [];
  for (const f of fresh) {
    if (!PLAYABLE.has(f.mimeType) && !HEIC.test(f.mimeType)) skipped.push({ name: f.name, reason: `A ${f.mimeType} does not play as it is. ${ON_THE_PAGE}` });
    else if (f.size !== null && f.size > AD_CREATIVE_MAX_BYTES && !HEIC.test(f.mimeType)) skipped.push({ name: f.name, reason: `Over 50 MB. ${ON_THE_PAGE}` });
    else copyable.push(f);
  }
  return { copy: copyable, skipped, alreadyInApp: chosen.length - fresh.length, notFound };
}

type Added = { name: string; width: number | null; height: number | null };

/**
 * Copy up to MAX_COPY_PER_CALL, one at a time (every Drive read is a metered
 * Composio call, and a video sits in memory while it crosses), going past
 * failures. left is what was not tried, for the next call.
 */
export async function copyBatch(files: DriveCreative[], copy: (f: DriveCreative) => Promise<Added>) {
  const added: Added[] = [];
  const failed: { name: string; error: string }[] = [];
  let tried = 0;
  for (const f of files) {
    if (added.length >= MAX_COPY_PER_CALL || tried >= MAX_TRIES_PER_CALL) break;
    tried += 1;
    try {
      added.push(await copy(f));
    } catch (err) {
      failed.push({ name: f.name, error: (err as Error).message });
    }
  }
  return { added, failed, left: files.length - tried };
}

/** One Drive file onto the client's Creatives page. Throws with the reason. */
async function copyOne(env: Env, client: SupabaseClient, tenantId: string, account: string, f: DriveCreative): Promise<Added> {
  let bytes: ArrayBuffer;
  let type = f.mimeType;
  let name = f.name;
  if (HEIC.test(f.mimeType)) {
    const meta = (await getFileMeta(env, account, f.id, "id,thumbnailLink")) as { thumbnailLink?: string } | null;
    if (!meta?.thumbnailLink) throw new Error("Drive has no preview of this HEIC yet.");
    const res = await fetch(meta.thumbnailLink.replace(/=s\d+$/, `=s${HEIC_PREVIEW_EDGE}`));
    if (!res.ok) throw new Error(`Drive preview failed (${res.status}).`);
    bytes = await res.arrayBuffer();
    type = "image/jpeg";
    name = f.name.replace(/\.[^.]+$/, "") + ".jpg";
  } else {
    bytes = await (await downloadDriveFile(env, account, f.id)).arrayBuffer();
  }
  const check = checkUpload(type, bytes.byteLength);
  if (!check.ok) throw new Error(check.status === 413 ? `Over 50 MB. ${ON_THE_PAGE}` : check.error);

  const path = newPath(tenantId, check.ext);
  const { error: upErr } = await client.storage.from(AD_CREATIVES_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const size = mediaSize(bytes);
  const filed = await recordAdCreative(client, tenantId, {
    path,
    name,
    type,
    size: bytes.byteLength,
    width: size?.width,
    height: size?.height,
    driveFileId: f.id,
  });
  if (!filed.ok) {
    await client.storage.from(AD_CREATIVES_BUCKET).remove([path]);
    throw new Error(filed.error);
  }
  return { name, width: size?.width ?? null, height: size?.height ?? null };
}

export interface CopyResult {
  finishedUrl: string;
  added: Added[];
  failed: { name: string; error: string }[];
  skipped: CopyPlan["skipped"];
  alreadyInApp: number;
  notFound: string[];
  left: number;
}

/** Copy a client's Finished Creatives onto their Creatives page, a few at a time. */
export async function copyFinishedCreatives(env: Env, client: SupabaseClient, tenantId: string, pick: unknown): Promise<CopyResult> {
  const folder = await clientFolderFor(client, tenantId);
  if (!folder) throw new Error("This client has no Drive folder linked.");
  const account = await resolveDriveAccount(env);
  const finished = pickFinishedCreatives(await listFolders(env, account, folder.folderId));
  if (!finished) throw new Error(`There is no Finished Creatives folder in ${folder.url}.`);
  const [found, inApp] = await Promise.all([
    walkImages(finished.id, (ids) => listChildrenOfMany(env, account, ids), isCreativeMime),
    driveFileIdsInApp(client, tenantId),
  ]);
  const plan = planCopy(toDriveCreatives(found, inApp), pick);
  const batch = await copyBatch(plan.copy, (f) => copyOne(env, client, tenantId, account, f));
  return {
    finishedUrl: `https://drive.google.com/drive/folders/${finished.id}`,
    ...batch,
    skipped: plan.skipped,
    alreadyInApp: plan.alreadyInApp,
    notFound: plan.notFound,
  };
}
