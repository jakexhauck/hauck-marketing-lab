// Standing up a client: the tenant row, every entitlement, and the owner login.
//
// Extracted from POST /api/admin/clients because it now has two callers with
// different starting points. The admin endpoint takes a plaintext password and
// hashes it. Intake approval cannot: the client chose their password days
// earlier at funnel step 3 and it was hashed on arrival, so by approve time only
// the hash exists. Both callers hand this function an ALREADY-HASHED password,
// which is the only shape that serves both.
//
// See docs/build-plans/client-onboarding-full.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CAPABILITIES } from "./permissions";
import { normalizeSubdomain } from "./tenantResolve";
import { seedOnboardingFields } from "./onboardingSeed";

export interface CreateTenantInput {
  name: string;
  niche?: string;
  slug?: string;
  brandColor?: string;
  brandInitials?: string;
  appName?: string;
  wonLabel?: string;
  valueLabel?: string;
  ghlLocationId?: string;
  ghlToken?: string;
  subdomain?: string;
  monthlySpend?: number;
  // Connections with a column of their own. All optional, all blank until the
  // client is wired up; the funnel never asks for any of them.
  websiteUrl?: string;
  metaAdAccountId?: string;
  ga4PropertyId?: string;
  googlePlaceId?: string;
  /** Normalized and validated by the caller. Omit both to add the owner later. */
  ownerEmail?: string;
  ownerName?: string;
  /** Already hashed. Plaintext never reaches this function. */
  ownerPasswordHash?: string;
  /** 'setup' holds the client behind the holding screen until Go Live. */
  onboardingStatus?: "setup" | "live";
}

export interface CreateTenantResult {
  tenantId: string;
  slug: string;
  /** The tenant was created but the owner login was not. Surfaced, never swallowed. */
  ownerWarning?: string;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Find a free slug, appending -2, -3, ... on collision.
export async function uniqueSlug(client: SupabaseClient, base: string): Promise<string> {
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

export class CreateTenantError extends Error {}

export async function createTenantWithOwner(
  client: SupabaseClient,
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const name = input.name.trim();
  const niche = (input.niche ?? "general").trim() || "general";
  const slug = await uniqueSlug(client, slugify(input.slug?.trim() || name));
  const brandInitials =
    (input.brandInitials ?? "").trim().slice(0, 3).toUpperCase() || name.slice(0, 2).toUpperCase();

  const insert = {
    slug,
    name,
    niche,
    brand_color: (input.brandColor ?? "#1d6fb8").trim() || "#1d6fb8",
    brand_initials: brandInitials,
    app_name: (input.appName ?? name).trim() || name,
    won_label: (input.wonLabel ?? "Won").trim() || "Won",
    value_label: (input.valueLabel ?? "Job Value").trim() || "Job Value",
    // tenants.ghl_* are NOT NULL. Store placeholders until the client is wired
    // to GoHighLevel (matches the test-account 'env' convention).
    ghl_location_id: (input.ghlLocationId ?? "").trim() || "pending",
    ghl_token: (input.ghlToken ?? "").trim() || "pending",
    subdomain: normalizeSubdomain(input.subdomain?.trim() || slug),
    owner_password_hash: input.ownerPasswordHash ?? null,
    monthly_spend: typeof input.monthlySpend === "number" ? input.monthlySpend : 0,
    onboarding_status: input.onboardingStatus ?? "live",
    // Null rather than "": these columns are read as "is it connected yet", and
    // an empty string is a value that answers yes.
    website_url: (input.websiteUrl ?? "").trim() || null,
    meta_ad_account_id: (input.metaAdAccountId ?? "").trim() || null,
    ga4_property_id: (input.ga4PropertyId ?? "").trim() || null,
    google_place_id: (input.googlePlaceId ?? "").trim() || null,
  };

  const { data: inserted, error } = await client
    .from("tenants")
    .insert(insert)
    .select("id, slug")
    .single();
  if (error || !inserted) {
    throw new CreateTenantError(error?.message ?? "could not create client");
  }

  const tenantId = (inserted as { id: string }).id;

  // Seed entitlements: every capability the CRM ships today, enabled.
  const seed = CAPABILITIES.map((c) => ({
    tenant_id: tenantId,
    capability: c.key,
    enabled: true,
  }));
  await client.from("tenant_entitlements").upsert(seed, { onConflict: "tenant_id,capability" });

  // Create the owner login (role 'owner') so the client can sign in immediately.
  // Owners bypass per-surface permission checks, so no grants are seeded. A
  // duplicate email (blocked by the global-unique index) leaves the tenant
  // created but reports the owner-account failure so the admin can fix it.
  let ownerWarning: string | undefined;
  if (input.ownerEmail && input.ownerPasswordHash) {
    const { error: ownerErr } = await client.from("staff_accounts").insert({
      tenant_id: tenantId,
      ghl_user_id: null,
      email: input.ownerEmail,
      name: (input.ownerName ?? "").trim() || `${name} (Owner)`,
      role: "owner",
      status: "active",
      password_hash: input.ownerPasswordHash,
    });
    if (ownerErr) ownerWarning = ownerErr.message;
  }

  return { tenantId, slug, ownerWarning };
}

/**
 * The onboarding record a brand-new client starts from.
 *
 * Two columns, two different things, and conflating them is the mistake this
 * function exists to prevent. `intake` is what the CLIENT said, verbatim and
 * never pushed anywhere. `fields` is what we PUSH into their GHL sub-account,
 * keyed by the provisioning map in src/lib/onboarding.ts. A handful of answers
 * are the same fact under two names (their phone is also where alerts go), so
 * the seed copies those across and leaves the rest for Jake.
 *
 * The checklist rows are written up front rather than materialised on first
 * click, so the record opens on a real list and the board can count progress
 * without inventing rows it has never seen.
 *
 * Non-fatal by design: this runs after the tenant and the owner login exist, and
 * a failure here is a record to repair rather than a client to un-create. The
 * caller reports the returned warning.
 */
export async function seedOnboardingRecord(
  client: SupabaseClient,
  tenantId: string,
  intake: Record<string, unknown>,
  checklistKeys: string[],
): Promise<string | undefined> {
  const now = new Date().toISOString();

  const { error } = await client.from("onboarding").upsert(
    {
      tenant_id: tenantId,
      fields: seedOnboardingFields(intake),
      intake,
      status: "draft",
      updated_at: now,
    },
    { onConflict: "tenant_id" },
  );
  if (error) return `The onboarding record could not be written: ${error.message}`;

  if (checklistKeys.length > 0) {
    const { error: listErr } = await client.from("onboarding_checklist").upsert(
      checklistKeys.map((key) => ({ tenant_id: tenantId, task_key: key, done: false })),
      { onConflict: "tenant_id,task_key" },
    );
    if (listErr) return `The setup checklist could not be seeded: ${listErr.message}`;
  }

  return undefined;
}
