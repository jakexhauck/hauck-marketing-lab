import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { canAccess, driveErrorResponse } from "../../../lib/driveAccess";
import { getAccessToken, uploadFile, isValidFileId } from "../../../lib/driveDirect";

// POST /api/admin/assets/upload  (multipart/form-data: folderId, file)
// Upload a file into a folder the admin may access. Bytes stream straight to
// Drive via the agency account (no third-party file store, up to 100 MB).
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const adminId = ctx.data.admin!.id;

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return Response.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const folderId = String(form.get("folderId") ?? "");
  if (!isValidFileId(folderId)) return Response.json({ error: "invalid folderId" }, { status: 400 });

  const entry = form.get("file") as unknown;
  if (entry === null || typeof entry === "string") return Response.json({ error: "missing file" }, { status: 400 });
  const file = entry as { arrayBuffer(): Promise<ArrayBuffer>; name?: string; type?: string };
  if (typeof file.arrayBuffer !== "function") return Response.json({ error: "missing file" }, { status: 400 });

  try {
    const token = await getAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, folderId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const bytes = await file.arrayBuffer();
    const created = await uploadFile(token, folderId, file.name || "upload", file.type || "application/octet-stream", bytes);
    return Response.json({ ok: true, file: created });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
