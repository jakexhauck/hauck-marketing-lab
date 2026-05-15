# Section 10: Deploy to Cloudflare Pages

## Goal

Get the demo live on a public URL that Jake can open on his phone, install as a PWA, and show to friendly clients. Cloudflare Pages free tier, deploys from the GitHub repo on push.

## Depends on

Section 09 (PWA ready). In practice can deploy earlier as a sanity check, but the polished demo goal is after 09.

## Acceptance criteria

- A Cloudflare Pages project is connected to `jakexhauck/hauck-marketing-lab`, build directory `client-dashboard/`, build command `pnpm install --frozen-lockfile && pnpm build`, output directory `dist/`
- A public URL exists (e.g. `hauck-dashboard.pages.dev`) and serves the production build
- Pushing to `main` triggers a redeploy automatically
- Opening the URL on an iPhone in Safari shows the login screen with full branding
- "Add to Home Screen" installs the PWA cleanly
- The dev panel is hidden by default in production, only visible with `?dev=1` query parameter or `localStorage.devMode = '1'`
- The dev-mode "Demo mode, any email signs you in" hint on the login screen stays visible (it's useful when showing the demo to people), or is gated behind the same dev flag
- A custom subdomain is **optional** for Phase 1 (e.g. `dash.hauckmarketing.com`). Set up only if Jake wants it and has the apex domain already.
- The deployed app loads in under 2 seconds on a normal 4G connection (test with Chrome DevTools throttling)
- `pnpm typecheck` and `pnpm build` both run in CI cleanly

## Files created / modified

```
client-dashboard/
  .nvmrc                    (optional, pin Node version for CF Pages)
  package.json              (verify scripts section is CF-ready)
  src/lib/
    devMode.ts              (small helper: returns true if ?dev=1 or localStorage flag)
  src/components/
    DevPanel.tsx            (modified, render only when devMode() is true)
  src/routes/
    Login.tsx               (modified, show dev hint only when devMode() is true)
```

## Steps

1. Add `devMode.ts` helper, reads `URLSearchParams` and `localStorage`. Memoize once at app start.
2. Gate `DevPanel` and the Login-screen dev hint behind `devMode()`.
3. Run `pnpm build` locally one more time. Confirm `dist/` is correct.
4. In Cloudflare dashboard: Pages → Create project → connect GitHub → select `jakexhauck/hauck-marketing-lab`.
5. Build config:
   - **Production branch**: `main`
   - **Build command**: `cd client-dashboard && pnpm install --frozen-lockfile && pnpm build`
   - **Output directory**: `client-dashboard/dist`
   - **Root directory**: leave as repo root (the build command handles the subdir)
   - **Environment variables**: none in Phase 1
6. First deploy. Watch the build log for errors. Most likely issue: pnpm not detected, set `NODE_VERSION=20` and use `npm install -g pnpm` in a build hook, or use the `PNPM_VERSION` env var.
7. Once deployed, open the URL on a real iPhone, walk through the full flow: login → dashboard → tap lead → mark Won → see toast → install as PWA → open from home screen.
8. Optional: add a custom domain. Cloudflare Pages → Custom domains → add `dash.hauckmarketing.com` → follow CNAME instructions.
9. Verify the dev panel does **not** appear on the bare URL, but does appear at `?dev=1`.

## Stop condition

Commit when the public URL serves the app, push-to-deploy works, and the install + click-through flow works on a real phone.

**Commit message:** `client-dashboard: cloudflare pages deploy + dev-mode gating (section 10)`

## Token weight

Light. Mostly configuration done in the Cloudflare UI, not in code. Code changes are 30–50 lines.

## Notes

- Cloudflare Pages free tier limits: 500 builds/month, unlimited bandwidth, unlimited requests. Plenty.
- An alternative is Vercel free tier, same setup pattern, swap UI. Cloudflare is slightly faster at the edge in most geographies and has cleaner monorepo handling, which is why it's the default here.
- Don't hook up any analytics in Phase 1. Adding Plausible / Posthog is a Phase 2 decision when there are actual users.
- After deploy, write the URL into the README of `docs/build-plans/Client Mobile App/README.md` until that folder gets deleted post-ship.
- Final pre-deploy checklist:
  - [ ] No console errors on page load
  - [ ] No console warnings about missing icons or manifest fields
  - [ ] Tap targets all ≥44px (audit with Chrome DevTools)
  - [ ] Lighthouse PWA score ≥90
  - [ ] Lighthouse Performance ≥85
  - [ ] All 3 mock clients demo cleanly with role + brand toggles
  - [ ] Dev panel hidden without `?dev=1`
