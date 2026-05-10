---
name: campaign-monitor
description: Autonomous monitoring rules and alerts
primary-agent: aurelius
expert-source: Performance Expert, Media Buying Expert
---

# Campaign Monitor Skill

## When to Use
- Setting up monitoring cadence
- Defining alert thresholds
- Establishing review rhythms

## Monitoring Cadence

### Daily Checks (Every Day)
```
QUICK HEALTH CHECK (5 min):
□ Any campaigns in red (ROAS < 1x)?
□ Any zero-conversion alerts?
□ Budget pacing on track?
□ Any critical metric swings (>30%)?

IF ANY RED FLAGS:
→ Escalate to deeper analysis
```

### Weekly Review (Once per Week)
```
COMPREHENSIVE REVIEW (30 min):

PERFORMANCE SUMMARY:
□ Total spend vs budget
□ Overall ROAS
□ Top 3 performers
□ Bottom 3 performers
□ Week-over-week trends

OPTIMIZATION ACTIONS:
□ Kill/scale decisions
□ Budget reallocation
□ Creative refresh needs
□ Tracking health check

NEXT WEEK PLAN:
□ New tests to launch
□ Scaling priorities
□ Creative pipeline
```

### Monthly Deep Dive (Once per Month)
```
STRATEGIC REVIEW (2 hours):

FULL ANALYSIS:
□ Month-over-month comparison
□ Funnel performance analysis
□ Unit economics validation
□ LTV/CAC trends
□ Creative performance trends

STRATEGIC DECISIONS:
□ Funnel pivot needed?
□ Offer changes?
□ Budget restructuring?
□ New channel consideration?

CMO REPORT:
□ Prepare monthly summary
□ Key wins and learnings
□ Recommendations for next month
```

## Alert Thresholds

### Critical Alerts (Immediate Action)
```
🔴 CRITICAL - STOP AND INVESTIGATE:

□ Zero conversions for 24h+ (spending > $200)
□ ROAS drops below 0.5x suddenly
□ CPM spikes > 100% overnight
□ CTR drops > 50% suddenly
□ Pixel/CAPI stops sending events
□ Budget overspend > 150% of daily

ACTION: Stop campaign, investigate, escalate
```

### Warning Alerts (Same-Day Action)
```
🟡 WARNING - INVESTIGATE TODAY:

□ CPA > target by 50% for 48h
□ CTR trending down 30% over 3 days
□ Frequency > 2.5
□ CVR drop > 25%
□ Budget underspend > 50%

ACTION: Analyze, document, plan fix
```

### Watch Alerts (Monitor Closely)
```
🟢 WATCH - KEEP EYE ON:

□ CPA increasing 15-25%
□ CTR trending slightly down
□ Frequency approaching 2.0
□ New creative underperforming
□ Learning phase extended

ACTION: Log, continue monitoring
```

## Automated Rules Framework

### Rule Structure
```
IF [condition] THEN [action]
WITH [parameters] FOR [duration]
ALERT [who]
```

### Example Rules

```
RULE: Kill Poor Performers
IF CPA > 2x target
AND spend > $500
AND duration > 72 hours
THEN pause campaign
ALERT @zenith, @aurelius

---

RULE: Scale Winners
IF ROAS > 3x
AND stable for 7 days
AND frequency < 2.0
THEN increase budget 15%
ALERT @aurelius for approval

---

RULE: Creative Fatigue Alert
IF CTR drops > 20% week-over-week
AND frequency > 2.5
THEN flag for creative refresh
DISPATCH @vortex for new creatives

---

RULE: Tracking Alert
IF conversions = 0
AND spend > $300
AND clicks > 100
THEN pause and audit
DISPATCH @nexus for tracking audit
```

## Monitoring Dashboard

### Daily View
```
┌─────────────────────────────────────────┐
│          TRAFFIC COMMAND PULSE          │
│              {Date}                     │
├─────────────────────────────────────────┤
│                                         │
│  SPEND TODAY:    ${amount}              │
│  CONVERSIONS:    {count}                │
│  CPA:            ${amount}              │
│  ROAS:           {X}x                   │
│                                         │
│  STATUS:         {🟢/🟡/🔴}             │
│                                         │
├─────────────────────────────────────────┤
│  ALERTS:                                │
│  {list of any active alerts}            │
│                                         │
├─────────────────────────────────────────┤
│  TOP PERFORMER: {campaign}              │
│  NEEDS ATTENTION: {campaign}            │
│                                         │
└─────────────────────────────────────────┘
```

### Weekly View
```
WEEKLY SUMMARY: {Week of Date}

OVERALL:
- Total spend: ${amount}
- Total conversions: {count}
- Average CPA: ${amount}
- Overall ROAS: {X}x

CAMPAIGN BREAKDOWN:
┌───────────────┬──────────┬──────┬───────┐
│ Campaign      │ Spend    │ Conv │ ROAS  │
├───────────────┼──────────┼──────┼───────┤
│ {Campaign 1}  │ ${X}     │ {Y}  │ {Z}x  │
│ {Campaign 2}  │ ${X}     │ {Y}  │ {Z}x  │
│ {Campaign 3}  │ ${X}     │ {Y}  │ {Z}x  │
└───────────────┴──────────┴──────┴───────┘

WoW COMPARISON:
- Spend: {+/-}${X} ({+/-}X%)
- Conversions: {+/-}{Y} ({+/-}Y%)
- CPA: {+/-}${Z} ({+/-}Z%)

ACTIONS TAKEN:
- {Action 1}
- {Action 2}

NEXT WEEK PRIORITIES:
- {Priority 1}
- {Priority 2}
```

## Expert Attribution
- **Performance Expert**: Alert thresholds, monitoring rhythm
- **Media Buying Expert**: Review cadence, CMO reporting structure
