import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { logAdminAction } from "../../../../../lib/adminAuth";
import { resolveDriveAccount } from "../../../../../lib/driveComposio";
import { fillClientFolderDocs } from "../../../../../lib/docFill";
import { isValidFileId } from "../../../../../lib/driveDirect";

// POST /api/admin/onboarding/:tenantId/drive-folder/fill
//
// Fill in docs: puts the client's company name into every [Company Name] in
// the Google Docs inside their client folder (functions/lib/docFill.ts). For
// folders made before the folder button did it on its own, or after the
// client's name changed. Owner only. Never touches the Client Setup templates:
// it only reads the folder linked to this client.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (!admin || admin.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const [{ data: tenant }, { data: folder, error }] = await Promise.all([
    client.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    client.from("client_folders").select("folder_id").eq("tenant_id", tenantId).limit(1).maybeSingle(),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const name = ((tenant as { name?: string } | null)?.name ?? "").trim();
  const folderId = (folder as { folder_id?: string } | null)?.folder_id ?? "";
  if (!name) return Response.json({ error: "Client not found" }, { status: 404 });
  if (!isValidFileId(folderId)) return Response.json({ error: "Create the client folder first" }, { status: 400 });

  try {
    const result = await fillClientFolderDocs(ctx.env, await resolveDriveAccount(ctx.env), folderId, name);
    await logAdminAction(client, admin.id, "onboarding.drive-fill", tenantId, result);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: `Drive: ${(err as Error).message}` }, { status: 502 });
  }
};
