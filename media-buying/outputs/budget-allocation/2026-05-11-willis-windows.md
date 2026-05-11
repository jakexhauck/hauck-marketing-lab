---
client: willis-windows
date: 2026-05-11
agent: aurelius
skill: budget-allocation
mode: pre-launch-sizing
status: NOT YET ALLOCATABLE — campaign not live
---

# Budget Allocation Plan: Willis Windows

**Status:** Pre-launch. No live spend, no ROAS, no tiers to reallocate.
**Mode used:** Minimum Viable Budget + Learning Phase math (from skill).
**Funnel type:** Local lead-gen (Instant Form → phone close).

---

## Why this isn't a reallocation plan

The skill's primary output (Tier 1/2/3/4 reshuffle) requires:
- Multiple ad sets with ≥7 days of stable performance
- ROAS values to rank
- Spend totals to redistribute

Willis Windows has **none of the above**. Running the standard reallocation flow would be fabrication. Per the readiness check (`outputs/launch-readiness/willis-windows-2026-05-11.md`), launch isn't viable before 2026-05-15.

This document instead locks the **opening budget** so we have a defensible floor before `@vortex` builds creative and before sign-off with the client.

---

## Pre-launch budget floor (Lead Gen funnel)

From the skill's "Minimum Viable Budget" table:

| Tier | Lead Gen funnel | Applies to Willis Windows |
|---|---|---|
| Minimum | $1K/week (~$143/day) | Only if target CPA is confirmed ≤ $35 |
| **Recommended** | **$3K/week (~$430/day)** | **Default ask if client can fund it** |
| Scale | $10K+/week | Premature — re-evaluate after 30 days of stable Tier 1 data |

## Learning Phase math

Formula: **Daily budget ≥ Target CPA × 2**
Algorithm needs ~50 conversions/week to exit learning efficiently.

**Unknown:** target CPA. Need from Jake or Willis before this is final.

Working assumption (local window service, single metro):
- Average ticket: $200–400 (residential), higher for commercial
- Acceptable CPL (form lead): $20–40
- Acceptable CPA (booked job): $80–150

| Assumed Target CPL | Required daily floor (CPL × 2) | Weekly floor |
|---|---|---|
| $20 | $40/day | $280/week |
| $30 | $60/day | $420/week |
| $40 | $80/day | $560/week |

**Recommendation:** Open at **$50/day ($350/week)** if optimizing for `Lead`. This clears the learning-phase math at a $25 CPL target and sits just under the "Recommended" funnel floor. If client funds less than $30/day, decline the launch — Andromeda won't get enough signal and we'll burn the budget proving nothing.

---

## Structure (Andromeda-aligned)

Per doctrine: 1 campaign, 1–2 broad ad sets, 15–25+ diverse creatives.

```
Campaign: WW – Advantage+ Leads (CBO)
└── Ad Set 1: Broad geo (metro radius), Advantage+ audience
    └── 15–25 creatives across 8 angles (handled by @vortex)
```

- **CBO**, not ABO. Single ad set initially → no manual split needed.
- Minimum/maximum per-ad-set caps: N/A at launch (only one ad set).
- Add a second ad set only if a clear creative-angle hypothesis emerges after week 2.

---

## Recommended allocation (launch)

```
┌─────────────────────────────┬──────────┬─────────┐
│ Line item                   │ Daily    │ Weekly  │
├─────────────────────────────┼──────────┼─────────┤
│ WW – Advantage+ Leads (CBO) │ $50      │ $350    │
└─────────────────────────────┴──────────┴─────────┘

TIER SUMMARY (week 1):
- Tier 1 (Winners):    $0  (none yet)
- Tier 2 (Performers): $0  (none yet)
- Tier 3 (Testing):    $350 (100% — entire launch is a test)
- Tier 4 (Kill):       $0
```

---

## Implementation

1. **Confirm target CPL with Willis** — this is the single missing input that determines whether $50/day is enough.
2. **Get budget sign-off in writing** before `@vortex` writes a hook. Skill rule: don't build creative for a budget the client hasn't agreed to.
3. **Launch at $50/day flat for 7 days.** No bid caps, no manual placements. Let Andromeda find its footing.
4. **Day 4–7:** First diagnostic pull — dispatch `@zenith` for `metric-diagnosis`.
5. **Day 14+:** First *actual* reallocation review. By then we'll have real Tier 1/2/3/4 ranks and the standard skill output applies.

---

## Observation period

- **72h** after launch before any kill/scale decision.
- **7 days** before first formal reallocation.
- **Next review (this plan):** 2026-05-18, assuming launch on 2026-05-15.

---

## Open questions for Jake

1. What's the target CPL Willis has signed off on?
2. What's the monthly cap the client has agreed to fund?
3. Single metro or multi-metro at launch? (affects daily floor)
