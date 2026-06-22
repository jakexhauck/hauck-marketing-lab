import type { Env } from "../../lib/env";
import { requireAdmin } from "../../lib/apiAuth";
import { isFullAccess, listAllowedFolders } from "../../lib/driveAccess";

// GET /api/drive/folders
// The Assets landing payload: connection status + the client folders this admin
// may browse. The UI uses this to render the root list and, when not connected,
// the "Connect Google" banner.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  const { adminId, supabase } = auth;

  const { data: conn } = await supabase
    .from("drive_connection")
    .select("connected_email, updated_at")
    .eq("id", true)
    .maybeSingle();
  const connection = conn as { connected_email: string | null; updated_at: string } | null;

  const [fullAccess, folders] = await Promise.all([
    isFullAccess(supabase, adminId),
    listAllowedFolders(supabase, adminId),
  ]);

  return Response.json({
    connected: !!connection,
    connectedEmail: connection?.connected_email ?? null,
    fullAccess,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      folderId: f.folder_id,
      webViewLink: f.web_view_link,
      tenantId: f.tenant_id,
    })),
  });
};
