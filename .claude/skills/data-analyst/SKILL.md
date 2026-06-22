---
name: data-analyst
description: Analyze ad campaign data, find revenue leaks and hidden opportunities, and write client-ready reports in plain English. Works with Meta Ads, Google Ads, and any CSV export. Use for monthly reporting and campaign optimization decisions.
---

# Data Analyst Skill

## Slash Command Usage

```
/analyze file="meta-ads-export.csv" client="Miami Smiles Dental" period="April 2026"
/weekly-report file="meta-ads-export.csv" client="Miami Smiles Dental"
/find-leak file="meta-ads-export.csv"
/compare file1="march-export.csv" file2="april-export.csv" client="Miami Smiles Dental"
/scorecard client="Miami Smiles Dental" goal="booked calls" budget=1500
```

## How to Export Data from Meta

Tell the client or do it yourself:
1. Ads Manager → select campaign(s) → click "Export" top right
2. Choose "Export Table Data" → select CSV
3. Set date range (last 7 days or last 30 days)
4. Save file and add to Claude Code workspace

## Full Analysis Workflow

```
/analyze file="[filename].csv" client="[NAME]" period="[DATE RANGE]" goal="[leads/calls/purchases]"
```

### Step 1: Load and parse the data
Read the CSV. Identify columns available. Calculate any missing metrics:
- CTR = Clicks / Impressions × 100
- CPR = Spend / Results
- Hook rate = ThruPlay or 3-second video views / Impressions (if available)

### Step 2: Surface-level assessment
- Total spend vs total results
- Average CPR vs industry benchmark for this niche
- Overall CTR vs benchmark (1.5%+ is healthy for local)
- CPM trends (rising CPM = audience fatigue or competitive pressure)

### Step 3: Ad-level breakdown
Sort all ads by CPR (best performers first).
- Top 3 ads: what's making them work? (hook type, format, offer?)
- Bottom 3 ads: what's killing them? (weak hook? bad CTA? wrong audience?)
- Any ads in learning phase that need more time before judging

### Step 4: Find the biggest opportunity
One sentence: the single change most likely to improve results this week.

### Step 5: Account health check
Flag any:
- Ads stuck in learning phase over 7 days
- Campaigns spending without any results
- Very high CPM (over $30 for local typically means audience fatigue)
- Low impression share / reach issues

## Weekly Report Format

```
/weekly-report file="[filename].csv" client="[NAME]"
```

Outputs a clean report formatted for client delivery:

---
**[CLIENT NAME] — Weekly Performance Report**
**Period: [date range]**

**Executive Summary** (2-3 sentences in plain English)
[What happened this week, one highlight, one flag]

**Key Numbers**
| Metric | This Week | Last Week | Change |
|--------|-----------|-----------|--------|
| Spend | $X | $X | ↑/↓ X% |
| Results | X | X | ↑/↓ X% |
| Cost per Result | $X | $X | ↑/↓ X% |
| CTR | X% | X% | ↑/↓ |

**What's Working**
[Top performing ad name and why it's winning]

**What to Fix**
[Specific underperforming element and recommended fix]

**This Week's Action**
[One specific recommended change — always include this]

---

## Revenue Leak Finder

```
/find-leak file="[filename].csv"
```

Scans the data and finds the single biggest revenue leak:
- Is it the hook? (high impressions, low CTR = creative problem)
- Is it the landing page? (high CTR, low conversions = page problem)
- Is it the audience? (high CPM, low results = wrong targeting or audience fatigue)
- Is it the offer? (clicks happening but no results = offer or page problem)
- Is it the follow-up? (leads coming in but not converting = sales problem)

Output: "The leak is [X]. Here's why and what to do about it."

## Scorecard Builder

```
/scorecard client="[NAME]" goal="[booked calls/purchases/leads]" budget=[monthly budget]
```

Creates a weekly tracking template as CSV with:
- All key metrics pre-labeled
- Benchmark targets for each metric based on niche and goal
- Color-coded thresholds (green/yellow/red) defined
- Instructions for how to pull each number from the platform

## Period Comparison

```
/compare file1="[period1].csv" file2="[period2].csv" client="[NAME]"
```

Side-by-side comparison of two periods with:
- % change for every metric
- What caused improvements (if identifiable)
- What caused declines
- Net summary: is the account trending better or worse?
