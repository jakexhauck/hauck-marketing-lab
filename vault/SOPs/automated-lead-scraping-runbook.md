# Run the Automated Lead Scraper

**Category:** Leads
**Source:** Module 5 Lesson 10
**When to use:** Every Monday morning. Replaces manual scraping once the tool is built.
**Estimated time:** 5 min to run, 30 min to work the list

---

## Prerequisites

- [ ] Lead scraper folder exists at `lead-scraper/`
- [ ] Google Sheets API credentials configured (service account JSON in place)
- [ ] Google Sheet "Agency Prospects" shared with the service account email
- [ ] Sheet ID added to config

## Checklist

- [ ] **First time only (or after env changes):**
  - [ ] `cd lead-scraper`
  - [ ] `pip install -r requirements.txt`
- [ ] **Run the scraper:**
  - [ ] `python scrape.py "[niche]" "[city, state]"`
  - [ ] Example: `python scrape.py "dentists" "Tampa, FL"`
  - [ ] Watch terminal progress: businesses found, Ad Library checks, scoring
- [ ] **Open the Google Sheet:**
  - [ ] New tab named `[City] - [Niche] - [Date]` should be visible
  - [ ] Sort by Score 5 first
- [ ] **Quick-check each top prospect:**
  - [ ] Open Meta Ad Library
  - [ ] Search by business name
  - [ ] 30 seconds per prospect: note weaknesses in their ads for your opener
- [ ] **Send personalized outreach to top 15:**
  - [ ] Reference specific ads or competitors in the message
  - [ ] Use manual-lead-scraping templates as base
  - [ ] Update Outreach Date column in the sheet
- [ ] **Set follow-up reminders:**
  - [ ] Wednesday: follow up with non-responders
  - [ ] Friday: second follow-up
- [ ] **Run additional niches throughout the week:**
  - [ ] Try 2 to 3 niches in different cities
  - [ ] By end of week: 200+ scored prospects across multiple tabs

## Notes

- **Outreach must stay manual.** Mass-blasted AI messages get ignored and can flag your accounts. Scraping = fine, outreach = never.
- Your computer must be on if running on a local schedule. For unattended runs, deploy to a GitHub Action or small cloud server.
- Common breaks:
  - [ ] Google Sheets permission denied: re-share with service account email
  - [ ] Module not found: re-run `pip install -r requirements.txt`
  - [ ] Rate limited: add 2 to 3 second delay between searches
  - [ ] Found 0 businesses: broaden search terms or try bigger city
- For niche selection logic, see manual-lead-scraping (same logic, automated execution).

## Related SOPs

- manual-lead-scraping
- niche-landing-page-outreach
- competitor-research-workflow
