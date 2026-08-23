// The connection registry: one declaration per integration this app depends on.
//
// It exists to answer three questions that until now lived only in code
// comments, in my head, and in a one-off HTML audit that started rotting the
// day it was written:
//
//   1. Where does this credential live? (Doppler, Cloudflare env, a Supabase row)
//   2. Is it working right now? (functions/api/admin/connections/health.ts probes it)
//   3. What goes dark if it dies? (the surfaces below, readable in both directions)
//
// Pure data plus pure helpers on purpose: the admin control room and the health
// endpoint both read this one file, so a new integration cannot be added to one
// without the other noticing.
//
// Naming note: this registry names vendors plainly (GoHighLevel, Composio) which
// the client-facing UI must never do. That policy guards client screens. This is
// the internal control room and its entire value is precision, so the real names
// stay. Nothing here is rendered on a client surface.

/** Where a credential physically lives. The answer to "stop making me hunt". */
export type CredHome =
  /** A Cloudflare Pages environment variable, mirrored from Doppler. */
  | "cloudflare"
  /** A column on the Supabase `tenants` row, so it differs per client. */
  | "tenant-row"
  /** A dedicated Supabase table holding a token we captured ourselves. */
  | "supabase-table"
  /** Held by Composio on our behalf, keyed by tenant. We never see the token. */
  | "composio";

export const CRED_HOME_LABEL: Record<CredHome, string> = {
  cloudflare: "Cloudflare env",
  "tenant-row": "Supabase tenants row",
  "supabase-table": "Supabase table",
  composio: "Held by Composio",
};

export interface CredentialRef {
  /** The exact key or column name, so there is never a guess about what to look for. */
  name: string;
  home: CredHome;
  /** Mirrored in the Doppler project (hauck-command-center/prd), the source of truth. */
  inDoppler?: boolean;
  /** Optional: the integration still works without this one, in a reduced form. */
  optional?: boolean;
  /** Why it exists, or the gotcha attached to it. */
  note?: string;
}

export interface SurfaceRef {
  /** Human path, e.g. "Paid Ads > Meta Data". */
  label: string;
  /** Route, so a red row is one click from the thing that broke. */
  to?: string;
  /** Who notices when this goes dark. */
  audience: "client" | "admin";
}

export interface ConnectionDef {
  id: string;
  label: string;
  vendor: string;
  /** agency: one credential spans every client. client: each client has their own. */
  scope: "agency" | "client";
  /** One line: what this connection actually does for us. */
  purpose: string;
  credentials: CredentialRef[];
  surfaces: SurfaceRef[];
  /** How to fix it when it goes red. Written so it needs no further hunting. */
  remediation: string;
}

