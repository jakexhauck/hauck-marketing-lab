# Doppler: one home for every secret

Goal: keep every production secret / API key in **one place** so a blanked Cloudflare secret is a one-command fix and nothing is ever unrecoverable again.

Why Doppler: it holds all values (readable, unlike Cloudflare which is write-only), syncs across Windows + Mac, and once `doppler login` + `doppler setup` are done on a machine, tooling (and Claude) can pull values headlessly. Recovery becomes: `node scripts/cf-rebind.mjs --from-doppler` then redeploy.

## The one command

From `command-center/app`:

```
npm run secrets:check    # dry run: what is on disk but not yet in Doppler
npm run secrets:sync     # upload everything missing
```

`scripts/secrets-to-doppler.mjs` is the single source of truth for **where our secrets live on disk** and **which Doppler project owns each one**. It scans every file in its `SOURCES` list, diffs against Doppler, and uploads what is missing. Secret values are never printed; drifted values are warned about, never silently overwritten (use `--apply --force` to overwrite on purpose).

**When you add any new secret** (new key in a `.env`/`.dev.vars`, a new `*_secrets.rs`, a new CF binding): run `npm run secrets:sync`. If the secret lives in a brand-new file, add one entry to `SOURCES` first. That is the whole "future keys always land in Doppler" contract. A non-blocking `.githooks/pre-commit` reminder also nags if a tracked secret file is committed while Doppler is behind.

## Project layout (one dashboard, one project per app)

Each app has its own Doppler project so two apps that reuse a key name (e.g. `SESSION_SECRET`, `SUPABASE_URL`) with different values never clobber each other.

| Project | Config | Owns | Synced to Cloudflare? |
|---|---|---|---|
| `hauck-command-center` | `prd` | The deployed Pages app runtime (Supabase, GHL, VAPID, Cloudflare, Google OAuth, `META_SYSTEM_USER_TOKEN`, `TEST_APP_PASSWORD`, …) | Yes, via `cf-rebind` (only rebinds keys already present in CF) |
| `hauck-desktop-app` | `prd` | Tauri-only: `META_APP_ID/SECRET`, its Supabase consts | No |
| `gohighlevel-cli` | `prd` | `GHL_API_KEY`, `GHL_FIREBASE_REFRESH_TOKEN`, `GHL_LOCATION_ID` | No |
| `hauck-intranet` | `prd` | internal portal `SUPABASE_*`, `SESSION_SECRET` | No |

`command-center/app/doppler.yaml` pins the CLI default to `hauck-command-center / prd`.

## Values only a human can supply

The scanner uploads everything it can read on disk. These keys are expected by the app (`functions/lib/env.ts`) but have **no value in any file**, so paste them into `hauck-command-center / prd` yourself (Doppler dashboard → Secrets, or `doppler secrets set NAME`):

| Secret | Where to get it |
|---|---|
| `RESEND_API_KEY` | Resend dashboard (rotate this one, it was pasted in chat once) |
| `GITHUB_TOKEN` | GitHub PAT used by the Build Lab status board (contents-read) |
| `TENANT_TIMEZONE` | e.g. `America/Chicago` (Willis) — defaults if unset |
| `TEST_GHL_LOCATION_ID` / `TEST_GHL_TOKEN` | real GHL creds for the test sub-account |
| `GHL_COMPANY_ID` | agency id, only needed to provision new GHL staff users |
| `META_AD_ACCOUNT_ID` | live client's ad account (`act_…`), per-client not a global secret |
| `APP_PASSWORD` | owner shared-login password, **intentionally unset**; only add for owner login |

Build pins `NODE_VERSION` / `PNPM_VERSION` live in the CF dashboard, not here.

## Setup on a new machine (once)

```
# Windows: winget install Doppler.doppler   |   Mac: brew install dopplerhq/cli/doppler
doppler login
cd command-center/app && doppler setup      # confirm hauck-command-center / prd
git config core.hooksPath .githooks         # enable the secret-drift pre-commit reminder
```

## Cloudflare sync (pick ONE)

- **Automatic (best):** Doppler dashboard → Integrations → Cloudflare Pages → authorize with a CF API token (Pages: Edit) → map config `prd` to the `hauck-command-center` production env. Doppler then pushes all secrets on every change; the blanking footgun is gone for good. **Caveat:** this pushes *all* `prd` secrets to CF runtime, so keep only genuine runtime keys in `hauck-command-center/prd` (that is why the other apps have their own projects).
- **Manual (works today):** `node scripts/cf-rebind.mjs --from-doppler` then redeploy. Safe one-shot PATCH; only rebinds keys that already exist in CF, so extra Doppler keys are ignored.

## Day-to-day

- **A secret changed / got blanked:** update it in Doppler, then `node scripts/cf-rebind.mjs --from-doppler` + redeploy (or nothing, if the automatic integration is on).
- **Claude needs a value:** once `doppler login` + `doppler setup` are done on this machine, Claude reads and writes Doppler headlessly (`doppler secrets download`, `npm run secrets:sync`). The final CF apply is still `cf-rebind` + redeploy or the automatic integration.

Related: [[incident_prod_login_unavailable]] (the footgun this retires), `command-center/app/scripts/cf-rebind.mjs`, `command-center/app/scripts/secrets-to-doppler.mjs`.
