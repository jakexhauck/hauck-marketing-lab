import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { liveTenantSlug } from "./env";
import type { WebsitePageRow } from "./websitePages";

// Per-client resolution by request host (0009). One deployment serves many
// clients: williswindows.dashmarketing.com routes to the willis-windows tenant,
// smith.dashmarketing.com to smith, and so on. The leftmost host label is the
// client key; everything resolves from the tenant row, with env vars as the
// fallback so single-tenant deploys (and the bare *.pages.dev URL) keep working.

// Host labels that are NOT a client (infra, internal apps, local dev). A host
// whose first label is one of these, or that has no client subdomain, falls
// back to the TENANT_SLUG env var (the existing single-tenant behavior).
const RESERVED_LABELS = new Set([
  "www",
  "app",
  "dash",
  "api",
  "crm",
  "admin",
  "test",
  "staging",
  "hauck-dashboard",
  "hauck-crm",
  "localhost",
]);

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brand_color: string;
  brand_initials: string;
  app_name: string;
  won_label: string;
  value_label: string;
  ghl_location_id: string;
  ghl_token: string;
  // Which webhook source this client's reporting is cut over to (0100):
  // 'workflow' (the hand-built webhook actions) or 'app' (the Marketplace app).
  // Optional so a pre-0100 database still types. See functions/lib/ghlEventHealth.ts.
  ghl_event_source?: string;
  meta_ad_account_id: string | null;
  google_place_id: string | null;
  ga4_property_id: string | null;
  owner_password_hash: string | null;
  monthly_spend: number | null;
  // Manual per-client Website > Pages list (0028). jsonb; comes back parsed.
  website_pages: WebsitePageRow[] | null;
  // Phones/emails that receive internal GHL notifications (0043). Their
  // conversations are hidden from every surface. See functions/lib/internalRecipients.ts.
  internal_recipients: string | null;
  // GHL pipeline whose opportunities make a conversation visible in this
  // client's Inbox (0097). NULL resolves by name instead. See
  // functions/lib/handoffScope.ts.
  client_inbox_pipeline_id: string | null;
  // true: this client types their own lead status and it is read from
  // lead_status (0102). false: derived from the live GHL stage, as everywhere
  // else. Set for a client who works their own leads, so nobody is moving the
  // GHL cards the derived status would read. See functions/lib/leadStatus.ts.
  manual_lead_status?: boolean;
  // A contact carrying this tag is visible in the client Inbox whatever
  // pipeline they are in (0103). NULL leaves the hand-off gate as it was.
  inbox_visible_tag?: string | null;
  // true: contacts carrying a paid-ad attribution are visible in the client
  // Inbox (0104), whatever pipeline they are in and with no tag needed.
  inbox_show_ad_leads?: boolean;
  // 'setup' while the client is being stood up, 'live' once Go Live is pressed
  // (0069). Read by the middleware's onboarding gate. Every tenant that existed
  // before that migration is 'live', so this is only ever 'setup' for a client
  // approved through the intake funnel.
  onboarding_status: string;
  // The GHL calendar this client's Google busy time blocks when no calendar has
  // been selected on Fulfillment > GHL > Calendars (0101). NULL matches by name
  // instead. See functions/lib/calendarSync.ts.
  estimate_calendar_id?: string | null;
  // Bumped to evict every live owner shared-password session for this client
  // (0121). Compared against the v claim each owner token carries; optional so
  // a pre-0121 database still types.
  session_version?: number;
}

const TENANT_COLS =
  "id, slug, name, niche, brand_color, brand_initials, app_name, won_label, value_label, ghl_location_id, ghl_token, meta_ad_account_id, google_place_id, ga4_property_id, owner_password_hash, monthly_spend, website_pages, internal_recipients, client_inbox_pipeline_id, manual_lead_status, inbox_visible_tag, inbox_show_ad_leads, onboarding_status, estimate_calendar_id, session_version";

