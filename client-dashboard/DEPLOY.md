# Deploy — Cloudflare Pages

The app is wired for Cloudflare Pages with no extra config in the repo. The build is reproducible from a fresh clone with `pnpm install && pnpm build` inside `client-dashboard/`.

Public URL goal: `hauck-dashboard.pages.dev` (or pick another name during setup).

## One-time setup in the Cloudflare dashboard

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** tab → **Connect to Git**.
2. Authorize Cloudflare on the GitHub org that owns `jakexhauck/hauck-marketing-lab`, then select the repo.
3. Set up build:
   - **Project name**: `hauck-dashboard` (becomes the `*.pages.dev` subdomain)
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: `cd client-dashboard && corepack enable && pnpm install --frozen-lockfile && pnpm build`
   - **Build output directory**: `client-dashboard/dist`
   - **Root directory (advanced)**: leave blank
4. Environment variables (under "Variables and Secrets"):
   - `NODE_VERSION` = `20`
   - `PNPM_VERSION` = `9`
5. Save and deploy. First build takes ~2 minutes.

## Verifying after the first deploy

- Open the `*.pages.dev` URL on iPhone Safari. Login screen renders with full branding, no console errors.
- Add to Home Screen. Reopen from the home-screen icon — it launches standalone (no Safari chrome).
- Walk the flow: any email → Dashboard → tap a lead → mark Won, enter a value → toast confirms → back to Dashboard.
- Confirm the dev panel (gear icon) is **hidden** on the bare URL.
- Append `?dev=1` to the URL. Reload. Gear icon now appears. From there you can swap client, role, theme, and launch the Showroom auto-cycle.

## Optional: custom subdomain

If you want `dash.hauckmarketing.com`:

1. Cloudflare Pages → the project → **Custom domains** → **Set up a custom domain**.
2. Enter `dash.hauckmarketing.com`. Cloudflare will add the CNAME automatically if the apex domain is on Cloudflare DNS; otherwise it shows the CNAME target to add manually.
3. SSL provisions in 1–5 minutes.

## What's deployed

- Frontend-only PWA. No backend, no DB, no API calls. All data is generated client-side from `src/mock/`.
- Total payload: ~94 KB gzipped JS + ~6 KB gzipped CSS.
- Workbox service worker pre-caches everything, so the second load is offline-capable.
- Push-to-`main` triggers an automatic rebuild and deploy. No manual step.
