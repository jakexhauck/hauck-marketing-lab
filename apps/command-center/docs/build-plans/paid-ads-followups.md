# Paid Ads page — remaining work

The client Paid Ads page (`/marketing/paid-ads` + `/creatives` + `/insights`) is
wired to real data end to end. What's left is (a) getting real ad data to exist
so it can be seen, (b) a few code follow-ups, and (c) live verification that can
only happen once ads actually run.

Connection docs: `docs/connections/paid-ads-meta.md` (Meta + GHL join),
`docs/connections/paid-ads-sales.md` (the dormant sales worklist).

## Already shipped (2026-07-03)

- ✅ **Meta insights** (spend, leads, cost-per-lead, weekly, running-now, best
  ads, leads-vs-last-month, FB/IG split) — `functions/api/ads/insights.ts`.
- ✅ **Per-tenant ad account** (`tenants.meta_ad_account_id`) — `57de57e`.
- ✅ **GHL revenue join** for New customers / Revenue / Your return (ROAS):
  `facebook ads` tag → this-month Job Completed opp value ÷ Meta spend —
  `4aa4dfd`, `functions/lib/adsRevenue.ts`.
- ✅ **Real creative thumbnails + every ad shown** (published or not; active
  first) — `58514a9`, `AdsCreatives.tsx`.
- ✅ **Product tour** repointed off the synthetic `/paid-ads` to the real page —
  `58514a9`.

## The current blocker (not a bug)

The Willis ad account (`act_27110669075184924`, the only account the agency
system-user token can see) has **0 campaigns, 0 ads, $0 lifetime spend**. So the
page correctly shows "no ads running yet" and honest zeros. Meta's API cannot see
**unpublished drafts** — an ad must be published (even if paused immediately) to
exist to any integration.

### Jake — to unblock (do these in order)
1. Open **Meta Ads Manager** for the Willis Windows ad account
   (`act_27110669075184924`).
2. Check whether the ads are **drafts** (unpublished). If so, **Publish** them
   (set to Paused right after if you don't want them live). Drafts stay invisible
   to the app until published.
3. If the ads instead live in a **different** ad account, send me that account ID.
   The token currently sees only the one account, so that other account would
   need to be shared to the agency system user in Meta Business settings.
4. Confirm the **`facebook ads` tag** automation in GHL actually fires on every ad
   lead (the revenue join keys off it; if it doesn't fire, revenue undercounts).
5. Confirm the job **value** is set on the opportunity at **Job Completed** (the
   revenue number is the sum of those values).

## Code follow-ups (open)

- [ ] **Bind `KV_CACHE`.** `wrangler.toml` has no KV namespace, so the 15-min
  insights cache is a safe no-op today. Create a KV namespace and bind it as
  `KV_CACHE` on the `hauck-dashboard` Pages project (dashboard → Settings →
  Functions → KV bindings). Without it every load hits Meta + GHL live. Low
  urgency at current volume; matters once the account is busy.
- [ ] **Real ad thumbnails may expire.** Meta `image_url`/`thumbnail_url` are
  signed and can 404 after a while. The 15-min cache covers normal use, but if
  images start breaking, proxy them through a Pages Function
  (`/api/ads/thumb?adId=`) that streams the image server-side. Not needed until
  observed.
- [ ] **"Best time of day" card.** Dropped from the real Insights view (demo
  only). Wire via Meta `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`
  if we want it real.
- [ ] **Per-ad attribution on leads** ("which ad" badge). GHL doesn't natively
  record the source ad. Needs a Meta Lead-Ads → GHL webhook stamping
  `ad_id`/`ad_name` on the contact (see `paid-ads-sales.md`). Only matters if we
  resurface a per-ad lead breakdown.
- [ ] **Revenue attribution window.** Currently the current calendar month, so a
  job completed this month from an earlier ad lead still counts (standard
  approximation, keeps ROAS coherent with this-month spend). Revisit only if Jake
  wants strict same-cohort attribution.

## Verification pending (once real ads + spend exist)

These are built and correct but untested against live data (the account is empty
and all `/api/*` are 401 unauthenticated, so only Jake can verify in his session):

- [ ] Overview tiles: spend / leads / cost-per-lead / weekly bars / running-now
  show real Meta numbers.
- [ ] New customers / Revenue / Your return populate once an ad lead reaches Job
  Completed with the `facebook ads` tag and a value.
- [ ] Your Ads: real creative images render (not gradients); paused/unpublished
  ads appear with a Paused badge.
- [ ] What's working: best ads, leads-vs-last-month, FB/IG split.

## Optional cleanup (dead/superseded code)

Not wired to anything client-facing; safe to delete when convenient to cut
confusion. The synthetic raw dashboard is the biggest one.

- [ ] `src/routes/PaidAds.tsx` (the always-synthetic raw dashboard at `/paid-ads`,
  no longer in nav or the tour) + its tree: `src/components/ads/PaidAdsDesktop.tsx`,
  `src/hooks/useAds.ts`, `src/lib/adsData.ts`, `src/lib/mockAds.ts`. Remove the
  `/paid-ads` route in `App.tsx` too.
- [ ] Dormant, unrouted: `src/routes/sales/PaidAds.tsx`, `src/routes/paid-ads/AdsLeads.tsx`.
- [ ] Retire the shipped `docs/build-plans/18-paid-ads-hub.md` if it's fully done.
