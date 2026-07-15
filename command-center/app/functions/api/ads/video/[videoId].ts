import { type Env, type ApiData } from "../../../lib/env";
import { graphGet } from "../../../lib/metaGraph";

// Read-only: resolve a single ad video's playable mp4 source + public permalink
// so the client's Your Ads lightbox can play the real video. The System-User
// token is used server-side ONLY; the client receives just the resolved URLs,
// never the token (the same reason AdPreviewModal never embedded Meta's iframe).
// Honest by design: if Meta will not return a source, `source` is "" and the
// client falls back to the poster plus the Facebook watch link.

export interface AdVideoResponse {
  source: string;
  permalink: string;
}

const EMPTY: AdVideoResponse = { source: "", permalink: "" };

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = ctx.env.META_SYSTEM_USER_TOKEN;
  const videoId = String(ctx.params.videoId ?? "");
  if (!token || !videoId) return Response.json(EMPTY satisfies AdVideoResponse);

  try {
    const data = await graphGet(token, `/${videoId}`, { fields: "source,permalink_url" });
    return Response.json({
      source: typeof data.source === "string" ? data.source : "",
      permalink: typeof data.permalink_url === "string" ? data.permalink_url : "",
    } satisfies AdVideoResponse);
  } catch {
    // Meta will not resolve the source (permission/transient/none): honest empty.
    return Response.json(EMPTY satisfies AdVideoResponse);
  }
};
