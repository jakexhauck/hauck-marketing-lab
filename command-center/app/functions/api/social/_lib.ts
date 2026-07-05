// GHL Social Planner helpers, colocated with the social routes (kept out of the
// shared functions/lib/ghl.ts on purpose so this feature never collides with
// other builds). Everything wraps ghlJson from the shared client. The `_`
// prefix keeps Cloudflare Pages from treating this module as a route.
//
// Task 0 (2026-07-05) proved the endpoints + scope against the live Willis
// tenant token but returned zero accounts and zero posts, so exact per-account
// and per-post FIELD NAMES are unverified. Every shaper therefore accepts
// several candidate field names and normalizes GHL's platform + status strings
// onto our small unions. Anything we cannot render (a platform we do not show,
// a post with no id) is dropped rather than faked.

import { ghlJson, type GhlContext } from "../../lib/ghl";

export type SocialPlatform = "ig" | "fb" | "gb";
// The four buckets our UI renders. GHL's raw status enum is wider (in_review,
// recurring, pending, deleted, ...); normalizeStatus folds them onto these.
export type SocialStatus = "scheduled" | "draft" | "posted" | "failed";

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  name: string;
  avatar: string | null;
}

export interface SocialPost {
  id: string;
  summary: string;
  status: SocialStatus;
  scheduleAt: string | null; // ISO, set for scheduled posts
  publishedAt: string | null; // ISO, set for posted
  platforms: SocialPlatform[];
  mediaUrls: string[];
}

// Map GHL's platform strings (facebook, instagram, google/gmb/googleMyBusiness,
// plus ones we do not render: tiktok, linkedin, twitter/x) onto our union.
// Returns null for anything we do not show, so callers drop it.
export function normalizePlatform(raw: unknown): SocialPlatform | null {
  const s = String(raw ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("insta")) return "ig";
  if (s.includes("face") || s === "fb") return "fb";
  if (s.includes("google") || s.includes("gmb") || s.includes("gbp")) return "gb";
  return null;
}

