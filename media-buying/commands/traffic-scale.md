# /traffic scale - Check Scaling Readiness

Quick access to @stratos scale readiness check.

## Usage
```
/traffic scale               # Scale readiness guidance
/traffic scale {campaign}    # Check specific campaign
```

## What It Does

1. Activates @stratos (Strategy Advisor)
2. Runs scale-readiness-check skill
3. Returns 4-pillar assessment with verdict

## The 4 Pillars

### 1. Metrics Stability
- CPA stable 7+ days
- ROAS > 2x consistently
- CTR not declining
- $1,000+ test spend

### 2. Creative Health
- 15+ active creatives
- 5+ different angles
- Frequency < 2.5
- No single creative > 40%

### 3. Tracking Health
- CAPI working
- Match rate > 60%
- No tracking issues

### 4. Infrastructure
- Sales team ready +30%
- Support capacity
- Cash flow for 30-60 day payback

## Output Format

```
SCALE READINESS: {Campaign}

PILLAR 1 - METRICS: [GREEN/YELLOW/RED]
PILLAR 2 - CREATIVE: [GREEN/YELLOW/RED]
PILLAR 3 - TRACKING: [GREEN/YELLOW/RED]
PILLAR 4 - INFRASTRUCTURE: [GREEN/YELLOW/RED]

VERDICT: [SCALE 20% / FIX FIRST / DO NOT SCALE]

RECOMMENDED ACTION:
[specific next steps]
```

## Scaling Protocol (If Approved)

```
Day 1: Hold
Day 2: +15-20% if stable
Day 3: Hold
Day 4: +15-20% if stable
Repeat...
```

## Related Commands
- `/traffic diagnose` - Metric diagnosis
- `/traffic` - Full Traffic Command activation
