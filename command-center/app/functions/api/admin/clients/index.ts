import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { hashPassword } from "../../../lib/password";
import { normalizeEmail } from "../../../lib/staff";
import { logAdminAction } from "../../../lib/adminAuth";
import { CreateTenantError, createTenantWithOwner } from "../../../lib/clientCreate";

// GET /api/admin/clients  (admin-only, gated in _middleware.ts)
// Every client in the database, with a light member count. Cross-tenant: this
// is the "all clients" list the tower opens on. ghl_token is never selected.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  // health_status / health_note are from migration 0022 (admin roster rail).
  // Until that migration is applied to the live DB, this select 500s; the
  // whole branch deploys after a human runs it, so that failure is expected
  // in the interim rather than a bug in this endpoint.
  const { data: tenantRows, error } = await client
    .from("tenants")
    .select(
      "id, slug, name, niche, brand_color, brand_initials, app_name, ghl_location_id, monthly_spend, created_at, health_status, health_note",
    )
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tenants = (tenantRows ?? []) as {
    id: string;
    slug: string;
    name: string;
    niche: string;
    brand_color: string;
    brand_initials: string;
    app_name: string;
    ghl_location_id: string;
    monthly_spend: number | null;
    created_at: string;
    health_status: "healthy" | "warn" | "paused" | null;
    health_note: string | null;
  }[];

  // Active-staff count per tenant in one pass (small scale; no group-by RPC).
  const counts = new Map<string, number>();
  const { data: staffRows } = await client
    .from("staff_accounts")
    .select("tenant_id, status");
  for (const row of (staffRows ?? []) as { tenant_id: string; status: string }[]) {
    if (row.status !== "active") continue;
    counts.set(row.tenant_id, (counts.get(row.tenant_id) ?? 0) + 1);
  }

  const clients = tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    niche: t.niche,
    brandColor: t.brand_color,
    brandInitials: t.brand_initials,
    appName: t.app_name,
    ghlLocationId: t.ghl_location_id,
    monthlySpend: t.monthly_spend ?? 0,
    memberCount: counts.get(t.id) ?? 0,
    createdAt: t.created_at,
    healthStatus: t.health_status ?? "healthy",
    healthNote: t.health_note ?? null,
  }));

  return Response.json({ clients, total: clients.length });
};

interface CreateBody {
  name?: string;
  niche?: string;
  slug?: string;
  brandColor?: string;
  brandInitials?: string;
  appName?: string;
  wonLabel?: string;
  valueLabel?: string;
  ghlLocationId?: string;
  ghlToken?: string;
  monthlySpend?: number;
  // Subdomain that routes to this client (e.g. 'williswindows'). Defaults to the
  // slug when omitted. Legacy: no longer used for routing now that the login
  // email identifies the client, but kept so existing tooling does not break.
  subdomain?: string;
  // The owner's login. The owner is created as a staff_accounts row with role
  // 'owner' (this is how they sign in: email + password identify the client).
  // Both are needed to create the account; omit both to add the owner later.
  // ownerPassword is also stored on the tenant as the legacy shared-password
  // fallback. Hashed here, never stored or returned in plaintext.
  ownerEmail?: string;
  ownerName?: string;
  ownerPassword?: string;
}

// POST /api/admin/clients  (admin-only) — register a new business.
// Seeds the tenant row plus all current capabilities enabled (Layer 2), so the
// new client immediately works the way an existing one does. GHL creds are
// optional at creation; placeholders are stored until the client is connected.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const ownerEmail = normalizeEmail(body.ownerEmail ?? "");
  const ownerPassword = (body.ownerPassword ?? "").trim();
  // Owner email + password come as a pair: one without the other can't make a
  // working login.
  if ((ownerEmail || ownerPassword) && !(ownerEmail && ownerPassword)) {
    return Response.json(
      { error: "owner email and password must be provided together" },
      { status: 400 },
    );
  }
  if (ownerEmail && !ownerEmail.includes("@")) {
    return Response.json({ error: "a valid owner email is required" }, { status: 400 });
  }
  if (ownerPassword && ownerPassword.length < 8) {
    return Response.json(
      { error: "owner password must be at least 8 characters" },
      { status: 400 },
    );
  }

  // Validation lives here (it speaks HTTP); the creation itself is shared with
  // intake approval, which arrives with an already-hashed password.
  let result;
  try {
    result = await createTenantWithOwner(client, {
      name,
      niche: body.niche,
      slug: body.slug,
      brandColor: body.brandColor,
      brandInitials: body.brandInitials,
      appName: body.appName,
      wonLabel: body.wonLabel,
      valueLabel: body.valueLabel,
      ghlLocationId: body.ghlLocationId,
      ghlToken: body.ghlToken,
      subdomain: body.subdomain,
      monthlySpend: body.monthlySpend,
      ownerEmail: ownerEmail || undefined,
      ownerName: body.ownerName,
      ownerPasswordHash: ownerPassword ? await hashPassword(ownerPassword) : undefined,
    });
  } catch (e) {
    if (!(e instanceof CreateTenantError)) throw e;
    return Response.json({ error: e.message }, { status: 500 });
  }

  await logAdminAction(client, ctx.data.admin!.id, "client.create", result.tenantId, {
    slug: result.slug,
    name,
  });

  return Response.json(
    { ok: true, id: result.tenantId, slug: result.slug, ownerWarning: result.ownerWarning },
    { status: 201 },
  );
};
