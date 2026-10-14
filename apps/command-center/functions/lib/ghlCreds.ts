import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { locationToken } from "./ghlApp";
import { resolveGhlCreds, type TenantRow } from "./tenantResolve";

// The one way a tenant row becomes a usable GoHighLevel key.
//
// Two kinds of client exist side by side:
//   - pasted: ghl_token holds a Private Integration token (Willis, Made Better).
//   - linked: ghl_token holds the literal 'app'. The real key is minted from the
//     Marketplace app's agency install on demand and cached in ghl_installs.
//
// The sentinel is stored rather than inferred from ghl_installs so every
// existing "is this client wired" check (tenantHasGhlCreds, isPlaceholder) keeps
// answering correctly without a join: 'app' is not a placeholder.
//
// Anything that reads tenants.ghl_token and hands it to GHL MUST come through
// here. ghlFetch refuses the sentinel, so a caller that forgets fails loudly.
export const APP_LINKED_TOKEN = "app";

type Creds = Pick<TenantRow, "ghl_location_id" | "ghl_token">;
export type Minter = (locationId: string) => Promise<string | null>;

export function isAppLinked(t: { ghl_token?: string | null }): boolean {
  return (t.ghl_token ?? "").trim() === APP_LINKED_TOKEN;
}

export async function resolveTenantGhl(
  tenant: Creds,
  mint: Minter,
): Promise<{ locationId: string; token: string } | null> {
  const creds = resolveGhlCreds(tenant);
  if (!creds) return null;
  if (!isAppLinked(tenant)) return creds;
  const token = await mint(creds.locationId);
  return token ? { locationId: creds.locationId, token } : null;
}

// The production minter. Kept separate so tests never touch ghl_installs.
export function appMinter(client: SupabaseClient, env: Env): Minter {
  return (locationId) => locationToken(client, env, locationId);
}
