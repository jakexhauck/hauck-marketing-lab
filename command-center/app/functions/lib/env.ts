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
  // Shared secret for the scheduled Google Calendar sync, called by the cron
  // worker. Unset means the route is closed, never open. See lib/calendarCron.ts.
  CALENDAR_CRON_SECRET?: string;
  // The GoHighLevel Marketplace app (private, sub-account target, installed in
  // bulk by the agency). Distinct from every GHL_* above, which are Private
  // Integration Tokens. See functions/lib/ghlApp.ts.
  GHL_APP_CLIENT_ID?: string;
  GHL_APP_CLIENT_SECRET?: string;
  // The marketplace app's own id. Used only to build the install URL the
  // Connection page shows.
  GHL_APP_ID?: string;
  // Supabase tenant slug for the live session mode (defaults to willis-windows).
  TENANT_SLUG?: string;
  // The TEST_* credentials below are named for what this sub-account used to
  // be. Since 2026-08-09 it is Made Better Landscaping Co's own sub-account: a
  // real client, holding real client data, NOT a scratch account to experiment
  // in. The names are kept only because renaming them means renaming secrets in
  // Cloudflare and Doppler; treat every TEST_* value here as a live client's.
  TEST_APP_PASSWORD?: string;
  TEST_GHL_LOCATION_ID?: string;
  TEST_GHL_TOKEN?: string;
  // Hauck Marketing's OWN GoHighLevel sub-account (agency sales calls), as
  // opposed to every other GHL credential here, which belongs to a client.
  // See functions/lib/agencyGhl.ts.
  AGENCY_GHL_LOCATION_ID?: string;
  AGENCY_GHL_TOKEN?: string;
  AGENCY_TIMEZONE?: string;
  // Who a callback task is assigned to in the agency's GHL. Defaults to Jake's
  // user id; see functions/lib/agencyGhl.ts.
  AGENCY_GHL_USER_ID?: string;
  // The workflow the call card drops a prospect into to place a call, matched by
  // NAME. Defaults to "CC Bridge Dial"; see functions/lib/coldCallBridge.ts.
  AGENCY_GHL_BRIDGE_WORKFLOW?: string;
  // Which calendars the Sales Calls page reads, comma separated. Absent means
  // the ones whose NAME says demo / discovery / sales, which is the same test
  // the booking panel uses. Set this only when a sales calendar is named
  // something else: reading every calendar on the account is what put four
  // flights and a school prom on the sales meetings page.
  AGENCY_SALES_CALENDAR_IDS?: string;
  // Supabase tenant slug for the shared-password ("test") session mode, which
  // is Made Better Landscaping Co. Defaults to the legacy test-account slug.
  TEST_TENANT_SLUG?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  // Browser-safe publishable key, returned by /api/chat/config for the Realtime socket.
  SUPABASE_ANON_KEY?: string;
  WEBHOOK_SECRET?: string;
  // Shared secret for the client Google Sheet lead trackers. Held in the Apps
  // Script bound to each sheet; buys read-only access to one tenant's leads via
  // /api/sheets/leads. Unset means that route is closed, never open.
  SHEETS_SYNC_TOKEN?: string;
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
  // The Drive folder a NEW client's folder is created inside, on that same
  // agency account ("🌟 Hauck Marketing", where the live client folders sit).
  // Unset => creating a client skips the folder and says so, rather than
  // dropping a client folder in whatever Drive root it could reach.
  CLIENT_DRIVE_ROOT_FOLDER_ID?: string;
  // The published client intake form, whole, e.g.
  // https://hauckmarketing.com/onboarding-form. Two jobs from one value: it is
  // the link Jake sends a new client, and its ORIGIN is the extra origin CORS
  // lets post to /api/intake. One value, so the link he hands out and the
  // address the API accepts can never be two different things.
  //
  // A setting rather than a line of code, because where the funnel is published
  // is decided outside this repo and moving it must not need a deploy. Unset
  // means no link is shown and no extra origin is allowed, which is the state
  // before it is published.
  FUNNEL_URL?: string;
  // The GoHighLevel calendar a new client's onboarding call is booked on, from
  // the Add a client page. Unset uses the calendar the intake funnel's own
  // booking page already embeds, so the two agree by default; set it only when
  // that calendar is replaced. See functions/lib/onboardingCall.ts.
  ONBOARDING_CALENDAR_ID?: string;
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
  // Doppler is the source of truth for every agency-wide secret. The admin
  // control room reads it so the app can show what Doppler holds and flag drift
  // against the values the running deploy actually has.
  // DOPPLER_TOKEN is read-only. DOPPLER_WRITE_TOKEN is separate and optional:
  // without it, in-app editing of agency secrets is off and the UI says so, so
  // the app never carries write power it is not being asked to use.
  // PROJECT/CONFIG default to hauck-command-center/prd (see doppler.yaml).
  DOPPLER_TOKEN?: string;
  DOPPLER_WRITE_TOKEN?: string;
  DOPPLER_PROJECT?: string;
  DOPPLER_CONFIG?: string;
  // What lets the Keys panel finish the job: write an agency secret into the
  // running deploy and restart it, rather than printing a shell command.
  //
  // CF_DEPLOY_TOKEN is deliberately NOT the account-wide CLOUDFLARE_API_TOKEN
  // used by the local scripts. It is scoped to Pages:Edit on this one project,
  // so an admin session that reached it still cannot touch DNS, other Workers,
  // or another project. The account token stays off this app on purpose.
  //
  // Absent, the panel still saves to Doppler and simply reports that a redeploy
  // is needed, which is how it behaved before any of this existed.
  CF_DEPLOY_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CF_PAGES_PROJECT?: string;
  // Shared secret that lets the scheduler Worker call the connection health
  // probe unattended, since Cloudflare Pages has no cron trigger of its own.
  // Unset means the scheduled check is simply off; it opens no other route
  // either way. Must be at least 32 chars or the gate refuses it. See
  // functions/lib/healthCron.ts.
  HEALTH_CRON_SECRET?: string;
  // Shared secret that lets the scheduler Worker refresh the Meta spend
  // snapshot nightly, for the same reason. Deliberately NOT the same value as
  // HEALTH_CRON_SECRET: that one buys a read, this one buys a write. Unset
  // means the nightly sync is off and spend goes stale. See
  // functions/lib/adsCron.ts.
  ADS_CRON_SECRET?: string;
  KV_CACHE?: KVNamespace;
}

