# Analyze Ad Data CSV with Claude

**Category:** Optimization
**Source:** Module 5 Lesson 5
**When to use:** Weekly minimum (Monday morning), daily recommended for active accounts.
**Estimated time:** 2 to 5 min once routine is set

---

## Prerequisites

- [ ] Meta Ads Manager access
- [ ] Claude Code workspace open
- [ ] Target CPL set per client

## Checklist

- [ ] **Export from Ads Manager:**
  - [ ] Select date range (7 days default, 30 days for monthly)
  - [ ] Confirm these columns visible: Campaign name, Ad set name, Ad name, Amount spent, Results, Cost per result, CTR, CPM, Frequency
  - [ ] Reports, Export Table Data, CSV
  - [ ] Save as `ads-YYYY-MM-DD.csv` in client workspace folder
- [ ] **Drop into Claude Code:**
  - [ ] Drag CSV into client folder under Claude Code workspace
  - [ ] Confirm file is visible
- [ ] **Prompt Claude:**
  - [ ] Always include target CPL (without context, numbers don't mean anything)
  - [ ] Request:
    - [ ] Profitable vs losing ads
    - [ ] Ad sets to pause immediately (CPL 3x target)
    - [ ] Winners to scale (CPL at or below target)
    - [ ] Tomorrow's action items
  - [ ] Specify: use real numbers, be specific by ad name
- [ ] **Act on the output:**
  - [ ] Pause flagged underperformers in Ads Manager
  - [ ] Increase budget 20% on flagged winners
  - [ ] Queue creative refresh for fatigued ads
  - [ ] Log changes in daily tracking sheet
- [ ] **For weekly client report use:**
  - [ ] Ask Claude to also generate a client-friendly summary (3-4 bullets, no jargon)
  - [ ] Adapt summary to weekly report template

## Notes

- Name files by date so week-over-week comparisons in Claude are trivial.
- Don't overreact to a single day. Accounts need 3 to 7 days for patterns. Pull full weeks before big calls.
- Missing columns: without CPM, CTR, and Frequency, Claude can't diagnose creative issues.
- Other questions to ask Claude on this data: compare to last week trending up or down, explain CPM increases in client-friendly language, which creative angles perform best, generate a weekly report.
- Adlevel (when available) removes the manual CSV step. Until then this is the routine.

## Related SOPs

- daily-15min-optimization-routine
- weekly-client-report
- troubleshooting-playbook
