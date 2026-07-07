import { type Env, type ApiData } from "../../lib/env";
import { graphGetAll, resolveAdAccount } from "../../lib/metaGraph";

// Read-only Meta media library for the Paid Ads "Media" tab: every ad image and
// video in the client's ad account, straight from the Graph API. Same shared
// System-User token and per-client account as insights.ts, so one client can
// never see another's media.
//
// Best-effort by design: if the media edges are not reachable with the current
// token/permissions, the client simply shows an honest "nothing to show yet"
// (never fabricated media). Images and videos are each fetched independently so
// one failing edge does not blank the other.

export interface MediaItem {
  id: string;
  type: "image" | "video";
  // Full asset (image url / video source); thumbnail is a smaller preview when
  // Meta gives one. Either may be "" and the client falls back to a placeholder.
  url: string;
  thumbnail: string;
  name: string;
}

export interface AdsMediaResponse {
  configured: boolean;
  items: MediaItem[];
  error?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fetchImages(token: string, account: string): Promise<MediaItem[]> {
  try {
    const rows = await graphGetAll(token, `/${account}/adimages`, {
      fields: "hash,name,url,permalink_url",
      limit: "200",
    });
    return rows
      .map((row) => {
        const url = str(row.url) || str(row.permalink_url);
        return {
          id: str(row.hash) || str(row.name),
          type: "image" as const,
          url,
          thumbnail: url,
          name: str(row.name),
        };
      })
      .filter((m) => m.url);
  } catch {
    return [];
  }
}

async function fetchVideos(token: string, account: string): Promise<MediaItem[]> {
  try {
    const rows = await graphGetAll(token, `/${account}/advideos`, {
      fields: "id,title,picture,permalink_url",
      limit: "200",
    });
    return rows.map((row) => {
      const thumb = str(row.picture);
      return {
        id: str(row.id),
        type: "video" as const,
        url: str(row.permalink_url) || thumb,
        thumbnail: thumb,
        name: str(row.title),
      };
    });
  } catch {
    return [];
  }
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = ctx.env.META_SYSTEM_USER_TOKEN;
  let account = resolveAdAccount(ctx.data.tenant?.meta_ad_account_id, ctx.env.META_AD_ACCOUNT_ID);
  if (!token || !account) {
    return Response.json({ configured: false, items: [] } satisfies AdsMediaResponse);
  }
  if (!account.startsWith("act_")) account = `act_${account}`;

  try {
    const [images, videos] = await Promise.all([
      fetchImages(token, account),
      fetchVideos(token, account),
    ]);
    return Response.json({
      configured: true,
      items: [...images, ...videos],
    } satisfies AdsMediaResponse);
  } catch (e) {
    return Response.json({
      configured: true,
      items: [],
      error: (e as Error).message,
    } satisfies AdsMediaResponse);
  }
};
