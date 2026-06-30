# 04 Website

Routes: `command-center/app/src/routes/website/` — `WebsiteOverview`, `WebsitePages`, `WebsiteRequestChange`, `WebsiteInsights`, `shared.tsx`.
Demo data + components in `shared.tsx` (`BrowserFrame`, `SiteMock`, `DeviceToggle`, `SAMPLE_*`, `SEED_REQUESTS`).

**Area status:** 4 pages, all fully designed, all demo-only. Smallest backend surface of the five areas. The "Request a Change" page is self-contained (Supabase + admin inbox) and the quickest real-data win in the whole section.

**Area-wide dependencies:** F6 (analytics), GHL funnels/sites API (page enumeration), Supabase `website_change_requests`.

**Deferred decision (Phase 6 in the original build):** how to render the real site preview — live `<iframe>` of the GHL site vs a screenshot image. Currently a CSS mock (`SiteMock`). This blocks only the visual preview, not the data.

**Note:** this overlaps the separately-planned "Site Review" feature (pin-notes on screenshots, admin Site Feedback inbox). The Request a Change page below IS that feature, scoped into Marketing. Reconcile the two so they share one table and one admin inbox.

---

## Page: Overview (`/marketing/website`)

**Current:** designed; demo shows a browser preview with floating stat chips, 4 KPI cards (visitors, leads from site, avg time on site, top page), top-pages list, traffic-source breakdown. Real session zeroed.

**Information needed:** visitor count, leads attributed to the site, avg time on site, top page, ranked top pages with views, traffic sources.

**Connections:** F6 analytics (visitors, sources, top pages, time on site); F4 / GHL (leads from site); GHL funnels API (which pages exist + live status).

**APIs / endpoints:** `GET /api/website/analytics` (visitors, sources, top pages, trend); `GET /api/website/pages` (live page list).

**Backend:** `functions/api/website/analytics.ts` + `functions/api/website/pages.ts`; extend `functions/lib/ghl.ts` with funnels/sites enumeration.

**Open questions:** GA4 vs GHL funnel analytics (F6). If sites are GHL-hosted, prefer GHL's own analytics and skip GA4 entirely.

---

## Page: Pages (`/marketing/website/pages`)

**Current:** designed; demo shows a master list of 6 pages (name, path, last updated, views) and a detail preview with a "request a change" button. Real session empty.

**Information needed:** the client's real live pages with URL, last-modified, and view count; a preview per page.

**Connections:** GHL funnels/sites API (page list + URLs + modified date); F6 (per-page views); the preview render decision.

**APIs / endpoints:** `GET /api/website/pages` (shared with Overview).

**Backend:** `functions/api/website/pages.ts`; GHL funnels client.

**Open questions:** per-page view counts depend on the analytics source granularity. Page preview depends on the iframe-vs-screenshot decision.

---

## Page: Request a Change (`/marketing/website/request`) — quickest real win

**Current:** designed and interactive but **not persisted**. Client drops numbered pins on a browser preview, writes a note per pin, requests show in an Open/In Progress/Done rail. Seeded with `SEED_REQUESTS`; everything is React state and is lost on refresh.

**Information needed:** persisted change requests — page, device, pin coordinates (`x_pct`, `y_pct`), note, status, timestamps, optional attachment.

**Connections:** Supabase only for the client side; an admin surface to action them; reuse the existing internal notification path on new request.

**APIs / endpoints:**
- `POST /api/website/requests` (create), `GET /api/website/requests` (list for tenant), `PATCH /api/website/requests/:id` (status; agency only).

**Backend:** `functions/api/website/requests/`; migration for:

```
website_change_requests (
  id pk, tenant_id fk, page text, device text,        -- desktop | mobile
  x_pct float, y_pct float, note text,
  status text,                                          -- open | in_progress | done
  attachment_url text null, created_at, updated_at )
```

Plus an **admin inbox** route to view all clients' requests and flip status, and a notification on new request.

**Open questions:** reconcile with the standalone "Site Review" feature so there is one table and one inbox, not two. Attachment storage (Drive vs Supabase storage) to be chosen.

---

## Page: What's working (`/marketing/website/insights`)

**Current:** designed; demo shows a hero "visitors this month" metric with trend, a 12-month bar chart, traffic sources, top-performing page, and two hardcoded plain-English insight cards.

**Information needed:** visitors this month vs last, 12-month trend, source breakdown, top page by conversion (not just views), data-driven insight text.

**Connections:** F6 analytics (same endpoint as Overview); F4/GHL (leads per page for conversion).

**APIs / endpoints:** reuse `GET /api/website/analytics`; extend with per-page conversion if leads-by-referrer is available.

**Backend:** shared with Overview.

**Open questions:** the two insight cards are static template text. Make them conditional on real data (e.g. show the mobile insight only when mobile share exceeds a threshold). Top page "by conversion" needs leads-per-page, which needs referrer tracking on inbound leads.

---

## Area build order

1. **Request a Change** (Supabase table + 3 endpoints + admin inbox; no external API; ship first, reconcile with Site Review). 2. Decide F6 source (GA4 vs GHL funnels). 3. `GET /api/website/analytics` → **Overview** + **Insights**. 4. GHL funnels enumeration → **Pages**. 5. Resolve the preview render decision (iframe vs screenshot) last.
