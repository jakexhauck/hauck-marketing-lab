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
   - **Build command**: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
   - **Build output directory**: `dist`
   - **Root directory (advanced)**: `client-dashboard`
4. Environment variables (under "Variables and Secrets" → **Production**, mark each as a Secret):
   - `NODE_VERSION` = `20` (plain variable, not a secret)
   - `PNPM_VERSION` = `10` (plain variable, not a secret). The `packageManager` field in `package.json` pins pnpm to 10.18.0 via Corepack regardless, but keep this aligned. Do not use pnpm 9 (cannot read `pnpm-workspace.yaml`, where the webcrypto-web-push patch is registered) or pnpm 11 (requires Node 22+, but the runner is on Node 20 and the build crashes with "No such built-in module: node:sqlite").
   - `APP_PASSWORD` = the password you'll type on the login screen
   - `SESSION_SECRET` = any random 32+ char string (used to sign session cookies; rotate to log everyone out)
   - `GHL_LOCATION_ID` = the live client sub-account's Location ID (GHL → Settings → Business Profile)
   - `GHL_TOKEN` = the Private Integration token from the live client sub-account (GHL → Settings → Integrations → Private Integrations → grant `opportunities.read/write`, `contacts.read/write`, `conversations.read/write`)
5. Second client sub-account (optional). These vars are named `TEST_*` for
   historical reasons only. **They point at Made Better Landscaping Co
   (`r0WfsA12qpBv7M185V3v`), a real client, as of 2026-08-09.** That location was
   the internal test account before then. It is not a staging or snapshot
   account and nothing should be experimented with in it. Add these three as
   Secrets too:
   - `TEST_APP_PASSWORD` = the password typed after tapping "Log into Made Better" on the login screen. Must differ from `APP_PASSWORD`.
   - `TEST_GHL_LOCATION_ID` = that sub-account's Location ID.
   - `TEST_GHL_TOKEN` = the Private Integration token from that sub-account (same scopes as above).
   If these are unset, that login simply returns "test account not configured" and the live login is unaffected.
6. Save and deploy. First build takes ~2 minutes.

## Verifying after the first deploy

- Open the `*.pages.dev` URL on iPhone Safari. Login screen renders with full branding, no console errors.
- Enter the `APP_PASSWORD` value → tap **Send sign-in link** → land on Dashboard with real leads from the live client sub-account.
- Add to Home Screen. Reopen from the home-screen icon — it launches standalone (no Safari chrome).
- Walk the flow: tap a lead → mark Won, enter a value → confirms back to Dashboard.
- Confirm the dev panel (gear icon) is **hidden** on the bare URL.
- Append `?dev=1` to the URL. Reload. Gear icon now appears. From there you can swap mock client, role, theme, and launch the Showroom auto-cycle.

## Optional: custom subdomain

If you want `dash.hauckmarketing.com`:

1. Cloudflare Pages → the project → **Custom domains** → **Set up a custom domain**.
2. Enter `dash.hauckmarketing.com`. Since the apex is on Namecheap, Cloudflare will show a CNAME target — copy it.
3. In Namecheap → **Advanced DNS** → add a CNAME record: Host `dash`, Value `<the CF target>`, TTL Auto.
4. Back in Cloudflare, wait for verification. SSL provisions in 1–5 minutes.

## What's deployed

- Frontend PWA + Cloudflare Pages Functions for the GHL bridge.
- Auth: shared `APP_PASSWORD` (live) plus optional `TEST_APP_PASSWORD` (Made Better). Successful login sets an HttpOnly session cookie signed with `SESSION_SECRET`; the cookie records which mode you logged in as and is good for 30 days.
- All `/api/*` calls (except `/api/health`, `/api/webhook`, and the three `/api/auth/*` endpoints) require a valid session cookie. The Worker injects the GHL location + token for that session's mode into every request — live sessions hit `GHL_*`, Made Better sessions hit `TEST_GHL_*`. The app is locked to those sub-accounts by configuration.
- To swap the live sub-account: update `GHL_LOCATION_ID` and `GHL_TOKEN`. To swap the Made Better sub-account: update `TEST_GHL_LOCATION_ID` and `TEST_GHL_TOKEN`. To force-logout everyone (e.g., after sharing the password too widely): rotate `SESSION_SECRET`.
- Push-to-`main` triggers an automatic rebuild and deploy. No manual step.
