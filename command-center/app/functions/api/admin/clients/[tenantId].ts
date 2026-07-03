import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../lib/adminAuth";
import { loadEnabledCapabilities } from "../../../lib/permissions";
import { hashPassword } from "../../../lib/password";
import { normalizeSubdomain } from "../../../lib/tenantResolve";
import type { StaffRole } from "../../../lib/staff";

// Coerce an admin-entered site into a safe absolute http(s) URL, or null if it
// cannot be one. A bare domain (rivertownplumbing.com) gets https://; anything
// whose scheme is not http/https (javascript:, data:, ...) is rejected, since
// the value is rendered in an iframe src and opened via window.open.
function normalizeWebsiteUrl(input: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// GET /api/admin/clients/:tenantId  (admin-only)
// The full picture of one client: business details, the people who own/work it
// (staff accounts with their grants, plus any GHL-identified team members),
// which capabilities are enabled, and recent activity. ghl_token never leaves
// the database.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  // Staff accounts (the employees the owner added) + their grants.
  const { data: staffRows } = await client
    .from("staff_accounts")
    .select("id, name, email, role, status, ghl_user_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  const staff = (staffRows ?? []) as {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    status: string;
    ghl_user_id: string | null;
    created_at: string;
  }[];

  const staffIds = staff.map((s) => s.id);
  const permsByStaff = new Map<string, { capability: string; view: boolean; edit: boolean }[]>();
  if (staffIds.length) {
    const { data: permRows } = await client
      .from("staff_permissions")
      .select("staff_account_id, capability, can_view, can_edit")
      .in("staff_account_id", staffIds);
    for (const row of (permRows ?? []) as {
      staff_account_id: string;
      capability: string;
      can_view: boolean;
      can_edit: boolean;
    }[]) {
      const list = permsByStaff.get(row.staff_account_id) ?? [];
      list.push({ capability: row.capability, view: row.can_view, edit: row.can_edit });
      permsByStaff.set(row.staff_account_id, list);
    }
  }

  // GHL-identified people on the account (tenant_users), informational. The
  // business owner usually appears here as role 'owner'.
  const { data: memberRows } = await client
    .from("tenant_users")
    .select("name, email, role, ghl_user_id")
    .eq("tenant_id", tenantId);
  const members = (memberRows ?? []) as {
    name: string | null;
    email: string | null;
    role: string;
    ghl_user_id: string | null;
  }[];

  const enabled = await loadEnabledCapabilities(client, tenantId);

  // Recent activity for this client.
  const { data: activityRows } = await client
    .from("activity_log")
    .select("id, action, payload, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  const activity = (
    (activityRows ?? []) as {
      id: number;
      action: string;
      payload: { summary?: string } | null;
      created_at: string;
    }[]
  ).map((a) => ({
    id: a.id,
    action: a.action,
    summary: a.payload?.summary ?? null,
    createdAt: a.created_at,
  }));

  return Response.json({
    client: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      niche: tenant.niche,
      brandColor: tenant.brand_color,
      brandInitials: tenant.brand_initials,
      appName: tenant.app_name,
      wonLabel: tenant.won_label,
      valueLabel: tenant.value_label,
      ghlLocationId: tenant.ghl_location_id,
      metaAdAccountId: tenant.meta_ad_account_id ?? null,
      googlePlaceId: tenant.google_place_id ?? null,
      websiteUrl: tenant.website_url ?? null,
      subdomain: tenant.subdomain ?? null,
      ownerPasswordSet: Boolean(tenant.owner_password_hash),
      monthlySpend: tenant.monthly_spend ?? 0,
      createdAt: tenant.created_at,
      healthStatus: tenant.health_status ?? "healthy",
      healthNote: tenant.health_note ?? null,
    },
    entitlements: enabled,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      status: s.status,
      ghlUserId: s.ghl_user_id,
      createdAt: s.created_at,
      permissions: permsByStaff.get(s.id) ?? [],
    })),
    members: members.map((m) => ({
      name: m.name ?? "Unknown",
      email: m.email ?? "",
      role: m.role,
      ghlUserId: m.ghl_user_id,
    })),
    activity,
  });
};

