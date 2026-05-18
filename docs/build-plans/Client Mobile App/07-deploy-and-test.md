# Section 07: Deploy + end-to-end test

## Goal

Confirm everything that's been built across sections 02–06 works against the live production deploy at `https://dash.hauckmarketing.com`, on Jake's real iPhone, with real Willis Windows data. Catch any "works on localhost, broken in prod" issues before declaring Phase 2 done.

Estimated time: ~1.5 hours.

## Depends on

Sections 02–06 committed and merged to `main`. Cloudflare Pages auto-deploys from `main`.

## Files created / modified

```
docs/build-plans/Client Mobile App/
  SELL-READY.md                               (new: short doc with what's live, how to onboard client #2, known gaps)
client-dashboard/
  README.md                                   (modified: drop "phase 1 demo only" warning, document env vars + deploy)
```

No app code changes in this section — it's verification and shipping docs.

## Steps

1. **Confirm latest deploy is green (5 min)**
   - Cloudflare Pages dashboard → `hauck-dashboard` → check the latest production deploy succeeded.
   - Visit `https://dash.hauckmarketing.com/api/health` → should return `{ ok: true, ts: ... }`.
   - Visit `https://dash.hauckmarketing.com/` → loads login screen with Willis branding.

2. **Confirm all env vars are set (5 min)**
   - In Cloudflare Pages → Settings → Environment variables, confirm Production scope has:
     - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (frontend bundle).
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Pages Functions).
   - Trigger a rebuild if any were added since the last deploy.

3. **Confirm Supabase URLs (3 min)**
   - Supabase → Authentication → URL Configuration → Site URL is `https://dash.hauckmarketing.com`. Redirect URLs include `https://dash.hauckmarketing.com/**` and `http://localhost:5173/**`.

4. **Confirm GHL webhook is registered (3 min)**
   - Willis sub-account → Settings → Webhooks. Should show one entry pointing at `https://dash.hauckmarketing.com/api/webhooks/ghl` with `ContactCreate` + `OpportunityCreate` + `OpportunityStatusUpdate` events enabled.

5. **iPhone install test (10 min)**
   - Open `https://dash.hauckmarketing.com` in Safari on Jake's iPhone.
   - Share → Add to Home Screen → name it "Willis Leads" (matches `app_name` in tenant config) → Add.
   - Open from the home-screen icon. Should be full-screen, no Safari chrome.

6. **Magic-link login on phone (5 min)**
   - Enter Jake's email. Tap "Send link". Check Gmail on phone. Tap link.
   - Should land on dashboard with Willis branding. Reload — still signed in.

7. **Read-path smoke test (10 min)**
   - Dashboard: stats render with real numbers.
   - Leads list: real Willis contacts, scroll to load more.
   - Lead detail: open one. See contact info, opportunity value, stage.
   - Pipeline screen: columns match Willis' GHL stages in correct order.
   - SMS thread on a lead with existing history: messages render.

8. **Write-path smoke test (15 min)**
   - Tap call button → iOS dialer opens with the lead's number. Don't actually call.
   - Type a test SMS to a number you control (e.g. your own personal cell) → Send. Confirm it arrives within 5s.
   - Reply to that SMS from the receiving phone. Within 10s, the reply appears in the in-app thread.
   - Change a test lead's stage to a middle stage → updates silently. Confirm in GHL UI on laptop.
   - Change the same lead to Won → confirm modal appears, accept. Confirm in GHL UI on laptop — opportunity is Won.

9. **Push notification end-to-end (15 min)**
   - On phone, dashboard → tap "Enable notifications" → accept permission.
   - On laptop, in Willis GHL, manually create a new contact (fake name like "Test Lead Phase 2").
   - Within 10s, phone buzzes with notification "New lead — Test Lead Phase 2".
   - Tap notification → app opens at that lead's detail page.
   - Delete the test contact in GHL.

10. **Activity log check (5 min)**
    - Supabase → Table Editor → `activity_log`. Should show entries for the SMS send, the stage updates, and any pushes that fired.

11. **Write SELL-READY.md (15 min)**
    - Document what's live: features, supported devices, tenant config knobs.
    - Onboarding a new client checklist: create GHL Private Integration token, add tenant row in Supabase, invite user, register webhook, share `dash.hauckmarketing.com` link.
    - Known gaps for next pass: drag-drop pipeline, multi-user-per-tenant UI, custom domain per tenant, in-app conversation inbox.
    - Pricing notes (placeholder for Jake to fill in).

12. **Update client-dashboard README (5 min)**
    - Drop the "phase 1 mock data only" warning.
    - Add deploy URL, env-var list (referencing `.env.example`), tenant-onboarding pointer to SELL-READY.md.

## Acceptance criteria

All eleven test steps (5–10) pass. If any fail, log the failure in SELL-READY.md under "Known gaps" before shipping, then triage: bugs go into a fix commit; UX issues become Tier 2 items.

## Stop condition

Commit + push when every test passes and the docs are updated. Phase 2 is done — Jake can sell the app.

**Commit message:** `client-dashboard: phase 2 ship — sell-ready (section 07)`

## Notes

- The whole `docs/build-plans/Client Mobile App/` folder gets deleted in this commit, except for `SELL-READY.md` which moves to `docs/Client Mobile App/SELL-READY.md` as the durable reference. Per the workspace hygiene rule: shipped build plans don't stick around as clutter.
- If iOS push fails on the real device, the most common cause is the PWA wasn't actually installed (opened from Safari, not from home screen). Reinstall and retry before debugging anything server-side.
- If the webhook never fires, check Willis GHL → Settings → Webhooks → Logs. GHL logs every delivery attempt with response code. A 401 means the secret is wrong; a 5xx means the Function errored.
- Don't ship if any write-path test fails. Reading wrong data is a UX bug; writing wrong data corrupts a real client's CRM.
