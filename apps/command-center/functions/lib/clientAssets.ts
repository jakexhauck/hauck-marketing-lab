import type { SupabaseClient } from "@supabase/supabase-js";
import { getFileMeta } from "./driveDirect";

// Client-facing Assets: the read side of the agency Drive, scoped to ONE tenant.
//
// The agency owns a single Google account (drive_connection). Which folders a
// client may see is decided in our own tables, never by Drive: client_folders
// maps tenant_id -> a Drive folder. A client session only carries its tenants.slug
// (see TenantContext), so we resolve the tenant id here, then read only the
// folders mapped to that id. A client can never reach another tenant's files.

export interface TenantFolder {
  id: string;
  name: string;
  folder_id: string;
}

// Resolve the tenant's UUID from its slug (the client session carries slug only).
export async function tenantIdForSlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// The Drive folders the agency has mapped to this tenant, in display order.
export async function tenantFolders(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantFolder[]> {
  const { data } = await supabase
    .from("client_folders")
    .select("id, name, folder_id")
    .eq("tenant_id", tenantId)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  return (data as TenantFolder[]) ?? [];
}

// Verify a file/folder id is at or beneath one of the tenant's mapped folders.
// Walks the Drive parent chain with the agency token, mirroring
// driveAccess.canAccess but scoped to a tenant's roots instead of an admin's, so
// a guessed or copied file id outside the shared folders is refused.
export async function tenantCanAccess(
  token: string,
  supabase: SupabaseClient,
  tenantId: string,
  targetId: string,
  maxDepth = 25,
): Promise<boolean> {
  const roots = new Set(
    (await tenantFolders(supabase, tenantId)).map((f) => f.folder_id),
  );
  if (roots.size === 0) return false;
  if (roots.has(targetId)) return true;

  const visited = new Set<string>([targetId]);
  let frontier = [targetId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      const meta = await getFileMeta(token, id, "id,parents");
      for (const p of meta?.parents ?? []) {
        if (roots.has(p)) return true;
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
