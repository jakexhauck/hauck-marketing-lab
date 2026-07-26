import type { WebsitePageRow } from "./websitePages";

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
  // Hauck Marketing's OWN GoHighLevel sub-account (agency sales calls), as
  // opposed to every other GHL credential here, which belongs to a client.
  // See functions/lib/agencyGhl.ts.
  AGENCY_GHL_LOCATION_ID?: string;
  AGENCY_GHL_TOKEN?: string;
  AGENCY_TIMEZONE?: string;
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
  // The Drive folder the admin SOP Hub reads, on that same agency account
  // ("SOPs Templates"). Its subfolders are the categories and its Docs are the
  // SOP pages. Unset => the hub renders a setup state rather than guessing at a
  // folder, since reading the wrong one would surface the wrong documents.
  SOP_DRIVE_FOLDER_ID?: string;
  // Composio brokers the per-CLIENT Google Calendar grant, which is a different
  // shape from the agency-wide Drive connection above: each client links their
  // own calendar and Composio holds that token, keyed by the tenant id passed
  // as its user_id. So both values here are agency-wide (one project key, one
  // shared auth config) and nothing per-tenant is stored on our side.
  COMPOSIO_API_KEY?: string;
  COMPOSIO_GCAL_AUTH_CONFIG_ID?: string;
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
  // Google Analytics 4 for the Website Overview + Insights tabs
  // (functions/api/website/analytics.ts). GA4_SA_JSON is one global agency
  // service-account key (the whole downloaded JSON, as a string) spanning every
  // client's property, like META_SYSTEM_USER_TOKEN. GA4_PROPERTY_ID is the
  // single-tenant fallback for the per-client tenants.ga4_property_id column.
  // Key or property absent => the Website tabs show their not-connected state.
  GA4_SA_JSON?: string;
  GA4_PROPERTY_ID?: string;
  // Single-tenant fallback for the per-client tenants.internal_recipients
  // column (0043). Comma or newline separated phones/emails that receive
  // internal GHL notifications; their conversations are hidden everywhere.
  INTERNAL_RECIPIENTS?: string;
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
  // The client's GA4 property id, resolved from the tenant row with the
  // GA4_PROPERTY_ID env var as the single-tenant fallback. Undefined => the
  // Website analytics tabs show not-connected. See functions/api/website/analytics.ts.
  ga4_property_id?: string;
  // The client's Website > Pages list, resolved from the tenant row (0028).
  // Empty array => the Pages tab shows its "add your pages" state. See
  // functions/api/website/pages.ts.
  website_pages?: WebsitePageRow[];
  // Phones/emails that receive internal GHL notifications, resolved from the
  // tenant row with the INTERNAL_RECIPIENTS env var as the single-tenant
  // fallback. Comma or newline separated. Conversations, threads, and lead rows
  // belonging to these people are hidden from every surface in the app.
  // Undefined => only the source='NOTIFICATION' signal applies, which still
  // catches the sinks GHL auto-creates. See functions/lib/internalRecipients.ts.
  internal_recipients?: string;
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
