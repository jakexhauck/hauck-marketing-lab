---
title: "Diagnose the current Willis Windows campaign. Walk through what the data is saying and where the bottleneck is."
agent: stratos
started_at: 2026-05-10T18:24:20.871643600-04:00
slug: 2026-05-10-diagnose-the-current-willis-windows-campaign
---

## stratos
<!-- at: 2026-05-10T22:24:53.164Z -->

Sir — before I deliver a strategic diagnosis, I need to actually see the data. Let me check what's available in the workspace.Sir, I have to stop you there.

I've pulled up the workspace — `media-buying/data/` is empty. There's no campaign export, no Ads Manager CSV, no Meta API pull. I'm being asked to diagnose a patient I've never examined.

I won't fabricate a diagnosis. That's how clients get bad advice and budgets get torched.

**What I need from you to actually do this properly:**

1. **Meta Ads Manager export** (last 7 + 30 days) — campaign, ad set, and ad level. Drop it in `media-buying/data/`.
   - Columns must include: Spend, Impressions, Reach, Frequency, CPM, CTR (link), Link Clicks, CPC, Leads/Purchases, CPA, ROAS
2. **Breakdown by creative** — I need to see which ads are eating spend vs. driving results
3. **The funnel numbers downstream of the click**:
   - Landing page CVR (clicks → leads)
   - Lead → booked job rate
   - Average ticket
   - Close rate from quote → paid job

**Why all of it, not just ad metrics:** Willis Windows is a local service business. Front-end ad math is meaningless without the back-end conversion to actual booked work. A "bad" CPL might be excellent if those leads close at $400 jobs. A "great" CPL is worthless if nobody answers the phone.

**Quickest path forward, Sir:**
- Export the last 30 days from Ads Manager (CSV)
- Tell me roughly: leads booked, jobs closed, average ticket
- I'll run a proper diagnosis — unit economics, where the bottleneck actually sits (creative? landing page? sales follow-up?), and what to change first

Pull the data and I'll get to work. Until then, anything I say is theater.

