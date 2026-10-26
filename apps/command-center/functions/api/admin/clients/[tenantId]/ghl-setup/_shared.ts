import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById } from "../../../../../lib/tenantResolve";
import { appMinter, resolveTenantGhl } from "../../../../../lib/ghlCreds";
import { agencyToken } from "../../../../../lib/ghlApp";
import { ghlJson, type GhlContext } from "../../../../../lib/ghl";
import { ghlErrorText, shapeFields, shapeProfile, shapeUsers, type CustomField, type StaffUser } from "../../../../../lib/ghlSetup";

// Client > GHL setup pages (lib/ghlSetup.ts). Owner only, checked here: these
// write to the client's real sub-account, and setters may read
// /api/admin/clients/* for their picker.

export interface SetupCtx {
  g: GhlContext;
  client: SupabaseClient;
  env: Env;
  tenantId: string;
}

export async function setupCtx(ctx: EventContext<Env, string, ApiData>): Promise<SetupCtx | Response> {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "Client not found" }, { status: 404 });
  const creds = await resolveTenantGhl(tenant, appMinter(client, ctx.env));
  if (!creds) return Response.json({ error: "Link the sub-account first." }, { status: 409 });
  return { g: { token: creds.token, locationId: creds.locationId }, client, env: ctx.env, tenantId };
}

/** The agency (Company) token, for the calls GHL only takes from the agency. */
export async function agencyCtx(s: SetupCtx): Promise<GhlContext & { companyId: string }> {
  const a = await agencyToken(s.client, s.env);
  if (!a) throw new Error("The GHL app is not installed for the agency.");
  return { token: a.token, locationId: s.g.locationId, companyId: a.companyId };
}

/** The sub-account's company id, which GHL wants on profile and user writes. */
export async function companyIdOf(g: GhlContext): Promise<string> {
  const p = shapeProfile(await ghlJson<unknown>(g, `/locations/${encodeURIComponent(g.locationId)}`));
  if (!p.companyId) throw new Error("GHL did not say which agency owns this sub-account.");
  return p.companyId;
}

export function fail(err: unknown): Response {
  return Response.json({ error: ghlErrorText((err as Error).message ?? String(err)) }, { status: 502 });
}

export const loc = (g: GhlContext) => encodeURIComponent(g.locationId);

// Jake's GHL login (his user in every client's sub-account, 2026-10-26).
export const JAKE_GHL_EMAIL = "realjakehauck@gmail.com";

export async function staffOf(s: SetupCtx): Promise<{ users: StaffUser[]; jakeIn: boolean }> {
  const users = shapeUsers(await ghlJson<unknown>(s.g, `/users/?locationId=${loc(s.g)}`));
  return { users, jakeIn: users.some((u) => u.email.toLowerCase() === JAKE_GHL_EMAIL) };
}


export async function fieldsOf(g: GhlContext): Promise<CustomField[]> {
  return shapeFields(await ghlJson<unknown>(g, `/locations/${loc(g)}/customFields`));
}
