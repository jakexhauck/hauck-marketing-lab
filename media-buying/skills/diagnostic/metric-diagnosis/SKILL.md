---
name: metric-diagnosis
description: Root cause analysis for campaign performance issues
primary-agent: zenith
expert-source: Performance Expert, Media Buying Expert
---

# Metric Diagnosis Skill

## When to Use
- Performance dropping unexpectedly
- Unclear why metrics are off
- Need systematic troubleshooting

## The Metric Stack

### Analysis Order (Top-Down)
```
1. CPM → Creative quality signal (Andromeda)
2. CTR → Message-market fit
3. CPC → Efficiency metric
4. CVR → Landing page health
5. CPA → Overall campaign health
6. ROAS → Profitability
```

## Diagnostic Matrix

### CPM Problems
| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| CPM > $30 (cold) | Creative fatigue | New creatives |
| CPM > $50 (any) | Algorithm penalty | Check diversity |
| CPM climbing daily | Andromeda restriction | More angles |
| CPM spike overnight | Auction pressure | Check competition |

### CTR Problems
| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| CTR < 0.8% | Hook not working | Test new hooks |
| CTR dropping over time | Creative fatigue | Refresh creatives |
| CTR varies by placement | Placement mismatch | Adjust creative format |
| Good CPM + Low CTR | Targeting too broad | Actually OK in Andromeda |

### CVR Problems
| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| CVR < 1% | LP problem | Audit landing page |
| Good CTR + Low CVR | Message mismatch | Align ad to LP |
| CVR dropping | Page fatigue | Test new LP |
| CVR varies by device | Mobile issues | Check mobile UX |

### CPA Problems
| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| CPA > 2x target | Multiple issues | Full diagnosis |
| CPA climbing slowly | Fatigue | Refresh cycle |
| CPA volatile | Learning phase | Wait 72h |
| CPA good but low volume | Budget too low | Increase budget |

## Diagnosis Process

### Step 1: Gather Data
```
REQUIRED METRICS (7-day window):
□ Impressions
□ CPM
□ CTR
□ CPC
□ Clicks
□ Landing page views
□ Conversions
□ CPA
□ ROAS
□ Frequency
```

### Step 2: Identify Bottleneck
```
IF CPM high + CTR low:
  → Creative problem (dispatch @vortex)

IF CPM OK + CTR OK + CVR low:
  → Landing page problem (escalate to CMO)

IF all metrics OK + zero conversions:
  → Tracking problem (dispatch @nexus)

IF metrics were good, now bad:
  → Fatigue or algorithm reset (wait 72h)
```

### Step 3: Quantify Impact
```
Calculate: "What would metrics be if X was fixed?"

Example:
Current CPA: $50
If CTR improved from 0.8% to 1.5%:
Expected CPA: $50 × (0.8/1.5) = $26.67
Potential savings: $23.33/conversion
```

## Output: Diagnostic Report

```
METRIC DIAGNOSIS: {Campaign}
DATE: {Date}
PERIOD: {Date range}

CURRENT METRICS:
┌─────────────┬──────────┬───────────┬────────┐
│ Metric      │ Actual   │ Benchmark │ Status │
├─────────────┼──────────┼───────────┼────────┤
│ CPM         │ ${X}     │ ${Y}      │ {✓/⚠/✗}│
│ CTR         │ {X}%     │ {Y}%      │ {✓/⚠/✗}│
│ CPC         │ ${X}     │ ${Y}      │ {✓/⚠/✗}│
│ CVR         │ {X}%     │ {Y}%      │ {✓/⚠/✗}│
│ CPA         │ ${X}     │ ${Y}      │ {✓/⚠/✗}│
│ ROAS        │ {X}x     │ {Y}x      │ {✓/⚠/✗}│
│ Frequency   │ {X}      │ <2.5      │ {✓/⚠/✗}│
└─────────────┴──────────┴───────────┴────────┘

PRIMARY BOTTLENECK: {metric}
ROOT CAUSE: {cause}
CONFIDENCE: {high/medium/low}

IMPACT ANALYSIS:
If {metric} improved from {X} to {Y}:
- Expected CPA improvement: {Z}%
- Expected ROAS improvement: {Z}x

RECOMMENDATIONS:
1. {action} - Owner: {agent}
2. {action} - Owner: {agent}
3. {action} - Owner: {agent}

ESCALATION NEEDED: {Y/N}
If yes, to: {agent/CMO}
```

## Expert Attribution
- **Performance Expert**: CPM as creative quality signal
- **Media Buying Expert**: Full-funnel diagnosis framework
