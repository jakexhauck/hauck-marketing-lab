---
kind: scale_checks
client: willis-windows
created_at: 2026-05-23T22:38:46.619956+00:00
title: "CBO, one broad Advantage+ ad set, all 3 creatives, $30/day — but flag creative starvation"
summary: "At $30/day with 3 creatives, splitting into 2 ad sets fragments learning. Run a single broad CBO ad set, feed all 3 creatives, treat the 2 'ready audiences' as future test cells once creative count clears 10+. Bid: Lowest cost is correct for learning phase."
inputs:
  daily_budget: 30
  objective: "Sales"
  audience_count: 2
  creative_count: 3
  bid_strategy: "Lowest cost"
---

```json
{"headline":"CBO, one broad Advantage+ ad set, all 3 creatives, $30/day — but flag creative starvation","summary":"At $30/day with 3 creatives, splitting into 2 ad sets fragments learning. Run a single broad CBO ad set, feed all 3 creatives, treat the 2 'ready audiences' as future test cells once creative count clears 10+. Bid: Lowest cost is correct for learning phase.","cbo_or_abo":"cbo","ad_sets":[{"name":"WW-PR-BROAD-AdvSales-2026-05","budget":30,"audience":"Broad (Advantage+ Sales, no detailed targeting, location-locked to service area, 25-65, all genders)","creatives":3}],"naming_convention":"WW-{stage}-{audience}-{objective}-{YYYY-MM} | Ad set: same root | Ad: WW-{format}-{angle}-{hook}-v{n}","build_order":["Confirm Advantage+ Sales eligibility and pixel/CAPI health","Create CBO campaign: WW-PR-CBO-AdvSales-2026-05, $30/day, Lowest cost","Create 1 ad set: WW-PR-BROAD-AdvSales-2026-05, broad targeting, service-area geo only","Upload all 3 creatives as separate ads under that ad set","Set conversion event to Purchase (or Lead if Sales pixel isn't firing real purchases)","Publish, then do not touch for 72 hours or $500 spend, whichever comes first","Queue 10+ new creative concepts immediately — current count is the bottleneck"]}
```

# Stratos — Campaign Architecture: Willis Windows

Sir, the numbers force the hand here. $30/day with 3 creatives is sub-Andromeda territory. Splitting budget across 2 ad sets would starve both. One broad ad set, all creatives in, then fix the creative pipeline.

## Verdict

**CBO, single ad set, broad, Lowest cost.** Justification below.

### Why CBO over ABO
- $30/day is too thin to manually balance ABO budgets across multiple ad sets.
- CBO lets Meta shift the $30 toward whichever creative/placement is learning fastest.
- Andromeda-era guidance (ref: Expert Source C): 1-2 campaigns max, trust the algorithm.

### Why 1 ad set, not 2
- Meta needs ~50 conversions to exit learning. At $30/day, even one ad set will struggle to hit that inside 14 days unless CPA is under ~$8.
- Two ad sets = two learning phases = two times longer to clean signal. Not worth it on this budget.
- The "2 audiences ready" are an asset, but they belong in a v2 test cell once creative count is above 10.

### Why broad, not the prepped audiences
- Advantage+ Sales ignores most manual targeting anyway. Feeding it a custom audience at this budget just confuses the bidder.
- Geo-lock to Willis's service radius is the only restriction worth applying.

### Why Lowest cost (not Cost cap / Bid cap)
- Lowest cost is correct during learning. Bid caps require known CPA baselines — we don't have one yet.
- Revisit once we have 7 days of stable CPA data.

### The real risk: creative starvation
3 creatives is the floor of the floor. Andromeda baseline is 15-25 per ad set. Once one creative fatigues, you have two left and a dying ad set. The single most important next action is more creative, not more ad sets.

## Campaign Architecture Diagram

```
WW-PR-CBO-AdvSales-2026-05  [Campaign, CBO $30/day, Lowest cost]
└── WW-PR-BROAD-AdvSales-2026-05  [Ad set, Advantage+ Sales, broad, geo-locked]
    ├── WW-STATIC-100off-hook01-v1     (creative 1)
    ├── WW-STATIC-100off-hook02-v1     (creative 2)
    └── WW-STATIC-100off-hook03-v1     (creative 3)
```

## Naming Convention

```
Campaign:  WW-{stage}-{structure}-{objective}-{YYYY-MM}
Ad set:    WW-{stage}-{audience}-{objective}-{YYYY-MM}
Ad:        WW-{format}-{angle}-{hook}-v{n}

stage     = PR (prospecting) | RT (retargeting) | LAL
structure = CBO | ABO
audience  = BROAD | LAL1 | CUSTOM-{name}
format    = STATIC | UGC | VSL | CAR
```

## Build Order (run top-to-bottom in Ads Manager)

1. **Verify pixel + CAPI** are firing Purchase (or Lead) events cleanly. If not, fix before launching.
2. **Create campaign**: `WW-PR-CBO-AdvSales-2026-05`, objective Sales, Advantage+ Sales, CBO $30/day, Lowest cost.
3. **Create ad set**: `WW-PR-BROAD-AdvSales-2026-05`. Conversion location = Website. Geo = Willis service area only. Age 25-65. Leave detailed targeting empty. Placements = Advantage+.
4. **Upload all 3 ads** under that ad set with the naming convention above.
5. **Set conversion event** to the lowest-funnel event that has 7-day signal (Purchase preferred; Lead if Purchase volume is too low).
6. **Publish.** Do not touch for 72 hours or $500 spend, whichever comes first (ref: Expert Source B kill rules).
7. **In parallel**: brief Vortex on producing 10+ new creative concepts this week. Current count is the bottleneck, not the budget.

Quick caveat, Sir: "Sales" objective for a windows business usually means quote requests / consultations, not direct purchases. If the offer is "book a free quote," we should be running the Leads objective with calls/forms, not Sales. Worth a 30-second sanity check before you click publish.
