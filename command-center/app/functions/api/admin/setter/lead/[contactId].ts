import type { Env, ApiData } from "../../../../lib/env";
import { ghlJson } from "../../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import { getServiceClient } from "../../../../lib/supabase";
import { DIAL_SELECT, shapeDialRow, type ApiDialRow, type RawDialRow } from "../dials";

// GET /api/admin/setter/lead/:contactId?tenantId= (admin-only, gated in
// _middleware.ts). The cockpit's single-lead panel: one contact's live CRM
// details plus its full dial history from setter_dials, newest first.
//
// Unlike the board list (functions/api/admin/setter/leads.ts), which
// deliberately omits tags to avoid an N+1 contact fetch across a whole
// column, this is exactly one contact, so fetching its tags here costs
// nothing extra: one /contacts/{id} call already returns them.

interface GhlContactResponse {
  contact: {
    id: string;
    contactName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    tags?: string[];
  };
}

export interface ApiSetterLeadDetail {
  contactId: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  dials: ApiDialRow[];
}

export const onRequestGet: PagesFunction<Env, "contactId", ApiData> = async (ctx) => {
  const tenantId = new URL(ctx.request.url).searchParams.get("tenantId");
  const contactId = ctx.params.contactId as string;
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const data = await ghlJson<GhlContactResponse>(
      gctx,
      `/contacts/${encodeURIComponent(contactId)}`,
    );
    const c = data.contact;
    const name =
      c.contactName ||
      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
      "Unknown";

    let dials: ApiDialRow[] = [];
    const client = getServiceClient(ctx.env);
    if (client) {
      const { data: rows, error } = await client
        .from("setter_dials")
        .select(DIAL_SELECT)
        .eq("tenant_id", tenantId)
        .eq("contact_id", contactId)
        .order("dialed_at", { ascending: false });
      if (error) return Response.json({ error: "dials_lookup_failed" }, { status: 500 });
      dials = ((rows ?? []) as unknown as RawDialRow[]).map(shapeDialRow);
    }

    const lead: ApiSetterLeadDetail = {
      contactId,
      name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      tags: c.tags ?? [],
      dials,
    };

    return Response.json({ lead });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