export const CONNECTIONS: ConnectionDef[] = [
  {
    id: "supabase",
    label: "Supabase",
    vendor: "Supabase",
    scope: "agency",
    purpose:
      "Our own database. Every tenant row, task, note, job, chat message and push subscription.",
    credentials: [
      { name: "SUPABASE_URL", home: "cloudflare", inDoppler: true },
      {
        name: "SUPABASE_SERVICE_ROLE_KEY",
        home: "cloudflare",
        inDoppler: true,
        note: "Server-only. Never reaches the browser.",
      },
      {
        // Optional deliberately: the database itself works without it, so
        // marking it required made the app's most critical dependency read
        // "Not set up" while its probe was green. Losing this breaks only the
        // Realtime chat socket, which is a degrade, not an outage.
        name: "SUPABASE_ANON_KEY",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Browser-safe. Handed out by /api/chat/config for the Realtime socket. Absent means team chat stops updating live; everything else is fine.",
      },
    ],
    surfaces: [
      { label: "Every page (tenant resolution)", audience: "client" },
      { label: "Team chat", to: "/comms", audience: "client" },
      { label: "Operations tasks", audience: "admin" },
      { label: "Admin audit log", to: "/admin/audit", audience: "admin" },
    ],
    remediation:
      "Doppler holds all three. Push with `npm run cf -- env:set` or `cf-rebind --from-doppler`, then redeploy. A 503 on login (not a 401) is the signature of Cloudflare having lost these.",
  },
  {
    id: "ghl",
    label: "GoHighLevel",
    vendor: "LeadConnector",
    scope: "client",
    purpose:
      "System of record for contacts, conversations, pipelines and calendars. Every stage move and message runs through it.",
    credentials: [
      {
        name: "tenants.ghl_token",
        home: "tenant-row",
        note: "Per client. tenantGhl.ts deliberately refuses to fall back to the env token: falling back would tag a different client's real customers.",
      },
      { name: "tenants.ghl_location_id", home: "tenant-row" },
      {
        name: "GHL_TOKEN",
        home: "cloudflare",
        inDoppler: true,
        note: "Single-tenant fallback for the client app only, not for admin write paths.",
      },
      { name: "GHL_LOCATION_ID", home: "cloudflare", inDoppler: true },
      {
        name: "GHL_COMPANY_ID",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Only needed to provision a new GHL user when adding staff.",
      },
      {
        name: "TEST_GHL_TOKEN",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Made Better Landscaping Co's sub-account. A real client: it was the test account until 2026-08-09, so the var name still says TEST.",
      },
      { name: "TEST_GHL_LOCATION_ID", home: "cloudflare", inDoppler: true, optional: true },
      {
        name: "GHL_APP_CLIENT_ID",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "The private Marketplace app, installed once by the agency across every sub-account. Not a Private Integration Token: this is what feeds /api/crm/app-webhook.",
      },
      {
        name: "GHL_APP_CLIENT_SECRET",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Shown once when the key pair is generated. A lost secret means generating a new pair, not recovering this one.",
      },
      {
        name: "GHL_APP_ID",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Only used to build the install link on Fulfillment > GHL > Connection.",
      },
    ],
    surfaces: [
      { label: "Inbox", to: "/conversations", audience: "client" },
      { label: "Contacts", to: "/contacts", audience: "client" },
      { label: "Customers", to: "/customers", audience: "client" },
      { label: "Jobs", to: "/sales/jobs", audience: "client" },
      { label: "Paid Ads > Lead Tracker", to: "/marketing/paid-ads/leads", audience: "client" },
      { label: "Setter Suite (board, cockpit, dials)", to: "/admin/setter", audience: "admin" },
      { label: "Onboarding readiness checks", audience: "admin" },
    ],
    remediation:
      "Per client: reissue the Private Integration Token in that sub-account and write it with `node scripts/set-tenant-ghl-token.mjs`. Never ask for a location id, look it up in the browser at /accounts.",
  },
  {
    id: "agency-ghl",
    label: "Agency GoHighLevel",
    vendor: "LeadConnector",
    scope: "agency",
    purpose:
      "Hauck Marketing's OWN sub-account, where cold-call meetings get booked for Jake and where those meetings are read back. Deliberately separate from every client's credentials.",
    credentials: [
      {
        name: "AGENCY_GHL_LOCATION_ID",
        home: "cloudflare",
        inDoppler: true,
        note: "The Hauck Marketing sub-account, not a client's.",
      },
      { name: "AGENCY_GHL_TOKEN", home: "cloudflare", inDoppler: true },
      {
        name: "AGENCY_GHL_USER_ID",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Who a callback task is assigned to. Defaults to Jake.",
      },
      {
        name: "AGENCY_GHL_BRIDGE_WORKFLOW",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: 'The workflow the Call button drops a prospect into to place a call, matched by name. Defaults to "CC Bridge Dial". It must be PUBLISHED: a draft accepts the contact and never rings.',
      },
    ],
    surfaces: [
      { label: "Cold Call booking", audience: "admin" },
      // The Call button on the call card lives here too: it is the same account
      // and the same credential, and listing it separately only lengthens the
      // one-line consequence the control room prints without adding a fact.
      { label: "Cold Call dials, pipelines and the Call button", audience: "admin" },
      {
        // Was "Sales Calls", which came out of the chrome (2026-08-23); the
        // month read-back lives on Data now.
        label: "Sales Data",
        to: "/admin/pillar/sales?tab=sales-data",
        audience: "admin",
      },
    ],
    remediation:
      "Reissue a Private Integration Token in the Hauck Marketing sub-account. Absent, every agency booking route answers 'not configured' rather than falling back to a client's account, which is the only safe way to fail.",
  },
  {
    id: "meta-ads",
    label: "Meta Ads",
    vendor: "Meta",
    scope: "agency",
    purpose: "Spend, impressions and creative for every client ad account, read through one System User token.",
    credentials: [
      {
        name: "META_SYSTEM_USER_TOKEN",
        home: "cloudflare",
        inDoppler: true,
        note: "One agency token spans every client ad account.",
      },
      {
        name: "tenants.meta_ad_account_id",
        home: "tenant-row",
        note: "The client's act_... id.",
      },
      {
        name: "META_AD_ACCOUNT_ID",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Single-tenant fallback. Cloudflare also carries an orphan META_AD_ACCOUNT with no _ID suffix that no code reads. Ignore it.",
      },
    ],
    surfaces: [
      { label: "Paid Ads > Dashboard", to: "/marketing/paid-ads", audience: "client" },
      { label: "Paid Ads > Lead Tracker", to: "/marketing/paid-ads/leads", audience: "client" },
      { label: "Paid Ads > Meta Data", to: "/marketing/paid-ads/meta", audience: "client" },
      { label: "Ad Tracker (spend and ROAS)", audience: "admin" },
    ],
    remediation:
      "System User tokens do not expire on a timer but die when the app or the user's permissions change. Reissue in Meta Business Settings, then push to Doppler and Cloudflare. Spend is refreshed nightly by workers/ads-cron; if it goes stale with a healthy token, check that Worker rather than the token.",
  },
  {
    id: "ga4",
    label: "Google Analytics 4",
    vendor: "Google",
    scope: "agency",
    purpose: "Website traffic and conversion numbers for the Website tabs.",
    credentials: [
      {
        name: "GA4_SA_JSON",
        home: "cloudflare",
        inDoppler: true,
        note: "The whole downloaded service-account JSON, stored as one string.",
      },
      { name: "tenants.ga4_property_id", home: "tenant-row" },
      { name: "GA4_PROPERTY_ID", home: "cloudflare", inDoppler: true, optional: true },
    ],
    surfaces: [
      { label: "Website > Overview", to: "/marketing/website", audience: "client" },
      { label: "Website > Insights", to: "/marketing/website/insights", audience: "client" },
    ],
    remediation:
      "The service account must be added as a Viewer on each client's GA4 property. If a property was recreated, the old id silently returns nothing.",
  },
  {
    id: "google-places",
    label: "Google Places",
    vendor: "Google",
    scope: "agency",
    purpose: "The star rating and review count on the Reviews hero.",
    credentials: [
      { name: "GOOGLE_PLACES_API_KEY", home: "cloudflare", inDoppler: true },
      { name: "tenants.google_place_id", home: "tenant-row" },
      { name: "GOOGLE_PLACE_ID", home: "cloudflare", inDoppler: true, optional: true },
    ],
    surfaces: [
      { label: "Google Reviews > rating hero", to: "/marketing/reviews/pipeline", audience: "client" },
    ],
    remediation:
      "Places keys fail on billing lapses and on referrer restrictions, not just on revocation. Check the Google Cloud project's billing state first.",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    vendor: "Google",
    scope: "agency",
    purpose: "The Assets hub file browser and the SOP Hub, both reading one agency Google account.",
    credentials: [
      { name: "GOOGLE_OAUTH_CLIENT_ID", home: "cloudflare", inDoppler: true },
      { name: "GOOGLE_OAUTH_CLIENT_SECRET", home: "cloudflare", inDoppler: true },
      {
        name: "GOOGLE_OAUTH_REDIRECT",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Defaults to the production callback when unset.",
      },
      {
        name: "drive_connection.refresh_token",
        home: "supabase-table",
        note: "Captured by the OAuth callback. This is the one credential we hold ourselves rather than mirror from Doppler.",
      },
      {
        // Optional: the Assets file browser works without it. Only the SOP Hub
        // needs it, and unset renders a setup state rather than reading the
        // wrong folder, so it degrades one surface instead of breaking Drive.
        name: "SOP_DRIVE_FOLDER_ID",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "The 'SOPs Templates' folder. Unset renders a setup state rather than reading the wrong folder.",
      },
      {
        // Same shape as the SOP folder above: a location, not a credential.
        // Unset costs a new client its Drive folder and says so on the screen
        // that would have made it; nothing else notices.
        name: "CLIENT_DRIVE_ROOT_FOLDER_ID",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "The folder a new client's own folder is created inside. Unset means creating a client skips the folder and warns.",
      },
    ],
    surfaces: [
      { label: "Assets hub", audience: "admin" },
      { label: "SOP Hub", audience: "admin" },
      { label: "New client > Create", to: "/admin/clients/new", audience: "admin" },
    ],
    remediation:
      "No connect button exists in the UI yet. Re-consent by opening /api/admin/assets/oauth/start and signing in as the agency Google account. A refresh token dies if consent is revoked or the account password changes.",
  },
  {
    id: "composio-calendar",
    label: "Google Calendar (via Composio)",
    vendor: "Composio",
    scope: "client",
    purpose: "Two-way calendar sync per client, so bookings land on the crew's real calendar.",
    credentials: [
      { name: "COMPOSIO_API_KEY", home: "cloudflare", inDoppler: true },
      { name: "COMPOSIO_GCAL_AUTH_CONFIG_ID", home: "cloudflare", inDoppler: true },
      {
        name: "connected account",
        home: "composio",
        note: "Keyed by `${mode}:${slug}`, not by tenant id. mode is a session property, not a tenants column.",
      },
    ],
    surfaces: [
      { label: "Jobs calendar", to: "/sales/jobs", audience: "client" },
      { label: "Setter Suite > Calendar", to: "/admin/setter", audience: "admin" },
    ],
    remediation:
      "Each client re-consents through Composio. The grant is per client, so one client's lapse never affects another.",
  },
  {
    id: "web-push",
    label: "Web Push",
    vendor: "VAPID / self-hosted",
    scope: "agency",
    purpose: "Browser push notifications, fanned out from the GHL webhook. Entirely ours, no vendor.",
    credentials: [
      { name: "VAPID_PUBLIC_KEY", home: "cloudflare", inDoppler: true },
      { name: "VAPID_PRIVATE_KEY", home: "cloudflare", inDoppler: true },
      {
        name: "push_subscriptions",
        home: "supabase-table",
        note: "Per device. Rotating the VAPID keys invalidates every existing subscription.",
      },
    ],
    surfaces: [
      { label: "New lead push alerts", audience: "client" },
      { label: "Connection health alerts", audience: "admin" },
    ],
    remediation:
      "Never rotate VAPID keys casually: every subscribed device has to re-subscribe, and users who dismissed the prompt have no way back in yet.",
  },
  {
    id: "health-cron",
    label: "Scheduled health checks",
    vendor: "Cloudflare Workers",
    scope: "agency",
    purpose:
      "The watchdog that runs this very page every 30 minutes unattended, so a credential that dies at 3am is known by 3:30 rather than whenever someone next opens Settings.",
    credentials: [
      {
        name: "HEALTH_CRON_SECRET",
        home: "cloudflare",
        inDoppler: true,
        note: "Shared with the scheduler Worker, which is a separate deploy: Pages projects cannot carry a cron trigger. At least 32 chars or the gate refuses it. Buys the caller one read-only snapshot and no admin power at all.",
      },
    ],
    surfaces: [{ label: "Connection health alerts", audience: "admin" }],
    remediation:
      "Set the same value in two places or the checks silently stop: this app's Cloudflare env, and the scheduler Worker's own secret (`wrangler secret put HEALTH_CRON_SECRET` in workers/health-cron). Absent here, the scheduled check is off and this page is only as fresh as the last time someone opened it.",
  },
  {
    id: "ads-cron",
    label: "Nightly ad spend sync",
    vendor: "Cloudflare Workers",
    scope: "agency",
    purpose:
      "Refreshes the per-ad, per-day Meta spend snapshot every night. Without it the client Paid Ads Dashboard keeps dividing by an old spend figure, so ROAS and cost per lead drift upward looking perfectly plausible.",
    credentials: [
      {
        name: "ADS_CRON_SECRET",
        home: "cloudflare",
        inDoppler: true,
        note: "Shared with the scheduler Worker (workers/ads-cron), a separate deploy because Pages projects cannot carry a cron trigger. At least 32 chars or the gate refuses it. Must NOT be the same value as HEALTH_CRON_SECRET: that one buys a read, this one triggers a write.",
      },
    ],
    surfaces: [
      { label: "Paid Ads > Dashboard", to: "/marketing/paid-ads", audience: "client" },
      { label: "Ad Tracker > Refresh spend", audience: "admin" },
    ],
    remediation:
      "Set the same value in this app's Cloudflare env and the Worker's own secret (`wrangler secret put ADS_CRON_SECRET` in workers/ads-cron), or every run comes back 401 and spend silently stops updating. The admin Ad Tracker panel shows how many days behind the snapshot is, and its Refresh button pulls it manually in the meantime.",
  },
  {
    id: "calendar-sync",
    label: "Google Calendar sync",
    vendor: "Composio",
    scope: "client",
    purpose:
      "Pushes each client's real Google commitments into the Home Estimate calendar their customers book into, every fifteen minutes. Without it a client keeps being offered slots they are not free for, and the first anybody knows is a customer arriving to an empty driveway.",
    credentials: [
      {
        name: "CALENDAR_CRON_SECRET",
        home: "cloudflare",
        inDoppler: true,
        note: "Shared with the scheduler Worker, for the same reason as ADS_CRON_SECRET: Pages projects cannot carry a cron trigger. At least 32 chars or the gate refuses it. Its own value, never shared with the other two cron secrets.",
      },
    ],
    surfaces: [
      { label: "Connect gate > Google Calendar", audience: "client" },
      { label: "Jobs", to: "/jobs", audience: "client" },
    ],
    remediation:
      "Set the same value in this app's Cloudflare env and the Worker's own secret, or every run comes back 401 and blocked slots silently stop updating. Nothing breaks visibly: the calendar simply stops learning that the owner is busy.",
  },
  {
    id: "dialer-cron",
    label: "Power dialer sync",
    vendor: "Cloudflare Workers",
    scope: "agency",
    purpose:
      "Records every GoHighLevel power-dialer call once a minute, with no browser open. The dial table feeds the tracker, the funnel and the script numbers, so a stopped worker quietly rewrites the day's numbers.",
    credentials: [
      {
        name: "COLD_CALL_CRON_SECRET",
        home: "cloudflare",
        inDoppler: true,
        note: "Shared with workers/dialer-cron, a separate deploy because Pages projects cannot carry a cron trigger. At least 32 chars or the gate refuses it.",
      },
    ],
    surfaces: [
      { label: "Cold Call dials and daily funnel", to: "/admin/pillar/acquisition?tab=cold-call", audience: "admin" },
    ],
    remediation:
      "Set the same value in this app's Cloudflare env and the Worker's own secret (`wrangler secret put COLD_CALL_CRON_SECRET` in workers/dialer-cron). The probe fails after ten quiet minutes; it lost three real calls once before this watchdog existed.",
  },
  {
    id: "error-log",
    label: "Background error receipts",
    vendor: "self-hosted",
    scope: "agency",
    purpose:
      "Every fire-and-forget failure (webhook side effects, cron handlers, uncaught API errors) lands in error_log instead of vanishing into console output. A burst is itself a health signal.",
    credentials: [],
    surfaces: [
      { label: "Operations > Business Health", to: "/admin/pillar/operations?tab=health", audience: "admin" },
    ],
    remediation:
      "Nothing to configure: the table exists (0119) and writers are best-effort. A red probe means five or more failures in an hour; read the latest ones under Operations > Business Health.",
  },
  {
    id: "resend",
    label: "Resend",
    vendor: "Resend",
    scope: "agency",
    purpose: "Internal notification email relayed from GHL workflows.",
    credentials: [
      {
        name: "RESEND_API_KEY",
        home: "cloudflare",
        inDoppler: true,
        note: "A send-only restricted key.",
      },
      {
        name: "NOTIFY_FROM",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Locked From address. A caller cannot override it.",
      },
    ],
    surfaces: [{ label: "Internal notification email", audience: "admin" }],
    remediation: "Reissue a send-only key in Resend. Verify the sending domain is still verified.",
  },
  {
    id: "github",
    label: "GitHub",
    vendor: "GitHub",
    scope: "agency",
    purpose: "Build Lab reads the build plans out of the repo over the REST API.",
    credentials: [
      { name: "GITHUB_TOKEN", home: "cloudflare", inDoppler: true, note: "Contents-read is enough." },
      { name: "GITHUB_REPO", home: "cloudflare", inDoppler: true, optional: true },
    ],
    surfaces: [{ label: "Build Lab", audience: "admin" }],
    remediation: "Fine-grained GitHub tokens expire on a date. This is the one credential with a hard clock on it.",
  },
  {
    id: "app-auth",
    label: "App sign-in",
    vendor: "self-hosted",
    scope: "agency",
    purpose: "The shared-password login and the signed session cookie.",
    credentials: [
      { name: "APP_PASSWORD", home: "cloudflare", inDoppler: true },
      {
        name: "SESSION_SECRET",
        home: "cloudflare",
        inDoppler: true,
        note: "Changing this signs every user out at once.",
      },
      { name: "TEST_APP_PASSWORD", home: "cloudflare", inDoppler: true, optional: true },
    ],
    surfaces: [{ label: "Login", audience: "client" }],
    remediation:
      "If login returns 503 rather than 401, the secrets are missing rather than wrong. Set them on both Cloudflare environments and redeploy.",
  },
  {
    id: "doppler",
    label: "Doppler",
    vendor: "Doppler",
    scope: "agency",
    purpose:
      "Source of truth for every agency-wide secret. The control room reads it to show what each key should be and to flag drift against what the running deploy actually has.",
    credentials: [
      {
        name: "DOPPLER_TOKEN",
        home: "cloudflare",
        inDoppler: false,
        note: "Read-only service token. Cannot live in Doppler itself: the app needs it to reach Doppler in the first place.",
      },
      {
        name: "DOPPLER_WRITE_TOKEN",
        home: "cloudflare",
        inDoppler: false,
        optional: true,
        note: "Separate and optional. Absent means editing agency secrets in-app is off, so the app holds no write power unless you deliberately grant it.",
      },
    ],
    surfaces: [
      { label: "Agency Settings > Secrets", to: "/admin/settings", audience: "admin" },
      { label: "Secret drift detection", audience: "admin" },
    ],
    remediation:
      "Create a service token in the Doppler dashboard for hauck-command-center/prd. Read-only for DOPPLER_TOKEN. Only add DOPPLER_WRITE_TOKEN if you want to edit secrets from inside the app.",
  },
  {
    id: "cloudflare-deploy",
    label: "Cloudflare deploys",
    vendor: "Cloudflare",
    scope: "agency",
    purpose:
      "What lets the Keys panel finish the job: writing an agency secret into the running deploy and restarting it, instead of printing a shell command and leaving it half done.",
    credentials: [
      {
        name: "CF_DEPLOY_TOKEN",
        home: "cloudflare",
        inDoppler: true,
        note: "Deliberately NOT the account-wide CLOUDFLARE_API_TOKEN. Scoped to Pages:Edit on this one project, so an admin session that reached it still cannot touch DNS, other Workers, or another project. The account token stays on Jake's machine.",
      },
      { name: "CLOUDFLARE_ACCOUNT_ID", home: "cloudflare", inDoppler: true },
      {
        name: "CF_PAGES_PROJECT",
        home: "cloudflare",
        inDoppler: true,
        optional: true,
        note: "Defaults to hauck-command-center, the name in wrangler.toml.",
      },
    ],
    surfaces: [
      { label: "Onboarding > Keys", to: "/admin/onboarding?view=keys", audience: "admin" },
      { label: "Agency Settings > Secrets", to: "/admin/settings", audience: "admin" },
    ],
    remediation:
      "Cloudflare dashboard > My Profile > API Tokens > Create Token > Custom. One permission: Account > Cloudflare Pages > Edit. Nothing else. Put it in Doppler as CF_DEPLOY_TOKEN and bind it with `cf-rebind --add CF_DEPLOY_TOKEN`. Absent, the Keys panel still saves to Doppler and simply says a redeploy is needed, which is exactly how it behaved before this existed.",
  },
  {
    id: "ghl-webhook",
    label: "GHL webhook",
    vendor: "LeadConnector",
    scope: "agency",
    purpose: "Instant inbound sync: GHL posts here on new leads and messages instead of us polling.",
    credentials: [
      {
        name: "WEBHOOK_SECRET",
        home: "cloudflare",
        inDoppler: true,
        note: "Shared with the GHL workflow that calls us. Both sides must change together.",
      },
    ],
    surfaces: [
      { label: "Inbox freshness", to: "/conversations", audience: "client" },
      { label: "New lead push alerts", audience: "client" },
    ],
    remediation:
      "A rotated secret makes GHL's calls fail silently on their side, so the app just looks stale. Update the workflow's header in GHL in the same sitting.",
  },
  {
    id: "sheets-lead-sync",
    label: "Client lead tracker sheets",
    vendor: "Google Apps Script",
    scope: "agency",
    purpose:
      "Feeds each client's own Google Sheet lead tracker. The Apps Script bound to that sheet polls /api/sheets/leads every ten minutes; it is where the owner marks outcomes, so a dead feed looks to them like the ads stopped working.",
    credentials: [
      {
        name: "SHEETS_SYNC_TOKEN",
        home: "cloudflare",
        inDoppler: true,
        note: "Held in each sheet's Apps Script properties as API_TOKEN. Rotating it stops every client sheet at once, so change both sides in the same sitting. Read-only: it buys one tenant's leads and can write nothing.",
      },
    ],
    surfaces: [
      { label: "Client lead tracker sheet", audience: "client" },
    ],
    remediation:
      "Unset, the route answers 503 and every sheet stops updating silently, since Apps Script failures only email the sheet's owner. Set the same value in Doppler and in Script Properties > API_TOKEN on each client sheet. See sheets/README.md.",
  },
];

