import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { logAdminAction } from "./adminAuth";
import { ghlFetch } from "./ghl";
import { loadAgencyInstall, locationToken } from "./ghlApp";
import { APP_LINKED_TOKEN } from "./ghlCreds";
import { linkBlocker } from "./subaccountLink";
import { provisionLocation, type ProvisionItem } from "./ghlProvision";
import { writeCustomValues, type CustomValuesResult } from "./customValuesProvision";

// Linking a client to their GoHighLevel sub-account through the Marketplace
// app. Lived in api/admin/clients/[tenantId]/subaccount.ts until the Grok
// Software connector needed the same link; one copy, so the Link button and the
// bot cannot link two different ways.
//
// The order matters. Everything that can refuse the link happens BEFORE
// anything is stored, so a failed link leaves the client exactly as it found
// them: the location is checked against the other clients, a key is minted for
// it, and that key is proven with a real read. Only then is the tenant row
// written.
//
// After that, the setup writes the API is actually capable of run in one go,
// because the alternative is a checklist of things somebody has to remember to
// press afterwards.

export interface LinkResult {
  ok: true;
  locationId: string;
  provision: ProvisionItem[];
  customValues: CustomValuesResult;
}

export interface LinkRefused {
  ok: false;
  error: string;
  status: number;
  code?: string;
}

export async function linkSubaccount(
  client: SupabaseClient,
  env: Env,
  tenantId: string,
  locationId: string,
  origin: string,
  adminId: string | null,
): Promise<LinkResult | LinkRefused> {
  const { data: tenants, error } = await client.from("tenants").select("id, name, ghl_location_id");
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!(tenants ?? []).some((t) => t.id === tenantId)) {
    return { ok: false, error: "client not found", status: 404 };
  }

  // One client per sub-account, refused rather than warned about: two tenants
  // holding one location makes every inbound event for it vanish.
  const blocked = linkBlocker(tenantId, locationId, tenants ?? []);
  if (blocked) return { ok: false, error: blocked, status: 409 };

  const token = await locationToken(client, env, locationId);
  if (!token) {
    return { ok: false, error: "The app is not installed on that sub-account yet.", status: 400, code: "not_installed" };
  }
  const gctx = { token, locationId };

  // Prove the key before storing anything. A mint can succeed against a
  // sub-account the app cannot actually read.
  const probe = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}`);
  if (!probe.ok) {
    return { ok: false, error: `GoHighLevel refused the test read (${probe.status}).`, status: 502 };
  }

  const { error: upErr } = await client
    .from("tenants")
    .update({ ghl_location_id: locationId, ghl_token: APP_LINKED_TOKEN })
    .eq("id", tenantId);
  if (upErr) return { ok: false, error: upErr.message, status: 500 };

  // Name the client on the cached install row. Nothing reads it to resolve a
  // key (locationToken keys by location), but an install row with no client on
  // it is unreadable when something has gone wrong.
  const agency = await loadAgencyInstall(client);
  if (agency) {
    await client
      .from("ghl_installs")
      .update({ tenant_id: tenantId })
      .eq("company_id", agency.company_id)
      .eq("location_id", locationId);
  }

  if (adminId) {
    await logAdminAction(client, adminId, "client.subaccount.link", tenantId, { location_id: locationId });
  }

  // Best effort from here: the link itself is saved and the client is connected.
  // A failed setup write shows as an unticked checklist item and is re-runnable
  // from Provision, which is a better outcome than refusing a good link.
  const secret = (env.WEBHOOK_SECRET ?? "").trim();
  const provision = secret
    ? await provisionLocation(gctx, `${origin}/api/webhook?token=${encodeURIComponent(secret)}`, {
        origin,
        secret: (env.SESSION_SECRET ?? "").trim(),
      }).catch(
        (e: unknown) => [
          {
            kind: "custom_value" as const,
            name: "Command Center Webhook URL",
            outcome: `failed: ${(e as Error).message}`,
          },
        ],
      )
    : [];

  const customValues = await writeCustomValues(client, tenantId, gctx, adminId).catch((e: unknown) => ({
    ok: false,
    written: [],
    failed: [{ name: (e as Error).message, status: 0 }],
    notFound: [],
  }));

  return { ok: true, locationId, provision, customValues };
}
