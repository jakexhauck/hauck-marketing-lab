---
name: creative-fatigue-detector
description: Detect creative fatigue and recommend refreshes
primary-agent: vortex
expert-source: Performance Expert, Media Buying Expert
---

# Creative Fatigue Detector Skill

## When to Use
- CTR declining over time
- CPM increasing without explanation
- Frequency climbing above 2.5
- Performance slowly degrading

## Fatigue Indicators

### Primary Signals
| Signal | Threshold | Severity |
|--------|-----------|----------|
| CTR drop | -20% over 7 days | Medium |
| CTR drop | -30% over 7 days | High |
| CPM rise | +30% over 7 days | Medium |
| CPM rise | +50% over 7 days | High |
| Frequency | > 2.5 | Medium |
| Frequency | > 3.5 | Critical |

### Secondary Signals
```
ENGAGEMENT METRICS:
- Video watch time declining
- Shares/saves decreasing
- Comments going negative
- ThruPlay % dropping

PERFORMANCE METRICS:
- CPA creeping up steadily
- ROAS slowly declining
- Conversion volume dropping
```

## Fatigue Levels

### Level 1: Early Warning
```
SYMPTOMS:
- CTR down 10-20%
- Frequency 2.0-2.5
- CPM up 15-25%

ACTION:
- Add 5-10 new creatives
- Pause bottom 20% performers
- Test new hooks (same angles)
```

### Level 2: Moderate Fatigue
```
SYMPTOMS:
- CTR down 20-30%
- Frequency 2.5-3.0
- CPM up 25-40%

ACTION:
- Add 15+ new creatives
- Introduce new angles
- Consider new formats
- Pause 30% of creatives
```

### Level 3: Severe Fatigue
```
SYMPTOMS:
- CTR down 30%+
- Frequency > 3.0
- CPM up 40%+

ACTION:
- Complete creative overhaul
- All new angles
- New formats (video→static, etc.)
- New messaging strategy
- Consider new offers
```

## Detection Process

### Step 1: Pull Data
```
REQUIRED METRICS (14-day):
- Daily CTR trend
- Daily CPM trend
- Average frequency
- Top creative performance
- Creative age (days active)
```

### Step 2: Calculate Trends
```
CTR_TREND = (CTR_last7 - CTR_prev7) / CTR_prev7
CPM_TREND = (CPM_last7 - CPM_prev7) / CPM_prev7
```

### Step 3: Score Fatigue
```
FATIGUE SCORE (0-10):
0-3: Healthy
4-5: Early warning
6-7: Moderate fatigue
8-10: Severe fatigue

FORMULA:
Score = (CTR_decline × 3) + (CPM_increase × 2) + (Frequency × 1)
Normalized to 0-10 scale
```

## Output: Fatigue Report

```
CREATIVE FATIGUE ANALYSIS: {Campaign}
DATE: {Date}
PERIOD ANALYZED: {Date range}

FATIGUE INDICATORS:
┌─────────────────┬─────────┬─────────┬──────────┐
│ Metric          │ Current │ 7d Ago  │ Change   │
├─────────────────┼─────────┼─────────┼──────────┤
│ CTR             │ {X}%    │ {Y}%    │ {-Z}%    │
│ CPM             │ ${X}    │ ${Y}    │ {+Z}%    │
│ Frequency       │ {X}     │ {Y}     │ {+Z}     │
│ ThruPlay %      │ {X}%    │ {Y}%    │ {-Z}%    │
└─────────────────┴─────────┴─────────┴──────────┘

FATIGUE SCORE: {X}/10
FATIGUE LEVEL: {1/2/3} - {Early/Moderate/Severe}

TOP FATIGUED CREATIVES:
1. {Creative ID} - Active {X} days, CTR down {Y}%
2. {Creative ID} - Active {X} days, CTR down {Y}%
3. {Creative ID} - Active {X} days, CTR down {Y}%

RECOMMENDED ACTIONS:
□ Add {X} new creatives
□ Pause {list of creatives}
□ Test angles: {new angles to try}
□ Format change: {if needed}

TIMELINE:
- Immediate: Pause worst performers
- This week: Add {X} new creatives
- Next week: Evaluate new vs old

DISPATCH TO @vortex:
Generate {X} hooks for angles: {list}
```

## Expert Attribution
- **Performance Expert**: Frequency thresholds, CPM as creative signal
- **Media Buying Expert**: Creative volume requirements
