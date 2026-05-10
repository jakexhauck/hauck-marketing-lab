---
name: attribution-analysis
description: Attribution window optimization and discrepancy analysis
primary-agent: nexus
expert-source: Performance Expert
---

# Attribution Analysis Skill

## When to Use
- Platform reporting doesn't match CRM
- Optimizing attribution windows
- Understanding conversion paths

## Attribution Windows

### Default Settings (Recommended)
```
CLICK ATTRIBUTION: 7 days
VIEW ATTRIBUTION: 1 day

WHY:
- 7-day click captures most journeys
- 1-day view minimizes inflation
- Balances accuracy vs. completeness
```

### Alternative Configurations
| Setting | Use Case | Trade-off |
|---------|----------|-----------|
| 1-day click | Quick decisions, low-ticket | Misses longer journeys |
| 28-day click | High-ticket, B2B | May over-attribute |
| 1-day click, no view | Conservative | Underreports |

### Post-iOS14 Reality
```
WHAT CHANGED:
- ~40% of iOS users opted out
- Delayed reporting (24-72h)
- Modeled conversions
- SKAdNetwork limitations

IMPLICATIONS:
- Trust directional trends, not exact numbers
- Compare platform to CRM for truth
- Expect 15-30% discrepancy
```

## Discrepancy Analysis

### Common Discrepancy Sources
```
META HIGHER THAN CRM:
- View-through conversions
- Cross-device attribution
- Modeled conversions
- Longer attribution window

CRM HIGHER THAN META:
- iOS14 data loss
- Pixel issues
- CAPI not configured
- Delayed events
```

### Acceptable Discrepancy Ranges
| Discrepancy | Status | Action |
|-------------|--------|--------|
| < 15% | Normal | Monitor |
| 15-30% | Elevated | Investigate |
| 30-50% | Concerning | Fix tracking |
| > 50% | Critical | Stop spending |

### Investigation Checklist
```
IF Meta > CRM by 30%+:
□ Check view-through settings
□ Compare attribution windows
□ Look for duplicate events
□ Check for modeled inflation

IF CRM > Meta by 30%+:
□ Verify pixel installation
□ Check CAPI configuration
□ Look for iOS14 gaps
□ Check event delays
```

## Output: Attribution Report

```
ATTRIBUTION ANALYSIS: {Account/Campaign}
DATE: {Date}
PERIOD: {Date range}

ATTRIBUTION SETTINGS:
- Click window: {X} days
- View window: {X} day(s)
- Conversion event: {event}

PLATFORM COMPARISON:
┌─────────────┬──────────┬──────────┬────────────┐
│ Source      │ Conv.    │ Revenue  │ ROAS       │
├─────────────┼──────────┼──────────┼────────────┤
│ Meta        │ {X}      │ ${Y}     │ {Z}x       │
│ CRM/Truth   │ {X}      │ ${Y}     │ {Z}x       │
│ Discrepancy │ {X}%     │ ${Y}%    │ -          │
└─────────────┴──────────┴──────────┴────────────┘

DISCREPANCY STATUS: {NORMAL/ELEVATED/CONCERNING}

ANALYSIS:
{Explanation of discrepancy sources}

RECOMMENDATIONS:
1. {Action to improve accuracy}
2. {Tracking fix if needed}
3. {Attribution setting change if needed}

TRUE PERFORMANCE ESTIMATE:
Based on CRM data, adjusted ROAS: {X}x
```

## Expert Attribution
- **Performance Expert**: Post-iOS14 reality, discrepancy benchmarks
