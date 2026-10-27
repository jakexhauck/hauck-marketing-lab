import { FINISHED_CREATIVES_FOLDER } from "./clientDriveFolder";
import type { DriveImage } from "./clientDriveImages";

// Client > Grok Bot > Add Creatives (Jake, 2026-10-27). A Grok Bot (or Jake)
// copies what sits in the client's Drive "Finished Creatives" folder onto their
// Creatives page. This file is the pure part: which folder is the one, which
// files count, and which are already in the app (ad_creative_files.drive_file_id,
// mig 0186).

export interface DriveCreative extends DriveImage {
  kind: "image" | "video";
  inApp: boolean;
}

export const isCreativeMime = (mimeType: string) => mimeType.startsWith("image/") || mimeType.startsWith("video/");

/** The "Finished Creatives" folder among the client folder's subfolders, forgiving case and spacing. */
export function pickFinishedCreatives<T extends { name: string }>(folders: T[]): T | null {
  const want = FINISHED_CREATIVES_FOLDER.toLowerCase();
  return folders.find((f) => f.name.replace(/\s+/g, " ").trim().toLowerCase() === want) ?? null;
}

export function toDriveCreatives(files: DriveImage[], inApp: Set<string>): DriveCreative[] {
  return files.map((f) => ({
    ...f,
    kind: f.mimeType.startsWith("video/") ? "video" : "image",
    inApp: inApp.has(f.id),
  }));
}
