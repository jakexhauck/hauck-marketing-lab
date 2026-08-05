# Willis Windows ads funnel: go-live plan

**Status as of 2026-08-05.** Three pages built, deployed and verified.
The webhook is now wired. What is left is GHL: three steps pasted, one
workflow built, one calendar redirect set.

## The flow

```
Facebook ad
  -> /quote              quote.js    5-step survey, POSTs the lead to GHL
  -> /book               booking.js  the calendar, prefilled
  -> /thank-you-quote    thanks.js   confirmation, and the Meta pixel fires here
```

The lead reaches GHL at `/quote`, **before** the calendar. Somebody who opens
the booking page, sees no time they like and closes the tab is still a lead
Willis can ring. That ordering is deliberate and worth keeping.

"No" on step 1 (Metro Detroit) is an auto-disqualification: nothing is posted
and no contact is created.

| File | GHL step | Mount |
|---|---|---|
| `command-center/app/public/sites/willis/quote.js` | the ad landing path, `/quote` | `#wwq` |
| `command-center/app/public/sites/willis/booking.js` | `/book` | `#wwb` |
| `command-center/app/public/sites/willis/thanks.js` | `/thank-you-quote` | `#wwt` |

Stubs to paste: `willis-windows-landing/quote.html`, `book.html`,
`thank-you-quote.html`. GHL holds two lines each; everything real ships by
deploy.

---

## Phase 1 — Jake, in GHL

### 1.1 Build the three steps

Each is a Custom JS/HTML element, full width, with GHL's own padding removed.

**The two later paths are not free choice.** `quote.js` redirects to
`williswindows.com/book`, and the calendar must redirect to
`williswindows.com/thank-you-quote`. A different name lands on a GHL soft 404,
which answers 200 with an empty body, so it looks like a blank page rather than
an error and nobody reports it. Different path wanted? It is one line.

### 1.2 Set the calendar's after-booking redirect

Calendar `Jlr88qZDp0Sth1H5Sjzf`, in its own settings:

```
https://williswindows.com/thank-you-quote
```

`booking.js` cannot do this. The booking happens inside a cross-origin iframe
and the parent is not reliably told when it succeeds. Left empty, GHL shows its
own confirmation inside the frame: the appointment is real, but nothing
pre-frames the call and **the Meta pixel never fires**, so every booked job
reads as zero conversions.

### 1.3 The webhook

Already wired into `quote.js`:

```
https://services.leadconnectorhq.com/hooks/OznT3yyuwK3dqVXDsCaD/webhook-trigger/DnQegzTCnElUUfG9Sqr1
```

Its own trigger on the Willis sub-account, not the news-channel page's
(`.../webhook-trigger/7f254ff9-...`), so ad leads and news-channel leads stay
tellable apart.

---

## Phase 2 — The workflow behind the webhook

### 2.0 Fire one lead FIRST, then map

GHL's Inbound Webhook trigger shows nothing to map until it has seen a real
payload. Walk one lead through `/quote` before opening the mapping dropdowns,
or every field below will be missing and it looks broken.

### 2.1 What the funnel posts

Form-encoded. Confirmed against a real capture.

```
first_name  last_name  full_name  name  phone  email
address  address1  city  state  postal_code
metro_detroit  home_type  timeline
offer  source  page_url  referrer
utm_source  utm_medium  utm_campaign  utm_content  utm_term
fbclid  gclid  ad_id  adset_id  campaign_id  ref
```

The last two rows only appear when the ad URL carried them.

### 2.2 Create or update the contact

In the workflow's Create/Update Contact action, the value for each field is
`{{inboundWebhookRequest.<key>}}`:

| GHL contact field | Value |
|---|---|
| First Name | `{{inboundWebhookRequest.first_name}}` |
| Last Name | `{{inboundWebhookRequest.last_name}}` |
| Phone | `{{inboundWebhookRequest.phone}}` |
| Email | `{{inboundWebhookRequest.email}}` |
| Address | `{{inboundWebhookRequest.address1}}` |
| City | `{{inboundWebhookRequest.city}}` |
| State | `{{inboundWebhookRequest.state}}` |
| Postal Code | `{{inboundWebhookRequest.postal_code}}` |

**Do not map `full_name` or `name` into a single name field.** They are posted
for workflow actions that only take one string. Feed either into a combined
name field and GHL re-splits it, which is the exact bug still open on the
cold-call calendar work, where business names land in first/last and the real
field ends up empty. The funnel has already split on the last space, so
"Mary Anne Willis" arrives as first "Mary Anne", last "Willis".

`address1` rather than `address`: the second is the same address as one
readable line ("881 Oakwood Ave, Berkley, MI 48072"), for a notification
template that wants one string.

### 2.3 Tag the contact `facebook ads`

