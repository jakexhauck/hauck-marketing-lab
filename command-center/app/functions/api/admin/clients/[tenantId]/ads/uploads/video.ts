import type { Env, ApiData } from "../../../../../../lib/env";
import { resolveUploadTarget } from "../../../../../../lib/creativeUploadTarget";
import { finishAdVideo, startAdVideo, transferAdVideo } from "../../../../../../lib/metaUpload";
import { parseLabelledName } from "../../../../../../lib/creativeNames";

// POST /api/admin/clients/:tenantId/ads/uploads/video   (multipart, by phase)
//   phase=start    size                        -> { sessionId, videoId, start, end }
//   phase=transfer sessionId, start, chunk     -> { start, end }
//   phase=finish   sessionId, name             -> { ok: true }
//
// A video never sits in Worker memory whole. The browser slices it to the
// offsets Meta names and sends one slice per request; this route relays each
// slice to Meta's chunked upload and hands back the next offsets. Done when
// start equals end.
//
// Admin-only via _middleware.ts.

// Meta's ceiling for an ad video is 4 GB; a request here only ever carries one
// Meta-sized slice, so this caps the slice, not the file.
const MAX_CHUNK = 60 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const target = await resolveUploadTarget(ctx.env, ctx.params.tenantId as string);
  if (target instanceof Response) return target;

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return Response.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const phase = String(form.get("phase") ?? "");
  const sessionId = String(form.get("sessionId") ?? "");

  try {
    if (phase === "start") {
      const size = Number(form.get("size"));
      if (!(size > 0)) return Response.json({ error: "size is required" }, { status: 400 });
      return Response.json(await startAdVideo(target.token, target.account, size));
    }

    if (!sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });

    if (phase === "transfer") {
      const entry = form.get("chunk") as unknown;
      if (!entry || typeof entry === "string") {
        return Response.json({ error: "missing chunk" }, { status: 400 });
      }
      const chunk = entry as File;
      if (chunk.size > MAX_CHUNK) {
        return Response.json({ error: "chunk too large" }, { status: 413 });
      }
      const start = Number(form.get("start"));
      return Response.json(
        await transferAdVideo(target.token, target.account, sessionId, start, chunk),
      );
    }

    if (phase === "finish") {
      const name = String(form.get("name") ?? "").trim();
      if (!parseLabelledName(name)) {
        return Response.json({ error: "name must end in 1:1 or 4:5" }, { status: 400 });
      }
      await finishAdVideo(target.token, target.account, sessionId, name);
      return Response.json({ ok: true });
    }
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }

  return Response.json({ error: "unknown phase" }, { status: 400 });
};
