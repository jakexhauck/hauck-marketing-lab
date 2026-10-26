import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { FOLDER_MIME } from "./driveDirect";
import { fileParents, getFileMeta, resolveDriveAccount } from "./driveComposio";
import { MAX_DEPTH, clientFolderFor, isUnderFolder } from "./clientDriveImages";

// The client's whole Drive folder in the app (Client > Folder, Jake 2026-10-26):
// browse, open in Google's own editor, new, rename, delete, upload.
//
// Everything runs on the Composio grant (driveComposio.ts), never the direct
// one, so nothing here lapses after Google's weekly Testing-mode expiry. Uploads
// included: Composio opens a resumable upload session and our function sends
// the bytes to the link it hands back (verified 2026-10-26).
//
// The agency account reads every client's folder and far more besides, so every
// id from the browser is checked to sit under THIS client's folder first.

export interface ClientDrive {
  account: string;
  root: { folderId: string; name: string; url: string };
  /** True when `id` is the client's folder or sits anywhere under it. */
  contains(id: string): Promise<boolean>;
  metaOf: MetaOf;
}

/** The client's folder and the Drive grant to reach it, or null before Create client folder. */
export async function openClientDrive(env: Env, supabase: SupabaseClient, tenantId: string): Promise<ClientDrive | null> {
  const root = await clientFolderFor(supabase, tenantId);
  if (!root) return null;
  const account = await resolveDriveAccount(env);
  return {
    account,
    root,
    contains: async (id) =>
      id === root.folderId || isUnderFolder(id, root.folderId, (x) => fileParents(env, account, x)),
    metaOf: async (id) => {
      const meta = (await getFileMeta(env, account, id, "id,name,parents")) as { name: string; parents?: string[] } | null;
      return meta ? { name: meta.name, parents: meta.parents ?? [] } : null;
    },
  };
}

export interface PathStep {
  id: string;
  name: string;
}

export type MetaOf = (id: string) => Promise<{ name: string; parents: string[] } | null>;

/**
 * The trail from the client's folder down to `folderId`, top first, or null
 * when `folderId` is not under the client's folder. Doubles as the access check
 * for a listing: it walks the same parents isUnderFolder would.
 *
 * Follows the first parent only. Drive gives every item one parent since 2020,
 * and a legacy second parent outside the client's folder would only make the
 * walk say no, which is the safe direction.
 */
export async function folderPath(
  folderId: string,
  rootId: string,
  rootName: string,
  metaOf: MetaOf,
): Promise<PathStep[] | null> {
  const trail: PathStep[] = [];
  let id = folderId;
  for (let depth = 0; depth <= MAX_DEPTH; depth++) {
    if (id === rootId) return [{ id: rootId, name: rootName }, ...trail.reverse()];
    const meta = await metaOf(id);
    if (!meta || meta.parents.length === 0) return null;
    trail.push({ id, name: meta.name });
    id = meta.parents[0];
  }
  return null;
}

// The New menu. Each is a metadata-only create, so Composio can make it.
const NEW_ITEMS: Record<string, string> = {
  folder: FOLDER_MIME,
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
};

export function newItemMime(kind: unknown): string | null {
  return typeof kind === "string" && Object.hasOwn(NEW_ITEMS, kind) ? NEW_ITEMS[kind] : null;
}

// Drive's own limit on a name is far longer, but nobody means a 500-character name.
const MAX_NAME = 255;

export function cleanDriveName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return clean || null;
}
