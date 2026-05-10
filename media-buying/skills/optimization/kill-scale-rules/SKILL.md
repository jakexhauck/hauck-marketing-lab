---
name: kill-scale-rules
description: Data-driven rules for killing or scaling campaigns
primary-agent: zenith
expert-source: Performance Expert, Media Buying Expert
---

# Kill/Scale Rules Skill

## When to Use
- Making pause/continue decisions
- Determining budget increases
- Systematic campaign management

## Core Philosophy

```
"Data before emotion"
"Kill fast, scale slow"
"72 hours minimum before judging"
```

## Kill Rules (IMMEDIATE ACTION)

### Universal Kill Criteria
```
KILL IMMEDIATELY IF ANY ARE TRUE:

□ CPA > 2x target for 72h+ with $500+ spend
  → Campaign fundamentally broken

□ CTR < 0.5% after 5,000+ impressions
  → Creative not resonating at all

□ Zero conversions after $300+ spend
  → Tracking issue or total mismatch

□ CVR < 0.5% with 200+ clicks
  → Landing page or offer problem

□ ROAS < 0.5x for 5+ days
  → Not profitable, won't improve

□ Frequency > 3.5 with declining metrics
  → Audience exhausted
```

### Kill Thresholds by Funnel Type
```
CHALLENGE FUNNEL:
- Kill if: CPR > $50 after $500 spend
- Kill if: Show rate < 40% consistently

WEBINAR FUNNEL:
- Kill if: CPR > $30 after $500 spend
- Kill if: Show rate < 20%

HIGH-TICKET CALL:
- Kill if: CPL > $200 after $1,000 spend
- Kill if: Application rate < 5%

LOW-TICKET/ECOM:
- Kill if: ROAS < 1.5x after $300 spend
- Kill if: ATC rate < 1%
```

## Scale Rules (GRADUAL ACTION)

### Prerequisites for Scaling
```
ALL MUST BE TRUE BEFORE SCALING:

□ CPA < target for 72h+ minimum
□ CTR > 1.2% consistently
□ CVR > 2% on landing page
□ ROAS > 2x for 5+ days
□ Spend > $1,000 in test period
□ Frequency < 2.0
□ 15+ diverse creatives active
□ No major metric volatility
```

### Scaling Protocol
```
SAFE SCALING SEQUENCE:

Day 1-3: HOLD
- Validate metrics are stable
- No changes

Day 4: INCREASE 15-20%
- If metrics hold for 72h
- Document baseline

Day 5-6: OBSERVE
- Watch for metric degradation
- No additional changes

Day 7: INCREASE 15-20%
- If still stable
- Never exceed 20% per increase

REPEAT until goal budget or issues
```

### Maximum Budget Velocity
```
DAILY INCREASE LIMITS:
- Aggressive: 20% max
- Safe: 15%
- Conservative: 10%

NEVER:
- Double budget overnight
- Increase during learning phase
- Scale immediately after creative change
```

## Hold Rules (WAIT AND OBSERVE)

### When to Hold
```
HOLD (NO ACTION) WHEN:

□ Campaign in learning phase
□ Less than 72 hours of data
□ Recent changes made (wait 48h)
□ Metrics volatile but improving
□ Seasonal/market disruption
□ Platform issues reported
```

### Learning Phase Rules
```
LEARNING NEEDS:
- ~50 optimization events
- Stable for 7 days after learning

DURING LEARNING:
- Don't make changes
- Expect volatility
- Budget must support 50 events/week
```

## Decision Framework

```
DECISION TREE:

1. Has campaign spent $500+?
   NO → Wait until $500 spend
   YES → Continue to step 2

2. Has it been 72+ hours?
   NO → Wait until 72h
   YES → Continue to step 3

3. Check KILL criteria (any true = KILL)
   ANY TRUE → KILL immediately
   ALL FALSE → Continue to step 4

4. Check SCALE criteria (all must be true)
   ALL TRUE → Scale by 15-20%
   ANY FALSE → HOLD and optimize
```

## Output Format

```
KILL/SCALE ANALYSIS: {Campaign}
DATE: {Date}
PERIOD: {Start} to {End}

SPEND: ${amount}
DURATION: {X} days

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KILL CRITERIA CHECK:
□ CPA > 2x target (72h, $500+)? {Y/N}
  Actual: ${X} vs Target: ${Y}

□ CTR < 0.5% (5K impressions)? {Y/N}
  Actual: {X}%

□ Zero conversions ($300+)? {Y/N}
  Conversions: {X}

□ CVR < 0.5% (200+ clicks)? {Y/N}
  Actual: {X}%

□ ROAS < 0.5x (5+ days)? {Y/N}
  Actual: {X}x

□ Frequency > 3.5 + declining? {Y/N}
  Actual: {X}

KILL TRIGGERED: {YES/NO}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCALE CRITERIA CHECK:
□ CPA < target for 72h+? {Y/N}
□ CTR > 1.2% consistently? {Y/N}
□ CVR > 2%? {Y/N}
□ ROAS > 2x for 5+ days? {Y/N}
□ Spend > $1,000? {Y/N}
□ Frequency < 2.0? {Y/N}
□ 15+ diverse creatives? {Y/N}

SCALE READY: {YES/NO}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERDICT: {KILL / SCALE / HOLD}

ACTION:
{Specific action to take}

NEXT REVIEW: {Date}
```

## Expert Attribution
- **Performance Expert**: 72h rule, $500 spend minimum, 20% scaling limit
- **Media Buying Expert**: Funnel-specific thresholds, back-end focus
