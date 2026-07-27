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
        note: "The TEST ACCOUNT sub-account, used by test-mode sessions.",
      },
      { name: "TEST_GHL_LOCATION_ID", home: "cloudflare", inDoppler: true, optional: true },
    ],
    surfaces: [
      { label: "Inbox", to: "/conversations", audience: "client" },
      { label: "Contacts", to: "/contacts", audience: "client" },
      { label: "Customers", to: "/customers", audience: "client" },
      { label: "Jobs", to: "/sales/jobs", audience: "client" },
      { label: "Paid Ads > Lead Tracker", to: "/marketing/paid-ads", audience: "client" },
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
    ],
    surfaces: [
      { label: "Cold Call booking", audience: "admin" },
      { label: "Cold Call dials and pipelines", audience: "admin" },
      {
        label: "Sales Calls",
        to: "/admin/pillar/sales?tab=calls",
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
      { label: "Paid Ads > Lead Tracker", to: "/marketing/paid-ads", audience: "client" },
      { label: "Paid Ads > Meta Data", to: "/marketing/paid-ads/meta", audience: "client" },
      { label: "Paid Ads > Media", to: "/marketing/paid-ads/media", audience: "client" },
      { label: "Ad Tracker (spend and ROAS)", audience: "admin" },
    ],
    remediation:
      "System User tokens do not expire on a timer but die when the app or the user's permissions change. Reissue in Meta Business Settings, then push to Doppler and Cloudflare. Spend also goes stale with a healthy token because no sync cron exists yet.",
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
    ],
    surfaces: [
      { label: "Assets hub", audience: "admin" },
      { label: "SOP Hub", audience: "admin" },
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
