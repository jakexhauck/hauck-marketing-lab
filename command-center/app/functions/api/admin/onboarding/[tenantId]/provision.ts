import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { loadTenantById } from "../../../../lib/tenantResolve";
import { appMinter, resolveTenantGhl } from "../../../../lib/ghlCreds";
import { writeCustomValues } from "../../../../lib/customValuesProvision";

// POST /api/admin/onboarding/:tenantId/provision
// Writes the client's mapped custom values into their GHL subaccount.
//
// The writing itself lives in lib/customValuesProvision.ts because linking a
// sub-account runs it too, and the two paths must not drift.
export const onRequestPost: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const tenant = await loadTenantById(client, tenantId);
  const creds = tenant ? await resolveTenantGhl(tenant, appMinter(client, ctx.env)) : null;
  if (!creds) {
    return Response.json({ error: "Link this client's sub-account first." }, { status: 400 });
  }

  const result = await writeCustomValues(
    client,
    tenantId,
    creds,
    ctx.data.admin?.id ?? null,
  );
  if (result.preflight) {
    return Response.json(
      { error: result.preflight.error, status: result.preflight.status },
      { status: 400 },
    );
  }

  return Response.json({
    ok: result.ok,
    written: result.written,
    failed: result.failed,
    notFound: result.notFound,
  });
};
