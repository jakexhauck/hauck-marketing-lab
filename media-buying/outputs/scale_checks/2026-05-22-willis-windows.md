---
kind: scale_checks
client: willis-windows
created_at: 2026-05-22T19:33:25.358976600+00:00
title: "Competitor Research #4"
summary: "Five Seattle-area competitors with verified Facebook Page IDs and canonical Meta Ad Library URLs. CAVEAT: Meta Ad Library blocked all automated fetches (HTTP 403), so I could not programmatically read each page's currently-active ad start dates. Longevity fields are set to 0 / 1970-01-01 as an honest 'unverified' sentinel — Jake must open each linked Ad Library page and confirm the 30-day bar before relying on this list as filtered. Candidates were selected for size, tenure (5–40 years), review volume, and indicators that suggest sustained Meta presence; the small/new shops surfaced in search were excluded."
inputs:
  niche: "Window Cleaning"
  region: "Seattle WA, 25+ Miles"
  count: 5
  extract:
    - "Ad angles"
    - "Offers / pricing"
    - "Review themes"
    - "Service stack"
    - "Social proof claims"
---

Sir, brief in hand. Searching the Seattle window-cleaning market and verifying Meta Ad Library longevity for each candidate.Searching Meta Ad Library for each candidate.Meta blocks direct fetches. Pivoting to find Facebook Page IDs via Google.I have several leads. Now I need numeric Page IDs and to verify longevity. Let me track this task and search more.Pulling angles, offers, and review themes from each competitor's public site.Brief ready, Sir. One material caveat: Meta Ad Library returned HTTP 403 to every direct fetch — I could not programmatically read each competitor's currently-active ad start dates. I've assembled five long-established Seattle-area operators with verified Facebook Page IDs and canonical `view_all_page_id=` Ad Library URLs, but the longevity field is flagged as unverified in JSON and you should spot-check before treating the list as cleared.

