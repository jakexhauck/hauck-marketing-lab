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
   - `PNPM_VERSION` = `9` (plain variable, not a secret)
   - `APP_PASSWORD` = the password you'll type on the login screen
   - `SESSION_SECRET` = any random 32+ char string (used to sign session cookies; rotate to log everyone out)
   - `GHL_LOCATION_ID` = the test sub-account's Location ID (GHL → Settings → Business Profile)
   - `GHL_TOKEN` = the Private Integration token from the test sub-account (GHL → Settings → Integrations → Private Integrations → grant `opportunities.read/write`, `contacts.read/write`, `conversations.read/write`)
5. Save and deploy. First build takes ~2 minutes.

## Verifying after the first deploy

- Open the `*.pages.dev` URL on iPhone Safari. Login screen renders with full branding, no console errors.
- Enter the `APP_PASSWORD` value → tap **Send sign-in link** → land on Dashboard with real leads from the test sub-account.
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
- Auth: shared `APP_PASSWORD`. Successful login sets an HttpOnly session cookie signed with `SESSION_SECRET`; cookie is good for 30 days.
- All `/api/*` calls (except `/api/health`, `/api/webhook`, and the three `/api/auth/*` endpoints) require a valid session cookie. The Worker injects the env-configured GHL location + token into every request — the app is locked to one sub-account by configuration.
- To swap to a different sub-account: update `GHL_LOCATION_ID` and `GHL_TOKEN` in the Pages env vars. To force-logout everyone (e.g., after sharing the password too widely): rotate `SESSION_SECRET`.
- Push-to-`main` triggers an automatic rebuild and deploy. No manual step.
