import { graphGetAll, resolveAdAccount } from "./metaGraph";

// Read-only Meta media shaping, shared by the client Paid Ads "Media" tab
// (functions/api/ads/media.ts) and the admin Fulfillment cockpit's per-tenant
// view, so both callers share one implementation instead of drifting copies.
//
// Videos come from /advideos (real, named). Images do NOT come from a raw
// /adimages dump: Meta auto-generates a still-frame image in /adimages for every
// video ad (all named "untitled"), so dumping the image library shows each video
// twice, once as an untitled screenshot of itself. Instead images are sourced
// from the ad CREATIVES, keeping only images that back a genuine photo ad; a
// video creative contributes its video, never its auto-thumbnail.
//
// Best-effort by design: if the edges are not reachable with the current
// token/permissions, the caller simply shows an honest "nothing to show yet"
// (never fabricated media). Videos and images are fetched independently so one
// failing edge does not blank the other.

export interface MediaItem {
  id: string;
  type: "image" | "video";
  // Full asset (image url / video source); thumbnail is a smaller preview when
  // Meta gives one. Either may be "" and the client falls back to a placeholder.
  url: string;
  thumbnail: string;
  name: string;
  // True when this exact asset backs an ad that is running right now. Resolved
  // in buildAdsMedia against the ACTIVE ads' creative keys; fetchImageCreatives
  // and fetchVideos default it to false for their standalone callers.
  live: boolean;
}

