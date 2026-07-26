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
