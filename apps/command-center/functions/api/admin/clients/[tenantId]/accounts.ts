import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { provisionOwnerLinks } from "../../../../lib/ghlProvision";
import { runChecks } from "../../../../lib/clientAccountsRun";

// GET  /api/admin/clients/:tenantId/accounts  -> { locationId, checks }
// POST /api/admin/clients/:tenantId/accounts  body { fix: "owner-links" } -> { checks }
//
// Client > Accounts: is everything this client needs connected? Rules live in
// lib/clientAccounts.ts. The GHL reads run together, four calls plus the key
// mint, well inside the Worker's subrequest cap.
//
// Owner only, checked here: setters may read /api/admin/clients/*, and the
// owner-link values compared in lib/clientAccountsRun.ts are keyed.

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = ctx.params.tenantId as string;
  const origin = new URL(ctx.request.url).origin;
  let r = await runChecks(ctx.env, tenantId, origin);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
  // Open Lead heals itself (Jake, 2026-10-14): a red row is written and read
  // again rather than waiting for the Write button, which stays for a failure.
  const secret = (ctx.env.SESSION_SECRET ?? "").trim();
  const links = r.body.checks.find((c) => c.id === "owner-links");
  if (r.gctx && secret && links?.state === "missing") {
    await provisionOwnerLinks(r.gctx, origin, secret);
    const again = await runChecks(ctx.env, tenantId, origin);
    if (!("error" in again)) r = again;
  }
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
