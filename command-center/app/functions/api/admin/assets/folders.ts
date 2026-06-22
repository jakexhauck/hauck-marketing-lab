import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { isFullAccess, listAllowedFolders } from "../../../lib/driveAccess";
import { isConnected } from "../../../lib/driveDirect";

// GET /api/admin/assets/folders
// The Assets landing payload: connection status + the client folders this admin
// may browse. Powers the root list and the "Connect Google" banner.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const adminId = ctx.data.admin!.id;

  const [{ connected, email }, fullAccess, folders] = await Promise.all([
    isConnected(supabase),
    isFullAccess(supabase, adminId),
    listAllowedFolders(supabase, adminId),
  ]);

  return Response.json({
    connected,
    connectedEmail: email,
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
