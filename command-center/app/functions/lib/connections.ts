import { ghlJson, ghlFetch, type GhlContext } from "./ghl";

// Shared helpers for the client Connections hub. Clients link their own social
// accounts (Facebook, Instagram, Google Business Profile) from inside the app;
// every connection lands back in the client's GHL sub-account via GHL's own
// OAuth-start, which 302-redirects to the provider's real consent screen. The
// browser only ever receives that provider URL, never a token.

export const OAUTH_PLATFORMS = ["facebook", "instagram", "google"] as const;
export type OAuthPlatform = (typeof OAUTH_PLATFORMS)[number];

// "connected" = an account of this platform is linked; "action_needed" = it is
// not yet linked (the card shows a Connect button); "unknown" = the status read
// failed and the UI shows a neutral state instead of a wrong one.
export type ConnState = "connected" | "action_needed" | "unknown";

export interface ConnectionStatus {
  id: OAuthPlatform;
  state: ConnState;
}

interface UsersResponse {
  users?: Array<{ id?: string }>;
}

// The social OAuth start requires a userId in the sub-account; the connection is
// attached to the location's first user. Throws a white-label error (never the
// vendor name) so a mis-provisioned location surfaces clearly.
export async function resolveLocationUserId(ctx: GhlContext): Promise<string> {
  const data = await ghlJson<UsersResponse>(
    ctx,
    `/users/?locationId=${encodeURIComponent(ctx.locationId)}`,
  );
  const first = data.users?.[0]?.id;
  if (!first) throw new Error("No user available to attach the connection");
  return first;
}

// GHL returns connected accounts under results.accounts (a flatter top-level
// accounts array is tolerated too). Each account carries a platform string
// (facebook, instagram, google / gmb). Map those onto our three platforms;
// anything else is ignored.
interface SocialAccountsResponse {
  results?: { accounts?: Array<{ platform?: string }> };
  accounts?: Array<{ platform?: string }>;
}

function normalizePlatform(raw: string): OAuthPlatform | null {
  const p = raw.toLowerCase();
  if (p.includes("facebook")) return "facebook";
  if (p.includes("instagram")) return "instagram";
  if (p.includes("google") || p.includes("gmb") || p.includes("business")) {
    return "google";
  }
  return null;
}

export async function readSocialAccounts(
  ctx: GhlContext,
): Promise<Record<OAuthPlatform, ConnState>> {
  const data = await ghlJson<SocialAccountsResponse>(
    ctx,
    `/social-media-posting/${encodeURIComponent(ctx.locationId)}/accounts`,
  );
  const list = data.results?.accounts ?? data.accounts ?? [];
  const connected = new Set<OAuthPlatform>();
  for (const a of list) {
    const p = normalizePlatform(a.platform ?? "");
    if (p) connected.add(p);
  }
  return {
    facebook: connected.has("facebook") ? "connected" : "action_needed",
    instagram: connected.has("instagram") ? "connected" : "action_needed",
    google: connected.has("google") ? "connected" : "action_needed",
  };
}

// Begin the OAuth handshake and return the provider's own consent URL (the 302
// Location). The browser opens this; the client consents on Facebook/Google's
// page and GHL captures the callback. Returns null if no redirect is issued.
export async function oauthStartUrl(
  ctx: GhlContext,
  platform: OAuthPlatform,
  userId: string,
): Promise<string | null> {
  const res = await ghlFetch(
    ctx,
    `/social-media-posting/oauth/${platform}/start?locationId=${encodeURIComponent(
      ctx.locationId,
    )}&userId=${encodeURIComponent(userId)}`,
    { redirect: "manual" },
  );
  return res.headers.get("location");
}
