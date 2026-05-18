export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WEBHOOK_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  KV_CACHE?: KVNamespace;
}

import type { TenantRow } from "./tenant";

export interface ApiData {
  userId: string;
  email: string;
  tenant: TenantRow;
  [k: string]: unknown;
}
