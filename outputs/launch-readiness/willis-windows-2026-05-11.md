# Willis Windows — Launch Readiness Verdict

**Date:** 2026-05-11
**Client:** Willis Windows (window cleaning, local service)
**Reviewed by:** Aurelius (Traffic Command)
**Status:** **NOT READY** — 0 of 9 cleared

---

## Verdict

**NOT READY. Do not launch.**

Zero of nine pre-launch items have been cleared. Andromeda cannot optimize on a campaign whose data plumbing does not exist, and no amount of creative will save tracking that does not fire. We are not "almost there" — we have not begun.

---

## Tiered Action Plan

Items are grouped by what blocks what. Do not work them in parallel until Tier 1 is done.

### Tier 1 — Data Foundation (MANDATORY before any creative work)

These are non-negotiable. Without them, Andromeda is blind and any spend is wasted budget.

| # | Item | Status | Action |
|---|------|--------|--------|
| 1 | Meta access token entered | STOP | Generate a system-user token from Business Manager. Store via the client's Settings → Meta credentials panel. Verify a test API call returns the ad account. |
| 2 | Pixel installed + verified | STOP | Install Meta Pixel on every page of williswindows site. Trigger `Lead` event on form submit. Verify in Events Manager → Test Events with a real submission. |
| 3 | CAPI configured | STOP | Server-side `Lead` and `PageView` minimum. Use Conversions API Gateway, GTM server-side, or the Zapier/CRM connector — whichever Willis's stack supports. Verify event match quality ≥ 6.0 in Events Manager. |
| 4 | Domain verified | STOP | Add DNS TXT record from Business Settings → Brand Safety → Domains. Required for iOS 14.5+ attribution and to claim the 8 conversion events. |
| 9 | Tracking dry-run passed | STOP | After 1–4, submit one real test lead end-to-end. Confirm: Pixel fires browser-side, CAPI fires server-side, deduplication works, lead lands in Willis's CRM/inbox. |

### Tier 2 — Campaign Inputs (build while Tier 1 is being verified)

| # | Item | Status | Action |
|---|------|--------|--------|
| 5 | Lead form built | STOP | Decide: Meta Instant Form vs. landing page. For local service with a phone-call close, Instant Form + auto-call follow-up wins on speed-to-lead. Fields: name, phone, zip, # of windows, single-story vs. two-story. |
| 6 | Creative pool seeded (8+ angles, 12+ hooks) | STOP | This is the lever. Dispatch `@vortex` for hook generation. Per Andromeda doctrine we need 15–25+ diverse creatives per ad set at launch, not eight. Eight is a warm-up, not a launch pool. (ref: Andromeda creative-diversity protocol) |
| 7 | Audiences defined | HOLD | For local service in Willis's metro: broad geo + Advantage+ targeting. Do **not** stack interests, lookalikes, or income filters. Creative is the targeting. The only constraint is geographic radius around service area. |
| 8 | Budget agreed | HOLD | Need Jake + client sign-off. Floor: $30–50/day for a single-metro window service to escape learning phase in ~7 days at a typical $30–60 CPL. Anything under $20/day will not gather enough conversion signal for Andromeda. |

---

## Pushback

You asked me to push back on premature "GO" calls. There are none to push back on — everything is STOP — so let me push back on the **plan** instead:

1. **The 8-angle / 12-hook target is too low.** Local services on Andromeda need 20+ creatives at launch or CPMs will climb within 10 days. Treat 8/12 as the brief to `@vortex`, not the launch volume. (ref: TFC creative volume protocol)
2. **Do not launch a single creative before CAPI is verified.** Browser-only Pixel data degrades match quality and Andromeda will optimize toward the wrong people. This is the single most common cause of "good CTR, terrible CPL" in local lead-gen.
3. **Budget conversation should happen now, not after creative is done.** If the client can only fund $15/day, we change the entire plan (or decline the launch). Resolve this before `@vortex` writes a single hook.

---

## Critical Path (Sir, do these in order)

1. **Today:** Meta token entered + Domain verified. Both are 15-minute jobs.
2. **Today / Tomorrow:** Pixel + CAPI live. Run dry-run lead. Do not skip the dry-run.
3. **In parallel with #2:** Confirm budget with Willis. Dispatch `@vortex` for 20+ diverse hooks across 8 angles.
4. **After tracking dry-run passes:** Build lead form, finalize geo audience, schedule launch.

**Earliest realistic launch date:** 2026-05-15 (Thursday), assuming tracking is clean by EOD 2026-05-12.

---

## Final Verdict

**NOT READY.**

Reattempt readiness check after Tier 1 (items 1–4 and 9) is cleared. Until then, no campaign creation, no boost, no "just a small test." A misfiring pixel during a test burns trust with the algorithm and the client.

*— Aurelius*
