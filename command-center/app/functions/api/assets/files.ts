import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { driveErrorResponse } from "../../lib/driveAccess";
import {
  getAccessToken,
  listFolderChildren,
  isConnected,
} from "../../lib/driveDirect";
import { tenantIdForSlug, tenantFolders } from "../../lib/clientAssets";

// GET /api/assets/files
// The client's own file library: every file the agency has shared to this
// tenant, listed straight from the agency Drive. Read-only from the client side
// (the agency owns the Drive), so the UI keeps upload / new-folder disabled.
// Files are grouped by the mapped folder they live in (each client_folders row
// is a section). Tenant isolation lives in clientAssets: only folders mapped to
// this session's tenant are ever read.
//
// Response: { connected, sections: string[], files: ApiAssetFile[] }
// connected = false        -> the agency has not connected a Drive yet.
// connected, no sections   -> connected, but nothing shared to this client yet.

interface ApiAssetFile {
  id: string;
  name: string;
  kind: string; // pdf | doc | image | zip | sheet
  section: string; // the mapped folder name it lives under
  modifiedTime: string | null;
  size: string | null;
}

// Coarse file-type bucket from the Drive mimeType (or the name's extension as a
// fallback). Anything unrecognised is a plain document so it still gets an icon.
function kindOf(mimeType: string, name: string): string {
  const m = (mimeType ?? "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (m.includes("pdf") || ext === "pdf") return "pdf";
  if (m.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext))
    return "sheet";
  if (m.includes("image") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return "image";
  if (m.includes("zip") || ["zip", "rar", "7z"].includes(ext)) return "zip";
  return "doc";
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase)
    return Response.json({ error: "supabase not configured" }, { status: 503 });

  const empty = (connected: boolean) =>
    Response.json({ connected, sections: [], files: [] });

  const { connected } = await isConnected(supabase);
  if (!connected) return empty(false);

  const tenantId = await tenantIdForSlug(supabase, ctx.data.tenant.slug);
  if (!tenantId) return empty(true);

  const folders = await tenantFolders(supabase, tenantId);
  if (folders.length === 0) return empty(true);

  try {
    const token = await getAccessToken(ctx.env, supabase);
    const files: ApiAssetFile[] = [];
    const sections: string[] = [];
    for (const f of folders) {
      sections.push(f.name);
      const children = await listFolderChildren(token, f.folder_id);
      for (const c of children) {
        if (c.isFolder) continue; // v1: a shared folder is flat (no sub-folders)
        files.push({
          id: c.id,
          name: c.name,
          kind: kindOf(c.mimeType, c.name),
          section: f.name,
          modifiedTime: c.modifiedTime,
          size: c.size,
        });
      }
    }
    return Response.json({ connected: true, sections, files });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
