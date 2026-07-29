# Settings Control Room: what is left

> **For agentic workers:** use `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Built and committed** on `feat/settings-control-room` (commit `31b0a88`, branched off `origin/main` at `bbedd19`): the split-screen Agency Settings page, the connection registry, live health probes, per-client credential editing, and Doppler drift detection. 21 files, 1700 tests passing, clean production build.

**Not built:** the 24/7 half. Everything below.

---

## Phase 0: Ship it (BLOCKED ON JAKE)

Every `git push` in the build session was denied by the permission classifier, so the commit exists locally and nowhere else.

- [ ] **Push to production.** From anywhere:
```bash
git -C "C:/Users/games/Desktop/hml-worktrees/settings-ship" push origin feat/settings-control-room:main
```
This is a fast-forward: the branch is `origin/main` plus exactly one commit. Cloudflare Pages production branch is `main` (`command-center/app/DEPLOY.md:13`), so the push triggers the deploy.

- [ ] **Watch the deploy.** Poll for a string in the served HTML, never for the local bundle hash: Cloudflare builds a different one.
- [ ] **Smoke the live page.** Open `https://app.hauckmarketing.com/admin/settings`. Expect the split screen, a short "Needs you" list, and the localhost banner ABSENT. If the banner shows, the environment detection is wrong.
- [ ] **Confirm the real production picture.** Unlike localhost, production has the full secret set, so most rows should be green. Two known truths to verify against: Google Drive should read broken with "No refresh token stored, never consented", and the Willis GHL probe should pass.
- [ ] **Clean up the worktree** once merged: `git worktree remove "C:/Users/games/Desktop/hml-worktrees/settings-ship"`. Note its `node_modules` is a junction to the main checkout, so do not delete the folder by hand.

## Phase 1: Turn on Doppler (BLOCKED ON JAKE, creds I cannot self-issue)

Until this is done, the agency half of the Secrets tab shows only what the running app has, and drift detection cannot run at all.

- [ ] **Generate a read-only service token** in Doppler for `hauck-command-center` / `prd`. That is `DOPPLER_TOKEN`.
- [ ] **Optional, only if you want in-app editing:** generate a second token with read/write. That is `DOPPLER_WRITE_TOKEN`. Leave it unset and editing stays off, which the UI states plainly.
- [ ] **Bind them:** add to `command-center/app/.env.local`, then
```bash
node scripts/cf-rebind.mjs --add DOPPLER_TOKEN,DOPPLER_WRITE_TOKEN
```
`--add` is required: these are new keys production does not know about yet, and plain `cf.mjs env:set` would blank every other secret on the way through (the recurring "login unavailable" outage).
- [ ] **Add to `.dev.vars`** too if you want them locally.
- [ ] **Verify:** the Secrets tab should stop showing "No Doppler token set" and start showing masked values with a real Doppler-versus-runtime comparison.

## Phase 2: The 24/7 half (the piece you actually asked for first)

Today the page catches breakage **when you open it**. You chose scheduled probing with a push notification. None of it exists.

**The blocker:** Cloudflare Pages has no cron triggers. `wrangler.toml` cannot carry a `[triggers]` block for a Pages project. The scheduler must live outside the app.

**Recommended shape:** a tiny separate Cloudflare Worker on the same account with a cron trigger that calls the existing health endpoint. The endpoint was deliberately built for this: no parameters, read-only, flat comparable snapshot.

### Task 2.1: Machine auth for the health endpoint

`/api/admin/connections/health` returns 401 to anything without an admin cookie, so a cron cannot call it. This is the security-sensitive step (M8).

- [ ] Add `HEALTH_CRON_SECRET` to `Env` and declare it in `connectionRegistry.ts` (the registry test fails otherwise, by design).
- [ ] In `functions/api/_middleware.ts`, allow `GET /api/admin/connections/health` when an `X-Health-Cron` header matches the secret, using a timing-safe comparison. Read-only, this one route, GET only. It must not open any other admin route.
- [ ] Test: correct secret passes, wrong secret 401s, the header does NOT grant access to `/api/admin/secrets/*`.

### Task 2.2: Snapshot storage and transition detection

Alerting on every red row every 30 minutes is noise. Only a **flip** is news.

- [ ] Migration (pick the number at PUSH time, numbering is a race): table `connection_health_snapshots` with `checked_at`, `connection_id`, `state`, `detail`.
- [ ] Pure helper `diffSnapshots(previous, current)` in `src/lib/connectionHealth.ts` returning `{ broke: [], recovered: [] }`. Test it: no alert when a row stays red, alert on green to red, and a recovery notice on red to green.

### Task 2.3: Fan out the alert

- [ ] Reuse `functions/lib/push.ts` and the `push_subscriptions` table. Both already work.
- [ ] Alert text carries the consequence, not the key name: "Meta Ads stopped working. Paid Ads goes dark." `consequenceOf()` in `src/lib/settingsActions.ts` already generates exactly this line.
- [ ] Only alert on `broke`. Recoveries can wait for the daily digest.

### Task 2.4: The scheduler Worker

- [ ] New minimal Worker (its own tiny wrangler project) with `crons = ["*/30 * * * *"]`, whose `scheduled()` handler GETs the health endpoint with the `X-Health-Cron` header.
- [ ] Deploy it, confirm one real firing end to end, then deliberately break a credential in a test tenant and confirm the push arrives.
- [ ] Side effect worth noting: once this Worker exists, the stale-ad-spend gap (memory: "NO CRON EXISTS so spend goes stale") has a home to live in.

## Phase 3: Decisions still open for Jake

- [ ] **One-click rebind and redeploy.** You picked the option that mentioned it; I did not build it. It needs a Cloudflare API token inside the Worker, which turns an admin session compromise into full control of the Cloudflare account. The drift banner hands over a copy-paste command instead. Say if you want the button anyway.
- [ ] **Encrypt `tenants.ghl_token` at rest.** It is plaintext in Supabase today and always has been; this build did not change that. Encrypting means touching every reader (`tenantGhl.ts`, `tenantResolve.ts`, the setter routes). Worth doing, but it is its own job.

## Phase 4: Housekeeping

- [ ] **Reconcile `docs/build-plans/self-serve-connections-wizard.md`.** It predates this work and its Task 8 (admin status mirror) is now built and superseded. Its client-facing half (letting a client link their own Facebook and Google) is still unbuilt and still worth doing. Either trim it to the client-facing half or delete it.
- [ ] **Delete this plan** when Phases 0 to 2 are done, per the standing rule, appending any leftover Jake actions to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md`.