export interface AdsMediaResponse {
  configured: boolean;
  items: MediaItem[];
  error?: string;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Loosely-typed views of the few nested creative shapes we read. Meta returns a
// lot more; we only touch the paths that hold an image or reveal a video.
interface StorySpec {
  video_data?: { video_id?: string; image_hash?: string; image_url?: string };
  link_data?: { image_hash?: string; picture?: string; video_id?: string };
  photo_data?: { image_hash?: string; url?: string };
}
interface AssetFeedSpec {
  videos?: Array<{ video_id?: string }>;
  images?: Array<{ hash?: string; url?: string }>;
}

// Every image hash a creative references, across the shapes Meta uses. Mirrors
// the image-candidate paths in fetchImageCreatives so live-marking and the
// media list agree on where a hash can hide.
function creativeImageHashes(c: Record<string, unknown>): string[] {
  const oss = (c.object_story_spec ?? {}) as StorySpec;
  const afs = (c.asset_feed_spec ?? {}) as AssetFeedSpec;
  return [
    str(c.image_hash),
    str(oss.link_data?.image_hash),
    str(oss.photo_data?.image_hash),
    str(oss.video_data?.image_hash),
    ...(Array.isArray(afs.images) ? afs.images.map((im) => str(im?.hash)) : []),
  ].filter(Boolean);
}

// The video id a creative plays, if it is a video creative (else "").
function creativeVideoId(c: Record<string, unknown>): string {
  const oss = (c.object_story_spec ?? {}) as StorySpec;
  const afs = (c.asset_feed_spec ?? {}) as AssetFeedSpec;
  return (
    str(c.video_id) ||
    str(oss.video_data?.video_id) ||
    str(oss.link_data?.video_id) ||
    (Array.isArray(afs.videos) ? str(afs.videos[0]?.video_id) : "")
  );
}

// The video ids and image hashes backing ads that are running right now
// (effective_status ACTIVE), so buildAdsMedia can mark each media item Live by
// exact key. Best-effort: any failure yields empty sets and nothing is marked
// live (we never fabricate "live").
export interface LiveCreativeKeys {
  videos: Set<string>;
  hashes: Set<string>;
}
export async function fetchLiveCreativeKeys(
  token: string,
  account: string,
): Promise<LiveCreativeKeys> {
  const videos = new Set<string>();
  const hashes = new Set<string>();
  try {
    const ads = await graphGetAll(token, `/${account}/ads`, {
      fields:
        "effective_status,creative{video_id,image_hash,object_story_spec,asset_feed_spec}",
      limit: "200",
    });
    for (const ad of ads) {
      if (str(ad.effective_status) !== "ACTIVE") continue;
      const creative = (ad.creative ?? {}) as Record<string, unknown>;
      const vid = creativeVideoId(creative);
      if (vid) videos.add(vid);
      for (const h of creativeImageHashes(creative)) hashes.add(h);
    }
  } catch {
    /* best-effort; nothing is marked live if the ads edge is unreachable */
  }
  return { videos, hashes };
}

// The photos genuinely used in the client's ads. We read the account's ad
// creatives, skip any creative that carries a video (its image is just the
// auto-generated video thumbnail), and keep the images from the rest. Hashes
// with no inline URL are resolved against /adimages.
export async function fetchImageCreatives(
  token: string,
  account: string,
): Promise<MediaItem[]> {
  let creatives: Record<string, unknown>[];
  try {
    creatives = await graphGetAll(token, `/${account}/adcreatives`, {
      fields: "id,name,image_hash,image_url,video_id,object_story_spec,asset_feed_spec",
      limit: "100",
    });
  } catch {
    return [];
  }

  // hash -> url resolver for creatives that reference an image only by hash.
  const hashUrl = new Map<string, string>();
  try {
    const imgs = await graphGetAll(token, `/${account}/adimages`, {
      fields: "hash,url,permalink_url",
      limit: "200",
    });
    for (const im of imgs) {
      const h = str(im.hash);
      if (h) hashUrl.set(h, str(im.url) || str(im.permalink_url));
    }
  } catch {
    /* resolver is best-effort; creatives usually carry an inline image_url */
  }

  const out: MediaItem[] = [];
  const seen = new Set<string>();

  for (const c of creatives) {
    const oss = (c.object_story_spec ?? {}) as StorySpec;
    const afs = (c.asset_feed_spec ?? {}) as AssetFeedSpec;

    const isVideo = Boolean(
      str(c.video_id) ||
        oss.video_data?.video_id ||
        oss.link_data?.video_id ||
        (Array.isArray(afs.videos) && afs.videos.length > 0),
    );
    if (isVideo) continue; // its image is only the video's auto-thumbnail

    // Every place a photo creative can hide an image (hash and/or inline url).
    const candidates: Array<{ hash: string; url: string }> = [
      { hash: str(c.image_hash), url: str(c.image_url) },
      { hash: str(oss.link_data?.image_hash), url: str(oss.link_data?.picture) },
      { hash: str(oss.photo_data?.image_hash), url: str(oss.photo_data?.url) },
      ...(Array.isArray(afs.images)
        ? afs.images.map((im) => ({ hash: str(im?.hash), url: str(im?.url) }))
        : []),
    ];

    for (const cand of candidates) {
      const key = cand.hash || cand.url;
      if (!key || seen.has(key)) continue;
      const url = cand.url || (cand.hash ? hashUrl.get(cand.hash) ?? "" : "");
      if (!url) continue;
      seen.add(key);
      out.push({
        id: cand.hash || key,
        type: "image",
        url,
        thumbnail: url,
        name: str(c.name),
        live: false, // buildAdsMedia resolves this against the ACTIVE ads
      });
    }
  }
  return out;
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
        live: false, // buildAdsMedia resolves this against the ACTIVE ads
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
    const [videos, images, live] = await Promise.all([
      fetchVideos(token, account),
      fetchImageCreatives(token, account),
      fetchLiveCreativeKeys(token, account),
    ]);
    const items = [...videos, ...images].map((it) => ({
      ...it,
      live: it.type === "video" ? live.videos.has(it.id) : live.hashes.has(it.id),
    }));
    // Lead with what is running today: live items first, original order kept
    // within each group (videos before images).
    items.sort((a, b) => Number(b.live) - Number(a.live));
    return {
      configured: true,
      items,
    };
  } catch (e) {
    return {
      configured: true,
      items: [],
      error: (e as Error).message,
    };
  }
}
