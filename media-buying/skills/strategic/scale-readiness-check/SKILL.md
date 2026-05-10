---
name: scale-readiness-check
description: Comprehensive assessment before scaling campaigns
primary-agent: stratos
expert-source: Performance Expert, Media Buying Expert
---

# Scale Readiness Check Skill

## When to Use
- Before increasing budget >20%
- Before duplicating winning ad sets
- Weekly health check on profitable campaigns

## The 4 Pillars of Scale Readiness

### Pillar 1: Metrics Stability
```
ALL MUST BE TRUE:
□ CPA stable (±15%) for 7+ days
□ ROAS > 2x for 7+ consecutive days
□ CTR not declining (flat or up)
□ CVR stable on landing page
□ No major volatility (no 2x swings)
□ Spend > $1,000 in test period
```

### Pillar 2: Creative Health
```
ALL MUST BE TRUE:
□ 15+ active creatives per ad set
□ Creative diversity score: HIGH
  - 5+ different angles in rotation
  - Mix of formats (video/static/carousel)
□ No single creative >40% of spend
□ Winning creatives identified (3+)
□ New creatives in production pipeline
□ Frequency < 2.5 across all creatives
```

### Pillar 3: Tracking Health
```
ALL MUST BE TRUE:
□ CAPI configured and sending events
□ Match rate > 60% (ideally >80%)
□ No tracking issues in last 7 days
□ Conversion values accurate
□ Events firing in correct sequence
□ Deduplication working
```

### Pillar 4: Infrastructure
```
ALL MUST BE TRUE:
□ Sales team can handle +30% volume
□ Support/fulfillment capacity ready
□ Cash flow supports longer payback
  - Can wait 30-60 days for ROI
□ Upsells/back-end offers ready
□ Follow-up sequences active
□ No operational bottlenecks
```

## Scaling Protocol

### Safe Scaling Rules
```
DAILY INCREASES:
- Maximum: 20% per day
- Ideal: 15% per day
- Never: >50% overnight

TIMING:
- Increase in morning (give algorithm full day)
- Wait 24-48h between increases
- Pause scaling if metrics wobble

SEQUENCE:
Day 1: Hold (observe)
Day 2: +15-20% if stable
Day 3: Hold (observe)
Day 4: +15-20% if still stable
Day 5: Hold (observe)
...repeat
```

### When to Pause Scaling
```
PAUSE IF ANY:
□ CPA increases >30% after scale
□ CTR drops >20% after scale
□ ROAS drops below target
□ Frequency spikes >2.5
□ CPM increases >40%

WAIT: 72 hours before resuming
```

## Output: Scale Readiness Report

```
SCALE READINESS CHECK: {Campaign}
DATE: {Date}

CURRENT PERFORMANCE:
- Daily spend: ${amount}
- CPA: ${actual} (target: ${target})
- ROAS: {X}x (target: {Y}x)
- Days stable: {N}

PILLAR 1 - METRICS: {GREEN/YELLOW/RED}
□ CPA stable 7+ days: {✓/✗}
□ ROAS > 2x 7+ days: {✓/✗}
□ CTR trend: {stable/declining}
□ CVR trend: {stable/declining}
□ Spend > $1K: {✓/✗}
Score: {X}/5

PILLAR 2 - CREATIVE: {GREEN/YELLOW/RED}
□ Active creatives: {N} (target: 15+)
□ Diversity score: {high/medium/low}
□ Top creative %: {N}% (target: <40%)
□ Pipeline: {N} in production
□ Frequency: {N} (target: <2.5)
Score: {X}/5

PILLAR 3 - TRACKING: {GREEN/YELLOW/RED}
□ CAPI status: {working/issues}
□ Match rate: {N}/10 (target: >6)
□ Recent issues: {none/some}
□ Values accurate: {✓/✗}
Score: {X}/4

PILLAR 4 - INFRASTRUCTURE: {GREEN/YELLOW/RED}
□ Sales capacity: {ready/limited}
□ Support capacity: {ready/limited}
□ Cash flow: {healthy/tight}
□ Back-end: {ready/not ready}
Score: {X}/4

OVERALL VERDICT: {GREEN / YELLOW / RED}

GREEN = Scale by 20%
YELLOW = Fix {issues} first, then scale
RED = Do not scale. Address {blockers}

RECOMMENDED ACTION:
{specific recommendation}

SCALING SCHEDULE (if GREEN):
Day 1: ${current} → Hold
Day 2: ${current * 1.15} (if stable)
Day 4: ${current * 1.32} (if stable)
Day 6: ${current * 1.52} (if stable)

NEXT REVIEW: {date}
```

## Expert Attribution
- **Performance Expert**: 72-hour rule, stability requirements
- **Media Buying Expert**: Infrastructure readiness, back-end capacity
