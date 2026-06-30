# Build Plan: Website section (client self-serve)

Status: planned
Chosen design direction: **Storefront** (variant 2). Mockup: `command-center/app/mockups/website/variant-2-storefront.html`.

## What we are building

A new **Website** section inside the client dashboard's Marketing menu, structured exactly like the existing **Social Media** section: one parent item that expands into a dropdown of sub-pages. It lets a local-business client see their own website working and request changes by clicking directly on it.

The client's own website (the funnels and landing pages we build for their campaigns) is the hero of every screen, shown in a realistic browser frame.

### The four pages

| Page | Route | What it does |
|------|-------|--------------|
| **Overview** | `/marketing/website` | Glance hub. A large live preview of their site as the hero (with a LIVE badge and floating stat chips), then KPI cards (visitors, leads from the site, avg time, top page), top pages, and where visitors come from. |
| **Pages** | `/marketing/website/pages` | Master-detail. A list of their site's pages on the left, a large preview of the selected page on the right with its stats and a "Request a change to this page" action. |
| **Request a Change** | `/marketing/website/request` | The signature feature. The site fills a large canvas; the client clicks any spot, a pin drops, and they type what they want changed. Pins and requests persist and reach us. |
| **What's working** | `/marketing/website/insights` | Plain-English performance: visitors trend, traffic sources, top-performing page, and a couple of insight cards. |