export function tenantTimezone(env: Env): string {
  return env.TENANT_TIMEZONE || "America/Chicago";
}

// Generic defaults. At client promotion time, set TENANT_SLUG (and seed the
// matching tenants row) per client; nothing client-specific belongs in code.
export const DEFAULT_LIVE_SLUG = "live-client";
// The shared-password session resolves to Made Better Landscaping Co's REAL
// tenant row. It used to resolve to a separate 'test-account' row, which meant
// one account was two tenants: the session scoped to an empty 'test-account'
// while reading GHL data from Made Better's location. Migration 0105 collapsed
// them and retired that row. The constant keeps its TEST name because the
// session mode and the TEST_GHL_* env vars still carry it.
export const DEFAULT_TEST_SLUG = "made-better-landscaping-co";

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
  // The GHL pipeline whose opportunities make a conversation visible in this
  // client's Inbox, from the tenant row (0097). Undefined => the pipeline is
  // resolved by name, and if that fails the Inbox is ungated and shows every
  // conversation, as it did before the gate. No env fallback: one client's
  // pipeline id is meaningless in another's sub-account. See
  // functions/lib/handoffScope.ts.
  client_inbox_pipeline_id?: string;
  // true: this client types their own lead status, read from lead_status (0102),
  // and the Paid Ads ladder counts from what they typed. false/undefined: the
  // status is derived from the live GHL stage, as for every client whose leads
  // we work ourselves. See functions/lib/leadStatus.ts.
  manual_lead_status?: boolean;
  // Contacts carrying this tag are always visible in the Inbox, on top of the
  // hand-off pipeline rule (0103). Undefined leaves the gate exactly as it was.
  inbox_visible_tag?: string;
  // Contacts whose GHL attributions carry a paid-ad id are always visible in
  // the Inbox (0104). The strong signal where the tag was the weak one.
  inbox_show_ad_leads?: boolean;
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