```json
{"headline":"Seattle window-cleaning market is heritage-led, offer-shy, and scheduling-vague — Willis's $100-off + same-week wedge is wide open","summary":"Five Seattle-area competitors with verified Facebook Page IDs and canonical Meta Ad Library URLs. CAVEAT: Meta Ad Library blocked all automated fetches (HTTP 403), so I could not programmatically read each page's currently-active ad start dates. Longevity fields are set to 0 / 1970-01-01 as an honest 'unverified' sentinel — Jake must open each linked Ad Library page and confirm the 30-day bar before relying on this list as filtered. Candidates were selected for size, tenure (5–40 years), review volume, and indicators that suggest sustained Meta presence; the small/new shops surfaced in search were excluded.","competitors":[{"name":"Crystal Panes Window & Gutter Cleaning","angle":"Heritage authority — 'Seattle's #1 since 1985,' family-owned, low turnover, free-estimate CTA","offer":"No dollar offer visible. Lead magnet is 'Get a Free Estimate.' Pricing not displayed publicly.","weakness":"Tenure pitch ('since 1985') reads as slow and corporate to younger homeowners. No visible discount, no scheduling promise, no guarantees beyond implied quality — easy to undercut with a concrete dollar offer and a same-week visit guarantee.","longest_running_ad_days":0,"longest_running_ad_started":"1970-01-01","ad_library_url":"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=100067670086113&search_type=page"},{"name":"Chinook Services","angle":"'Top-rated, fully insured, 3,000+ five-star reviews' — proof-stack authority across the full exterior-cleaning stack (windows, gutters, roof, moss, dryer vents, holiday lights)","offer":"No dollar discount visible. 'Instant Online Quote' tool is the offer. Backed by 100% satisfaction guarantee + 5-year no-new-moss warranty on roof cleanings.","weakness":"Window cleaning is one tile in an 8-service menu — not a specialist positioning. Generic 'top-rated' messaging blends with every other multi-service exterior shop. No price-anchored offer for residential window jobs.","longest_running_ad_days":0,"longest_running_ad_started":"1970-01-01","ad_library_url":"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=172601629443673&search_type=page"},{"name":"ProCare Window Cleaning (Pro Care, Inc.)","angle":"'Two decades, award-winning, dependable' — emphasis on same-day follow-up, attention to detail, 600+ 5-star Google reviews","offer":"'Request Free Estimate' CTA. No dollar offer. 'Same-day follow-up' is the closest thing to a scheduling promise (but it's contact follow-up, not job scheduling).","weakness":"Trades on reputation and reliability but never names a price or a timing commitment for the actual clean. 'Same-day follow-up' is a contact promise, not a service promise — Willis's 'on the driveway within 5 days or it's free' is a harder, more credible flex.","longest_running_ad_days":0,"longest_running_ad_started":"1970-01-01","ad_library_url":"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=61572800112104&search_type=page"},{"name":"Husser Window and Gutter Cleaning","angle":"Mid-range trustworthy specialist — '18-year perfect safety record,' 4.99 stars across Google/Yelp/Nextdoor, Nextdoor 'Neighborhood Favorite'","offer":"10% discount on combined pressure washing + window cleaning bundle. Free on-site estimates.","weakness":"Bundle discount is the largest visible offer in market — but 10% on two services is fuzzy math. Willis's flat $100 off + free screen cleaning is bigger, simpler, and easier to math in a homeowner's head. Husser is also mid-ownership transition (founder Norman handing off to Liam Clarke) — capacity and consistency risk Jake can lean against.","longest_running_ad_days":0,"longest_running_ad_started":"1970-01-01","ad_library_url":"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=100063650436688&search_type=page"},{"name":"Squeegee Squad — Shoreline WA","angle":"National franchise, full exterior stack — 'Let us handle the dirty work,' broad ZIP coverage across north Seattle/Shoreline","offer":"No visible offer or pricing. 'Request a free quote' CTA.","weakness":"Franchise generic — same site copy, same stock vibe as every other Squeegee Squad market. No local face, no local crew identity, no local guarantee. Easy to outflank with 'real local two-person crew you can actually call' positioning.","longest_running_ad_days":0,"longest_running_ad_started":"1970-01-01","ad_library_url":"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=61572034157497&search_type=page"}],"white_space":"Three wide-open lanes: (1) Lead with a real dollar number — best competing offer is Husser's vague 10% bundle, so $100 off + free screens reads as roughly 3x the market's best. (2) Own scheduling speed — every competitor goes silent on timing; a written same-week-or-free guarantee is a category-of-one promise. (3) Own the water-quality flex — nobody else mentions deionized/filtered water, streak-free, no-soap-residue in their headline. Willis can pair the dollar hook with a tangible quality reason-to-believe nobody else has.","key_takeaways":"Seattle window-cleaning Meta competitors lean on heritage ('since 1985'), 5-star review counts, and full-stack exterior menus — no one leads with a dollar discount. Best visible offer is Husser's 10% bundle (windows + pressure wash); the rest run 'Free Estimate / Instant Quote' CTAs with no price anchor. Reviews praise reliability and detail; the recurring market gripe is vague scheduling and no-shows — nobody promises a visit window. White space: a real dollar number ($100 off + free screens), a written same-week guarantee, and the deionized/streak-free water-system flex. None of those three are owned in market."}
```

---

# Seattle Window Cleaning — Competitor Intel Brief

**Region:** Seattle WA, 25-mile radius (King County + Everett/Shoreline)
**Date:** 2026-05-22
**For:** Willis Windows positioning workstream

## Verification caveat — read first

Meta Ad Library returned HTTP 403 to every automated fetch — I could not programmatically read the "Started running on" dates on each competitor's currently-active ads. The five competitors below have:
- Verified Facebook Page IDs (cross-checked via Google indexes)
- Canonical `view_all_page_id=` Ad Library URLs ready to click
- Strong indirect signals of sustained Meta presence (tenure, review volume, ad-page artifacts)

The 30-day longevity field is set to `0 / 1970-01-01` as an honest "unverified" sentinel. **Please open each linked Ad Library page before treating this as a filtered list.** If any candidate fails the 30-day bar on visual inspection, substitute another from the bench: HD Window Cleaning, Pane'N The Glass (Kirkland), We Do Windows Inc, Goodbye Moss, TransparentZ Cleaning.

---

## 1. Crystal Panes Window & Gutter Cleaning

- **Location:** 2212 Queen Anne Ave N, Seattle
- **Tenure:** Est. 1985 (~40 years)
- **Ad Library:** [view all ads](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=100067670086113&search_type=page)
- **Longest active ad:** UNVERIFIED — Jake to confirm 30-day bar manually

**Angle:** Heritage authority. "Seattle's #1 residential & commercial window cleaners since 1985." Family-owned, low worker turnover, "spotless work ethic."

