import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

// The GoHighLevel Marketplace app: OAuth, token storage, and webhook signature
// verification.
//
// This is the second GHL credential model in the app and it does not replace
// the first. Every existing route still reads tenants.ghl_token, the Private
// Integration Token pasted in during onboarding. This file is used only by
// /api/crm/* and the Connection page, so nothing that works today can break if
// the app install goes wrong.
//
// The install shape, which drives the whole design:
//   The app's target user is Sub-Account, so it carries sub-account scopes.
//   The AGENCY installs it in bulk across every sub-account in one action.
//   That install returns ONE token with userType "Company" and a companyId.
//   A per-sub-account token is then minted from it on demand, via
//   POST /oauth/locationToken, and cached.
//
// So there is never a moment where somebody has to click something per client.

const OAUTH_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

// Refresh this far before the token actually dies. GHL access tokens last 24h;
// a minute of slack is enough to cover a slow round trip without refreshing on
// every request.
const REFRESH_SLACK_MS = 60_000;

export class GhlAppNotConfigured extends Error {
  code = "app_not_configured" as const;
  constructor() {
    super("The GoHighLevel Marketplace app is not configured.");
  }
}

export interface GhlAppCreds {
  clientId: string;
  clientSecret: string;
}

export function appCreds(env: Env): GhlAppCreds {
  const clientId = (env.GHL_APP_CLIENT_ID ?? "").trim();
  const clientSecret = (env.GHL_APP_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) throw new GhlAppNotConfigured();
  return { clientId, clientSecret };
}

// The scopes the app was registered with. Kept here so the install URL the
// Connection page builds can never drift from what was ticked in the developer
// portal: GHL locks scopes once a version is published, so a mismatch fails the
// install rather than silently granting less.
export const APP_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "opportunities.readonly",
  "opportunities.write",
  "conversations.readonly",
  "conversations/message.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
  "invoices.readonly",
  "locations.readonly",
  "locations/customValues.readonly",
  "locations/customValues.write",
  "locations/customFields.write",
  "locations/tags.write",
  "users.readonly",
  "workflows.readonly",
  // The two that make the agency-installs-once model work at all.
  "oauth.readonly",
  "oauth.write",
] as const;

export function installUrl(env: Env, origin: string): string | null {
  const clientId = (env.GHL_APP_CLIENT_ID ?? "").trim();
  if (!clientId) return null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${origin}/api/crm/oauth/callback`,
    scope: APP_SCOPES.join(" "),
  });
  return `https://marketplace.gohighlevel.com/oauth/chooselocation?${params}`;
}

// ---------------------------------------------------------------------------
// Install state (CSRF)
// ---------------------------------------------------------------------------

// The callback is necessarily public, and loadAgencyInstall picks the newest
// agency row. Without this, anyone who could drive a valid code into the
// callback could plant their own agency row and become the account this app
// mints tokens from. The state is minted by the admin-only endpoint and
// expires, so an install can only start from inside the Command Center.

const STATE_TTL_MS = 15 * 60_000;