interface PatchBody {
  name?: string;
  niche?: string;
  brandColor?: string;
  brandInitials?: string;
  appName?: string;
  wonLabel?: string;
  valueLabel?: string;
  monthlySpend?: number;
  ghlLocationId?: string;
  ghlToken?: string;
  // The client's Meta ad account (act_...). Empty string clears it (falls back
  // to the env account / not-connected).
  metaAdAccountId?: string;
  // The client's Google Places place_id. Empty string clears it (falls back to
  // the GOOGLE_PLACE_ID env / not-connected).
  googlePlaceId?: string;
  // The client's live website URL (their single GHL Sites-tab site). Empty
  // string clears it (Website page shows not-connected).
  websiteUrl?: string;
  subdomain?: string;
  // New owner login password for this client. Hashed; never read back.
  ownerPassword?: string;
  // Manual per-account health flag surfaced in the Service Delivery roster.
  healthStatus?: "healthy" | "warn" | "paused";
  healthNote?: string;
}

const HEALTH_STATUSES = ["healthy", "warn", "paused"] as const;

// PATCH /api/admin/clients/:tenantId  (admin-only)
// Edit a client's display content / labels / branding / GHL connection. Only the
// supplied fields change. ghl_token is write-only (never read back).
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  if (str(body.name)) update.name = str(body.name);
  if (str(body.niche)) update.niche = str(body.niche);
  if (str(body.brandColor)) update.brand_color = str(body.brandColor);
  if (str(body.brandInitials)) update.brand_initials = str(body.brandInitials)!.slice(0, 3).toUpperCase();
  if (str(body.appName)) update.app_name = str(body.appName);
  if (str(body.wonLabel)) update.won_label = str(body.wonLabel);
  if (str(body.valueLabel)) update.value_label = str(body.valueLabel);
  if (typeof body.monthlySpend === "number") update.monthly_spend = body.monthlySpend;
  if (str(body.ghlLocationId)) update.ghl_location_id = str(body.ghlLocationId);
  if (str(body.ghlToken)) update.ghl_token = str(body.ghlToken);
  // Present-but-empty clears the ad account (back to env fallback / not-connected).
  if (body.metaAdAccountId !== undefined) {
    const v = str(body.metaAdAccountId);
    update.meta_ad_account_id = v ? v : null;
  }
  if (body.googlePlaceId !== undefined) {
    const v = str(body.googlePlaceId);
    update.google_place_id = v ? v : null;
  }
  // Present-but-empty clears the site. A non-empty value must be a real http(s)
  // URL: it is rendered in an iframe src and opened via window.open, so reject
  // anything else (javascript:, data:, garbage) rather than store it.
  if (body.websiteUrl !== undefined) {
    const v = str(body.websiteUrl);
    if (!v) {
      update.website_url = null;
    } else {
      const normalized = normalizeWebsiteUrl(v);
      if (!normalized) {
        return Response.json({ error: "invalid website url" }, { status: 400 });
      }
      update.website_url = normalized;
    }
  }
  if (str(body.subdomain)) update.subdomain = normalizeSubdomain(str(body.subdomain)!);
  if (body.healthStatus !== undefined) {
    if (!HEALTH_STATUSES.includes(body.healthStatus)) {
      return Response.json({ error: "invalid health status" }, { status: 400 });
    }
    update.health_status = body.healthStatus;
  }
  // health_note is nullable and clearable: an empty string wipes the note.
  if (typeof body.healthNote === "string") {
    update.health_note = body.healthNote.trim() || null;
  }
  if (str(body.ownerPassword)) {
    const pw = str(body.ownerPassword)!;
    if (pw.length < 8) {
      return Response.json(
        { error: "owner password must be at least 8 characters" },
        { status: 400 },
      );
    }
    update.owner_password_hash = await hashPassword(pw);
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error } = await client.from("tenants").update(update).eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Audit without leaking secret values.
  const audited = { ...update };
  if ("ghl_token" in audited) audited.ghl_token = "(updated)";
  if ("owner_password_hash" in audited) audited.owner_password_hash = "(updated)";
  await logAdminAction(client, ctx.data.admin!.id, "client.update", tenantId, audited);

  return Response.json({ ok: true });
};