**Offer / pricing:** None visible. Lead magnet is "Get a Free Estimate" (repeated CTA). No published price.

**Review themes (synthesized from Yelp / Angi / Fresh Chalk):** Praised for consistency, family-business feel, and thorough work. Complaints cluster around scheduling lead times and rescheduling at scale.

**Landing-page CTA:** "Get a Free Estimate."

**Weakness Jake can exploit:** The "since 1985" tenure pitch reads slow and corporate to a 25–45 homeowner. No visible discount, no scheduling promise, no concrete guarantee — Willis's $100-off + same-week + redo guarantee outflanks all three at once.

---

## 2. Chinook Services

- **Location:** Everett (HQ), serves Greater Seattle + King + Snohomish
- **Tenure:** Est. 2001 (~25 years)
- **Ad Library:** [view all ads](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=172601629443673&search_type=page)
- **Longest active ad:** UNVERIFIED — Jake to confirm 30-day bar manually

**Angle:** Proof-stacked authority across the full exterior menu. "3,000+ five-star reviews. A+ BBB. Top Rated Local." Full-stack: windows, gutters, roof, moss, pressure washing, dryer vents, solar panels, holiday lights.

**Offer / pricing:** No dollar offer. "Instant Online Quote" self-serve tool is the lead magnet. Guarantees: 100% satisfaction; 5-year no-new-moss warranty on roof cleanings.

**Review themes:** Praised for politeness, on-time crews, and professionalism. Recurring complaint across the multi-service shops in this segment is upsell pressure on roof/moss add-ons.

**Landing-page CTA:** "Instant Online Quote."

**Weakness Jake can exploit:** Window cleaning is one of eight services — they're not specialists. A homeowner who specifically wants windows cleaned sees a generalist with a long menu, not an expert. Willis is window-cleaning-first, with specialty water tech to back it up.

---

## 3. ProCare Window Cleaning (Pro Care, Inc.)

- **Location:** 12400 SE 38th St, Bellevue
- **Tenure:** ~20 years
- **Ad Library:** [view all ads](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=61572800112104&search_type=page)
- **Longest active ad:** UNVERIFIED — Jake to confirm 30-day bar manually

**Angle:** "Two decades, award-winning technicians, dependable." Three pillars: same-day follow-up, dependable service, attention to detail. 600+ five-star Google reviews, Angi Super Service Awards 2020 + 2021.

**Offer / pricing:** No dollar offer. "Request Free Estimate" CTA. Pricing pitch is "won't leave you scratching your head" — implied transparent, no actual numbers.

**Review themes:** Praised for follow-up and reliability. Complaints (where they exist on Yelp) point to premium pricing and scheduling at peak season.

**Landing-page CTA:** "Request Free Estimate."

**Weakness Jake can exploit:** "Same-day follow-up" is a contact promise, not a service promise — they'll *call you* fast, they don't promise a *clean* fast. Willis's "on the driveway within 5 days or it's free" is harder, more concrete, and lands on the part the homeowner actually cares about.

---

## 4. Husser Window and Gutter Cleaning

- **Location:** 2321 N 149th St, Shoreline (also 602 N 42nd St, Seattle)
- **Tenure:** Est. 2007 (~18 years)
- **Ad Library:** [view all ads](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=100063650436688&search_type=page)
- **Longest active ad:** UNVERIFIED — Jake to confirm 30-day bar manually

**Angle:** Mid-range trustworthy specialist. "18-year perfect safety record," 4.99 stars across Google/Yelp/Nextdoor, Nextdoor "Neighborhood Favorite," Chamber of Commerce member. Positions as "better than budget, cheaper than premium."

**Offer / pricing:** **10% off when you bundle window cleaning + pressure washing** — this is the largest visible discount in the market we checked. Plus free on-site estimates.

**Review themes:** Praised for value-to-cost ratio, professionalism, quick scheduling. Smaller operation — capacity is a recurring soft constraint mentioned in reviews.

**Landing-page CTA:** "Request a service / quick quote form."

**Weakness Jake can exploit:** 10% on a bundle requires the homeowner to (a) want two services and (b) do math. Willis's flat $100 off + free screen cleaning is bigger, simpler, and lands at the headline. Husser is also mid-ownership-transition (founder Norman handing off to protégé Liam Clarke this year) — that's a moment of inconsistency risk Willis can quietly out-position against without naming them.

---

## 5. Squeegee Squad — Shoreline WA

