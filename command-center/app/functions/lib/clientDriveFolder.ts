import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { composioDriveConfigured, createDriveFolder, resolveDriveAccount } from "./driveComposio";
import { isValidFileId } from "./driveDirect";

// A new client's Google Drive folder, made when the client is created.
//
// One folder, empty. There is no agreed structure for the inside of a client
// folder yet (the live ones disagree with each other), and inventing a skeleton
// here would put a shape in Drive that nobody chose. When that structure is
// decided it goes in this file and nowhere else.
//
// Composio, not the direct grant: the direct OAuth client's consent screen is in
// Testing, so Google expires its refresh token weekly. Creating a folder is a
// metadata call, which is exactly the half Composio can do (it cannot move file
// BYTES, which is why the wizard collects no uploads). See driveComposio.ts.

/** How a client folder is named, matching "🤝 | Willis Windows" in the Drive. */
export const CLIENT_FOLDER_PREFIX = "🤝 | ";

/** Drive rejects these outright; a business name can plausibly hold a slash. */
function sanitize(name: string): string {
  return name.replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim();
}

export function clientFolderName(businessName: string): string {
  return `${CLIENT_FOLDER_PREFIX}${sanitize(businessName)}`;
}

export interface ClientFolder {
  folderId: string;
  name: string;
  webViewLink: string | null;
}

/**
 * A folder attempt: either the folder, or the reason there isn't one.
 *
 * Never both, and never a throw. A Drive outage must not cost a client the
 * tenant row and owner login that were already written, so the caller reports
 * the warning and moves on. The folder is re-creatable; the half-made client
 * would not be.
 */
export interface FolderOutcome {
  folder: ClientFolder | null;
  warning: string | null;
}

/** The Drive folder every client folder is created inside. */
export function clientDriveRoot(env: Env): string {
  return (env.CLIENT_DRIVE_ROOT_FOLDER_ID ?? "").trim();
}

export async function createClientFolder(env: Env, businessName: string): Promise<FolderOutcome> {
  const root = clientDriveRoot(env);
  if (!root) {
    return { folder: null, warning: "No Drive folder was created: CLIENT_DRIVE_ROOT_FOLDER_ID is not set." };
  }
  if (!isValidFileId(root)) {
    return { folder: null, warning: "No Drive folder was created: CLIENT_DRIVE_ROOT_FOLDER_ID is not a Drive folder id." };
  }
  if (!composioDriveConfigured(env)) {
    return { folder: null, warning: "No Drive folder was created: Google Drive is not configured." };
  }

  try {
    const accountId = await resolveDriveAccount(env);
    const made = await createDriveFolder(env, accountId, root, clientFolderName(businessName));
    return {
      folder: { folderId: made.id, name: made.name, webViewLink: made.webViewLink },
      warning: null,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { folder: null, warning: `No Drive folder was created: ${detail}` };
  }
}

/**
 * Create the folder and map it to the tenant, so it shows up in Assets.
 *
 * The mapping row is what makes the folder visible in the app; without it the
 * folder exists in Drive and nothing here knows about it. A failed mapping is
 * still reported as a warning with the folder returned, because the folder is
 * real by then and saying otherwise would send Jake looking for a folder that
 * is sitting right there.
 */
export async function provisionClientFolder(
  env: Env,
  supabase: SupabaseClient,
  tenantId: string,
  businessName: string,
  adminId: string | null,
): Promise<FolderOutcome> {
  const outcome = await createClientFolder(env, businessName);
  if (!outcome.folder) return outcome;

  const { error } = await supabase.from("client_folders").insert({
    tenant_id: tenantId,
    name: businessName.trim() || outcome.folder.name,
    folder_id: outcome.folder.folderId,
    web_view_link: outcome.folder.webViewLink,
    created_by: adminId,
  });
  if (error) {
    return {
      folder: outcome.folder,
      warning: `The Drive folder was created but not linked to this client: ${error.message}`,
    };
  }
  return outcome;
}