/** Credentials this integration genuinely cannot run without. */
export function requiredCredentials(def: ConnectionDef): CredentialRef[] {
  return def.credentials.filter((c) => !c.optional);
}

export interface SurfaceGroup {
  surface: SurfaceRef;
  requires: ConnectionDef[];
}

// The reverse view, and the reason this file is worth having. Answers "this page
// is empty, what does it need", which is the question actually asked when a
// client complains. Insertion-ordered by first appearance so the client-facing
// surfaces lead.
export function surfaceIndex(defs: ConnectionDef[] = CONNECTIONS): SurfaceGroup[] {
  const groups = new Map<string, SurfaceGroup>();
  for (const def of defs) {
    for (const surface of def.surfaces) {
      const existing = groups.get(surface.label);
      if (existing) existing.requires.push(def);
      else groups.set(surface.label, { surface, requires: [def] });
    }
  }
  return [...groups.values()];
}

export interface CredentialEntry extends CredentialRef {
  connectionId: string;
  connectionLabel: string;
}

// Every credential in one flat, alphabetised list: the "which system holds this
// key" lookup, so a value is never hunted across three dashboards again.
export function credentialIndex(defs: ConnectionDef[] = CONNECTIONS): CredentialEntry[] {
  return defs
    .flatMap((def) =>
      def.credentials.map((c) => ({
        ...c,
        connectionId: def.id,
        connectionLabel: def.label,
      })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
