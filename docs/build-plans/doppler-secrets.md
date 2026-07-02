# Doppler: one home for every secret

Goal: keep every production secret / API key in **one place I can read and you can sync**, so a blanked Cloudflare secret is a one-command fix and nothing is ever unrecoverable again.

Why Doppler: it holds all values (readable, unlike Cloudflare which is write-only), syncs across your Windows + Mac, and once `doppler login` + `doppler setup` are done on a machine, tooling (and I) can pull values headlessly. Recovery becomes: `node scripts/cf-rebind.mjs --from-doppler` then redeploy.

Project/config names are already committed in `command-center/app/doppler.yaml`: **project `hauck-command-center`, config `prd`**. Create them with those exact names.

---

## The 17 production secrets (Cloudflare Pages `hauck-command-center`)

Already in `.env.local` (upload handles these):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `SESSION_SECRET`, `WEBHOOK_SECRET`, `GHL_TOKEN`, `VAPID_PRIVATE_KEY`

Missing everywhere I can read, **you paste these into Doppler** (source in parens):
| Secret | Where to get the value |
|---|---|
| `RESEND_API_KEY` | Resend dashboard (memory says rotate this one, it was pasted in chat) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `google_oauth_secrets.rs` (gitignored) or Google Cloud console |
| `GITHUB_TOKEN` | GitHub PAT used by the Build Lab status board |
| `TENANT_TIMEZONE` | e.g. `America/Chicago` (Willis's timezone) |
| `NODE_VERSION` / `PNPM_VERSION` | CF Pages build pins, copy current values from the CF dashboard |
| `TEST_APP_PASSWORD` | test sub-account shared password (also in `.dev.vars`) |
| `TEST_GHL_LOCATION_ID` / `TEST_GHL_TOKEN` | real GHL creds for the test sub-account |
| `APP_PASSWORD` | owner shared-login password, **intentionally unset**; only add if you want owner login |

---

## Setup (once)

### 1. Install + log in  (run each with a leading `!`)
```
winget install Doppler.doppler
```
Create a free account at doppler.com, then:
```
doppler login
```

### 2. Create the project + load the secrets we already have
From `command-center/app` (the committed `doppler.yaml` points here):
```
doppler setup            # confirm project hauck-command-center / config prd
doppler secrets upload .env.local
```

### 3. Add the missing values
Paste the rows from the table above in the Doppler dashboard (Secrets tab), or:
```
doppler secrets set RESEND_API_KEY GOOGLE_OAUTH_CLIENT_SECRET ...
```

### 4. Point Cloudflare at Doppler (pick ONE)
- **Automatic (best):** Doppler dashboard -> Integrations -> Cloudflare Pages -> authorize with a CF API token (Pages: Edit) -> map config `prd` to the `hauck-command-center` production env. Doppler now pushes all secrets together on every change; the blanking footgun is gone for good.
- **Manual (already works today):** `node scripts/cf-rebind.mjs --from-doppler` then redeploy. Safe one-shot PATCH, pulls values from Doppler.

### 5. Local dev from Doppler (optional, retires hand-edited `.env.local`)
```
doppler run -- npm run dev:full
# or regenerate the file:
doppler secrets download --no-file --format env > .env.local
```

---

## Day-to-day after setup

- **A secret changed / got blanked:** update it in Doppler, then `node scripts/cf-rebind.mjs --from-doppler` + redeploy (or nothing, if the automatic integration is on).
- **Claude needs a value:** once you've done `doppler login` + `doppler setup` on this machine, I can run `doppler secrets download` / `cf-rebind --from-doppler --dry` myself (read-only). I still can't write prod secrets (classifier-blocked), so the final apply is your `!` command or the automatic integration.
- **Second machine (Mac):** `brew install dopplerhq/cli/doppler`, `doppler login`, `doppler setup` in the same dir. Same source of truth.

Related: [[incident_prod_login_unavailable]] (the footgun this retires), `command-center/app/scripts/cf-rebind.mjs`.
