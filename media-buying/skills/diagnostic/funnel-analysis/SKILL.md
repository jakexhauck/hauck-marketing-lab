---
name: funnel-analysis
description: End-to-end funnel health check
primary-agent: stratos
expert-source: Media Buying Expert, Business Expert
---

# Funnel Analysis Skill

## When to Use
- Overall funnel performance review
- Identifying conversion bottlenecks
- Pre-scale funnel health check

## Funnel Stages Analysis

### Challenge Funnel Metrics
```
STAGE 1: Registration
- Cost per registration (CPR)
- Registration rate
- Benchmark: 15-30% of LP visitors

STAGE 2: Show Rate
- Day 1 show rate: 70%+ target
- Day 3 show rate: 60%+ target
- Day 5 show rate: 50%+ target

STAGE 3: Engagement
- Watch time
- Chat activity
- Replay views

STAGE 4: Close
- Offer conversion rate
- Application rate
- Call booking rate
- Close rate

STAGE 5: Back-End
- Upsell take rate
- Recurring revenue
- 90-day LTV
```

### Webinar Funnel Metrics
```
STAGE 1: Registration
- CPR target: $5-20
- Registration rate: 20-40%

STAGE 2: Show Rate
- Live show: 25-40%
- Replay: adds 10-20%

STAGE 3: Close
- Offer conversion: 5-15%
- Cart close: 3-8%
```

### VSL Funnel Metrics
```
STAGE 1: Traffic
- CPC target: $0.50-2.00
- CTR target: 1-3%

STAGE 2: Watch
- 50% completion: 40%+
- Full watch: 15-25%

STAGE 3: Convert
- VSL to checkout: 5-15%
- Checkout complete: 50-70%
```

## Bottleneck Identification

### Symptom → Stage → Solution
```
Good traffic + Low registrations:
→ Landing page problem
→ Test new headlines, reduce friction

Good registrations + Low shows:
→ Follow-up problem
→ Improve reminder sequence

Good shows + Low close:
→ Offer or sales problem
→ Review pitch, pricing, urgency

Good front-end + Low back-end:
→ Fulfillment or upsell problem
→ Review customer experience
```

## Output: Funnel Analysis Report

```
FUNNEL ANALYSIS: {Funnel Name}
DATE: {Date}
TYPE: {Challenge/Webinar/VSL/Call}

STAGE METRICS:
┌────────────────┬──────────┬───────────┬────────┐
│ Stage          │ Actual   │ Target    │ Status │
├────────────────┼──────────┼───────────┼────────┤
│ Traffic (CPC)  │ ${X}     │ ${Y}      │ {✓/⚠/✗}│
│ Registration % │ {X}%     │ {Y}%      │ {✓/⚠/✗}│
│ Show Rate      │ {X}%     │ {Y}%      │ {✓/⚠/✗}│
│ Close Rate     │ {X}%     │ {Y}%      │ {✓/⚠/✗}│
│ Upsell Rate    │ {X}%     │ {Y}%      │ {✓/⚠/✗}│
└────────────────┴──────────┴───────────┴────────┘

BOTTLENECK: Stage {N} - {Name}
IMPACT: Fixing would improve {metric} by {X}%

ROOT CAUSE ANALYSIS:
{Detailed analysis of why this stage underperforms}

RECOMMENDATIONS:
1. {Action} - Owner: {agent/team}
2. {Action} - Owner: {agent/team}

FUNNEL HEALTH: {GREEN/YELLOW/RED}
SCALE READY: {Y/N}
```

## Expert Attribution
- **Media Buying Expert**: Challenge funnel benchmarks, show rate targets
- **Business Expert**: Funnel math, LTV optimization
