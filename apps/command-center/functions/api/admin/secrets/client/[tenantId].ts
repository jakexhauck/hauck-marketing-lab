import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import {
  CLIENT_SECRET_COLUMNS,
  validatePatch,
  viewRow,
} from "../../../../../src/lib/clientSecrets";

// /api/admin/secrets/client/:tenantId  (admin-only, gated in _middleware.ts)
//
// Per-client credentials. These are columns on the tenants row, read on every
// request, so a value saved here is live on the next request with no deploy.
// That is the whole reason this half is separate from the Doppler-backed agency
// secrets: Doppler is one config per environment and cannot model "client #5".
//
// Two rules this file exists to enforce:
//   1. A secret value never travels back to the browser. GET returns ids in
//      full and secrets masked to their last four characters.
//   2. Only columns on the allow-list can be written. validatePatch drops
//      anything else, so no request can reach `slug`, `id`, or an entitlement
//      column by way of this endpoint.
//
// Every write is recorded in admin_audit_log with the field NAMES only, never
// the values, because that log is readable in the app.

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data, error } = await client
    .from("tenants")
    .select(["id", "name", "slug", ...CLIENT_SECRET_COLUMNS].join(", "))
    .eq("id", tenantId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "No such client." }, { status: 404 });

  const row = data as unknown as Record<string, unknown>;
  return Response.json(
    {
      tenantId,
      name: (row.name as string) || (row.slug as string) || tenantId,
      slug: (row.slug as string) ?? "",
      fields: viewRow(row),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};

export const onRequestPut: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { ok, patch, errors } = validatePatch(body);
  if (!ok) return Response.json({ error: "Some values need fixing.", errors }, { status: 400 });
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to save." }, { status: 400 });
  }

  const { error } = await client.from("tenants").update(patch).eq("id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Field names only. The audit log is readable inside the app, so putting a
  // value here would defeat the masking on the way in.
  const adminId = ctx.data.admin?.id;
  if (adminId) {
    await logAdminAction(client, adminId, "secrets.client.update", tenantId, {
      fields: Object.keys(patch).sort(),
      cleared: Object.entries(patch)
        .filter(([, v]) => v === "")
        .map(([k]) => k)
        .sort(),
    });
  }

  // Read back so the caller sees the stored, normalised state rather than what
  // it optimistically typed (act_ prefixes added, properties/ stripped).
  const { data } = await client
    .from("tenants")
    .select(CLIENT_SECRET_COLUMNS.join(", "))
    .eq("id", tenantId)
    .maybeSingle();

  return Response.json(
    { saved: Object.keys(patch).sort(), fields: viewRow((data ?? {}) as Record<string, unknown>) },
    { headers: { "Cache-Control": "no-store" } },
  );
};
