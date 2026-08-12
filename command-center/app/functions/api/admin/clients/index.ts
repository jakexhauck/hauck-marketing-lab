import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { hashPassword } from "../../../lib/password";
import { normalizeEmail } from "../../../lib/staff";
import { logAdminAction } from "../../../lib/adminAuth";
import {
  CreateTenantError,
  createTenantWithOwner,
  seedOnboardingRecord,
} from "../../../lib/clientCreate";
import { provisionClientFolder } from "../../../lib/clientDriveFolder";
import { CHECKLIST_TASKS } from "../../../../src/lib/onboarding";

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
      "id, slug, name, niche, brand_color, brand_initials, app_name, ghl_location_id, meta_ad_account_id, monthly_spend, created_at, health_status, health_note, onboarding_status",
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
    meta_ad_account_id: string | null;
    monthly_spend: number | null;
    created_at: string;
    health_status: "healthy" | "warn" | "paused" | null;
    health_note: string | null;
    onboarding_status: string | null;
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
    // Whether this client's ads are wired at all. Carried on the roster because
    // the Paid Ads page gates its tabs on it: an unlinked client is shown the
    // setup wizard instead of four pages that can only read zero.
    metaAdAccountId: t.meta_ad_account_id ?? null,
    monthlySpend: t.monthly_spend ?? 0,
    memberCount: counts.get(t.id) ?? 0,
    createdAt: t.created_at,
    healthStatus: t.health_status ?? "healthy",
    healthNote: t.health_note ?? null,
    // Onboarding filters its picker on this. A row from before the column
    // existed is a client who has been running for months, so it reads as live.
    onboardingStatus: t.onboarding_status === "setup" ? "setup" : "live",
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
  // Step 3 connections. Each has had a column on tenants for a while; the
  // wizard was the first thing to ask for them at creation.
  websiteUrl?: string;
  metaAdAccountId?: string;
  ga4PropertyId?: string;
  googlePlaceId?: string;
  // The client's own intake answers (wizard steps 4-6): contact and legal,
  // targeting, story. Saved verbatim to onboarding.intake and never pushed to
  // GHL. A few of them seed onboarding.fields on the way past; see
  // onboardingSeed.ts.
  intake?: Record<string, string>;
}

// POST /api/admin/clients  (admin-only) — register a new business by hand.
//
// The manual path, for a client who never filled in the intake funnel. Approving
// a submission (api/admin/intake/[id].ts) is the other one, and both stand the
// client up through the same functions/lib/clientCreate.ts: one place that
// writes a tenant, its entitlements and its owner login. What differs is only
// what this handler does first — validate a plaintext password and hash it —
// and that a hand-made client is live immediately rather than held behind the
// setup screen.
//
// GHL creds are optional at creation; placeholders are stored until connected.
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

  // The tenant, its entitlements and the owner login. Shared with intake
  // approval (functions/lib/clientCreate.ts), which arrives with a password
  // hashed days earlier at funnel step 3 — hence a hash in, never plaintext.
  let created;
  try {
    created = await createTenantWithOwner(client, {
      name,
      niche: body.niche,
      // Raw, not resolved: createTenantWithOwner owns slug uniqueness and
      // derives the subdomain from whatever slug it lands on, so resolving
      // either here would only give it a second chance to disagree with itself.
      slug: body.slug,
      subdomain: body.subdomain,
      brandColor: body.brandColor,
      brandInitials: body.brandInitials,
      appName: body.appName,
      wonLabel: body.wonLabel,
      valueLabel: body.valueLabel,
      ghlLocationId: body.ghlLocationId,
      ghlToken: body.ghlToken,
      monthlySpend: body.monthlySpend,
      websiteUrl: body.websiteUrl,
      metaAdAccountId: body.metaAdAccountId,
      ga4PropertyId: body.ga4PropertyId,
      googlePlaceId: body.googlePlaceId,
      ownerEmail: ownerEmail || undefined,
      ownerName: body.ownerName,
      ownerPasswordHash: ownerPassword ? await hashPassword(ownerPassword) : undefined,
      // Held at the setup screen, exactly like a client who came through the
      // funnel. A client added by hand still has to be stood up: a sub-account,
      // an ads manager, a calendar. Starting them live meant they never appeared
      // on Onboarding at all, so the work was invisible and the app they could
      // already open was wired to nothing. Go Live is what opens it.
      onboardingStatus: "setup",
    });
  } catch (e) {
    if (!(e instanceof CreateTenantError)) throw e;
    return Response.json({ error: e.message }, { status: 500 });
  }

  const { tenantId, slug: createdSlug, ownerWarning } = created;

  // The onboarding record the client's setup page reads. Written even with no
  // intake answers, so the record opens on a real row rather than on "this
  // client has never been onboarded".
  const onboardingWarning = await seedOnboardingRecord(
    client,
    tenantId,
    { ...(body.intake ?? {}), name },
    CHECKLIST_TASKS.map((t) => t.key),
  );

  // Last, and never fatal: the tenant and the owner login are already written,
  // and a folder is the one part of this that can simply be made again.
  const drive = await provisionClientFolder(ctx.env, client, tenantId, name, ctx.data.admin!.id);

  await logAdminAction(client, ctx.data.admin!.id, "client.create", tenantId, {
    slug: createdSlug,
    name,
  });

  return Response.json(
    {
      ok: true,
      id: tenantId,
      // The slug that was actually taken, which is not always the one asked for:
      // a collision appends -2, -3 and so on.
      slug: createdSlug,
      ownerWarning,
      onboardingWarning,
      driveWarning: drive.warning ?? undefined,
      driveFolderUrl: drive.folder?.webViewLink ?? undefined,
    },
    { status: 201 },
  );
};
