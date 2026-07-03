import type { Env, ApiData } from "../../lib/env";
import { ghlJson, type GhlContext } from "../../lib/ghl";

// Website > Pages. Lists the pages of the client's live site, read from their
// GoHighLevel Sites. A GHL "site" is a funnel with type === "website"; its
// steps are the pages (Home, About, Services, ...), each with a path. We flatten
// those into a simple list; the frontend joins each path onto the tenant's
// website_url to preview and open it.
//
// GET /api/website/pages -> { site: { name, updatedAt } | null, pages: [...] }
//
// A missing funnels scope (or any GHL error) returns an empty, unavailable
// result so the Pages tab shows its not-connected state instead of erroring.

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
  const gctx: GhlContext = {
    token: ctx.data.tenant.ghl_token,
    locationId: ctx.data.tenant.ghl_location_id,
  };

  let data: FunnelListResponse;
  try {
    data = await ghlJson<FunnelListResponse>(
      gctx,
      `/funnels/funnel/list?locationId=${encodeURIComponent(gctx.locationId)}&limit=100`,
    );
  } catch {
    // Scope missing / GHL down: the tab shows its not-connected empty state.
    return Response.json({ site: null, pages: [], unavailable: true });
  }

  // Only the site(s), never the marketing funnels. Willis has exactly one.
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
