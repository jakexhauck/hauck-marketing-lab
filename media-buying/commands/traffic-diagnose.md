# /traffic diagnose - Run Metric Diagnosis

Quick access to @zenith metric diagnosis without full Traffic Command activation.

## Usage
```
/traffic diagnose                  # General diagnosis prompt
/traffic diagnose {campaign_name}  # Diagnose specific campaign
```

## What It Does

1. Activates @zenith (Metrics Analyst)
2. Runs the metric-diagnosis skill
3. Returns root cause analysis with recommended actions

## Expected Input

Provide campaign metrics:
```
REQUIRED:
- Campaign/ad set name
- Spend (total and daily)
- CPM, CTR, CPC
- CVR (landing page)
- CPA and ROAS
- Duration (days running)

OPTIONAL:
- Frequency
- Historical comparison
- Creative breakdown
```

## Output Format

```
METRIC DIAGNOSIS: {Campaign}

CURRENT METRICS:
[table of actual vs benchmark]

PRIMARY BOTTLENECK: {metric}
ROOT CAUSE: {cause}

RECOMMENDATIONS:
1. [action] - Owner: [@agent]
2. [action] - Owner: [@agent]
```

## Quick Example

```
User: /traffic diagnose [CLIENT] Challenge
      Spend: $2,500
      CPM: $45
      CTR: 0.6%
      CPA: $75 (target: $30)

Zenith: DIAGNOSIS: CPM high + CTR low = Creative problem
        ROOT CAUSE: Insufficient creative diversity

        RECOMMENDATION:
        1. Dispatch @vortex for 20+ new diverse creatives
        2. Pause bottom 3 performing ads
        3. Wait 72h before re-evaluating
```

## Related Commands
- `/traffic` - Full Traffic Command activation
- `/traffic scale` - Check scaling readiness
- `/traffic hooks` - Generate new hooks
