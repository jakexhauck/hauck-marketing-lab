import type { SupabaseClient } from "@supabase/supabase-js";
import { getFileMeta } from "./drive";

// Who-sees-what for the Assets hub. Drive itself can't gate this (the agency
// account owns everything), so the portal is the gatekeeper:
//   - an admin listed in drive_full_access sees EVERY client_folder
//   - any other admin sees only the client_folders linked in folder_access
// Every Drive call resolves the admin's allowed root folders, then verifies the
// requested folder/file lives at or under one of them (ancestor walk).

export interface ClientFolder {
  id: string;
  tenant_id: string | null;
  name: string;
  folder_id: string;
  web_view_link: string | null;
  sort: number;
}

/** True if this admin sees every client folder (the agency owner). */
export async function isFullAccess(supabase: SupabaseClient, adminId: string): Promise<boolean> {
  const { data } = await supabase
    .from("drive_full_access")
    .select("admin_id")
    .eq("admin_id", adminId)
    .maybeSingle();
  return !!data;
}

/** The client folders this admin may browse, sorted for display. */
export async function listAllowedFolders(supabase: SupabaseClient, adminId: string): Promise<ClientFolder[]> {
  if (await isFullAccess(supabase, adminId)) {
    const { data } = await supabase
      .from("client_folders")
      .select("id, tenant_id, name, folder_id, web_view_link, sort")
      .order("sort", { ascending: true })
      .order("name", { ascending: true });
    return (data as ClientFolder[]) ?? [];
  }
  const { data: grants } = await supabase
    .from("folder_access")
    .select("client_folder_id")
    .eq("admin_id", adminId);
  const ids = ((grants as { client_folder_id: string }[]) ?? []).map((g) => g.client_folder_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("client_folders")
    .select("id, tenant_id, name, folder_id, web_view_link, sort")
    .in("id", ids)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  return (data as ClientFolder[]) ?? [];
}

/**
 * Verify the given folder/file id is at or beneath one of the admin's allowed
 * root folders. Walks the Drive parent chain up to maxDepth. Returns true if
 * permitted. A drive_full_access admin is permitted for any reachable id.
 */
export async function canAccess(
  token: string,
  supabase: SupabaseClient,
  adminId: string,
  targetId: string,
  maxDepth = 25,
): Promise<boolean> {
  const allowed = await listAllowedFolders(supabase, adminId);
  const allowedRootIds = new Set(allowed.map((f) => f.folder_id));
  if (allowedRootIds.size === 0) return false;
  if (allowedRootIds.has(targetId)) return true;

  // Walk up the parent chain. Drive returns at most one parent per node in
  // My Drive, but handle multiple defensively with a visited set.
  const visited = new Set<string>([targetId]);
  let frontier = [targetId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const meta = await getFileMeta(token, id, "id,parents");
      const parents = meta?.parents ?? [];
      for (const p of parents) {
        if (allowedRootIds.has(p)) return true;
        if (!visited.has(p)) {
          visited.add(p);
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return false;
}
