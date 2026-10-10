import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { loadTenantById } from "../../../../lib/tenantResolve";
import { mergeTag, ownerLinkValues, type WiringLink } from "../../../../lib/ghlProvision";

// GET /api/admin/clients/:tenantId/wiring
//   -> { links: [{ name, merge, value }] }   or { links: [] } before a sub-account
//
// Client > GHL > Wiring: the four owner links (Call Now, Lead Outcome,
// Estimate Outcome, Phone Appointment Call Now) with this client's key already in them, to paste into the
// matching GHL custom values. Same values Link and Push write
// (lib/ghlProvision.ts), so a pasted one and a pushed one can never differ.
//
// Owner only, checked here: setters may read /api/admin/clients/* for their
// picker, and these links are keyed.

export const onRequestGet: PagesFunction<Env, "tenantId", ApiData> = async (ctx) => {
  if (ctx.data.admin?.role !== "owner") return Response.json({ error: "Forbidden" }, { status: 403 });
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const secret = (ctx.env.SESSION_SECRET ?? "").trim();
  if (!secret) return Response.json({ error: "Links are not set up on the server." }, { status: 503 });

  const tenant = await loadTenantById(client, ctx.params.tenantId as string);
  if (!tenant) return Response.json({ error: "Client not found" }, { status: 404 });

  // "pending" is the placeholder a client carries before its sub-account exists.
  const location = String(tenant.ghl_location_id ?? "").trim();
  if (!/^[A-Za-z0-9]{8,64}$/.test(location)) return Response.json({ links: [] });

  const values = await ownerLinkValues(new URL(ctx.request.url).origin, secret, location);
  const links: WiringLink[] = values.map((v) => ({ ...v, merge: mergeTag(v.name) }));
  return Response.json({ links });
};
