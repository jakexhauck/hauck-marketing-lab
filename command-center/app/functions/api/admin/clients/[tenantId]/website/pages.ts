import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { loadTenantById, resolveGhlCreds } from "../../../../../lib/tenantResolve";
import { ghlJson, type GhlContext } from "../../../../../lib/ghl";

// Admin-tenant mirror of GET /api/website/pages for the Fulfillment cockpit
// (Web Design > Pages). Lists one client's live pages from their GoHighLevel
// Sites: a GHL "site" is a funnel with type === "website"; its steps are the
// pages, each with a path. We flatten those; the panel joins each path onto the
// client's website_url to preview and open it. Auth is enforced upstream
// (admin session only); do not re-check here.
//
// GET /api/admin/clients/:tenantId/website/pages
//   -> { site: { name, updatedAt } | null, pages: [...], unavailable?: true }
//
// A missing funnels scope (or any GHL error) returns an empty, unavailable
// result so the Pages panel shows its not-connected state instead of erroring.

interface FunnelStep {
  id?: string;
  name?: string;
  url?: string;
  sequence?: number;
}

interface Funnel {
  _id?: string;
  name?: string;
  type?: string;
  deleted?: boolean;
  dateUpdated?: string;
  steps?: FunnelStep[];
}

interface FunnelListResponse {
  funnels?: Funnel[];
}

interface WebsitePage {
  id: string;
  name: string;
  path: string;
  sequence: number;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  // Resolve GHL creds the same way the live middleware does for the client path:
  // the tenant's own creds once real, else the GHL_* env fallback. Reading
  // tenant.ghl_token raw would send a placeholder ('env'/'pending') to GHL and
  // 401 for any client not yet fully wired (the Pages "unavailable" bug).
  const creds = resolveGhlCreds(tenant, ctx.env);
  if (!creds) return Response.json({ site: null, pages: [], unavailable: true });

  const gctx: GhlContext = {
    token: creds.token,
    locationId: creds.locationId,
  };

  let data: FunnelListResponse;
  try {
    data = await ghlJson<FunnelListResponse>(
      gctx,
      `/funnels/funnel/list?locationId=${encodeURIComponent(gctx.locationId)}&limit=100`,
    );
  } catch {
    // Scope missing / GHL down: the panel shows its not-connected empty state.
    return Response.json({ site: null, pages: [], unavailable: true });
  }

  const websites = (data.funnels ?? []).filter(
    (f) => f.type === "website" && !f.deleted,
  );

  const pages: WebsitePage[] = [];
  let siteName: string | null = null;
  let updatedAt: string | null = null;

  for (const f of websites) {
    if (siteName === null) {
      siteName = f.name ?? null;
      updatedAt = f.dateUpdated ?? null;
    }
    for (const s of f.steps ?? []) {
      const name = (s.name ?? "").trim();
      const path = (s.url ?? "").trim();
      if (!name || !path) continue;
      pages.push({
        id: s.id ?? `${f._id ?? "site"}:${s.sequence ?? pages.length}`,
        name,
        path: path.startsWith("/") ? path : `/${path}`,
        sequence: typeof s.sequence === "number" ? s.sequence : pages.length + 1,
      });
    }
  }

  pages.sort((a, b) => a.sequence - b.sequence);

  return Response.json({
    site: siteName ? { name: siteName, updatedAt } : null,
    pages,
  });
};
