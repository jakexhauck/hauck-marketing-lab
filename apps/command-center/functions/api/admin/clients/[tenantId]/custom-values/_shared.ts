import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { appMinter, resolveTenantGhl } from "../../../../../lib/ghlCreds";
import type { GhlContext } from "../../../../../lib/ghl";
import { listValues } from "../../../../../lib/customValuesMirror";

// Owner only, checked here: setters may read /api/admin/clients/* for their
// picker, and custom values hold keyed owner links.
export async function ownerGhl(
  ctx: EventContext<Env, string, ApiData>,
): Promise<GhlContext | Response> {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenant = await loadTenantById(client, ctx.params.tenantId as string);
  if (!tenant) return Response.json({ error: "Client not found" }, { status: 404 });
  const creds = await resolveTenantGhl(tenant, appMinter(client, ctx.env));
  if (!creds) return Response.json({ error: "Link the sub-account first." }, { status: 409 });
  return { token: creds.token, locationId: creds.locationId };
}

// Open Lead is the app's to write. Refuse an edit or delete aimed at it.
export async function refuseAppValue(g: GhlContext, id: string): Promise<Response | null> {
  const target = (await listValues(g)).find((v) => v.id === id);
  if (target?.locked) {
    return Response.json({ error: `${target.name} is written by the app.` }, { status: 409 });
  }
  return null;
}

export function ghlError(err: unknown): Response {
  return Response.json({ error: `GHL said no: ${(err as Error).message}` }, { status: 502 });
}
