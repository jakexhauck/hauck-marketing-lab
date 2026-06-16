# Unified CRM — Manual Actions Checklist (Web CRM)

> This is your side of the build, Sir. I am building the code (workspace, shared core,
> backend auth changes, the `crm-web` app and its UI). The items below are things only you
> can do: account access, DNS, deploys, and a couple of decisions. Work them in any order
> except where a "Blocked by" note says otherwise.
>
> Nothing here blocks me from building. The only items that block the web CRM from working
> **in production** are the deploy (Part B) and the Pages project (Part C). Local development
> needs nothing from you except that the backend dev server is running (Part A).

Legend: ☐ = todo, ✅ = done. Tick them as you go.

---

## Part A — Local development prerequisites (needed to *see* the app while I build)

The web CRM talks to the same `/api/*` backend the mobile app uses. In development that
backend runs locally on **port 8788** (Cloudflare Wrangler), and your secrets are already in
`client-dashboard/.dev.vars`. You likely already do this for the mobile app.

### A1. ☐ Confirm Node + pnpm versions

1. Open Terminal.
2. Run `node -v`. It must print `v20.x` (Node 20). If it prints 22 or 18, install Node 20:
   - If you use `nvm`: `nvm install 20 && nvm use 20`.
   - Otherwise download the Node 20 LTS installer from nodejs.org.
   Reason: the Cloudflare build runner is pinned to Node 20; building on 22 can crash with
   a `node:sqlite` error, and 18 is too old.
