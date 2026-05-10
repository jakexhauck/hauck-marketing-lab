---
name: budget-allocation
description: Budget distribution and reallocation strategy
primary-agent: zenith
expert-source: Performance Expert, Media Buying Expert
---

# Budget Allocation Skill

## When to Use
- Distributing budget across campaigns
- Reallocating from losers to winners
- Planning monthly ad spend

## Allocation Framework

### Tier System
```
TIER 1 - WINNERS (60% of budget)
- ROAS > 3x
- CPA < target
- Stable for 7+ days
- Priority: Maximum scale

TIER 2 - PERFORMERS (25% of budget)
- ROAS 2-3x
- CPA at or near target
- Showing improvement
- Priority: Optimize, then scale

TIER 3 - TESTING (15% of budget)
- New campaigns
- New creatives
- Hypothesis testing
- Priority: Gather data

TIER 4 - KILL (0% of budget)
- ROAS < 1.5x for 5+ days
- CPA > 2x target
- No improvement trend
- Priority: Shut down
```

### Reallocation Process
```
WEEKLY REALLOCATION CYCLE:

STEP 1: Rank all ad sets by ROAS
- Sort highest to lowest
- Include spend and conversion data

STEP 2: Calculate performance tiers
- Tier 1: Top 20% by ROAS
- Tier 2: Middle 60%
- Tier 3: Testing campaigns
- Tier 4: Bottom 20%

STEP 3: Shift budget
- Move 20% from Tier 4 → Tier 1
- Move 10% from low Tier 2 → high Tier 2
- Keep Tier 3 stable (testing)

STEP 4: Document changes
- Record all shifts
- Set 72h observation period
```

## Budget Sizing

### Minimum Viable Budget
```
BY FUNNEL TYPE:

Paid Challenge:
- Minimum: $10K/week
- Recommended: $25K/week
- Scale: $50K+/week

Webinar:
- Minimum: $5K/week
- Recommended: $15K/week
- Scale: $30K+/week

VSL/Direct:
- Minimum: $2K/week
- Recommended: $5K/week
- Scale: $15K+/week

Lead Gen:
- Minimum: $1K/week
- Recommended: $3K/week
- Scale: $10K+/week
```

### Learning Phase Budget
```
FORMULA:
Daily budget ≥ Target CPA × 2

EXAMPLE:
Target CPA: $25
Minimum daily: $50
Weekly minimum: $350

REASON:
Algorithm needs 50 conversions/week
to exit learning phase efficiently
```

## Campaign Budget Optimization (CBO)

### When to Use CBO
```
USE CBO WHEN:
□ Multiple ad sets with different creatives
□ Same audience/targeting
□ Want algorithm to optimize
□ Budget > $100/day

USE ABO WHEN:
□ Testing specific hypotheses
□ Need controlled spend per test
□ Budget < $50/day per test
```

### CBO Distribution Rules
```
DEFAULT: Let algorithm distribute

MANUAL OVERRIDES:
- Set minimum spend per ad set (20% of total)
- Cap maximum spend per ad set (50% of total)
- Remove poorly performing ad sets

OBSERVATION:
- Watch for 80/20 distribution
- If one ad set gets 80%+, consider splitting
```

## Output Format

```
BUDGET ALLOCATION PLAN: {Account/Client}
DATE: {Date}
TOTAL BUDGET: ${amount}/week

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CURRENT DISTRIBUTION:
┌─────────────────┬──────────┬─────────┬────────┐
│ Campaign/AdSet  │ Spend    │ ROAS    │ Tier   │
├─────────────────┼──────────┼─────────┼────────┤
│ {Campaign 1}    │ ${X}     │ {X}x    │ Tier 1 │
│ {Campaign 2}    │ ${X}     │ {X}x    │ Tier 2 │
│ {Campaign 3}    │ ${X}     │ {X}x    │ Tier 3 │
│ {Campaign 4}    │ ${X}     │ {X}x    │ Tier 4 │
└─────────────────┴──────────┴─────────┴────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDED ALLOCATION:
┌─────────────────┬──────────┬─────────┬────────┐
│ Campaign/AdSet  │ Current  │ New     │ Change │
├─────────────────┼──────────┼─────────┼────────┤
│ {Campaign 1}    │ ${X}     │ ${Y}    │ +{Z}%  │
│ {Campaign 2}    │ ${X}     │ ${Y}    │ +{Z}%  │
│ {Campaign 3}    │ ${X}     │ ${Y}    │ ={Z}   │
│ {Campaign 4}    │ ${X}     │ ${0}    │ KILL   │
└─────────────────┴──────────┴─────────┴────────┘

TOTAL REALLOCATION: ${amount} shifted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TIER SUMMARY:
- Tier 1 (Winners): ${X} ({Y}%)
- Tier 2 (Performers): ${X} ({Y}%)
- Tier 3 (Testing): ${X} ({Y}%)
- Tier 4 (Kill): ${0} (0%)

IMPLEMENTATION:
1. {Action with specific campaign}
2. {Action with specific campaign}
3. {Action with specific campaign}

OBSERVATION PERIOD: 72 hours
NEXT REVIEW: {Date}
```

## Expert Attribution
- **Performance Expert**: Tier system, 15-20-25% allocation
- **Media Buying Expert**: Funnel-specific budgeting
