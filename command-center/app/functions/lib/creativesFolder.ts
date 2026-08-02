// The client's ad-creatives Drive folder: one id, and the link built from it.
//
// Deliberately tiny and deliberately independent of the assets/SOP Drive
// integration in driveDirect.ts. That one reads folder CONTENTS and so needs the
// agency's OAuth connection, which has never been completed. This one only
// hands out a URL, so it works today and cannot break when Drive is down.

export const DRIVE_FOLDER_BASE = "https://drive.google.com/drive/folders/";

export interface CreativesFolder {
  folderId: string | null;
  // Null whenever folderId is, so a caller never has to build the link itself
  // and the two can never disagree.
  url: string | null;
}

// Rebuilt from the id rather than stored, because a pasted share link carries
// query junk (?usp=sharing, resourcekey) that goes stale and differs depending
// on whether it came from the copy-link button or the address bar.
export function folderUrl(folderId: string | null): string | null {
  return folderId ? `${DRIVE_FOLDER_BASE}${folderId}` : null;
}

export function toCreativesFolder(folderId: string | null | undefined): CreativesFolder {
  const id = (folderId ?? "").trim() || null;
  return { folderId: id, url: folderUrl(id) };
}