3. Run `corepack enable` (this lets the repo's pinned pnpm 10.18.0 activate automatically).
4. Run `pnpm -v`. It should print `10.18.0` (or another 10.x). If it prints 9 or 11, that's
   the wrong major — run `corepack prepare pnpm@10.18.0 --activate` and re-check.

### A2. ☐ Confirm the backend secrets file exists

1. In Terminal: `ls -la client-dashboard/.dev.vars` from the repo root
   (`/Users/jakehauck/Desktop/hauck-marketing-lab`).
2. It should exist (it does as of this writing). It must contain these keys:
   `APP_PASSWORD`, `SESSION_SECRET`, `GHL_LOCATION_ID`, `GHL_TOKEN`, and optionally the three
   `TEST_*` keys. You do **not** need to add anything new — the web CRM reuses these.
3. If the file is ever missing, recreate it with the same keys you set in the Cloudflare Pages
   dashboard for the mobile project (see `client-dashboard/DEPLOY.md`).

### A3. ☐ Be able to start the backend dev server

When you want to view the web CRM with live data locally, the backend must be running.

1. From the repo root, in one Terminal tab:
   ```
   cd client-dashboard
   pnpm install        # first time only
   pnpm build          # produces dist/ so wrangler can serve functions
   npx wrangler pages dev dist --port 8788 --compatibility-flags nodejs_compat
   ```
   Wrangler auto-loads `.dev.vars`. Leave this tab running. (This is the same server your
   mobile app's `pnpm dev` proxies to on 8788 — if you already run the backend a different
   way that listens on 8788, that's fine, keep doing that.)
2. I will give you the one command to start the web CRM itself (a second Terminal tab) once
   its scaffold lands. It will run on **port 5174** and proxy `/api` to 8788, exactly like the
   mobile app does on 5173.

> You do not have to do A3 right now. It's only for when you want to look at the running app.
> I will tell you the exact two-tab command sequence when the app is ready to view.

---

## Part B — Deploy the backend auth change (the ONE coordination point)

**Why this exists:** the web CRM needs the backend to accept the session from a login the same
way the mobile app does. I'm making three small, additive edits to:
`functions/lib/session.ts`, `functions/api/auth/login.ts`, `functions/api/_middleware.ts`.
These are backward-compatible — the mobile app keeps working unchanged. But they only take
effect in production after a deploy, and **your production deploy is "push to `main`," which
also ships everything else currently uncommitted in `client-dashboard/`** (your Part 5 work).

### B1. ☐ Decide what ships with the deploy

You have ~66 uncommitted files in the working tree, most of them the Part 5 mobile work.
Pick one:

- **Option 1 (simplest, recommended once you've reviewed Part 5):** finish reviewing Part 5,
  commit it, let me commit my backend changes on top, then push `main`. One deploy ships
  both. Best if Part 5 is ready.
- **Option 2 (isolate the auth change):** if Part 5 is *not* ready to ship, tell me and I will
  put **only** the three backend auth files on a separate commit so you can deploy just those
  (cherry-pick or a temporary branch). More fiddly; only needed if Part 5 must stay unshipped.

**Action:** reply to me with "Part 5 is ready, ship together" or "isolate the auth change."
This is the only decision I genuinely need from you to finish the production path. I can build
everything else regardless.

### B2. ☐ Push and confirm the deploy

(After B1 is resolved and I've committed the code.)

1. From the repo root: `git push origin main`.
2. Cloudflare → **Workers & Pages** → `hauck-dashboard` → **Deployments**. Watch the new build
   go green (~2 min).
3. Sanity-check it didn't break the mobile app: open the mobile app, log in, confirm leads
   load. (The change is additive, so this should be uneventful.)

### B3. ☐ Verify the new auth path works (optional, 30 seconds)

In Terminal (replace `<password>` with your live `APP_PASSWORD`):
```
curl -s -X POST https://dash.hauckmarketing.com/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"password":"<password>"}'
```
You should see JSON containing `"ok":true` and now also a `"token":"..."` field. That `token`
field is the new additive bit (the desktop app will use it later; the web CRM uses the cookie).
If you see `ok:true`, the backend is ready.

---

## Part C — Create the Cloudflare Pages project for the web CRM (production)

Do this whenever you like; it doesn't block local viewing. The web CRM is a **separate** Pages
project from the mobile app. It has **no backend of its own** — it calls the mobile project's
API at `https://dash.hauckmarketing.com/api/*` (topology "Option A" from the plan).

### C1. ☐ Create the project

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** tab →
   **Connect to Git**.
2. Select the same repo (`jakexhauck/hauck-marketing-lab`). It's already authorized from the
   mobile project.
3. Build settings:
   - **Project name:** `hauck-crm` (this becomes `hauck-crm.pages.dev`).
   - **Production branch:** `main`.
   - **Framework preset:** `None`.
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter crm-web build`
   - **Build output directory:** `crm-web/dist`
   - **Root directory (advanced):** leave **blank / repo root** (not `crm-web`). The build runs
     from the repo root so pnpm can resolve the workspace and the shared `packages/core`.
     *(If the dashboard insists on a root dir, set it to the repo root, i.e. leave it empty.)*

### C2. ☐ Set environment variables (Production)

Under **Settings → Variables and Secrets → Production**:
- `NODE_VERSION` = `20` (plain variable).
- `PNPM_VERSION` = `10` (plain variable).
- `VITE_API_BASE` = `https://dash.hauckmarketing.com` (plain variable). This tells the web CRM
  where the API lives. **No GHL tokens or passwords here** — the web CRM never touches GHL
  directly; it only calls the mobile project's API, which holds the secrets.

> Note: there is intentionally nothing secret in this project. All secrets stay on the
> `hauck-dashboard` project.

### C3. ☐ First deploy

1. Save. Cloudflare runs the first build. It will succeed only after my `crm-web` code is on
   `main` (so do this step after I've pushed, or trigger a redeploy then).
2. When green, open `https://hauck-crm.pages.dev`. You'll get the login screen.

---

## Part D — Custom domain `crm.hauckmarketing.com` (DNS is on Namecheap)

Your apex `hauckmarketing.com` is registered at **Namecheap**, so the DNS record goes there,
exactly like you did for `dash.hauckmarketing.com`.

### D1. ☐ Add the custom domain in Cloudflare

1. Cloudflare → `hauck-crm` Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `crm.hauckmarketing.com`.
3. Cloudflare shows a **CNAME target** (something like `hauck-crm.pages.dev`). Copy it.

### D2. ☐ Add the CNAME at Namecheap

1. Namecheap → **Domain List** → `hauckmarketing.com` → **Manage** → **Advanced DNS**.
2. **Add New Record** → Type **CNAME Record**:
   - **Host:** `crm`
   - **Value:** `<the CF target you copied>`
   - **TTL:** Automatic
3. Save.

### D3. ☐ Wait for verification

1. Back in Cloudflare's Custom domains panel, wait for status **Active** (DNS propagation +
   SSL, usually 1–5 minutes, occasionally longer).
2. Open `https://crm.hauckmarketing.com` — login screen, valid padlock.

### D4. ☐ Tell me the final origin (only if it differs)

The plan assumes the web CRM lives at `crm.hauckmarketing.com` and is already in the backend's
CORS allowlist (I'm adding it). If you choose a different subdomain, tell me the exact hostname
so I add it to `allowedOrigins` in `_middleware.ts`. If you stick with `crm.`, no action.

---

## Part E — Nothing to do, just so you know

- **Password:** the web CRM uses the **same** `APP_PASSWORD` you already use for the mobile app.
  No new password, no new account. (Per-user named logins are a deliberately separate later
  phase.)
- **GHL:** untouched. Same sub-account, same tokens, same data. The web CRM is just another
  window onto it.
- **Desktop app:** deferred per your call. The backend `token` field I'm adding now (Part B)
  is the only groundwork needed so the future Tauri wrap is a thin layer, not a rebuild.

---

## Quick status line for you to fill in

- Part A (local dev ready): ☐
- Part B1 decision (ship Part 5 together / isolate): ☐  ← **the one thing I need from you**
- Part B deploy done: ☐
- Part C Pages project: ☐
- Part D custom domain live: ☐
