import type { SupabaseClient } from "@supabase/supabase-js";
import { getFileMeta } from "./driveDirect";

// Who-sees-what for the Assets hub. Drive can't gate this (the agency account
// owns everything), so the command center is the gatekeeper:
//   - an admin in drive_full_access sees every client_folder
//   - any other admin sees only the client_folders linked in folder_access
// Each Drive call resolves the admin's allowed root folders, then verifies the
// requested folder/file is at or under one of them (Drive ancestor walk).
//
// Tables (migrations 0013/0015) are shared with the former internal portal.

export interface ClientFolder {
  id: string;
  tenant_id: string | null;
  name: string;
  folder_id: string;
  web_view_link: string | null;
  sort: number;
}

export async function isFullAccess(supabase: SupabaseClient, adminId: string): Promise<boolean> {
  const { data } = await supabase.from("drive_full_access").select("admin_id").eq("admin_id", adminId).maybeSingle();
  return !!data;
}

export async function listAllowedFolders(supabase: SupabaseClient, adminId: string): Promise<ClientFolder[]> {
  if (await isFullAccess(supabase, adminId)) {
    const { data } = await supabase
      .from("client_folders")
      .select("id, tenant_id, name, folder_id, web_view_link, sort")
      .order("sort", { ascending: true })
      .order("name", { ascending: true });
    return (data as ClientFolder[]) ?? [];
  }
  const { data: grants } = await supabase.from("folder_access").select("client_folder_id").eq("admin_id", adminId);
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
 * Verify a folder/file id is at or beneath one of the admin's allowed roots.
 * Walks the Drive parent chain up to maxDepth using the agency access token.
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

  const visited = new Set<string>([targetId]);
  let frontier = [targetId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const meta = await getFileMeta(token, id, "id,parents");
      for (const p of meta?.parents ?? []) {
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

// Map a thrown Drive error to an HTTP response. A not-connected error becomes
// 409 so the UI shows the "Connect Google" banner.
export function driveErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === "DriveNotConnectedError") {
    return Response.json({ error: message, code: "not_connected" }, { status: 409 });
  }
  return Response.json({ error: message }, { status: 502 });
}