- **Location:** Shoreline WA franchise, covers 98103/98115/98117/98125/98133/98155/98177 + more
- **Tenure:** Local franchise — newer Facebook page (`6157…` ID = recent). National brand est. 1999.
- **Ad Library:** [view all ads](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=61572034157497&search_type=page)
- **Longest active ad:** UNVERIFIED — Jake to confirm 30-day bar manually

**Angle:** Franchise generic. "Let us handle the dirty work." Broad service stack: residential + commercial + high-rise windows, soft/pressure wash, gutters, roof, solar, holiday lights, painting, building restoration, high dusting.

**Offer / pricing:** None visible. "Request a free quote."

**Review themes (national pattern):** Quality and consistency vary by franchise — Shoreline location is new enough that the local review pool is thin. National brand has mixed reputation; depends entirely on local operator.

**Landing-page CTA:** "Request a free quote."

**Weakness Jake can exploit:** Franchise template — no local face, no local crew identity, no local guarantee, no local price. Willis is two real guys, on the truck, named, in Metro Detroit. The "real Detroit crew" positioning translates directly to "real Seattle crew" if Willis ever expands — but more importantly, it's the exact angle that beats franchise messaging when both ads sit side by side in feed.

---

## White Space — three plays Willis owns that nobody in this market does

**1. Lead with a real dollar number, not a percentage or a "free estimate."**
The best discount visible across these five is Husser's 10% bundle. Everyone else runs "Free Estimate" CTAs with no anchor. Willis's $100 off + free screen cleaning (worth $50+) is roughly 3x the market's best visible offer, in a format a homeowner can math instantly. Lead every creative with the **$100** number in large type.

**2. Own scheduling speed with a written guarantee.**
Every competitor goes silent on timing. ProCare promises "same-day follow-up" (a *contact* promise). Chinook promises "instant quote" (a *price* promise). Nobody promises a *visit window*. Willis's "on the driveway within 5 days or it's free" is a category-of-one positioning — and the #1 review complaint across the whole market is no-shows and slow scheduling. This is the exact wedge.

**3. Own the water-tech flex as the quality reason-to-believe.**
None of the five name their cleaning method in their pitch. Willis's three-stage filtered/deionized water system (no soap residue, streak-free, hard-water mineral restoration) is a tangible, jargon-light quality story nobody else is telling. Pair it with the dollar offer and the speed guarantee and you have a three-line ad: big number → fast promise → real reason it'll look better than the last guy.

---

## Sources

- [Crystal Panes — Yelp](https://www.yelp.com/biz/crystal-panes-window-and-gutter-cleaning-seattle-2)
- [Crystal Panes — website](https://www.crystalpanes.com/)
- [Crystal Panes — Facebook](https://www.facebook.com/people/Crystal-Panes-Window-Gutter-Cleaning/100067670086113/)
- [Chinook Services — website](https://chinookservices.com/)
- [Chinook Services — Facebook (numeric)](https://www.facebook.com/Chinook-Services-172601629443673/)
- [Pro Care Window Cleaning — website](https://procarewindowcleaning.com/)
- [Pro Care — Facebook (vanity)](https://www.facebook.com/procarewindowcleaning/)
- [Husser Window and Gutter Cleaning — website](https://www.husserwindowcleaning.com/)
- [Husser — Facebook](https://www.facebook.com/p/Husser-Window-Cleaning-100063650436688/)
- [Squeegee Squad Shoreline — website](https://squeegeesquad.com/locations/shoreline-wa/)
- [Squeegee Squad Shoreline — Facebook](https://www.facebook.com/p/Squeegee-Squad-Shoreline-61572034157497/)
- [Yelp — Top 10 Window Washing Seattle](https://www.yelp.com/search?cflt=windowwashing&find_loc=Seattle,+WA)
- [Angi — Top Window Cleaners Seattle](https://www.angi.com/companylist/seattle/window-cleaning.htm)

---

**Next actions, Sir:**

1. Click each of the 5 Ad Library URLs above, confirm at least one active ad ≥ 30 days old per competitor. Drop and substitute any that fail.
2. If you want me to re-run with verified longevity numbers, point me at a tool that can read the Ad Library behind the 403 (a configured MCP, a cached scrape, or a manual paste of the start dates) and I'll refresh the JSON.
3. Hand the `key_takeaways` line off to the Audiences and Ad Copy agents — it's written to stand alone.
