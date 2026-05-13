# Data Analyst Agent

Analyzes ad campaign data, finds revenue leaks and hidden opportunities, and writes client-ready reports in plain English. Works with Meta Ads, Google Ads, and any CSV export.

## Install

```bash
cp -r . ~/.claude/skills/data-analyst/
```

## Usage

```
/analyze file="meta-ads-export.csv" client="Miami Smiles Dental" period="April 2026"
/weekly-report file="meta-ads-export.csv" client="Miami Smiles Dental"
/find-leak file="meta-ads-export.csv"
/compare file1="march-export.csv" file2="april-export.csv" client="Miami Smiles Dental"
/scorecard client="Miami Smiles Dental" goal="booked calls" budget=1500
```

## What it does

- Full campaign analysis (top/bottom performers, account health, benchmarks)
- Weekly client reports (plain English, no jargon, copy-paste ready)
- Revenue leak finder (hook? landing page? audience? follow-up?)
- Period-over-period comparisons
- Custom scorecard templates

## How to get your data

Meta Ads Manager → select campaign → Export → Export Table Data → CSV → save to workspace

## Output

- Analysis markdown (can paste directly into email)
- Weekly report (client-ready format)
- Scorecard CSV template