function stateSecret(env: Env): string {
  return (env.SESSION_SECRET ?? env.WEBHOOK_SECRET ?? "").trim();
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createInstallState(env: Env): Promise<string> {
  const secret = stateSecret(env);
  if (!secret) throw new GhlAppNotConfigured();
  const ts = String(Date.now());
  return `${ts}.${await hmacHex(secret, ts)}`;
}

export async function verifyInstallState(
  env: Env,
  state: string,
): Promise<boolean> {
  const secret = stateSecret(env);
  if (!secret || !state) return false;
  const [ts, sig] = state.split(".");
  if (!ts || !sig) return false;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return false;
  const expected = await hmacHex(secret, ts);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------

// GHL's public key for X-GHL-Signature, base64 SPKI, Ed25519.
//
// Hardcoded rather than an env var on purpose: it is public, identical for
// every developer on the platform, and putting it in Doppler would invite
// somebody to "fix" a verification failure by changing it.
//
// The older X-WH-Signature header (RSA-SHA256) is deprecated on 1 September
// 2026 and is not implemented here. Building against a header with three weeks
// left would have been an integration with a three-week shelf life.
const GHL_WEBHOOK_PUBLIC_KEY_SPKI =
  "MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: CryptoKey | null = null;

async function webhookKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "spki",
    b64ToBytes(GHL_WEBHOOK_PUBLIC_KEY_SPKI),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return cachedKey;
}

// Verify an inbound Marketplace webhook against the RAW body bytes.
//
// It must be the raw bytes, not a re-serialised object: JSON.stringify of a
// parsed payload reorders nothing in practice but changes whitespace, and the
// signature is over exactly what GHL sent.
export async function verifyWebhookSignature(
  rawBody: ArrayBuffer,
  signature: string,
): Promise<boolean> {
  if (!signature) return false;
  try {
    const key = await webhookKey();
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      b64ToBytes(signature),
      rawBody,
    );
  } catch {
    // A malformed signature (wrong length, not base64) makes WebCrypto throw
    // rather than return false. That is an unauthenticated caller, not a fault
    // in this app, so it logs as a rejection: an ERROR line for every piece of
    // junk that hits a public endpoint is how real errors become invisible.
    console.warn("[crm] rejected: malformed signature");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  userType?: string;
  companyId?: string;
  locationId?: string;
}

async function postForm(
  path: string,
  body: Record<string, string>,
  bearer?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    Version: API_VERSION,
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetch(`${OAUTH_BASE}${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
  });
}

// Swap the ?code= from the install redirect for the agency (company) token.
export async function exchangeCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const { clientId, clientSecret } = appCreds(env);
  const res = await postForm("/oauth/token", {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    // The install is performed by the agency, so the token comes back as
    // userType "Company". Asking for "Location" here yields a token that
    // cannot mint per-sub-account tokens, which is the whole point.
    user_type: "Company",
    redirect_uri: redirectUri,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshToken(
  env: Env,
  refresh: string,
  userType: string,
): Promise<TokenResponse> {
  const { clientId, clientSecret } = appCreds(env);
  const res = await postForm("/oauth/token", {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refresh,
    user_type: userType === "Company" ? "Company" : "Location",
  });
  if (!res.ok) {
    throw new Error(`token refresh failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

// Mint a sub-account token from the agency token. Needs oauth.readonly and
// oauth.write on the app, which is why those scopes are non-negotiable.
export async function mintLocationToken(
  agencyToken: string,
  companyId: string,
  locationId: string,
): Promise<TokenResponse> {
  const res = await postForm(
    "/oauth/locationToken",
    { companyId, locationId },
    agencyToken,
  );
  if (!res.ok) {
    throw new Error(
      `location token mint failed (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as TokenResponse;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface InstallRow {
  id: string;
  company_id: string;
  // '' for the agency row, a real id for a sub-account row.
  location_id: string;
  tenant_id: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scopes: string | null;
  user_type: string;
  installed_at: string;
  revoked_at: string | null;
}

function expiryFrom(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export async function saveInstall(
  client: SupabaseClient,
  companyId: string,
  locationId: string,
  token: TokenResponse,
  tenantId: string | null,
): Promise<void> {
  const { error } = await client.from("ghl_installs").upsert(
    {
      company_id: companyId,
      location_id: locationId,
      tenant_id: tenantId,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: expiryFrom(token.expires_in),
      scopes: token.scope ?? null,
      user_type: token.userType ?? (locationId ? "Location" : "Company"),
      // A reinstall after an uninstall must clear the tombstone, or the
      // Connection page keeps reporting a client as uninstalled forever.
      revoked_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,location_id" },
  );
  if (error) throw new Error(`saving install failed: ${error.message}`);
}

export async function loadInstall(
  client: SupabaseClient,
  companyId: string,
  locationId: string,
): Promise<InstallRow | null> {
  const { data } = await client
    .from("ghl_installs")
    .select("*")
    .eq("company_id", companyId)
    .eq("location_id", locationId)
    .maybeSingle();
  return (data as InstallRow) ?? null;
}

// The single agency row. There is exactly one install, so this does not take a
// company id: whichever agency installed the app is the agency we serve.
export async function loadAgencyInstall(
  client: SupabaseClient,
): Promise<InstallRow | null> {
  const { data } = await client
    .from("ghl_installs")
    .select("*")
    .eq("location_id", "")
    .is("revoked_at", null)
    .order("installed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as InstallRow) ?? null;
}

// ---------------------------------------------------------------------------
// The one function the rest of the app calls
// ---------------------------------------------------------------------------

function isFresh(row: InstallRow): boolean {
  return Date.parse(row.expires_at) - Date.now() > REFRESH_SLACK_MS;
}

// A usable access token for a sub-account, minted or refreshed as needed.
//
// Lazy rather than a cron: a scheduled refresher that quietly stops running
// takes every GHL read down with it, and the failure is invisible until a
// client opens a page. Refreshing on the request that needs it fails loudly,
// in one place, at the moment it matters.
//
// Returns null when the app is not installed, which callers should treat as
// "not connected" rather than an error.
export async function locationToken(
  client: SupabaseClient,
  env: Env,
  locationId: string,
): Promise<string | null> {
  const cached = await loadInstall(client, await companyIdFor(client), locationId);
  if (cached && !cached.revoked_at && isFresh(cached)) return cached.access_token;

  // Refresh a stale sub-account token in place when we hold a refresh token.
  if (cached?.refresh_token && !cached.revoked_at) {
    try {
      const next = await refreshToken(env, cached.refresh_token, cached.user_type);
      await saveInstall(client, cached.company_id, locationId, next, cached.tenant_id);
      return next.access_token;
    } catch (err) {
      // Fall through and re-mint from the agency token. A refresh token can be
      // invalidated by a reinstall, and re-minting is cheap.
      console.warn("[crm] sub-account refresh failed, re-minting", err);
    }
  }

  const agency = await agencyToken(client, env);
  if (!agency) return null;
  try {
    const minted = await mintLocationToken(
      agency.token,
      agency.companyId,
      locationId,
    );
    await saveInstall(
      client,
      agency.companyId,
      locationId,
      minted,
      cached?.tenant_id ?? null,
    );
    return minted.access_token;
  } catch (err) {
    console.error("[crm] minting a location token failed", err);
    return null;
  }
}

async function companyIdFor(client: SupabaseClient): Promise<string> {
  const agency = await loadAgencyInstall(client);
  return agency?.company_id ?? "";
}

// The agency token, refreshed if stale. null when the app has never been
// installed.
export async function agencyToken(
  client: SupabaseClient,
  env: Env,
): Promise<{ token: string; companyId: string } | null> {
  const row = await loadAgencyInstall(client);
  if (!row) return null;
  if (isFresh(row)) return { token: row.access_token, companyId: row.company_id };
  if (!row.refresh_token) {
    console.error("[crm] agency token expired with no refresh token; reinstall needed");
    return null;
  }
  try {
    const next = await refreshToken(env, row.refresh_token, "Company");
    await saveInstall(client, row.company_id, "", next, null);
    return { token: next.access_token, companyId: row.company_id };
  } catch (err) {
    console.error("[crm] agency token refresh failed", err);
    return null;
  }
}
