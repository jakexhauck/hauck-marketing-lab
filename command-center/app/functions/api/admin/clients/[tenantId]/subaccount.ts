import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { ghlFetch } from "../../../../lib/ghl";
import { loadAgencyInstall, locationToken } from "../../../../lib/ghlApp";
import { APP_LINKED_TOKEN } from "../../../../lib/ghlCreds";
import { linkBlocker } from "../../../../lib/subaccountLink";
import { provisionLocation, type ProvisionItem } from "../../../../lib/ghlProvision";
import { writeCustomValues, type CustomValuesResult } from "../../../../lib/customValuesProvision";

// POST /api/admin/clients/:tenantId/subaccount   { locationId }
//
// Client setup's Link button: the moment a client's software account starts
// reading their own GoHighLevel sub-account. Admin only, enforced upstream in
// _middleware.ts.
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
//
// A LIVE client may be re-linked through this same endpoint, deliberately.
// There is no separate unlink: clearing a client back to nothing is the move
// that empties their app, and swapping them to a sub-account that has just
// answered a real read is not. The warning for a live client lives on the
// button (SubaccountCard), where the client's name can be said out loud.

interface LinkResponse {
  ok: true;
  locationId: string;
  provision: ProvisionItem[];
  customValues: CustomValuesResult;
}

export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  let body: { locationId?: unknown } = {};
  try {
    body = (await ctx.request.json()) as { locationId?: unknown };
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const locationId = typeof body.locationId === "string" ? body.locationId.trim() : "";

  const { data: tenants, error } = await client
    .from("tenants")
    .select("id, name, ghl_location_id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!(tenants ?? []).some((t) => t.id === tenantId)) {
    return Response.json({ error: "client not found" }, { status: 404 });
  }

  // One client per sub-account, refused rather than warned about: two tenants
  // holding one location makes every inbound event for it vanish.
  const blocked = linkBlocker(tenantId, locationId, tenants ?? []);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  const token = await locationToken(client, ctx.env, locationId);
  if (!token) {
    return Response.json(
      { error: "The app is not installed on that sub-account yet.", code: "not_installed" },
      { status: 400 },
    );
  }
  const gctx = { token, locationId };

  // Prove the key before storing anything. A mint can succeed against a
  // sub-account the app cannot actually read.
  const probe = await ghlFetch(gctx, `/locations/${encodeURIComponent(locationId)}`);
  if (!probe.ok) {
    return Response.json(
      { error: `GoHighLevel refused the test read (${probe.status}).` },
      { status: 502 },
    );
  }

  const { error: upErr } = await client
    .from("tenants")
    .update({ ghl_location_id: locationId, ghl_token: APP_LINKED_TOKEN })
    .eq("id", tenantId);
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

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

  if (ctx.data.admin) {
    await logAdminAction(client, ctx.data.admin.id, "client.subaccount.link", tenantId, {
      location_id: locationId,
    });
  }

  // Best effort from here: the link itself is saved and the client is connected.
  // A failed setup write shows as an unticked checklist item and is re-runnable
  // from Provision, which is a better outcome than refusing a good link.
  const origin = new URL(ctx.request.url).origin;
  const secret = (ctx.env.WEBHOOK_SECRET ?? "").trim();
  const provision = secret
    ? await provisionLocation(gctx, `${origin}/api/webhook?token=${encodeURIComponent(secret)}`).catch(
        (e: unknown) => [
          {
            kind: "custom_value" as const,
            name: "Command Center Webhook URL",
            outcome: `failed: ${(e as Error).message}`,
          },
        ],
      )
    : [];

  const customValues = await writeCustomValues(
    client,
    tenantId,
    gctx,
    ctx.data.admin?.id ?? null,
  ).catch((e: unknown) => ({
    ok: false,
    written: [],
    failed: [{ name: (e as Error).message, status: 0 }],
    notFound: [],
  }));

  return Response.json({ ok: true, locationId, provision, customValues } satisfies LinkResponse);
};
