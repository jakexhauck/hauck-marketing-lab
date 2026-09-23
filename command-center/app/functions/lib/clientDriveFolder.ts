import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import {
  composioDriveConfigured,
  copyDriveFile,
  createDriveFolder,
  listChildrenOfMany,
  listFolders,
  resolveDriveAccount,
} from "./driveComposio";
import { isValidFileId, type DriveFile } from "./driveDirect";

// A client's Google Drive folder, made by the Create client folder button on
// Onboarding (Jake, 2026-09-23: a button, not automatic on client create).
//
// Jake's layout (2026-09-23), modelled on "🤝 | Above All Garage Doors":
//   🤝 | Business Name
//   ├── Finished Creatives/
//   └── a copy of every doc in "🚀 Client Setup", renamed "WW | Copy" etc.
// Every doc in that folder is copied, so a template Jake drops in there later
// is picked up with no code change. The structure lives in this file only.
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

/** The subfolder every client folder gets. */
export const FINISHED_CREATIVES_FOLDER = "Finished Creatives";

// Endings that are paperwork, not name: "Made Better LC" is MB, not MBL.
const COMPANY_ENDINGS = new Set(["LLC", "LC", "PLLC", "INC", "CO", "CORP", "LTD"]);

/** "Willis Windows" -> "WW". The prefix on every copied doc. */
export function clientInitials(businessName: string): string {
  const words = businessName
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const initials = words
    .filter((w) => !COMPANY_ENDINGS.has(w.toUpperCase()))
    .map((w) => w[0].toUpperCase())
    .join("");
  // A name that is nothing but endings still needs a prefix, or the copy would
  // be called " | Copy".
  if (initials) return initials;
  return words[0]?.[0]?.toUpperCase() ?? "X";
}

/** "Copy | TEMPLATE" -> "WW | Copy". A doc with no tag just gets the prefix. */
export function templateCopyName(templateName: string, initials: string): string {
  const base = templateName.replace(/\s*\|\s*template\s*$/i, "").trim();
  return `${initials} | ${base}`;
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

// Not secrets, so they live here. The root's env var still wins, for a move;
// that env var never being set is what kept this switched off until 2026-09-23.
const DEFAULT_CLIENT_DRIVE_ROOT = "195VBhcEi4ZHMUxr7yeyWeCIJo8WZC_7Y"; // 🌟 Hauck Marketing
const SETUP_TEMPLATES_FOLDER = "1pG95hrqE06O9Dam-7IbGW7EO4Bl-dBze"; // 🚀 Client Setup

const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

/** The Drive folder every client folder is created inside. */
export function clientDriveRoot(env: Env): string {
  return (env.CLIENT_DRIVE_ROOT_FOLDER_ID ?? "").trim() || DEFAULT_CLIENT_DRIVE_ROOT;
}


export async function createClientFolder(env: Env, businessName: string): Promise<FolderOutcome> {
  const root = clientDriveRoot(env);
  if (!isValidFileId(root)) {
    return { folder: null, warning: "No Drive folder was created: CLIENT_DRIVE_ROOT_FOLDER_ID is not a Drive folder id." };
  }
  if (!composioDriveConfigured(env)) {
    return { folder: null, warning: "No Drive folder was created: Google Drive is not configured." };
  }

  let accountId: string;
  let made: { id: string; name: string; webViewLink: string | null };
  try {
    accountId = await resolveDriveAccount(env);
    made = await createDriveFolder(env, accountId, root, clientFolderName(businessName));
  } catch (err) {
    return { folder: null, warning: `No Drive folder was created: ${errText(err)}` };
  }

  const problems = await fillClientFolder(env, accountId, made.id, businessName);
  return {
    folder: { folderId: made.id, name: made.name, webViewLink: made.webViewLink },
    warning: problems.length ? `The Drive folder was made, but ${problems.join("; ")}.` : null,
  };
}

/**
 * The inside of a new client folder. Returns what went wrong, one entry per
 * failure, so one bad copy never costs the others. One call at a time: the
 * Composio quota is shared and answers bursts with 429.
 */
async function fillClientFolder(
  env: Env,
  accountId: string,
  folderId: string,
  businessName: string,
): Promise<string[]> {
  const problems: string[] = [];

  try {
    await createDriveFolder(env, accountId, folderId, FINISHED_CREATIVES_FOLDER);
  } catch (err) {
    problems.push(`${FINISHED_CREATIVES_FOLDER} was not created (${errText(err)})`);
  }

  const setup = SETUP_TEMPLATES_FOLDER;
  let templates: DriveFile[];
  try {
    templates = (await listChildrenOfMany(env, accountId, [setup])).get(setup) ?? [];
  } catch (err) {
    problems.push(`the setup templates could not be read (${errText(err)})`);
    return problems;
  }

  const initials = clientInitials(businessName);
  for (const t of templates) {
    // Drive cannot copy a folder, and a shortcut would copy as a dead link.
    if (t.isFolder || t.mimeType === SHORTCUT_MIME) continue;
    const name = templateCopyName(t.name, initials);
    try {
      await copyDriveFile(env, accountId, t.id, folderId, name);
    } catch (err) {
      problems.push(`${name} was not copied (${errText(err)})`);
    }
  }
  return problems;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

/**
 * What the Create client folder button runs. Safe to press twice: a client
 * already linked gets their folder back, and a folder that already sits in the
 * root under the right name (Willis, Made Better and AAG were made by hand) is
 * linked as it is, never duplicated and never refilled.
 */
export async function ensureClientFolder(
  env: Env,
  supabase: SupabaseClient,
  tenantId: string,
  businessName: string,
  adminId: string | null,
): Promise<FolderOutcome> {
  const { data: linked, error: readErr } = await supabase
    .from("client_folders")
    .select("folder_id, name, web_view_link")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (readErr) return { folder: null, warning: `Could not check for an existing folder: ${readErr.message}` };
  if (linked) {
    const row = linked as { folder_id: string; name: string; web_view_link: string | null };
    return {
      folder: { folderId: row.folder_id, name: row.name, webViewLink: row.web_view_link ?? folderUrl(row.folder_id) },
      warning: null,
    };
  }

  const root = clientDriveRoot(env);
  if (composioDriveConfigured(env) && isValidFileId(root)) {
    try {
      const accountId = await resolveDriveAccount(env);
      const wanted = clientFolderName(businessName);
      const found = (await listFolders(env, accountId, root)).find((f) => f.name.trim() === wanted);
      if (found) {
        const folder = { folderId: found.id, name: found.name, webViewLink: folderUrl(found.id) };
        const { error } = await supabase.from("client_folders").insert({
          tenant_id: tenantId,
          name: businessName.trim() || found.name,
          folder_id: found.id,
          web_view_link: folder.webViewLink,
          created_by: adminId,
        });
        return {
          folder,
          warning: error ? `The Drive folder exists but was not linked to this client: ${error.message}` : null,
        };
      }
    } catch (err) {
      return { folder: null, warning: `No Drive folder was created: ${errText(err)}` };
    }
  }

  return provisionClientFolder(env, supabase, tenantId, businessName, adminId);
}

function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}
