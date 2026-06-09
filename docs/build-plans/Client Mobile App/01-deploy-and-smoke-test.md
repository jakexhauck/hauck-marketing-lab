# 01: Deploy the Test App + Smoke Test

## Objective

Get the test build live on Cloudflare Pages at a real HTTPS URL, installed as a PWA on a
physical iPhone, and verified end to end against the test GHL account.

## Why it matters

Nothing else in this plan can be properly verified until the app is on real HTTPS. Service
workers, push notifications, the PWA install prompt, secure cookies (`Secure; SameSite=Lax`),
and GHL webhooks all require a trusted origin. `localhost` lies to you about all of these.
This is the first task even though the app already runs locally.

## Dependencies

None. This is the root of the graph.

## Prerequisites

- A Cloudflare account with Pages enabled.
- The repo pushed to GitHub (Cloudflare Pages builds from a Git connection).
- Test GHL sub-account credentials: a location ID and an API token.
- A physical iPhone (the simulator does not honour real PWA install behaviour reliably).

## Current state

- `client-dashboard/wrangler.toml` exists with `compatibility_date = "2026-05-18"` and the
  `nodejs_compat` flag.
- `client-dashboard/DEPLOY.md` already documents the one-time Cloudflare setup. Read it; this
  doc layers the test-mode specifics on top.
- Build command: `package.json` → `"build": "tsc && vite build"`. Output dir: `dist`.
- `functions/lib/env.ts` declares every env var the app reads. The test-mode trio is:
  - `TEST_APP_PASSWORD`
  - `TEST_GHL_LOCATION_ID`
  - `TEST_GHL_TOKEN`
- `functions/api/_middleware.ts:26-32` exempts these public paths from auth:
  `/api/health`, `/api/webhook`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.

## Target state

A live URL (e.g. `https://hauck-dashboard.pages.dev`) where:

- Logging in with the **test** password lands you in the app reading the test GHL account.
- The app installs to the iPhone home screen and launches standalone (no Safari chrome).
- `/api/health` returns 200 with no auth.

## Step-by-step

### 1. Connect the repo to Cloudflare Pages

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, pick the
repo. Set:

- **Root directory:** `client-dashboard`
- **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm build`
- **Build output directory:** `dist`

### 2. Set build environment variables

In **Settings → Environment variables → Production**:

| Var | Value |
|-----|-------|
| `NODE_VERSION` | `20` |
| `PNPM_VERSION` | `9` |

### 3. Set runtime secrets (test mode is enough for now)

Set these as **encrypted** environment variables. For the test app you only strictly need the
`TEST_*` set plus a session secret. The live `APP_PASSWORD` / `GHL_*` can stay unset until you
promote to a client, but note: if `APP_PASSWORD` is unset, `SESSION_SECRET` must be set
because the session signer falls back to `APP_PASSWORD` (`functions/lib/session.ts:55`).

| Var | Value | Notes |
|-----|-------|-------|
| `SESSION_SECRET` | 32+ random chars | `openssl rand -hex 32`. Required if `APP_PASSWORD` is unset. |
| `TEST_APP_PASSWORD` | a password you choose | What you type on the login screen in test mode. |
| `TEST_GHL_LOCATION_ID` | test sub-account location ID | From GHL. |
| `TEST_GHL_TOKEN` | test sub-account API token | From GHL. Private integration token or OAuth access token. |

### 4. Deploy and watch the build

Trigger a deploy (push to the connected branch, or **Retry deployment**). Watch the build log
for the `tsc` step. If TypeScript fails, the build fails: run `pnpm typecheck` locally first
(`package.json` → `"typecheck": "tsc --noEmit && tsc --noEmit -p functions/tsconfig.json"`).

### 5. Smoke test the API directly

```
curl -i https://YOUR-APP.pages.dev/api/health
```

Expect `200`. This is the public, no-auth canary that the Functions runtime is alive.

Then confirm auth and tenant injection work:

```
curl -i -X POST https://YOUR-APP.pages.dev/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"password":"YOUR_TEST_PASSWORD","mode":"test"}'
```

Expect `200` with a `set-cookie: hml_session=...` header. Copy that cookie, then:

```
curl -i https://YOUR-APP.pages.dev/api/summary \
  -H 'cookie: hml_session=PASTE_VALUE_HERE'
```

Expect `200` with real pipeline counts from the test GHL account. A `502`/`500` here usually
means the `TEST_GHL_TOKEN` is wrong or expired (the error body from `ghlJson` includes the GHL
status and first 500 chars of its response, `functions/lib/ghl.ts:38-41`).

### 6. Install on the iPhone

Open the URL in Safari on the phone. Log in with the test password. **Share → Add to Home
Screen.** Launch from the home screen icon. Confirm:

- It opens standalone (no address bar). Driven by `display: "standalone"` in the manifest
  (`vite.config.ts`).
- The icon is the Hauck icon, not a screenshot. Confirms `apple-touch-icon.png` is served.
- The session persists across an app relaunch (30-day cookie, `session.ts`).

## Testing checklist (do all on the phone, in test mode)

- [ ] `/api/health` returns 200 via curl.
- [ ] Login with the wrong password is rejected (401).
- [ ] Login with the correct test password succeeds and lands on Home.
- [ ] Home shows real pipeline cards and counts from the test account.
- [ ] Leads, Contacts, Conversations each load real test data.
- [ ] Opening a lead shows the message thread.
- [ ] Sending a test SMS to your own number actually arrives (verifies the write path).
- [ ] App installs to home screen and launches standalone.
- [ ] Killing and relaunching the app keeps you logged in.

## Acceptance criteria

- A bookmarkable test URL exists and is installed on at least one real device.
- Every bottom-nav tab renders real test-account data with no console errors.
- The SMS send path works (this is the only destructive/outbound action; verify with your own
  number).

## Rollback

Cloudflare Pages keeps every deployment. If a deploy regresses, **Deployments → pick the last
good one → Rollback**. Secrets are independent of deploys, so a rollback does not lose them.

## Notes for the future client promotion

When you promote to a real client, this same doc is the acceptance test: set the live `GHL_*`
and `APP_PASSWORD`, log in with `mode: "live"` (the default), and re-run the checklist against
the client's real data before handing over the URL.
