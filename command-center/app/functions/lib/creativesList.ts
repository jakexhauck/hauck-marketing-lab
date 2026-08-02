import type { Env } from "./env";
import { DriveNotConnectedError } from "./driveDirect";
import { listChildrenOfMany, resolveDriveAccount } from "./driveComposio";

// Reading the contents of a client's ad-creatives Drive folder.
//
// Brokered by COMPOSIO (driveComposio.ts), not by the raw OAuth grant in
// driveDirect.ts. The raw grant runs on the agency's own Google Cloud project,
// whose consent screen is still in Testing: nobody has ever completed it, and
// drive_connection has sat empty since it was built. Composio's Google app is
// already verified and the agency account is connected there, which is the same
// reasoning that moved the SOP Hub across.
//
// Split from creativesFolder.ts on purpose. That file hands out a URL and needs
// nothing from Google at all, which is what lets the "Open in Drive" button keep
// working on a day when listing does not.

export type CreativeKind = "image" | "video" | "pdf" | "sheet" | "zip" | "doc";

export interface CreativeFile {
  id: string;
  name: string;
  kind: CreativeKind;
  // Opens the file in Drive itself. Always present; the thumbnail may not be.
  webViewLink: string | null;
  modifiedTime: string | null;
  size: number | null;
  // Drive's own short-lived thumbnail URL, passed through for the grid to load
  // directly.
  //
  // NOT proxied through us, unlike everything else here, because Composio's
  // transport cannot move file BYTES (see the note at the top of
  // driveComposio.ts: its file-staging store fails with "Missing presigned
  // URL"). There is therefore no token-authenticated path to an image, so the
  // browser fetches Google's URL itself and the tile falls back to a type icon
  // when that fails.
  thumbnailUrl: string | null;
}

// Video is called out separately from the Assets page's kinds: an ad account is
// mostly images and video, and "doc" for a reel is useless in a creatives grid.
export function creativeKind(mimeType: string, name: string): CreativeKind {
  const m = (mimeType ?? "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (m.includes("video") || ["mp4", "mov", "webm", "avi", "m4v"].includes(ext)) return "video";
  if (m.includes("image") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext))
    return "image";
  if (m.includes("pdf") || ext === "pdf") return "pdf";
  if (m.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (m.includes("zip") || ["zip", "rar", "7z"].includes(ext)) return "zip";
  return "doc";
}

export interface CreativesListing {
  // False means the agency Google account is not connected in Composio. The
  // folder link still works; only the grid is unavailable.
  connected: boolean;
  files: CreativeFile[];
  // Drive answered, but badly (folder deleted, access revoked, rate limited).
  // Said out loud rather than rendered as an empty folder, which reads as "this
  // client has no creatives".
  error: string | null;
}

export async function listCreatives(
  env: Env,
  folderId: string | null,
): Promise<CreativesListing> {
  try {
    const accountId = await resolveDriveAccount(env);
    // Connection resolved, so the grid is available even if no folder is mapped
    // yet. Reported separately from "no files" so the wizard can tell them apart.
    if (!folderId) return { connected: true, files: [], error: null };

    const byFolder = await listChildrenOfMany(env, accountId, [folderId]);
    const children = byFolder.get(folderId) ?? [];

    const files = children
      // Sub-folders are skipped rather than descended into. A creatives folder
      // organised into sub-folders is a real thing, but flattening it would mix
      // two campaigns' assets into one grid with no way to tell them apart.
      .filter((c) => !c.isFolder)
      .map<CreativeFile>((c) => ({
        id: c.id,
        name: c.name,
        kind: creativeKind(c.mimeType, c.name),
        webViewLink: c.webViewLink,
        modifiedTime: c.modifiedTime,
        size: c.size == null ? null : Number(c.size) || null,
        thumbnailUrl: c.thumbnailLink,
      }));

    return { connected: true, files, error: null };
  } catch (err) {
    // Not connected is a setup state, not a failure, and the UI says something
    // completely different about it, so it never travels as `error`.
    if (err instanceof DriveNotConnectedError) {
      return { connected: false, files: [], error: null };
    }
    return { connected: true, files: [], error: (err as Error).message };
  }
}
