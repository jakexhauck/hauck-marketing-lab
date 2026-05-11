---
title: "Sir, I'd like a readiness check on Willis Windows before we launch. Current pre-launch checklist: - [✗] Meta access token entered - [✗] Pixel installed + verified - [✗] CAPI configured - [✗] Domain verified - [✗] Lead form built - [✗] Creative pool seeded (8+ angles, 12+ hooks) - [✗] Audiences defined - [✗] Budget agreed - [✗] Tracking dry-run passed Cleared: 0 of 9. Please: 1. Identify which checks need the most attention before launch. 2. Push back on any \"GO\" status that looks premature. 3. Recommend specific actions for each \"STOP\" or \"HOLD\" item. 4. Give a final verdict: READY / NOT READY / READY WITH CAVEATS. 5. Save your verdict to outputs/launch-readiness/ when complete."
agent: aurelius
started_at: 2026-05-11T12:14:40.843541100-04:00
slug: 2026-05-11-sir-i-d-like-a-readiness
---

## aurelius
<!-- at: 2026-05-11T16:15:39.869Z -->

Sir.

**Verdict: NOT READY.** 0 of 9 cleared. We have not begun.

## What needs attention first

**Tier 1 — Data foundation (blocks everything else):**
1. **Meta token** — 15-min job, Business Manager → system user
2. **Pixel verified** — install + fire `Lead` on submit, confirm in Test Events
3. **CAPI** — server-side `Lead` minimum, match quality ≥ 6.0
4. **Domain verified** — DNS TXT record, required for iOS attribution
5. **Tracking dry-run** — one real test lead, end-to-end

Without these, Andromeda is blind. Any spend is wasted.

**Tier 2 — Inputs (build in parallel after Tier 1 is in motion):**
- Lead form (recommend Instant Form for a local phone-close business)
- Creative pool — **8 angles / 12 hooks is too low.** Doctrine is 15–25+ diverse creatives per ad set. Treat 8/12 as the brief, not the launch volume.
- Audiences — broad geo + Advantage+. No interest stacking. Creative is the targeting.
- Budget — needs sign-off **now**, before `@vortex` writes a single hook. Floor: $30–50/day for a single-metro window service.

## Pushback

Nothing was marked GO, so nothing to push back on there. But:

- **Don't launch a single creative before CAPI is verified.** Browser-only Pixel data is the #1 cause of "good CTR, terrible CPL" in local lead-gen.
- **Resolve budget before creative.** If the client funds $15/day we redesign the plan or decline the launch.

## Critical path

1. Today: Meta token + domain verification (30 min total)
2. Today/tomorrow: Pixel + CAPI live, run dry-run
3. In parallel: confirm budget, dispatch `@vortex` for 20+ hooks across 8 angles
4. After dry-run passes: lead form, geo audience, schedule launch

**Earliest realistic launch:** Thu 2026-05-15, if tracking is clean by EOD tomorrow.

Verdict saved: `outputs/launch-readiness/willis-windows-2026-05-11.md`.

Shall I dispatch `@vortex` for the hook brief now, Sir, or would you prefer to nail down budget with Willis first?

