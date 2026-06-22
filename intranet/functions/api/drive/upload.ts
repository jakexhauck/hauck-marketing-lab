import type { Env } from "../../lib/env";
import { requireAdmin, driveErrorResponse } from "../../lib/apiAuth";
import { getDriveAccessToken, uploadFile, isValidFileId } from "../../lib/drive";
import { canAccess } from "../../lib/driveAccess";

// POST /api/drive/upload  (multipart/form-data: folderId, file)
// Upload a file into a folder the admin may access. The browser sends the bytes
// to the portal; the portal forwards them to Drive with the agency token.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const auth = await requireAdmin(ctx.request, ctx.env);
  if (auth instanceof Response) return auth;
  const { adminId, supabase } = auth;

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return Response.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const folderId = String(form.get("folderId") ?? "");
  if (!isValidFileId(folderId)) return Response.json({ error: "invalid folderId" }, { status: 400 });

  // form.get returns string | File; a real upload is the File branch (has
  // arrayBuffer()). Treat it structurally to stay portable across type defs.
  const entry = form.get("file") as unknown;
  if (entry === null || typeof entry === "string") {
    return Response.json({ error: "missing file" }, { status: 400 });
  }
  const file = entry as { arrayBuffer(): Promise<ArrayBuffer>; name?: string; type?: string };
  if (typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "missing file" }, { status: 400 });
  }

  try {
    const token = await getDriveAccessToken(ctx.env, supabase);
    if (!(await canAccess(token, supabase, adminId, folderId))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const bytes = await file.arrayBuffer();
    const created = await uploadFile(
      token,
      folderId,
      file.name || "upload",
      file.type || "application/octet-stream",
      bytes,
    );
    return Response.json({ ok: true, file: created });
  } catch (err) {
    return driveErrorResponse(err);
  }
};
