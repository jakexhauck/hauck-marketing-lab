# Section 01: Provision external services

## Goal

Stand up the three external accounts/projects this build depends on, generate the credentials we'll need, and add the DNS record for `dash.hauckmarketing.com`. End state: a `.env.local` file and a couple of Cloudflare dashboard tabs ready, so sections 02 and 03 can start immediately.

Estimated time: 45–60 minutes if no MFA prompts, 75 if anything sends a verification email.

## Pre-flight (Jake confirms)

- [ ] Logged into the GHL agency account that owns the Willis Windows sub-account.
- [ ] Have a Cloudflare account (any tier; we use only free features today).
- [ ] Have Namecheap dashboard access for `hauckmarketing.com`.
- [ ] Have a Supabase account (sign up at supabase.com with GitHub if not).
- [ ] Node 20 + pnpm installed locally (already true — `client-dashboard/.nvmrc` pins it).

## Step 1: Supabase project (10 min)

1. supabase.com → **New project**.
2. Name: `hauck-dashboard`. Region: closest to you (likely `us-east-1` or `us-west-2`). Database password: generate, save to a password manager.
3. Wait ~2 min for provisioning.
4. Once it's up, go to **Project Settings → API**. Copy these into a safe note for now (I'll wire them into the app in section 02):
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon public key**
   - **service_role key** (treat like a password — server-only)
5. Go to **Authentication → Providers**, confirm **Email** is on, **Confirm email** is OFF (magic-link doesn't need email confirmation). Save.
6. Go to **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5173`
   - Redirect URLs: add `http://localhost:5173/**` and `https://dash.hauckmarketing.com/**`
   - Save.

## Step 2: GHL Private Integrations token (10 min)

1. In the GHL agency dashboard, switch to the **Willis Windows** sub-account.
2. Sub-Account Settings → **Private Integrations** (under Business Profile area, sometimes labeled "Integrations" or under the gear menu).
3. **Create New Integration**.
4. Name: `Hauck Dashboard`.
5. **Scopes** — check all of these (we need them all today):
   - `contacts.readonly` and `contacts.write`
   - `opportunities.readonly` and `opportunities.write`
   - `conversations.readonly` and `conversations.write`
   - `conversations/message.readonly` and `conversations/message.write`
   - `locations.readonly`
   - `users.readonly`
   - `calendars.readonly`
6. **Create**. Copy the token immediately (it's only shown once). Save to the same note as the Supabase keys.
7. While you're here, grab the **Location ID**: Settings → Business Profile → scroll to bottom, or check the URL when you're in the sub-account (it's the `?locationId=` parameter, a long alphanumeric string).

## Step 3: Cloudflare Pages connect (10 min)

If you haven't connected Pages to the repo yet (per `client-dashboard/DEPLOY.md`), do it now:

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Authorize Cloudflare on the GitHub org that owns `jakexhauck/hauck-marketing-lab`. Select the repo.
3. Build config:
   - Project name: `hauck-dashboard`
   - Production branch: `main`
   - Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
   - Build output directory: `dist`
   - **Root directory (advanced):** `client-dashboard` (this matters — sets the monorepo root so Pages Functions resolve correctly and unrelated repo changes don't trigger rebuilds)
4. Environment variables → add:
   - `NODE_VERSION` = `20`
   - `PNPM_VERSION` = `9`
   - (Leave Supabase + GHL env vars for later — section 02/03 adds them.)
5. **Save and deploy**. First build takes ~2 min. Confirm the `*.pages.dev` URL loads the current mock-data login screen.

## Step 4: Namecheap CNAME for dash.hauckmarketing.com (10 min)

Once the Pages project is live and you know its `*.pages.dev` hostname:

1. Cloudflare Pages → `hauck-dashboard` project → **Custom domains** → **Set up a custom domain**.
2. Enter `dash.hauckmarketing.com`. Cloudflare will say "DNS not on Cloudflare" and show you the CNAME target you need (will look like `hauck-dashboard.pages.dev`).
3. Open Namecheap → Domain List → `hauckmarketing.com` → **Manage** → **Advanced DNS**.
4. **Add New Record**:
   - Type: `CNAME Record`
   - Host: `dash`
   - Value: `hauck-dashboard.pages.dev` (or whatever Cloudflare showed)
   - TTL: Automatic
5. Save.
6. Back in Cloudflare Pages, click **Check DNS** / **Activate**. SSL provisions in 1–5 min.
7. Open `https://dash.hauckmarketing.com` in a browser. Should serve the same login screen.

## Step 5: Pages Functions skeleton (5 min, Claude does this)

Once the above is done, I (Claude) will:

1. Create `client-dashboard/functions/api/_middleware.ts` (CORS + JWT verification helper).
2. Create `client-dashboard/functions/api/health.ts` (returns `{ok: true}`) — a smoke-test endpoint.
3. Commit and push. Pages auto-deploys.
4. Verify `https://dash.hauckmarketing.com/api/health` returns `{"ok":true}`.

Pages Functions live alongside the frontend in the same project. No separate Worker, no separate deploy.

## Step 6: Stash the credentials (Jake hands them to Claude, 2 min)

After all four above are done, paste this filled-in block back to me in chat. I'll never echo the secrets back in plain text; I'll write them into `.env.local` (gitignored) and into Cloudflare Pages environment variables via the dashboard steps in section 03.

```
SUPABASE_URL=https://________.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GHL_TOKEN=pit-________ or eyJ...   (whatever format GHL gave you)
GHL_LOCATION_ID=________________
```

Don't email these or commit them. Drop them in chat and I'll move them straight into env files.

## Stop condition

- `https://dash.hauckmarketing.com` serves the current mock-data PWA over HTTPS.
- `https://dash.hauckmarketing.com/api/health` returns `{"ok": true}`.
- Supabase project URL, anon key, service-role key recorded.
- GHL Private Integration token + location ID recorded.

**Commit message:** `client-dashboard: pages functions skeleton + dash subdomain (section 01)`

## Notes

- If Cloudflare Pages says SSL provisioning is stuck after 10 min, double-check the CNAME at Namecheap (proxy/cloud icon doesn't apply here — Namecheap doesn't have one, just confirm value).
- If GHL says you don't have permission to create a Private Integration, you're not on the right account level. Use the sub-account (not the agency-level dashboard), and make sure your agency user has admin role on that sub-account.
- If Supabase magic-link emails go to spam: ignore for today, we'll switch to Resend with a hauckmarketing.com sender domain next week.
- We are NOT moving nameservers to Cloudflare today. Namecheap stays as DNS host. The single CNAME is all we need.
