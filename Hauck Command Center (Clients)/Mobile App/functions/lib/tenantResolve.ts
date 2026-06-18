import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { liveTenantSlug } from "./env";

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
  owner_password_hash: string | null;
  monthly_spend: number | null;
}

const TENANT_COLS =
  "id, slug, name, niche, brand_color, brand_initials, app_name, won_label, value_label, ghl_location_id, ghl_token, owner_password_hash, monthly_spend";

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

// A tenant is "GHL-wired" once it has real creds (not the placeholders the admin
// console seeds: '', 'pending', 'env'). Until then the runtime falls back to the
// GHL_* env vars so a half-set-up client still shows the env sub-account.
export function tenantHasGhlCreds(t: Pick<TenantRow, "ghl_location_id" | "ghl_token">): boolean {
  const placeholder = (v: string) => {
    const s = (v ?? "").trim().toLowerCase();
    return s === "" || s === "pending" || s === "env";
  };
  return !placeholder(t.ghl_location_id) && !placeholder(t.ghl_token);
}
