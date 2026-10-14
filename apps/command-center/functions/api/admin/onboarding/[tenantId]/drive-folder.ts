import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { ensureClientFolder } from "../../../../lib/clientDriveFolder";

// POST /api/admin/onboarding/:tenantId/drive-folder
//
// The Create client folder button. Links the folder if it already exists,
// otherwise makes it with Finished Creatives and the Client Setup docs. A
// folder with a warning is still a 200: the folder is real, and the warning
// names the doc that did not copy.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data: tenant } = await client.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
  if (!tenant) return Response.json({ error: "not found" }, { status: 404 });
  const name = (tenant as { name: string }).name;

  const out = await ensureClientFolder(ctx.env, client, tenantId, name, ctx.data.admin!.id);
  if (!out.folder) return Response.json({ error: out.warning ?? "No Drive folder was created." }, { status: 502 });

  await logAdminAction(client, ctx.data.admin!.id, "onboarding.drive-folder", tenantId, {
    name,
    folderId: out.folder.folderId,
  });

  return Response.json({ ok: true, folderUrl: out.folder.webViewLink, warning: out.warning ?? undefined });
};
