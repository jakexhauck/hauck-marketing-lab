# Internal notifications via the app (Resend)

Internal-notification emails (the alerts GHL sends to business owners/staff) are
sent from the agency's own domain, `alerts@hauckmarketing.com`, through the app
instead of GHL's sender. GHL still authors the message; a workflow **Webhook**
action hands the finished (merge-fields-resolved) content to the app, which
sends it via Resend.

Client-facing email (workflows/campaigns/replies to leads) stays in GHL on the
client's own domain. This endpoint is internal-only.

## Endpoint

`POST https://app.hauckmarketing.com/api/internal-notify?token=<WEBHOOK_SECRET>`

- Auth: reuses `WEBHOOK_SECRET` (same GHL -> app secret as `/api/webhook`), via
  `?token=` or an `x-webhook-token` header.
- `From` is locked server-side to `NOTIFY_FROM` (defaults to
  `Hauck Marketing Alerts <alerts@hauckmarketing.com>`). The caller cannot set
  the sender, so a leaked token can only ever send **as us**, never spoof.
- Env: `RESEND_API_KEY` (send-only restricted key), optional `NOTIFY_FROM`.

### Request body

```json
{
  "to": "staff@company.com",
  "subject": "New lead: {{contact.name}}",
  "html": "<p>{{contact.name}} just came in from {{contact.source}}.</p>",
  "replyTo": "{{contact.email}}",
  "locationId": "{{location.id}}"
}
```

- `to` — required. One address, or several comma/semicolon-separated.
- `subject` — required.
- `html` — the message (use `text` instead for plain; `body` is an alias for
  `html`). At least one of `html`/`text` is required.
- `replyTo` — optional. Set it to the lead's email so staff can reply straight
  to the lead.
- `locationId` — optional, logged only, for tracing which sub-account fired it.

### Responses

- `200 {"ok":true,"id":"..."}` — sent (Resend message id).
- `400` — bad/missing recipient, subject, or body.
- `401` — bad/missing token.
- `502` — Resend rejected or unreachable (details in the function log).
- `503` — `WEBHOOK_SECRET` or `RESEND_API_KEY` not configured.

GHL workflow webhook actions fire once and do not retry-hammer, so the endpoint
returns the true status (unlike `/api/webhook`, which always acks 200). A
failure shows up in the workflow's execution log.

## Wiring a GHL workflow (per internal-notification you want moved)

1. Open the workflow that currently sends the internal-notification email.
2. Replace the **Email / Internal Notification** action with a **Webhook** action.
3. Method `POST`, URL:
   `https://app.hauckmarketing.com/api/internal-notify?token=<WEBHOOK_SECRET>`
4. Set the **Custom Data / JSON body** to the shape above. Paste your existing
   subject and message text into `subject` and `html`; keep the merge fields you
   already use (GHL resolves them before firing).
5. Turn OFF GHL's own copy of that internal notification so staff aren't
   double-notified.
6. Save, run a test, confirm the alert lands from `alerts@hauckmarketing.com`.

Once one workflow is proven, add the same action to your snapshot so new
sub-accounts inherit it.

## Follow-ups

- Trim the root-domain DMARC record to a single entry for clean deliverability
  (multiple DMARC records make receivers ignore DMARC).
- Rotate the Resend API key once wiring is confirmed (it was shared in chat during
  setup); update the `RESEND_API_KEY` Cloudflare secret and redeploy.
- v2 option: also drop these as in-app notifications + push (the app already has
  both from the Team comms build) so an alert becomes a deep link into Command
  Center, not just an email.
