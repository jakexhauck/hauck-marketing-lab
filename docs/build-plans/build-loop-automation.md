# Build-Loop Automation, Finishing Plan

> Goal: close the loop so Jake describes a change and Claude ships it end to end
> (build → verify → commit → push → watch deploy → smoke-test → report), with
> near-zero manual input. House rules: address Jake as **"Sir"**, **no em dashes**,
> ask before destructive or outward-facing actions, confirm credentials only when
> they cannot be self-issued.

This plan finishes the work started 2026-06-19. The autopilot preference is the
standing default (see memory `feedback_build_loop_autopilot`).

## Where we are

**Done and verified:**
- Admin **Tasks tab** + sidebar shell, live at app.hauckmarketing.com (commits `0babf35`, earlier).
- **`npm run db:migrate`** applies Supabase schema via the Management API + ledger. No SQL editor.
- **`npm run dev:full`** runs the full local stack (vite + wrangler functions), smoke-tested green.
- **`npm run cf ...`** (`scripts/cf.mjs`) controls Cloudflare Pages by API (env vars, secrets, deploy watch). Committed `1300ddb`.
- Credentials live in gitignored `.env.local`; `.env.example` documents them.

**Blocked / not done:**
- `cf` is **blocked**: the Cloudflare token is valid but scoped to Pages only, so it cannot
  enumerate accounts. Needs `CLOUDFLARE_ACCOUNT_ID` set explicitly.
- No post-push **deploy-watch** wired into the ship flow yet.
- No automated **self-verification** (Playwright login + check) after a deploy.
- Two tokens (Supabase PAT, Cloudflare token) were pasted in plaintext chat and should be **rotated**.

## Steps

### 1. Unblock Cloudflare control (BLOCKED on Jake)
- Get `CLOUDFLARE_ACCOUNT_ID` (Workers & Pages > right rail, or the dashboard URL).
- Add it to `.env.local`.
- Verify: `npm run cf whoami`, `npm run cf env:list`, `npm run cf deploy:list` all succeed.
- Acceptance: `whoami` prints the account + project `hauck-command-center` and its domains.

### 2. Wire deploy-watch into the ship flow
- After every push, run `node scripts/cf.mjs deploy:watch <HEAD-sha>` and report success/failure.
- Add `scripts/ship.mjs` (or extend `cf.mjs`): take the current `git rev-parse HEAD`, push, then
  watch that exact deployment to green. One command for the whole tail of the loop.
- Acceptance: a trivial change deploys and the script blocks until "success" then prints the URL.

### 3. Self-verification (Playwright smoke test)
- Provision a dedicated **bot admin** account so Claude can log in without Jake's personal
  password: insert into `admin_accounts` via the migration runner with a PBKDF2 hash generated
  from `functions/lib/password.ts`. Store its email + password in `.env.local`.
- Add `scripts/smoke.mjs` (uses the Playwright MCP or `puppeteer-core`, already a devDep): log in
  as the bot admin, hit `/admin/tasks`, assert the page renders and the API returns tasks.
- Run it against local (`dev:full`) before a push and against prod after a deploy.
- Acceptance: `npm run smoke` exits 0 on a healthy deploy, non-zero with a screenshot on failure.

### 4. Rotate the exposed tokens (security)
- Supabase PAT and Cloudflare token were shared in plaintext. Regenerate both, update `.env.local`.
- Use `npm run cf env:set` for any Cloudflare-side secret that needs rotating in production env.
- Acceptance: old tokens revoked, `db:migrate` and `cf whoami` still work with the new ones.

### 5. Secrets generator (foundation for client provisioner)
- `scripts/gen-secrets.mjs`: generate `SESSION_SECRET`, `WEBHOOK_SECRET`, VAPID keypair, and
  push them to production with `cf env:set --secret`.
- This is the first brick of a future one-command **client provisioner** (tenant + secrets +
  GHL staff). Out of scope to finish here; just land the generator.
- Acceptance: running it sets the three secrets in CF production (verify via `cf env:list`).

### 6. One-page runbook
- Write `docs/build-plans/RUNBOOK-build-loop.md`: the canonical commands (`db:migrate`,
  `dev:full`, `cf ...`, `ship`, `smoke`) and the autopilot flow, so any future Claude session
  uses them instead of dashboards.
- Update the architecture map (`blueprint/index.html`) GAPS/IDEAS to reflect the closed loop.

## Manual-action checklist

**Jake must do (one-time):**
1. Copy the **Cloudflare Account ID** and paste it to Claude (Step 1).
2. After Step 4, confirm you want the **old tokens revoked** (or do the revoke in the two dashboards).

**Already automated / Claude will do:**
- Steps 2, 3, 5, 6 in full once Step 1 unblocks `cf`.
- All commits, pushes, deploy-watching, and smoke-tests from here on (autopilot).
- Provision the bot admin via `db:migrate`; no SQL editor.

## Definition of done
Jake says "add X" and gets back "X is live, here is the proof" with no dashboard visits, no
SQL editor, no manual deploy-watching, and no hand-verification. The only future interrupts are
credentials Claude cannot issue itself (e.g. a new client's GoHighLevel token).