We drop the earlier "Leads from Site" idea (Jake's call): website inquiries stay owned by **Sales > New Inquiries**.

## How it mirrors Social (the template we are copying)

Social lives in `src/routes/social/` with one shared file plus one file per page, wired into `src/App.tsx` and `src/lib/nav.ts`. We copy that shape under `src/routes/website/`.

The Social golden rule applies here too: **a real (connected) client never sees fabricated content.** Pages render their full, populated layout only in demo/preview mode (`?demo=1` via `demoMode()`); a real session shows the zeroed/empty state plus a "Not connected yet" notice until the site and analytics are linked. (See `src/routes/social/shared.tsx`.)

## Phase 0 - Nav + routes scaffolding

**`src/lib/nav.ts`** (Marketing section, the existing Website item at line ~98):
- Remove `comingSoon: true`.
- Convert it to a parent with `children`, mirroring Social:
  ```ts
  {
    to: "/marketing/website",
    label: "Website",
    icon: Globe,
    children: [
      { to: "/marketing/website", label: "Overview", icon: LayoutDashboard },
      { to: "/marketing/website/pages", label: "Pages", icon: LayoutGrid },
      { to: "/marketing/website/request", label: "Request a Change", shortLabel: "Requests", icon: MousePointerClick },
      { to: "/marketing/website/insights", label: "What's working", shortLabel: "Insights", icon: BarChart3 },
    ],
  }
  ```
- Add any missing icon imports (`MousePointerClick`, etc.). The expandable parent/children sidebar rendering already exists (built for Social); no Sidebar component change needed.

**`src/App.tsx`**:
- Replace the single `/marketing/website` ComingSoon route (line ~326) with four routes, each `<ProtectedRoute>`-wrapped, mirroring the Social block (lines 327-331).
- Add imports for the four new page components.

**Stubs first:** create the four page files rendering a shared "coming soon" body so nav + routing can be verified before the real UI lands (same approach Social used for Calendar/Posts/Insights via a stub). Then fill them in, in the phases below.

## Phase 1 - Shared kit: `src/routes/website/shared.tsx`

The Storefront direction reuses one browser-preview component everywhere, so it goes in shared:

- **`BrowserFrame`** - rounded window: top bar with traffic-light dots and a locked address bar showing the client's domain, body slot for the preview. A `device` prop (`"desktop" | "mobile"`) swaps to a narrow phone shape.
- **`SiteMock`** - the rendered homepage used in the mockup (hero, sticky nav, 3 service cards, footer). **For the real build this is replaced by the actual site** (see Phase 6 - how we render the real site is the one open decision).
- **`DeviceToggle`** - the Desktop/Mobile segmented control.
- **`NotConnectedNotice`** - the website equivalent of Social's banner ("To see real visitor numbers and your live pages, we still need to connect your site and analytics").
- **`WEBSITE_CONTAINER`** - the shared scroll container (copy `SOCIAL_CONTAINER`, wider max-width to suit the larger previews).
- Demo data tables (KPIs, top pages, sources, pages list, seed change requests) with empty/zeroed variants, same pattern as Social's `SAMPLE_*` / `EMPTY_*`.

Reuse existing primitives throughout: `Shell`, `PageHeader`, `Panel`, `PanelHeader`, `Badge`, `Button`, `EmptyState`, `Segmented`, `demoMode()`.

## Phase 2 - Overview (`WebsiteOverview.tsx`)

- `PageHeader` "Website" + subtitle, actions: "View live site" (primary) and "Request a change".
- Storefront hero: a large `BrowserFrame` of the homepage with a LIVE badge (pulsing dot) and floating glass stat chips, plus the device toggle.
- KPI row (4 `Panel` cards): Visitors this month, Leads from your site, Avg time on page, Top page.
- Top pages list + "Where visitors come from" bars.
- Real session: zeroed KPIs, empty preview placeholder, `NotConnectedNotice`.

## Phase 3 - Pages (`WebsitePages.tsx`)

- `PageHeader` "Pages".
- Master-detail: selectable page rows (Home, Services, About, Reviews, Contact, Book Now) on the left; large `BrowserFrame` preview of the selected page on the right with last-updated, views, and a "Request a change to this page" button that deep-links into Request a Change.
- Real session: list of the client's actual pages once connected; empty state otherwise.

## Phase 4 - Request a Change (`WebsiteRequestChange.tsx`) - the real feature

This is the only page with genuinely new behaviour, not just a styled view.

- Large canvas (`BrowserFrame` + device toggle) as the click target; a requests rail/panel beside it.
- Click on the canvas drops a numbered pin at the click point and opens a composer ("What would you like changed here?" + Send). On send, the request is saved and appears in the rail with status Open. Clicking a request highlights its pin.
- **Coordinate model:** store pin position as **percentages** of the preview width/height (not raw pixels) plus the page URL and the device mode, so a pin lands in the right place at any screen size.
- **Persistence (real build):** a tenant-scoped Supabase table, e.g. `website_change_requests` (id, tenant, page_url, device, x_pct, y_pct, note, status, created_at, updated_at). Status enum: `open | in_progress | done`.
- **Reaches us:** surface these on the agency/admin side so we see and action them (and can flip status, which the client sees reflected). Internal notification on new request (reuse the existing internal-notification path). This is separate from Sales > New Inquiries.
- Demo mode seeds 2-3 pre-placed pins so the populated state shows without a backend.

## Phase 5 - What's working (`WebsiteInsights.tsx`)

- Bold hero number (visitors this month) + small vs-last-month pill + CSS bar trend.
- Traffic sources as labeled bars; top-performing page callout; 2 plain-English insight cards.
- Real session: zeroed + not-connected.

## Phase 6 - Real data wiring (deferred, like Social's "wrap GHL next")

Three real sources to connect, each can land after the UI ships on demo data:

1. **Visitor analytics** (visitors, sources, time on page, per-page views). Likely GA4 or the site platform's analytics. Decide the source and a small fetch layer.
2. **The live site + its pages list.** Since these are sites we build (GHL funnels/landing pages), we likely control the domain and can enumerate pages.
3. **Change-request store** (Phase 4 table) + the agency-side surface.

### Open decision (needs Jake): how do we render the real site for click-to-pin?

The mockup uses a hand-built homepage. For the real build, two viable approaches:

- **A. Live embed (iframe).** Interactive and always current, but: many sites block embedding (X-Frame-Options / CSP), and we can only capture *where* they clicked, not which element. Works cleanly **only because we build/host these sites**, so we can allow our own pages to embed. Best if every client site is one we control.
- **B. Screenshot annotation (recommended default).** We render a server-side screenshot of each page and let the client pin on the image. Works on **any** site regardless of embedding rules, pins are rock-solid, and it is what proven markup tools (Markup.io, BugHerd, Pastel) do. Trade-off: the image is a snapshot, refreshed on a schedule or on demand, not live.

Recommendation: **B (screenshots) as the default**, with **A (live embed) where the page is one we host** and embedding is allowed. Either way the pin/coordinate model in Phase 4 is the same.

## Verify + ship

- Per page: nav expands and lands correctly, in-page state works, demo vs real session both render, no em dashes in UI text, light/dark both clean.
- Request a Change: pin drops at the click point, composer saves, status round-trips once the table is wired.
- Playwright screenshots of the real running app for each page (M9).
- Ship: push to main, watch the CF Pages deploy, smoke-test the live URL.

## Out of scope (for now)

- Building/redesigning the client's actual website (that is Service Delivery's Website lane).
- Leads from the site (owned by Sales > New Inquiries).
- SEO / Google ranking page (could be a future fifth sub-page if wanted).
