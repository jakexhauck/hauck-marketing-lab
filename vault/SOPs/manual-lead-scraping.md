# Manual Lead Scraping via Claude Code

**Category:** Leads
**Source:** Module 5 Lesson 9
**When to use:** When you need new prospects but haven't set up the automated scraper. Monday morning prospecting.
**Estimated time:** 30 min for 50 prospects + first outreach

---

## Prerequisites

- [ ] Claude Code workspace open
- [ ] Target niche and city decided
- [ ] Outreach templates ready

## Checklist

- [ ] **Pick niche and city. Be specific.**
  - [ ] Not "restaurants" but "Italian restaurants in Tampa FL"
  - [ ] Good starter niches: dentists, gyms, HVAC, plumbers, salons, restaurants, roofing, med spas, auto detail, dog groomers, real estate, cleaning
- [ ] **Run the prospecting prompt in Claude Code, request:**
  - [ ] 50 businesses in the niche and city
  - [ ] Per business: name, phone, website, address, Google rating, review count, Facebook page status
  - [ ] Meta Ad Library check for active ads
  - [ ] Score each prospect 1 to 5 based on ad presence and quality
- [ ] **Filter results:**
  - [ ] Keep only 3.5+ stars and 20+ reviews (have ad budget)
  - [ ] Sort by score, then by review count
- [ ] **Review the table, focus on Score 4 and 5:**
  - [ ] 5: running bad ads, easiest close
  - [ ] 4: running decent ads, pitch better results
  - [ ] 3: Facebook page but no ads, needs education
  - [ ] 2: no Facebook, harder sell
  - [ ] 1: skip
- [ ] **Save as CSV with tracking columns:**
  - [ ] Add columns: Outreach Date, Response, Notes, Follow-Up Date
  - [ ] Save to `prospects/[city]-[niche]-[date].csv`
- [ ] **Send first 10 to 15 personalized outreach messages:**
  - [ ] Score 4-5 template: "Hey [name], I was looking at [business]'s Facebook ads and noticed a few things that could probably cut your cost per lead in half"
  - [ ] Score 2-3 template: "Hey [name], I help [niche] businesses in [city] get more customers through Facebook and Instagram ads. Most of your competitors are running them"
  - [ ] Personalize every message (no spam)
  - [ ] Keep it 3 to 4 sentences max
- [ ] **Set follow-up reminders:**
  - [ ] Wednesday: follow up with anyone who didn't respond Monday
  - [ ] Friday: second follow-up, add new prospects to next week's list

## Notes

- Goal of first message is a 10-minute call, not a sale. Lead with value.
- Most responses come on the 2nd or 3rd message. Don't skip follow-ups.
- Don't pitch on the first message. Offer value first.
- Score 5 prospects are easiest because they already believe in advertising. They just spend badly.
- 40 to 60 messages per week at 5% response = 2 to 3 calls weekly. Close one a month and you're profitable.

## Related SOPs

- automated-lead-scraping-runbook
- niche-landing-page-outreach
- competitor-research-workflow