// Fold GHL's wider post-status enum onto our four buckets. Unknown/queued/
// in-review states read as "scheduled" (they are not yet live and not drafts).
export function normalizeStatus(raw: unknown): SocialStatus {
  const s = String(raw ?? "").toLowerCase();
  if (
    s.includes("publish") ||
    s === "completed" ||
    s === "posted" ||
    s === "success" ||
    s === "live"
  ) {
    return "posted";
  }
  if (s.includes("draft")) return "draft";
  if (s.includes("fail") || s.includes("error") || s.includes("declin")) return "failed";
  return "scheduled";
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

interface RawAccount {
  id?: string;
  _id?: string;
  oauthId?: string;
  name?: string;
  accountName?: string;
  platform?: string;
  avatar?: string;
  profilePicture?: string;
  picture?: string;
}

interface AccountsResponse {
  results?: { accounts?: RawAccount[]; groups?: unknown[] };
  accounts?: RawAccount[];
}

// List the location's Social-Planner-linked accounts, normalized to fb/ig/gb.
// Accounts linked only under Settings -> Integrations do NOT surface here; this
// endpoint returns just Social-Planner connections.
export async function fetchSocialAccounts(gctx: GhlContext): Promise<SocialAccount[]> {
  const data = await ghlJson<AccountsResponse>(
    gctx,
    `/social-media-posting/${gctx.locationId}/accounts`,
  );
  const raw = data.results?.accounts ?? data.accounts ?? [];
  const out: SocialAccount[] = [];
  for (const a of raw) {
    const platform = normalizePlatform(a.platform);
    if (!platform) continue;
    const id = firstString(a.id, a._id, a.oauthId);
    if (!id) continue;
    out.push({
      id,
      platform,
      name: firstString(a.name, a.accountName) ?? "",
      avatar: firstString(a.avatar, a.profilePicture, a.picture),
    });
  }
  return out;
}

interface RawPost {
  id?: string;
  _id?: string;
  summary?: string;
  caption?: string;
  status?: string;
  scheduleDate?: string;
  scheduledAt?: string;
  publishAt?: string;
  publishedAt?: string;
  publishedDate?: string;
  createdAt?: string;
  accountIds?: string[];
  accounts?: (string | { id?: string; _id?: string; platform?: string })[];
  platform?: string;
  platforms?: string[];
  media?: (string | { url?: string })[];
  mediaUrls?: string[];
}

interface PostsListResponse {
  results?: { posts?: RawPost[]; count?: number };
  posts?: RawPost[];
}

// Shape one raw GHL post into our SocialPost. Platforms are resolved by joining
// the post's account ids against the accounts list (id -> platform); if the
// post instead carries platform strings directly, those are used as a fallback.
export function shapeSocialPost(
  raw: RawPost,
  platformByAccountId: Map<string, SocialPlatform>,
): SocialPost | null {
  const id = firstString(raw.id, raw._id);
  if (!id) return null;

  const status = normalizeStatus(raw.status);

  const platforms = new Set<SocialPlatform>();
  for (const acc of raw.accounts ?? []) {
    if (typeof acc === "string") {
      const p = platformByAccountId.get(acc);
      if (p) platforms.add(p);
    } else if (acc) {
      const embedded = normalizePlatform(acc.platform);
      if (embedded) platforms.add(embedded);
      const accId = firstString(acc.id, acc._id);
      const mapped = accId ? platformByAccountId.get(accId) : undefined;
      if (mapped) platforms.add(mapped);
    }
  }
  for (const accId of raw.accountIds ?? []) {
    const p = platformByAccountId.get(accId);
    if (p) platforms.add(p);
  }
  for (const raw2 of raw.platforms ?? []) {
    const p = normalizePlatform(raw2);
    if (p) platforms.add(p);
  }
  const direct = normalizePlatform(raw.platform);
  if (direct) platforms.add(direct);

  const mediaUrls: string[] = [];
  for (const m of raw.media ?? []) {
    const url = typeof m === "string" ? m : m?.url;
    if (typeof url === "string" && url.trim()) mediaUrls.push(url);
  }
  for (const url of raw.mediaUrls ?? []) {
    if (typeof url === "string" && url.trim()) mediaUrls.push(url);
  }

  return {
    id,
    summary: firstString(raw.summary, raw.caption) ?? "",
    status,
    scheduleAt: firstString(raw.scheduleDate, raw.scheduledAt, raw.publishAt),
    publishedAt:
      status === "posted"
        ? firstString(raw.publishedAt, raw.publishedDate, raw.createdAt)
        : firstString(raw.publishedAt, raw.publishedDate),
    platforms: [...platforms],
    mediaUrls,
  };
}

// Fetch the location's posts, paged (skip/limit are STRINGS per Task 0) up to a
// safe cap. Date-range params are intentionally NOT sent (unconfirmed in Task 0,
// risked a 422); callers filter by date client-side for the calendar month. The
// account map resolves each post's platforms.
export async function fetchSocialPosts(
  gctx: GhlContext,
  platformByAccountId: Map<string, SocialPlatform>,
): Promise<SocialPost[]> {
  const PAGE = 100;
  const MAX = 500; // small-business volume; log if we ever hit it
  const out: SocialPost[] = [];
  const seen = new Set<string>();

  for (let skip = 0; skip < MAX; skip += PAGE) {
    const data = await ghlJson<PostsListResponse>(
      gctx,
      `/social-media-posting/${gctx.locationId}/posts/list`,
      {
        method: "POST",
        body: JSON.stringify({ type: "all", skip: String(skip), limit: String(PAGE) }),
      },
    );
    const raw = data.results?.posts ?? data.posts ?? [];
    for (const p of raw) {
      const shaped = shapeSocialPost(p, platformByAccountId);
      if (shaped && !seen.has(shaped.id)) {
        seen.add(shaped.id);
        out.push(shaped);
      }
    }
    if (raw.length < PAGE) break;
    if (skip + PAGE >= MAX) {
      console.warn(`social posts pagination hit cap for ${gctx.locationId}`);
    }
  }
  return out;
}

interface UsersResponse {
  users?: { id?: string }[];
}

// GHL's create-post endpoint requires a non-empty userId (the authoring user),
// which the tenant context does not carry. Resolve one from the location's
// users. Any valid location user works for authorship; we take the first.
export async function fetchLocationUserId(gctx: GhlContext): Promise<string | null> {
  const data = await ghlJson<UsersResponse>(
    gctx,
    `/users/?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  return data.users?.find((u) => u.id)?.id ?? null;
}

export interface CreatePostInput {
  accountIds: string[];
  userId: string;
  summary: string;
  status: "draft" | "scheduled";
  scheduleAt?: string | null; // ISO, required when status === "scheduled"
}

interface CreatePostResponse {
  results?: { post?: RawPost };
  post?: RawPost;
}

// Create a draft or scheduled post in GHL. Terminal write: ghlFetch never
// retries a POST, so a duplicate can't slip out on a 5xx/429.
export async function createSocialPost(
  gctx: GhlContext,
  input: CreatePostInput,
  platformByAccountId: Map<string, SocialPlatform>,
): Promise<SocialPost | null> {
  const body: Record<string, unknown> = {
    accountIds: input.accountIds,
    userId: input.userId,
    summary: input.summary,
    type: "post",
    status: input.status,
  };
  if (input.status === "scheduled" && input.scheduleAt) {
    body.scheduleDate = input.scheduleAt;
  }
  const data = await ghlJson<CreatePostResponse>(
    gctx,
    `/social-media-posting/${gctx.locationId}/posts`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const raw = data.results?.post ?? data.post;
  return raw ? shapeSocialPost(raw, platformByAccountId) : null;
}

export async function deleteSocialPost(gctx: GhlContext, id: string): Promise<void> {
  await ghlJson(
    gctx,
    `/social-media-posting/${gctx.locationId}/posts/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

// id -> platform map, the join key between accounts and posts.
export function platformMap(accounts: SocialAccount[]): Map<string, SocialPlatform> {
  const m = new Map<string, SocialPlatform>();
  for (const a of accounts) m.set(a.id, a.platform);
  return m;
}
