export interface Env {
  APP_PASSWORD: string;
  SESSION_SECRET?: string;
  GHL_LOCATION_ID: string;
  GHL_TOKEN: string;
  // Supabase tenant slug for the live session mode (defaults to willis-windows).
  TENANT_SLUG?: string;
  TEST_APP_PASSWORD?: string;
  TEST_GHL_LOCATION_ID?: string;
  TEST_GHL_TOKEN?: string;
  // Supabase tenant slug for the test session mode (defaults to test-account).
  TEST_TENANT_SLUG?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  WEBHOOK_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  KV_CACHE?: KVNamespace;
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
  // Supabase tenants.slug for this session, resolved from the session mode in
  // _middleware.ts. All Supabase-backed routes must scope by this, never by a
  // hardcoded slug, or test and live data bleed into each other.
  slug: string;
  mode: "live" | "test";
}

export interface ApiData {
  tenant: TenantContext;
  [k: string]: unknown;
}
