import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { CAPABILITIES } from "../../../lib/permissions";
import { logAdminAction } from "../../../lib/adminAuth";

// GET /api/admin/clients  (admin-only, gated in _middleware.ts)
// Every client in the database, with a light member count. Cross-tenant: this
// is the "all clients" list the tower opens on. ghl_token is never selected.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenantRows, error } = await client
    .from("tenants")
    .select(
      "id, slug, name, niche, brand_color, brand_initials, app_name, ghl_location_id, monthly_spend, created_at",
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
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Find a free slug, appending -2, -3, ... on collision.
async function uniqueSlug(client: SupabaseClient, base: string): Promise<string> {
  const root = base || "client";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { data } = await client
      .from("tenants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Math.floor(Date.now() / 1000)}`;
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

  const niche = (body.niche ?? "general").trim() || "general";
  const slug = await uniqueSlug(client, slugify(body.slug?.trim() || name));
  const brandColor = (body.brandColor ?? "#1d6fb8").trim() || "#1d6fb8";
  const brandInitials =
    (body.brandInitials ?? "").trim().slice(0, 3).toUpperCase() ||
    name.slice(0, 2).toUpperCase();
  const appName = (body.appName ?? name).trim() || name;

  const insert = {
    slug,
    name,
    niche,
    brand_color: brandColor,
    brand_initials: brandInitials,
    app_name: appName,
    won_label: (body.wonLabel ?? "Won").trim() || "Won",
    value_label: (body.valueLabel ?? "Job Value").trim() || "Job Value",
    // tenants.ghl_* are NOT NULL. Store placeholders until the client is wired
    // to GoHighLevel (matches the test-account 'env' convention).
    ghl_location_id: (body.ghlLocationId ?? "").trim() || "pending",
    ghl_token: (body.ghlToken ?? "").trim() || "pending",
    monthly_spend: typeof body.monthlySpend === "number" ? body.monthlySpend : 0,
  };

  const { data: inserted, error } = await client
    .from("tenants")
    .insert(insert)
    .select("id, slug")
    .single();
  if (error || !inserted) {
    return Response.json({ error: error?.message ?? "could not create client" }, { status: 500 });
  }

  const tenantId = (inserted as { id: string }).id;

  // Seed entitlements: every capability the CRM ships today, enabled.
  const seed = CAPABILITIES.map((c) => ({
    tenant_id: tenantId,
    capability: c.key,
    enabled: true,
  }));
  await client.from("tenant_entitlements").upsert(seed, { onConflict: "tenant_id,capability" });

  await logAdminAction(client, ctx.data.admin!.id, "client.create", tenantId, { slug, name });

  return Response.json({ ok: true, id: tenantId, slug }, { status: 201 });
};
