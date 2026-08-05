# Ads funnel: the GHL wiring reference

Lookup material for the hand-off to Jake. Load when you are writing his
checklist or debugging a funnel that is not producing contacts.

## The payload the survey posts

Form-encoded, not JSON. Form-encoding keeps it a simple request and skips the
CORS preflight round trip.

```
first_name  last_name  full_name  name  phone  email
address  address1  city  state  postal_code
metro_detroit  home_type  timeline
offer  source  page_url  referrer
utm_source  utm_medium  utm_campaign  utm_content  utm_term
fbclid  gclid  ad_id  adset_id  campaign_id  ref
```

Rows 3 is client-specific: it is one key per survey question, named by the
question's `key`. Renaming a key silently changes the shape of every lead after
the deploy.

The last two rows only appear when the ad URL carried them.

## Contact field mapping

The value for every field is `{{inboundWebhookRequest.<key>}}`.

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

**Do not map `full_name` or `name` into a combined name field.** They are
posted only for workflow actions that take one string. Feed either into a
combined field and GHL re-splits it, emptying first/last. That is the bug still
open on the cold-call calendar work.

`address1` rather than `address`: the second is the same address as one
readable line, for a notification template that wants one string.

## Custom fields

Create on the contact, then map. The middle block is per-client.

| Custom field | Value |
|---|---|
| Offer | `{{inboundWebhookRequest.offer}}` |
| Lead Source Detail | `{{inboundWebhookRequest.source}}` |
| Page URL | `{{inboundWebhookRequest.page_url}}` |
| *(one per survey question)* | `{{inboundWebhookRequest.<question_key>}}` |
| UTM Campaign | `{{inboundWebhookRequest.utm_campaign}}` |
| UTM Content (creative) | `{{inboundWebhookRequest.utm_content}}` |
| Ad ID | `{{inboundWebhookRequest.ad_id}}` |
| fbclid | `{{inboundWebhookRequest.fbclid}}` |

`utm_content` and `ad_id` are what tell you which creative paid for a booked
job. Skip them and you know the ads worked without knowing which ad did.

## The tag

Add **`facebook ads`**. `functions/lib/adsRevenue.ts` matches
case-insensitively by contains on `facebook ad`, and joins Job Completed
opportunities to contacts carrying it. No tag, no revenue, no ROAS.

## The order Jake has to do things in

GHL's Inbound Webhook trigger shows **nothing to map until a real payload has
arrived**. Opening the mapping dropdowns first looks broken but is not.

1. Paste the three stubs, full width, GHL's own padding removed.
2. Set the calendar's after-booking redirect to the thank-you URL.
3. Fire one lead through the survey.
4. Refresh the trigger, map the fields, add the tag, add a notification.
5. **Publish the workflow.** A draft will not process real leads.
6. Put the Meta conversion event on the thank-you step, not the survey step and
   not the booking step.
7. Set `utm_content` per creative on the ad URLs.

## Populating the trigger without a live page

If the stubs are not pasted yet, POST a sample directly. Use obviously fake
values and tell Jake precisely what to delete.

```bash
curl -s -X POST "<webhook-url>" \
  --data-urlencode "first_name=ZZTEST" \
  --data-urlencode "last_name=DeleteMe" \
  --data-urlencode "phone=+13135550100" \
  --data-urlencode "email=zztest.deleteme@example.com"
  # ...one --data-urlencode per field in the payload list above
```

A healthy webhook answers `{"status":"Success: test request received"}`.

## Verifying a deploy

`app.hauckmarketing.com` answers **200 with a 1447-byte SPA shell** for any
path that does not exist, and the edge serves that stale shell for about a
minute after the real file lands.

```bash
curl -s "https://app.hauckmarketing.com/sites/<client>/quote.js" | grep -c '<a string only the new version has>'
```

Poll on content. Confirm twice, twenty seconds apart. A status code tells you
nothing here.
