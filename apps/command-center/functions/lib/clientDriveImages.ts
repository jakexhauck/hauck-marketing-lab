import type { SupabaseClient } from "@supabase/supabase-js";
import type { DriveFile } from "./driveDirect";

// The images in a client's Google Drive folder, for the Image Converter page
// (Client > Image Converter, Jake 2026-10-15). The browser turns them into JPGs
// under 750 KB for GHL texts; nothing is ever written back to Drive.
//
// Pure apart from the injected Drive reads, so the walk and the "is this file
// really in their folder" check are testable without Composio.

export interface DriveImage {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  thumbnailLink: string | null;
  // Where it sits under the client folder, "" for the top level, else
  // "Finished Creatives" or "Finished Creatives / March".
  folder: string;
}

// A runaway walk (a folder shortcut loop, a folder of 5,000 subfolders) stops
// here rather than eating the Composio quota. Real client folders are 2 to 3
// levels and a dozen folders.
export const MAX_DEPTH = 6;
export const MAX_FOLDERS = 200;

export type ListChildrenOfMany = (folderIds: string[]) => Promise<Map<string, DriveFile[]>>;

/** Every image under `rootId`, one Drive call per level. */
export async function walkImages(rootId: string, listChildrenOfMany: ListChildrenOfMany): Promise<DriveImage[]> {
  const images: DriveImage[] = [];
  const seen = new Set<string>([rootId]);
  let level = new Map<string, string>([[rootId, ""]]);
  for (let depth = 0; depth < MAX_DEPTH && level.size > 0; depth++) {
    const children = await listChildrenOfMany([...level.keys()]);
    const next = new Map<string, string>();
    for (const [folderId, path] of level) {
      for (const f of children.get(folderId) ?? []) {
        if (f.isFolder) {
          if (seen.has(f.id) || seen.size >= MAX_FOLDERS) continue;
          seen.add(f.id);
          next.set(f.id, path ? `${path} / ${f.name}` : f.name);
        } else if (f.mimeType.startsWith("image/")) {
          images.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : null,
            thumbnailLink: f.thumbnailLink,
            folder: path,
          });
        }
      }
    }
    level = next;
  }
  return images;
}

/**
 * True when `fileId` sits somewhere under `rootId`.
 *
 * The download endpoint takes a Drive file id from the browser, and the agency
 * account can read every client's folder and far more besides, so the id is
 * walked up to the client's folder before any bytes move.
 */
export async function isUnderFolder(
  fileId: string,
  rootId: string,
  parentsOf: (id: string) => Promise<string[]>,
): Promise<boolean> {
  let frontier = [fileId];
  const seen = new Set<string>();
  for (let depth = 0; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const parent of await parentsOf(id)) {
        if (parent === rootId) return true;
        if (!seen.has(parent)) {
          seen.add(parent);
          next.push(parent);
        }
      }
    }
    frontier = next;
  }
  return false;
}

/** The client's linked Drive folder, or null before Create client folder. */
export async function clientFolderFor(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ folderId: string; name: string; url: string } | null> {
  const { data, error } = await supabase
    .from("client_folders")
    .select("folder_id, name, web_view_link")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { folder_id: string; name: string; web_view_link: string | null };
  return {
    folderId: row.folder_id,
    name: row.name,
    url: row.web_view_link ?? `https://drive.google.com/drive/folders/${row.folder_id}`,
  };
}