**Not cosmetic and easy to skip.** The Command Center's Paid Ads page computes
New customers, Revenue from ads and ROAS by joining Job Completed opportunities
to contacts carrying this tag (`functions/lib/adsRevenue.ts`, matched
case-insensitively by contains on `facebook ad`). No tag means every lead this
funnel produces is invisible to your own reporting, and ROAS reads zero while
the ads are working.

### 2.4 Custom fields

Create these on the contact, then map:

| Custom field | Value |
|---|---|
| Home Type | `{{inboundWebhookRequest.home_type}}` |
| Timeline | `{{inboundWebhookRequest.timeline}}` |
| Offer | `{{inboundWebhookRequest.offer}}` |
| Lead Source Detail | `{{inboundWebhookRequest.source}}` |
| Page URL | `{{inboundWebhookRequest.page_url}}` |
| UTM Campaign | `{{inboundWebhookRequest.utm_campaign}}` |
| UTM Content (creative) | `{{inboundWebhookRequest.utm_content}}` |
| Ad ID | `{{inboundWebhookRequest.ad_id}}` |
| fbclid | `{{inboundWebhookRequest.fbclid}}` |

`utm_content` and `ad_id` are what tell you which creative paid for a booked
job. Skip them and you will know the ads worked without knowing which ad did.

### 2.5 Notify

However the crew should hear about it: SMS, email, internal notification. Two
people do every job, so a lead sitting unseen is the failure mode.

**Open question:** does this lead also create an opportunity, and in which
pipeline and stage? The keep-vs-move baseline says software owns stage movement
and GHL owns comms, but Willis is wired into the Command Center, so this is a
real decision rather than a default. Paid Ad's Pipeline at the first stage is
what `adsRevenue.ts` already assumes.

---

## Phase 3 — One real lead, end to end

Not a click-through. An actual lead, on an actual phone, on cellular.

1. Open `/quote` on a phone. Answer all five steps.
2. Confirm it lands on `/book` with the name, phone and email already filled.
3. Book a real slot.
4. Confirm it lands on `/thank-you-quote`, and that the page names the time.
5. **Copy the full URL of that thank-you page and send it over.** See below.
6. In GHL: the contact exists, is tagged `facebook ads`, carries the address,
   home type and timeline, the appointment is on the calendar, and the
   notification fired.
7. Separately, tap **No** on step 1 and confirm it stops dead and posts nothing.
8. Delete the test contact and cancel the test appointment.

**Do not skip 6.** The Jersey booking page passed every test and could not book
anybody on its first live day, and Willis's own website form silently lost
every request it ever received.

### Why step 5 matters

`thanks.js` says the booked time back to the homeowner. The parameter GHL
appends to the redirect has **not been confirmed against a real booking on this
calendar**, so it currently checks the names GHL is known to have used and then
falls back to scanning every parameter for a value that parses as a plausible
appointment. If it finds nothing the page says "at the time you picked", which
is true whatever GHL sends, so nothing is broken either way. One real thank-you
URL locks the exact parameter.

---

## Phase 4 — Meta side

1. Conversion event on the **thank-you step**, not the funnel step and not the
   booking step. That is the entire reason the thank-you is a separate URL:
   only a completed booking can reach it.
2. Point the ad set at `/quote`.
3. `utm_content` set per creative on the ad URLs. The funnel forwards it, along
   with `fbclid` and `ad_id`, but only if the ad puts it there first.

---

## Phase 5 — Watch it

For the first day, check leads are arriving and tagged. Every failure mode here
is silent.

- A lead reaches the browser but not GHL. The funnel refuses to move on if the
  POST fails, so the homeowner sees the error and the phone number. Anyone
  saying "the form broke" is this.
- Leads arriving untagged, so the Paid Ads page shows zero revenue.
- A blank page after the survey or after booking, meaning a step got renamed.
- The calendar clipped. GHL's `form_embed.js` sizes the iframe and ad blockers
  sometimes eat it. `booking.js` sets a 760px floor and listens for the height
  itself as a backstop, so a blocked script should degrade to "a bit tall".

---

## Deliberately not doing

- **The five-day driveway guarantee** on the thank-you page. Pending ops
  sign-off.
- **Re-pointing the old news-channel funnel.** Its own webhook, its own
  thank-you, its own retired design. Leave it alone.

---

## Blockers

| Blocked thing | Waiting on | Who |
|---|---|---|
| Any traffic at all | three stubs pasted and published | Jake |
| Reaching the thank-you page | the calendar's after-booking redirect | Jake |
| A lead becoming a contact | the workflow built off one fired payload | Jake |
| ROAS reading anything but zero | the `facebook ads` tag | Jake |
| Conversion tracking | pixel event on the thank-you step | Jake |
| Creative-level attribution | `utm_content` on the ad URLs | Jake |
| Naming the exact booked time | one real thank-you URL sent over | Jake |
| Opportunity creation | the pipeline/stage decision | both |
