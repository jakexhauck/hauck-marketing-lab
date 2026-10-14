# Production Deploy Recovery (post-reorg)

Two open items left over from shipping the Admin Control Tower on 2026-06-16.
Both are production-only; local dev is unaffected. Neither is destructive, but
Part B touches live client login, so do it during a quiet window.

Context: the repo reorg moved the backend from repo-root `client-dashboard/` to
`Hauck Command Center (Clients)/Mobile App/`. The Cloudflare Pages project was
never updated to match, so Git builds have failed ever since and production has
been kept current only by manual `wrangler pages deploy` from a local build.

---

## Part A — Restore Git auto-deploy (`hauck-dashboard` root directory)

### Symptom
Every push to `main` produces a **Failure** build on the `hauck-dashboard`
Pages project. `dash.hauckmarketing.com` is frozen on the last successful
(pre-reorg) build except where a manual CLI deploy has overridden it.

### Cause
The Pages project's **Root directory** still points at `client-dashboard`, which
the reorg emptied (only a local `.wrangler` cache remains). There is no
`package.json` there, so the build aborts.

### Fix (Cloudflare dashboard — owner only)
1. Cloudflare → **Workers & Pages** → **hauck-dashboard** → **Settings** →
   **Builds & deployments** → **Build configuration** → **Edit**.
2. Set:
   - **Root directory**: `Hauck Command Center (Clients)/Mobile App`
   - **Build command**: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
   - **Build output directory**: `dist` (relative to root)
3. Confirm these build env vars exist (Settings → **Variables and secrets**):
   - `NODE_VERSION` = `20`
   - `PNPM_VERSION` = `10`
   (Both are already present as of this writing.)
4. Save, then **Deployments** → **Retry deployment** on the latest, or push a
   trivial commit to `main`.

### Verify
- The new build shows **Success**.
- `curl https://dash.hauckmarketing.com/api/health` returns OK.
- Future pushes to `main` deploy automatically; the manual CLI step is no longer
  needed.

### Interim workaround (until the above is done)
Deploy current `main` from a local build:
```
cd "Hauck Command Center (Clients)/Mobile App"
pnpm install && pnpm build
npx wrangler pages deploy dist --project-name hauck-dashboard --branch main --commit-dirty=true
```

---

## Part B — Finish admin login + restore owner login

### B1. Seat the admin password hash at 100k iterations
The Workers runtime rejects PBKDF2 above 100k iterations (fixed in code as of
commit `d13222c`). The admin account row was originally seeded at 150k and must
be re-hashed at 100k or admin login returns `500 internal_error`.

1. Regenerate the hash (never commit the output — it is a credential):
   ```
   node -e '
   const c=require("crypto");
   const p="<ADMIN_PASSWORD>";            // the password you log in with
   const s=c.randomBytes(16);
   const h=c.pbkdf2Sync(p,s,100000,32,"sha256");
   const u=b=>b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
   console.log(`pbkdf2$100000$${u(s)}$${u(h)}`);
   '
   ```
2. In the Supabase SQL editor:
   ```sql
   update public.admin_accounts
   set password_hash = '<paste the pbkdf2$100000$... hash>',
       updated_at = now()
   where lower(email) = '<your admin email>';
   ```

### Verify
```
curl -s -X POST https://dash.hauckmarketing.com/api/auth/admin-login \
  -H 'content-type: application/json' \
  -d '{"email":"<your admin email>","password":"<ADMIN_PASSWORD>"}'
```
Expect HTTP 200 with `ok:true` and a `token` field. A 401 means the hash or
password is wrong; a 500 means the row is still at 150k.

### B2. Restore owner (client) login — `APP_PASSWORD` missing in production
The `hauck-dashboard` production environment has **no `APP_PASSWORD` secret**, so
owner login returns `500 "APP_PASSWORD not configured"`. This predates the Tower
work; it is a separate gap. Confirm whether the Willis mobile app currently logs
in before assuming impact.

1. Set the secret to the real client login password (the value typed on the
   mobile login screen):
   ```
   cd "Hauck Command Center (Clients)/Mobile App"
   printf '%s' '<REAL_APP_PASSWORD>' | npx wrangler pages secret put APP_PASSWORD --project-name hauck-dashboard
   ```
2. Redeploy so the running deployment picks up the new secret (Part A's retry,
   or the interim CLI deploy command above).

### Verify
```
curl -s -X POST https://dash.hauckmarketing.com/api/auth/login \
  -H 'content-type: application/json' -d '{"password":"<REAL_APP_PASSWORD>"}'
```
Expect HTTP 200 with a `token` field. `"APP_PASSWORD not configured"` means the
secret did not reach the live deployment (redeploy again).

---

## Known follow-ups (not blocking)
- **Staff accounts** seeded before commit `d13222c` carry 150k hashes and will
  fail login on Workers the same way. If any exist, re-hash them at 100k (same
  method as B1) or have each staff member reset their password.
- **CRM frontend (`hauck-crm`)** has no Pages project yet, so the Tower has no
  production web UI. Out of scope for this runbook; tracked separately.
</content>
</invoke>
