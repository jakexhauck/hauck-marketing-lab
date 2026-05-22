export interface Env {
  APP_PASSWORD: string;
  SESSION_SECRET?: string;
  GHL_LOCATION_ID: string;
  GHL_TOKEN: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  WEBHOOK_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  KV_CACHE?: KVNamespace;
}

export interface TenantContext {
  ghl_location_id: string;
  ghl_token: string;
}

export interface ApiData {
  tenant: TenantContext;
  [k: string]: unknown;
}
