import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { listFolders } from "./driveComposio";
import { clientDriveRoot, clientInitials, matchClientFolder } from "./clientDriveFolder";
import { clientFolderFor } from "./clientDriveImages";

// The client's Mission Control doc (Jake, 2026-10-26): a copy of "Mission
// Control // TEMPLATE" (Drive > New Client Setup) in the client's Drive folder,
// named like "CW // Mission Control". The Brief page embeds it.
//
// The doc the CSM picks on the Brief (tenants.mission_control_doc_id, 0184,
// Jake 2026-10-27) wins. With none picked, the doc is found by name in the
// folder, so a copy a Grok Bot or Jake makes by hand still shows up by itself.

export const MISSION_CONTROL_TEMPLATE_ID = "1NOVDwDuQg0EJ_zfL2aOqDmzDu8gE4kMfNsZTeMP8Dlc";
export const MISSION_CONTROL_NAME_PART = "Mission Control";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

/**
 * Why a folder cannot be linked to this client, or null when it can. It must
 * be one of the client folders in the root (so a stray id cannot point a
 * client at someone else's files) and no other client may hold it: two clients
 * on one folder would each see the other's Brief.
 */
export function folderLinkProblem(
  folderId: string,
  rootFolders: { id: string }[],
  holders: { tenant_id: string; folder_id: string }[],
  tenantId: string,
): string | null {
  if (!rootFolders.some((f) => f.id === folderId)) return "That folder is not in the client folders.";
  if (holders.some((h) => h.tenant_id === tenantId)) return "This client already has a folder.";
  if (holders.some((h) => h.folder_id === folderId)) return "Another client already uses that folder.";
  return null;
}

/** "Comfort Wizards LLC" -> "CW // Mission Control", the name Jake gave the first copy. */
export function missionControlDocName(clientName: string): string {
  return `${clientInitials(clientName)} // ${MISSION_CONTROL_NAME_PART}`;
}

// Drive's links end in /edit?usp=drivesdk; the embed wants the plain editor.
export function missionControlEmbedUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}

/**
 * The client's Drive folder: the linked one, else their "🤝 | Name" folder in
 * the client root (only AAG was ever linked; the rest were made by hand or by a
 * bot). Never creates a folder, so no match gives null rather than a duplicate.
 */
export async function missionControlFolder(
  env: Env,
  supabase: SupabaseClient,
  accountId: string,
  tenantId: string,
  clientName: string,
): Promise<{ folderId: string } | null> {
  const linked = await clientFolderFor(supabase, tenantId);
  if (linked) return { folderId: linked.folderId };
  const found = matchClientFolder(await listFolders(env, accountId, clientDriveRoot(env)), clientName);
  return found ? { folderId: found.id } : null;
}
