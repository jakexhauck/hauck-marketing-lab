import { graphGetAll, resolveAdAccount } from "./metaGraph";

// Read-only Meta media library shaping, shared by the client Paid Ads "Media"
// tab (functions/api/ads/media.ts) and, in a later phase, the admin
// Fulfillment cockpit's per-tenant view. Ports the exact fetch/shape logic
// that used to live inline in ads/media.ts so both callers share one
// implementation instead of drifting copies.
//
// Best-effort by design: if the media edges are not reachable with the current
// token/permissions, the caller simply shows an honest "nothing to show yet"
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

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function fetchImages(token: string, account: string): Promise<MediaItem[]> {
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

export async function fetchVideos(token: string, account: string): Promise<MediaItem[]> {
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

// The full Paid Ads "Media" payload for one tenant. Callers (the client
// endpoint, and the admin endpoint) pass their own resolved token + tenant
// account; envAccount is the single-tenant fallback (mirrors resolveAdAccount
// everywhere else in Paid Ads). Not-connected and Meta-call-failure both
// degrade to an honest payload, never a fabricated item.
export async function buildAdsMedia(
  token: string | undefined,
  tenantAccount: string | null | undefined,
  envAccount: string | undefined,
): Promise<AdsMediaResponse> {
  let account = resolveAdAccount(tenantAccount ?? undefined, envAccount);
  if (!token || !account) {
    return { configured: false, items: [] };
  }
  if (!account.startsWith("act_")) account = `act_${account}`;

  try {
    const [images, videos] = await Promise.all([
      fetchImages(token, account),
      fetchVideos(token, account),
    ]);
    return {
      configured: true,
      items: [...images, ...videos],
    };
  } catch (e) {
    return {
      configured: true,
      items: [],
      error: (e as Error).message,
    };
  }
}
