import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { loadTenantById } from "../../../../../../lib/tenantResolve";
import { logAdminAction } from "../../../../../../lib/adminAuth";
import { validateCreativeInput, type CreativeStatus } from "../../../../../../lib/adCreatives";

// Ad Library's internal creatives tracker (Fulfillment cockpit > Paid Ads >
// Ad Library, bottom section). Reads/writes public.client_ad_creatives
// (migration 0027), scoped to one tenant. This is an agency-side draft
// tracker only: there is no write to Meta here. Pushing a creative to the
// client's live ad account is split to Phase 2b (see AdLibraryPanel.tsx).
// Auth is enforced upstream in _middleware.ts (admin session only); do not
// re-check.
//
// GET  /api/admin/clients/:tenantId/ads/creatives -> { creatives: AdCreative[], unavailable?: true }
// POST /api/admin/clients/:tenantId/ads/creatives -> 201 { creative: AdCreative }

interface CreativeRow {
  id: string;
  tenant_id: string;
  media_ref: string | null;
  headline: string | null;
  primary_text: string | null;
  status: CreativeStatus;
  created_by: string | null;
  created_at: string;
}

export interface AdCreative {
  id: string;
  mediaRef: string | null;
  headline: string;
  primaryText: string;
  status: CreativeStatus;
  createdBy: string | null;
  createdAt: string;
}

function shape(row: CreativeRow): AdCreative {
  return {
    id: row.id,
    mediaRef: row.media_ref,
    headline: row.headline ?? "",
    primaryText: row.primary_text ?? "",
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  const { data, error } = await client
    .from("client_ad_creatives")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    // The 0027 migration may not be applied yet in every environment; degrade
    // to an honest "unavailable" (mirrors website/requests.ts) rather than a
    // 500 so the panel can still render the real Meta media gallery above it.
    return Response.json({ creatives: [], unavailable: true });
  }

  return Response.json({ creatives: ((data ?? []) as CreativeRow[]).map(shape) });
};

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const validation = validateCreativeInput(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const { mediaRef, headline, primaryText, status } = validation.value;

  const adminId = ctx.data.admin?.id;
  const { data: inserted, error } = await client
    .from("client_ad_creatives")
    .insert({
      tenant_id: tenantId,
      media_ref: mediaRef ?? null,
      headline,
      primary_text: primaryText,
      status,
      created_by: adminId ? `admin:${adminId}` : null,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return Response.json({ error: error?.message ?? "could not create creative" }, { status: 500 });
  }

  if (adminId) {
    await logAdminAction(client, adminId, "ads.creative.create", tenantId, {
      creativeId: (inserted as CreativeRow).id,
      status,
    });
  }

  return Response.json({ creative: shape(inserted as CreativeRow) }, { status: 201 });
};
