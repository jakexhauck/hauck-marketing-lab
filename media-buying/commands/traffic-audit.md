# /traffic audit - Full Campaign Audit

Quick access to @nexus tracking audit + comprehensive campaign review.

## Usage
```
/traffic audit                # Full audit guide
/traffic audit {domain/url}   # Audit specific property
```

## What It Does

1. Activates @nexus (Tracking Specialist)
2. Runs tracking-audit skill
3. Returns comprehensive audit report

## Audit Components

### 1. Pixel Verification
- Pixel ID correct
- Installed on all pages
- Events firing properly
- No duplicate pixels

### 2. CAPI Status
- CAPI configured
- Access token valid
- Test events received
- Deduplication working

### 3. Event Hierarchy
```
PageView → ViewContent → Lead/ATC → Purchase
```

### 4. Match Rate (EMQ)
- Current score (1-10)
- Missing parameters
- Improvement recommendations

## Output Format

```
TRACKING AUDIT: {Domain}

PIXEL STATUS:
├── Pixel ID: {ID} - {ACTIVE/INACTIVE}
├── Events firing: {Y/N}
└── Duplicates: {Y/N}

CAPI STATUS:
├── Configured: {Y/N}
├── Deduplication: {WORKING/BROKEN}
└── Match rate: {X}/10

EVENT AUDIT:
[table of events and status]

ISSUES FOUND:
1. {issue} - Severity: {HIGH/MEDIUM/LOW}

FIX PRIORITY:
1. {fix} - Blocks: {launch/optimization/nothing}

LAUNCH READY: {YES/NO/CONDITIONAL}
```

## Pre-Launch Checklist

```
□ Pixel ID correct on all pages
□ CAPI access token valid
□ Test events received
□ Deduplication working
□ Match rate > 60%
□ Event parameters complete
□ Values accurate
```

## Related Commands
- `/traffic diagnose` - When tracking looks fine but results are bad
- `/traffic scale` - Includes tracking check in readiness
