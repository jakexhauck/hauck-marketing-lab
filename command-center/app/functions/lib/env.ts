export interface Env {
  APP_PASSWORD: string;
  SESSION_SECRET?: string;
  GHL_LOCATION_ID: string;
  GHL_TOKEN: string;
  // Agency/company id. Required only to provision new GHL users when adding
  // staff (POST /users/ needs it). Absent => staff accounts are created without
  // a linked GHL user. See functions/lib/staff.ts.
  GHL_COMPANY_ID?: string;
  // Supabase tenant slug for the live session mode (defaults to willis-windows).
  TENANT_SLUG?: string;
  TEST_APP_PASSWORD?: string;
  TEST_GHL_LOCATION_ID?: string;
  TEST_GHL_TOKEN?: string;
  // Supabase tenant slug for the test session mode (defaults to test-account).
  TEST_TENANT_SLUG?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  // Browser-safe publishable key, returned by /api/chat/config for the Realtime socket.
  SUPABASE_ANON_KEY?: string;
  WEBHOOK_SECRET?: string;
  // Resend API key (send-only restricted key) for internal-notification emails
  // relayed from GHL workflows via /api/internal-notify. NOTIFY_FROM sets the
  // locked From address (caller cannot override it); defaults to the agency
  // alerts mailbox. See functions/api/internal-notify.ts.
  RESEND_API_KEY?: string;
  NOTIFY_FROM?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  // The admin "Assets" hub (Google Drive file browser) connects ONE agency
  // Google account via OAuth; the refresh token is stored in drive_connection.
  // GOOGLE_OAUTH_CLIENT_ID / _SECRET come from a Web OAuth client in the agency's
  // Google Cloud project. GOOGLE_OAUTH_REDIRECT defaults to
  // https://app.hauckmarketing.com/api/admin/assets/oauth/callback when unset.
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT?: string;
  // Build Lab reads vault/Plans/Builds/*.md from the repo over the GitHub REST
  // API. GITHUB_TOKEN is a contents-read (the workflow token, contents+issues
  // read/write, also works). GITHUB_REPO defaults to jakexhauck/hauck-marketing-lab.
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  // IANA timezone for "today" computations (new-today counts, task due dates,
  // invoice overdue). Defaults to America/Chicago.
  TENANT_TIMEZONE?: string;
  // Meta (Facebook/Instagram) Ads read access for the Paid Ads tabs. One agency
  // System-User token spans every client ad account; META_AD_ACCOUNT_ID is the
  // live client's account (act_...). Both absent => Paid Ads shows not-connected.
  // Per-tenant account override (a tenants column) is a future step. See
  // functions/api/ads/insights.ts.
  META_SYSTEM_USER_TOKEN?: string;
  META_AD_ACCOUNT_ID?: string;
  // Google reviews rating hero (functions/api/reviews/summary.ts). The Places
  // API key is one global agency secret spanning every client's place, like
  // META_SYSTEM_USER_TOKEN. GOOGLE_PLACE_ID is the single-tenant fallback for the
  // per-client tenants.google_place_id column. Both absent => the hero shows its
  // not-connected state.
  GOOGLE_PLACES_API_KEY?: string;
  GOOGLE_PLACE_ID?: string;
  KV_CACHE?: KVNamespace;
}

export function tenantTimezone(env: Env): string {
  return env.TENANT_TIMEZONE || "America/Chicago";
}

// Generic defaults. At client promotion time, set TENANT_SLUG (and seed the
// matching tenants row) per client; nothing client-specific belongs in code.
export const DEFAULT_LIVE_SLUG = "live-client";
export const DEFAULT_TEST_SLUG = "test-account";

export function liveTenantSlug(env: Env): string {
  return env.TENANT_SLUG || DEFAULT_LIVE_SLUG;
}

export function testTenantSlug(env: Env): string {
  return env.TEST_TENANT_SLUG || DEFAULT_TEST_SLUG;
}

export interface TenantContext {
  ghl_location_id: string;
  ghl_token: string;
  // The client's Meta ad account (act_...), resolved from the tenant row with
  // the META_AD_ACCOUNT_ID env var as the single-tenant fallback. Undefined =>
  // Paid Ads shows not-connected. See functions/api/ads/insights.ts.
  meta_ad_account_id?: string;
  // The client's Google Places place_id, resolved from the tenant row with the
  // GOOGLE_PLACE_ID env var as the single-tenant fallback. Undefined => the
  // Reviews rating hero shows not-connected. See functions/api/reviews/summary.ts.
  google_place_id?: string;
  // Supabase tenants.slug for this session, resolved from the session mode in
  // _middleware.ts. All Supabase-backed routes must scope by this, never by a
  // hardcoded slug, or test and live data bleed into each other.
  slug: string;
  mode: "live" | "test";
}

export interface ApiData {
  tenant: TenantContext;
  // Caller identity, populated by _middleware.ts on authenticated requests.
  // session: the verified, signed session (owner has no staffId).
  // isOwner: shared-password owner OR a staff row with role 'owner'.
  // staff: the resolved staff record, or null for the owner session.
  // permissions: a staff member's effective per-surface grants (empty for owner,
  //   who bypasses surface checks).
  session?: import("./session").SessionData;
  isOwner?: boolean;
  staff?: import("./staff").StaffRecord | null;
  permissions?: import("./permissions").EffectivePermissions;
  // Populated by _middleware.ts on /api/admin/* routes only: the verified,
  // active super-admin (0008). Cross-tenant admin handlers read this and never
  // re-check identity themselves.
  admin?: import("./adminAuth").AdminRecord | null;
  [k: string]: unknown;
}
