import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { ghlFetch, type GhlContext } from "../../../../lib/ghl";
import { isPlaceholder } from "../../../../lib/tenantGhl";
import { appMinter, isAppLinked, resolveTenantGhl } from "../../../../lib/ghlCreds";
import { logAdminAction } from "../../../../lib/adminAuth";
import { ownerLinkValues, provisionOwnerLinks } from "../../../../lib/ghlProvision";
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
} from "../../../../lib/clientAccounts";

// GET  /api/admin/clients/:tenantId/accounts  -> { locationId, checks }
// POST /api/admin/clients/:tenantId/accounts  body { fix: "owner-links" } -> { checks }
//
// Client > Accounts: is everything this client needs connected? Rules live in
// lib/clientAccounts.ts. The GHL reads run together, four calls plus the key
// mint, well inside the Worker's subrequest cap.
//
// Owner only, checked here: setters may read /api/admin/clients/*, and the
// owner-link values compared below are keyed.

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

async function runChecks(env: Env, tenantId: string, origin: string) {
  const client = getServiceClient(env);
  if (!client) return { error: "supabase not configured", status: 503 } as const;

  const [tenantRes, capiRes, ownerRes, pushRes] = await Promise.all([
    client
      .from("tenants")
      .select("ghl_location_id, ghl_token, meta_ad_account_id, meta_page_id, owner_password_hash")
      .eq("id", tenantId)
      .maybeSingle(),
    client.from("client_capi").select("dataset_id, access_token").eq("tenant_id", tenantId).maybeSingle(),
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

  const capi = capiRes.data as { dataset_id?: string; access_token?: string } | null;
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
    capi: { datasetId: !!capi?.dataset_id?.trim(), token: !!capi?.access_token?.trim() },
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

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const r = await runChecks(ctx.env, ctx.params.tenantId as string, new URL(ctx.request.url).origin);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
  return Response.json(r.body, { headers: { "Cache-Control": "no-store" } });
};

// The one fix done on this endpoint: write the owner link (Open Lead) into GHL.
// Every other fix button reuses the endpoint that already owns that setting.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const admin = ctx.data.admin;
  if (admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  let body: { fix?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (body.fix !== "owner-links") return Response.json({ error: "Unknown fix" }, { status: 400 });

  const secret = (ctx.env.SESSION_SECRET ?? "").trim();
  if (!secret) return Response.json({ error: "Links are not set up on the server." }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const origin = new URL(ctx.request.url).origin;
  const before = await runChecks(ctx.env, tenantId, origin);
  if ("error" in before) return Response.json({ error: before.error }, { status: before.status });
  if (!before.gctx) return Response.json({ error: "Link GHL first" }, { status: 409 });

  const items = await provisionOwnerLinks(before.gctx, origin, secret);
  const failed = items.filter((i) => i.outcome.startsWith("failed"));
  const client = getServiceClient(ctx.env);
  if (client) await logAdminAction(client, admin.id, "client.owner_links", tenantId, { items });
  if (failed.length) {
    return Response.json({ error: failed.map((f) => `${f.name}: ${f.outcome}`).join("; ") }, { status: 502 });
  }

  const after = await runChecks(ctx.env, tenantId, origin);
  if ("error" in after) return Response.json({ error: after.error }, { status: after.status });
  return Response.json(after.body);
};
