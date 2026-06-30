# GHL instant sync (webhook setup)

How GHL changes flow into the Command Center, and the one manual step needed to
make per-record events arrive **instantly** instead of on the next page load.

## What already syncs by itself (no setup)

Pipelines, stages, leads, contacts, and conversations are read **live from GHL**
every time a page loads (5-minute cache). Nothing is hardcoded. So:

- Deleting / renaming / reordering pipelines or stages in GHL shows up in the app
  automatically. This is why Willis's deleted pipelines already disappeared.
- These do **not** need the webhook. GHL does not even emit pipeline-structure
  changes as webhooks; the live read is the mechanism.

## What the webhook adds

Real-time **per-record** events: a new lead, a stage move, a win, an inbound
message, a booked appointment. With the webhook on, these hit the activity feed
and fire a phone push the moment they happen, instead of waiting for a refresh.

## App side — already done

All of this is configured in Cloudflare (project `hauck-command-center`,
`app.hauckmarketing.com`) and live:

- `WEBHOOK_SECRET` — set. The endpoint authenticates on this.
- `GHL_LOCATION_ID` / `GHL_TOKEN` — Willis's sub-account.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — phone push.
- Supabase keys — activity_log persistence + dedup (migration 0012).

Endpoint: `functions/api/webhook.ts`. It authenticates by the `token` in the URL,
routes by `event.locationId` to the right tenant, writes one `activity_log` row
(idempotent on `event.id` when present), and pushes for new leads / inbound
messages / new appointments / wins.

## The one manual step — point Willis's GHL at us

GHL marketplace webhooks sign with an RSA key we don't verify, so the supported
path is **Workflow → Webhook action** carrying the shared token in the URL plus a
small custom JSON payload. Do this inside the **Willis Windows** sub-account.

**Webhook URL (same for every workflow below):**

```
https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>
```

Get `<WEBHOOK_SECRET>` from Cloudflare → Pages → `hauck-command-center` →
Settings → Variables and Secrets → `WEBHOOK_SECRET` (or have it rotated and handed
to you).

### Build one workflow per event

For each row: new Workflow → the listed trigger → add a **Webhook** action →
Method `POST`, the URL above, and the **Custom Data** key/values shown. The `type`
value must be typed **exactly** as written (the handler switches on it). Use the
GHL merge-field picker for the `{{...}}` values.

| Event for the client | GHL trigger | `type` (exact) | Custom data to add |
|---|---|---|---|
| New lead | Opportunity Created | `OpportunityCreate` | `locationId={{location.id}}`, `opportunityId={{opportunity.id}}`, `contactId={{contact.id}}`, `assignedTo={{opportunity.assigned_to}}` |
| Stage moved | Pipeline Stage Changed | `OpportunityStageUpdate` | same four as above |
| Won / lost | Opportunity Status Changed | `OpportunityStatusUpdate` | same four + `status={{opportunity.status}}` |
| Appointment booked | Customer Booked Appointment | `AppointmentCreate` | `locationId={{location.id}}`, `contactId={{contact.id}}` |
| Client replied | Customer Replied | `InboundMessage` | `locationId={{location.id}}`, `contactId={{contact.id}}` |
| Invoice paid (optional) | Invoice Paid | `InvoicePaid` | `locationId={{location.id}}`, `contactId={{contact.id}}` |

Notes:

- **`locationId` is mandatory** on every payload. Without it the event is dropped
  (tenant routing is by location, never hardcoded).
- Leave `id` out. The handler only uses it to dedup GHL retries; omitting it means
  a plain insert, which is correct for these distinct events.
- `type` strings are case-sensitive and must match the table exactly.

### Verify it works

1. In Willis's GHL, move a test opportunity to a new stage (fires
   `OpportunityStageUpdate`).
2. In the app, open the activity feed — a "Stage changed" row should appear within
   a second or two.
3. To watch the raw hit live: Cloudflare → `hauck-command-center` → the latest
   deployment → Functions / real-time logs, look for `[webhook] Opportunity...`.
4. If nothing arrives: re-check the token in the URL, confirm `locationId` is in
   the payload, and confirm the `type` string matches exactly.

## Scope note

Paid Ads, Social, Campaigns, and Website are still demo data and are **not** part
of this webhook. They are separate connection builds (see `social.md`,
`campaigns.md`, and the website build plan).
