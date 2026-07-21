import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getAccessToken, getFileMeta, exportDocHtml, isValidFileId, DriveNotConnectedError } from "../../../../lib/driveDirect";
import { cleanDocHtml, extractTitle } from "../../../../lib/sopHtml";
import { DOC_MIME } from "../../../../lib/sopTree";

// GET /api/admin/sops/doc/:fileId — one SOP, rendered.
//
// Exporting and sanitizing a Doc costs a few hundred ms, so the result is cached
// in sop_doc_cache keyed by Drive's modifiedTime. Edit the Doc and the next open
// re-renders it; otherwise this is a single indexed row read.
//
// Admin-only: gated centrally in api/_middleware.ts.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const fileId = String(ctx.params.fileId ?? "");
  if (!isValidFileId(fileId)) {
    return Response.json({ error: "invalid file id" }, { status: 400 });
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  try {
    const token = await getAccessToken(ctx.env, client);

    const meta = await getFileMeta(token, fileId, "id,name,mimeType,modifiedTime,webViewLink");
    if (!meta) return Response.json({ error: "not found" }, { status: 404 });
    // Only Docs render as SOP pages. Anything else is an attachment and belongs
    // in Drive, so refuse rather than exporting something unreadable.
    if (meta.mimeType !== DOC_MIME) {
      return Response.json({ error: "not a Google Doc" }, { status: 415 });
    }

    const modifiedTime = (meta as { modifiedTime?: string }).modifiedTime ?? "";

    const { data: cached } = await client
      .from("sop_doc_cache")
      .select("html, title, modified_time")
      .eq("file_id", fileId)
      .maybeSingle();

    if (cached && cached.modified_time === modifiedTime) {
      return Response.json({ title: cached.title ?? meta.name, html: cached.html, cached: true });
    }

    const raw = await exportDocHtml(token, fileId);
    const html = cleanDocHtml(raw);
    const title = extractTitle(raw) ?? meta.name;

    // A cache write failing must not fail the read: the SOP is already rendered.
    await client
      .from("sop_doc_cache")
      .upsert(
        { file_id: fileId, modified_time: modifiedTime, title, html, cached_at: new Date().toISOString() },
        { onConflict: "file_id" },
      );

    return Response.json({ title, html, cached: false });
  } catch (err) {
    if (err instanceof DriveNotConnectedError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not open that SOP.";
    return Response.json({ error: message }, { status: 500 });
  }
};
