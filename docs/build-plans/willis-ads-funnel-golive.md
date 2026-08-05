# Willis Windows ads funnel: go-live plan

**Status as of 2026-08-04:** both pages are built, deployed and verified live.
Nothing is wired. No traffic can reach them yet.

- `command-center/app/public/sites/willis/quote.js` (5-step funnel, `#wwq`)
- `command-center/app/public/sites/willis/thanks.js` (thank-you, `#wwt`)
- Stubs: `willis-windows-landing/quote.html`, `willis-windows-landing/thank-you-quote.html`
- Commits `cd95ff42`, `93402cc0`

The whole remaining job is GHL wiring plus one config line, then one real lead
walked end to end. Everything below is ordered so nothing waits on anything
that has not happened yet.

---

## Phase 1 — Jake, in GHL (about 20 minutes)

Nothing else can start until this is done, because the funnel cannot post
anywhere and I cannot test a lead that has nowhere to land.

### 1.1 Build the two steps

Both are Custom JS/HTML elements, set to full width, with GHL's own padding
removed.

| Step path | Paste |
|---|---|
| the ad landing path (see 1.2) | the two lines from `quote.html` |
| **`thank-you-quote`** exactly | the two lines from `thank-you-quote.html` |

**The thank-you path is not free choice.** `quote.js` redirects to
`williswindows.com/thank-you-quote`. A different name sends every converting
lead to a GHL soft 404, which answers 200 with an empty body, so it looks like
a blank page rather than an error and nobody reports it. If you want a
different path, tell me first: it is one line.

### 1.2 Decide the landing path

`/quote` is the obvious one and is currently unused. Confirm it and I will note
it everywhere. The ads point here.

### 1.3 Create a NEW inbound webhook

A workflow with an Inbound Webhook trigger, on the Willis sub-account
(`OznT3yyuwK3dqVXDsCaD`).

**Do not reuse `.../webhook-trigger/7f254ff9-...`.** That one belongs to the
old news-channel landing page. Sharing it makes ad leads and news-channel leads
impossible to tell apart afterwards, and the whole point of this funnel is
knowing which creative paid for a job.

Send me the URL.

---

## Phase 2 — The workflow behind the webhook (Jake builds, I specify)

The funnel posts these fields, form-encoded. Confirmed against a real capture:

```
first_name  last_name  full_name  name  phone  email  address
metro_detroit  home_type  timeline
offer  source  page_url  referrer
utm_source  utm_medium  utm_campaign  utm_content  utm_term
fbclid  gclid  ad_id  adset_id  campaign_id
```

The workflow must do four things.

### 2.1 Create or update the contact

Map `first_name` / `last_name` / `phone` / `email`. They are already split on
the last space, so "Mary Anne Willis" arrives as first "Mary Anne", last
"Willis". Do not feed `full_name` into a single name field as well: that is the
exact bug still open on the cold-call calendar work, where GHL re-splits a
combined name and empties the real fields.

### 2.2 Tag the contact `facebook ads`

**This is not cosmetic and it is easy to skip.** The Command Center's Paid Ads
page computes New customers, Revenue from ads and ROAS by joining Job Completed
opportunities to contacts carrying this tag (`functions/lib/adsRevenue.ts`,
matched case-insensitively by contains on `facebook ad`). No tag means every
lead this funnel produces is invisible to your own reporting, and ROAS reads
zero while the ads are working.

### 2.3 Put the answers somewhere a human will read them

`address`, `home_type` and `timeline` are what let Willis quote before they
call. Custom fields or a note on the contact, either is fine, as long as they
show up on the contact record rather than only in the workflow log.

### 2.4 Notify

However you want the crew to hear about it: SMS, email, internal notification.
Two people do every job, so a lead sitting unseen is the failure mode.

**Open question for tomorrow:** does this lead also create an opportunity, and
in which pipeline and stage? Your keep-vs-move baseline says software owns
stage movement and GHL owns comms, but Willis is wired into the Command Center,
so this is a real decision rather than a default. I would put it in the Paid
Ad's Pipeline at the first stage and let the app move it from there, which is
what `adsRevenue.ts` already assumes. Confirm and I will note it.

---

## Phase 3 — Me, once I have the webhook URL (about 10 minutes)

1. Paste it into `CONFIG.webhookUrl` in `quote.js`. One line.
2. Commit, push, watch the deploy.
3. Verify on **file contents, not status code**. `app.hauckmarketing.com`
   returns a 1447-byte SPA shell with status 200 for any path that does not
   exist, and edge caches serve that stale shell for about a minute after the
   real file lands. Check twice.
4. Confirm `williswindows.com/thank-you-quote` is a real page and not a soft
   404, by title rather than status.

---

## Phase 4 — One real lead, end to end (both of us, 15 minutes)

Not a click-through. An actual lead, on your actual phone, on cellular rather
than wifi.

1. Open the live ad URL on your phone.
2. Answer all five steps with real-looking details.
3. Confirm the redirect lands on the thank-you page, not a blank one.
4. In GHL: the contact exists, is tagged `facebook ads`, has the address, home
   type and timeline on it, and the notification fired.
5. Separately, tap **No** on step 1 and confirm it stops dead and posts nothing.
6. Delete the test contact.

**Do not skip 4.** The Jersey booking page passed every test and could not book
anybody on its first live day, and the Willis website's own estimate form
silently lost every request it ever received.

---

## Phase 5 — Meta side (Jake)

1. Put the conversion event on the **thank-you step**, not the funnel step.
   That is the entire reason the thank-you is a separate URL: only a completed
   lead can reach it.
2. Point the ad set at the landing path from 1.2.
3. Make sure the ad URLs carry `utm_content` set per creative. The funnel
   already forwards it, along with `fbclid` and `ad_id`, but only if the ad
   puts it on the URL in the first place. Without it you will know the ads
   produced leads and not which creative did.

---

## Phase 6 — Watch it, do not walk away

For the first day: check that leads are arriving and that the tag is on them.
The failure modes worth watching for are all silent.

- A lead reaches the browser but not GHL. The funnel refuses to show a
  thank-you if the POST fails, so a homeowner would see the error and the phone
  number. If anyone calls saying the form broke, that is this.
- Leads arriving untagged, so the Paid Ads page shows zero revenue.
- The thank-you page showing blank, meaning the step got renamed.

---

## Not doing tomorrow, deliberately

- **The five-day driveway guarantee** is not on the thank-you page. Your notes
  have it as pending ops sign-off. Confirm it with the crew and I will add it.
- **A call-back time promise.** Same reason: two people do every job and a
  thank-you page is a poor place to invent an SLA.
- **Re-pointing the old news-channel funnel.** It has its own webhook, its own
  thank-you page and its own retired design. Leave it alone.

---

## Blockers, in one line each

| Blocked thing | Waiting on | Who |
|---|---|---|
| Any lead reaching GHL | the new inbound webhook URL | Jake |
| Any traffic at all | both stubs pasted and published | Jake |
| Conversion tracking | pixel event on the thank-you step | Jake |
| Creative-level attribution | `utm_content` on the ad URLs | Jake |
| Opportunity creation | the pipeline/stage decision | both |