// Normalize an admin-entered subdomain label: lowercase, hyphen-separated, the
// charset valid in a DNS label. Shared by the admin create/update endpoints.
export function normalizeSubdomain(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

// The client subdomain label for this host, or null when the host carries no
// client subdomain (apex, *.pages.dev, reserved label, or local dev).
export function clientLabelFromHost(host: string | null): string | null {
  if (!host) return null;
  const name = host.split(":")[0].trim().toLowerCase(); // strip any port
  if (!name || name === "localhost" || /^[0-9.]+$/.test(name)) return null;
  // The bare Pages domain (hauck-dashboard.pages.dev) is the project, not a
  // client. Custom client domains never end in .pages.dev.
  if (name.endsWith(".pages.dev")) return null;
  const labels = name.split(".");
  // Need at least sub.domain.tld to have a client subdomain.
  if (labels.length < 3) return null;
  const first = labels[0];
  if (RESERVED_LABELS.has(first)) return null;
  return first;
}

// Look up a tenant by its configured subdomain, then by slug as a fallback (so
// a client whose subdomain == slug works without setting the column). Returns
// null if neither matches.
async function loadTenantByLabel(
  client: SupabaseClient,
  label: string,
): Promise<TenantRow | null> {
  const bySub = await client
    .from("tenants")
    .select(TENANT_COLS)
    .ilike("subdomain", label)
    .maybeSingle();
  if (bySub.data) return bySub.data as TenantRow;
  const bySlug = await client
    .from("tenants")
    .select(TENANT_COLS)
    .eq("slug", label)
    .maybeSingle();
  return (bySlug.data as TenantRow | null) ?? null;
}

export async function loadTenantBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<TenantRow | null> {
  const { data } = await client
    .from("tenants")
    .select(TENANT_COLS)
    .eq("slug", slug)
    .maybeSingle();
  return (data as TenantRow | null) ?? null;
}

// Load a tenant by its primary key. This is the account-based path: the session
// carries the tenant id (set at login from the logged-in account), so the
// client is resolved from WHO is signed in, not from the request host.
export async function loadTenantById(
  client: SupabaseClient,
  id: string,
): Promise<TenantRow | null> {
  const { data } = await client
    .from("tenants")
    .select(TENANT_COLS)
    .eq("id", id)
    .maybeSingle();
  return (data as TenantRow | null) ?? null;
}

// Resolve the live tenant for a request: by host subdomain when present, else by
// the TENANT_SLUG env var (single-tenant fallback). Returns null only when a
// subdomain is present but matches no client (caller should 404 / show "not
// configured"); a missing subdomain resolves the env tenant.
export async function loadLiveTenantForHost(
  client: SupabaseClient,
  env: Env,
  host: string | null,
): Promise<TenantRow | null> {
  const label = clientLabelFromHost(host);
  if (label) return loadTenantByLabel(client, label);
  return loadTenantBySlug(client, liveTenantSlug(env));
}

// A tenant is "GHL-wired" once it has real creds, rather than the placeholders
// the admin console seeds: '', 'pending', 'env'. All or nothing: a real
// location id beside a placeholder token is a half-filled form, not a
// connection.
export function tenantHasGhlCreds(t: Pick<TenantRow, "ghl_location_id" | "ghl_token">): boolean {
  const placeholder = (v: string) => {
    const s = (v ?? "").trim().toLowerCase();
    return s === "" || s === "pending" || s === "env";
  };
  return !placeholder(t.ghl_location_id) && !placeholder(t.ghl_token);
}

// Which GoHighLevel sub-account to read for this tenant: its own, or none.
//
// This used to fall back to the GHL_LOCATION_ID / GHL_TOKEN env vars whenever
// the tenant's row held placeholders, and the middleware did the same thing in
// its own copy of the ladder. That was written when there was one client, and
// the env vars were that client's creds, so "fall back to env" and "fall back
// to this client" were the same sentence.
//
// They stopped being the same sentence the moment there were two clients. The
// env vars still hold a REAL client's credentials, so a half-wired client did
// not degrade to an empty page: it showed Willis Windows' leads, conversations,
// calendar and revenue, under the other client's name, with nothing on screen
// to say whose numbers they were. Every Fulfillment page showed it, because
// every Fulfillment page is a read of whatever this returned.
//
// So: no env fallback. A client that has not been wired up yet resolves to
// null, and callers turn that into "not connected", which is the truth.
//
// The shared-password ("test") sessions are unaffected: _middleware.ts builds
// their tenant from TEST_GHL_LOCATION_ID / TEST_GHL_TOKEN before reaching here,
// so those are the tenant's own creds by the time this sees them. Those vars
// name Made Better Landscaping Co's real sub-account, not a test account.
export function resolveGhlCreds(
  tenant: Pick<TenantRow, "ghl_location_id" | "ghl_token">,
): { locationId: string; token: string } | null {
  if (!tenantHasGhlCreds(tenant)) return null;
  return { locationId: tenant.ghl_location_id, token: tenant.ghl_token };
}
