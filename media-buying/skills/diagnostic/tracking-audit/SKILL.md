---
name: tracking-audit
description: Pixel and CAPI verification for data integrity
primary-agent: nexus
expert-source: Media Buying Expert
---

# Tracking Audit Skill

## When to Use
- Before any campaign launch
- Zero conversions appearing
- Attribution discrepancies
- CAPI setup verification

## Pre-Launch Audit Checklist

### 1. Pixel Verification
```
BASIC CHECKS:
□ Pixel ID is correct
□ Pixel installed on ALL pages
□ Pixel firing on page load
□ No duplicate pixels
□ Events Manager shows recent activity

TOOL: Meta Pixel Helper (Chrome)
```

### 2. Event Hierarchy
```
REQUIRED EVENTS:
□ PageView - All pages
□ ViewContent - Product/sales pages
□ Lead - Form submissions
□ Purchase - Thank you page

EVENT PARAMETERS:
□ content_ids (for catalog)
□ value (for value optimization)
□ currency (BRL)
□ content_type (optional)
```

### 3. CAPI Verification
```
MANDATORY PARAMETERS:
□ event_name
□ event_time
□ action_source = "website"
□ event_source_url
□ user_data (at least one)

USER DATA REQUIRED:
□ client_ip_address
□ client_user_agent
□ fbp (Facebook browser ID)
□ fbc (click ID if available)
□ external_id (your user ID)

HIGH-VALUE (HASHED):
□ em (email)
□ ph (phone)
□ fn (first name)
□ ln (last name)
```

### 4. Deduplication
```
CRITICAL CHECK:
□ event_id matches between pixel and CAPI
□ Same event only counted once
□ Test with real conversion

COMMON ISSUES:
- Different event_id = double counting
- Missing event_id = no dedup
- Timestamp mismatch = potential issues
```

### 5. Match Rate (EMQ)
```
TARGET SCORES:
9-10 = Excellent (maintain)
7-8 = Good (minor improvements)
5-6 = Acceptable (add parameters)
3-4 = Poor (priority fix)
1-2 = Critical (stop spending)

IMPROVEMENT PRIORITY:
1. Add email (em)
2. Add phone (ph)
3. Add names (fn, ln)
4. Add location (ct, st, zp)
```

## Audit Output Format

```
TRACKING AUDIT: {Domain/Funnel}
DATE: {Date}
AUDITOR: @nexus

PIXEL STATUS:
├── Pixel ID: {ID}
├── Status: {ACTIVE/INACTIVE}
├── Last activity: {timestamp}
└── Duplicate pixels: {Y/N}

CAPI STATUS:
├── Configured: {Y/N}
├── Access token: {valid/expired/missing}
├── Test events: {receiving/not receiving}
├── Deduplication: {working/broken}
└── Match rate: {X}/10

EVENT AUDIT:
┌─────────────────┬────────┬────────────┬────────┐
│ Event           │ Pixel  │ CAPI       │ Params │
├─────────────────┼────────┼────────────┼────────┤
│ PageView        │ {✓/✗}  │ {✓/✗}      │ {✓/✗}  │
│ ViewContent     │ {✓/✗}  │ {✓/✗}      │ {✓/✗}  │
│ Lead            │ {✓/✗}  │ {✓/✗}      │ {✓/✗}  │
│ Purchase        │ {✓/✗}  │ {✓/✗}      │ {✓/✗}  │
└─────────────────┴────────┴────────────┴────────┘

ISSUES FOUND:
1. {issue} - Severity: {HIGH/MEDIUM/LOW}
2. {issue} - Severity: {HIGH/MEDIUM/LOW}

FIX PRIORITY:
1. {fix} - Blocks: {launch/optimization/nothing}
2. {fix} - Blocks: {launch/optimization/nothing}

LAUNCH READY: {YES / NO / CONDITIONAL}
If conditional: Fix {items} before launch
```

## Expert Attribution
- **Media Buying Expert**: CAPI priority, event hierarchy
