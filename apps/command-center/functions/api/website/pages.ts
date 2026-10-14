import type { Env, ApiData } from "../../lib/env";
import { sanitizeWebsitePages, toPageItems } from "../../lib/websitePages";

// Website > Pages. Lists the pages of the client's live site from the manual
// per-client list stored on the tenant row (tenants.website_pages, 0028), which
// the agency edits in the admin Web Design > Pages panel. The frontend joins
// each path onto the tenant's website_url to preview and open it.
//
// GET /api/website/pages -> { site: null, pages: [...], unavailable: false }
//
// No external call, so there is no failure mode: an unconfigured client just has
// an empty list (the tab shows its "add your pages" state). `site` is always null
// now (the "last updated" line came from GHL and simply does not render); the
// field is kept for wire-shape stability with the frontend hook.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const pages = toPageItems(sanitizeWebsitePages(ctx.data.tenant.website_pages));
  return Response.json({ site: null, pages, unavailable: false });
};
