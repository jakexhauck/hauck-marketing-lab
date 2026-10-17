import type { Env } from "./env";
import { getServiceClient } from "./supabase";
import { ghlFetch, type GhlContext } from "./ghl";
import { isPlaceholder } from "./tenantGhl";
import { appMinter, isAppLinked, resolveTenantGhl } from "./ghlCreds";
import { ownerLinkValues } from "./ghlProvision";
import {
  baseChecks,
  blockedGhlChecks,
  calendarsCheck,
  ownerLinksCheck,
  ownerPhoneCheck,
  pipelineCheck,
  sortChecks,
  type AccountCheck,
  type AccountCheckId,
  type AccountFacts,
} from "./clientAccounts";

// Gathering the facts behind Client > Accounts and running its rules
// (lib/clientAccounts.ts). Lived in api/admin/clients/[tenantId]/accounts.ts
// until the Agents startup check (api/agent-runner/snapshot.ts) needed the
// same red count; one copy, so the page and the check cannot disagree.

interface TenantFacts {
  ghl_location_id: string | null;
  ghl_token: string | null;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  owner_password_hash: string | null;
}

async function ghlChecks(gctx: GhlContext, origin: string, secret: string): Promise<AccountCheck[]> {
  const loc = encodeURIComponent(gctx.locationId);
  const read = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await ghlFetch(gctx, path);
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const [pipes, cals, values, users] = await Promise.all([
    read<{ pipelines?: Parameters<typeof pipelineCheck>[0] }>(`/opportunities/pipelines?locationId=${loc}`),
    read<{ calendars?: Parameters<typeof calendarsCheck>[0] }>(`/calendars/?locationId=${loc}`),
    read<{ customValues?: { name: string; value?: string }[] }>(`/locations/${loc}/customValues`),
    read<{ users?: { phone?: unknown }[] }>(`/users/?locationId=${loc}`),
  ]);
  const unknown = (id: AccountCheckId): AccountCheck => ({ id, state: "unknown", detail: "GHL did not answer" });

  const expected = secret ? await ownerLinkValues(origin, secret, gctx.locationId) : null;
  return [
    pipes ? pipelineCheck(pipes.pipelines ?? []) : unknown("pipeline"),
    cals ? calendarsCheck(cals.calendars ?? []) : unknown("calendars"),
    values && expected ? ownerLinksCheck(values.customValues ?? [], expected) : unknown("owner-links"),
    users ? ownerPhoneCheck(users.users ?? []) : unknown("owner-phone"),
  ];
}

export async function runChecks(env: Env, tenantId: string, origin: string) {
  const client = getServiceClient(env);
  if (!client) return { error: "supabase not configured", status: 503 } as const;

  const [tenantRes, ownerRes, pushRes] = await Promise.all([
    client
      .from("tenants")
      .select("ghl_location_id, ghl_token, meta_ad_account_id, meta_page_id, owner_password_hash")
      .eq("id", tenantId)
      .maybeSingle(),
    client
      .from("staff_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .eq("status", "active"),
    client.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);
  if (tenantRes.error) return { error: tenantRes.error.message, status: 500 } as const;
  const t = tenantRes.data as TenantFacts | null;
  if (!t) return { error: "client not found", status: 404 } as const;

  const hasGhl = !isPlaceholder(t.ghl_location_id) && !isPlaceholder(t.ghl_token);

  let gctx: GhlContext | null = null;
  let ghl: AccountFacts["ghl"] = "none";
  if (hasGhl) {
    try {
      const creds = await resolveTenantGhl(
        { ghl_location_id: t.ghl_location_id as string, ghl_token: t.ghl_token as string },
        appMinter(client, env),
      );
      if (creds) {
        const probe = await ghlFetch(creds, `/locations/${encodeURIComponent(creds.locationId)}`);
        if (probe.ok) gctx = creds;
      }
    } catch {
      gctx = null;
    }
    ghl = !gctx ? "dead" : isAppLinked(t) ? "app" : "token";
  }

  const facts: AccountFacts = {
    ghl,
    metaAdAccountId: t.meta_ad_account_id,
    metaPageId: t.meta_page_id,
    hasLogin: (ownerRes.count ?? 0) > 0 || !!t.owner_password_hash,
    pushDevices: pushRes.count ?? 0,
  };

  const secret = (env.SESSION_SECRET ?? "").trim();
  const ghlRows = gctx ? await ghlChecks(gctx, origin, secret) : blockedGhlChecks();
  return {
    gctx,
    body: {
      locationId: hasGhl ? (t.ghl_location_id as string) : null,
      checks: sortChecks([...baseChecks(facts), ...ghlRows]),
    },
  } as const;
}

