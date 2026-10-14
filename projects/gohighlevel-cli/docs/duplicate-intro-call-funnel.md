# Duplicate the "Intro Call" Confirmation Funnel for a New Client

This is the per-client checklist for copying the call-confirmation funnel (the one where a lead
clicks a link to confirm and the title on the Google Calendar flips to "CONFIRMED") into a new
GoHighLevel subaccount.

Reference (source of truth): test subaccount `r0WfsA12qpBv7M185V3v`.

---

## How the funnel works (so the steps make sense)

It is a tag-chained, two-stage set of workflows:

- **Stage 1 - Booking** (one per calendar): triggers when an appointment is booked on a specific
  calendar, then adds a "booked" tag.
  - `1. Intro Call` (booking) -> triggers on the **Intro Call** calendar -> adds tag `intro call booked`
  - `2. Intro Call 2nd Chance` (booking) -> triggers on the **2nd Chance** calendar -> adds tag `intro call 2nd chance booked`
- **Stage 2 - Confirmation** (one per booking tag): triggers on the "booked" tag, sends the
  SMS/email confirmation sequence, and when the lead clicks the confirm link it runs a **custom
  webhook** that renames the appointment.
  - The webhook: `PUT https://services.leadconnectorhq.com/calendars/events/appointments/{{appointment.id}}`
    with body `{"title": "🟢 CONFIRMED: {{contact.name}} Intro Call"}` and an `Authorization: Bearer pit-...`
    header. GHL's native two-way Google Calendar sync then pushes that new title to the Google event.
    **This is the title flip. It is a webhook, not a built-in action.**

Everything else (downstream nurture, no-confirmation, etc.) is tag-chained off those.

---

## The 3 things a GHL snapshot CANNOT copy correctly

A snapshot copies the workflows, tags, and message bodies fine. These three are per-subaccount and
must be re-pointed by hand (or with the helper tool below):

1. **The calendar each Stage-1 trigger points at.** New subaccount = new calendar IDs.
2. **The Private Integration Token in each Stage-2 flip webhook header.** A PIT only works in the
   subaccount it was created in. There are **two** flip webhooks (Intro Call + 2nd Chance).
3. **The per-client custom values** the messages depend on (from-name, from-email, notification
   recipients, etc).

---

## Per-client checklist

1. **Copy the funnel in.** Load the agency snapshot that contains the Intro Call funnel into the new
   subaccount (Agency view -> the subaccount -> Load Snapshot). If no snapshot exists yet, build one
   from the source account once: Agency -> Snapshots -> Create -> pick the source -> include the
   Intro Call workflows, calendars, pipeline, custom values, and trigger links.

2. **Create / confirm the calendars** in the new subaccount and copy their IDs:
   - Intro Call calendar
   - Intro Call 2nd Chance calendar
   - (Home Estimate, FB Home Estimate, etc. if that client uses them)
   Get the IDs fast: `python tools/intro_call_funnel.py audit --location <LOC> --pit <PIT>` lists every
   calendar a trigger points at and its name.

3. **Create a Private Integration Token** in the new subaccount: Settings -> Private Integrations ->
   Create New. Give it at least these scopes:
   - **Calendars** (read) and **Calendars/Events** write  <- the webhook needs this to rename appointments
   - **Custom Values** (read)  <- lets the audit tool flag missing custom values
   - Contacts / Workflows read are handy too.
   Copy the `pit-...` value.

4. **Set the per-client custom values** (Settings -> Custom Values). All nine must exist:
   - `email_from_name`
   - `email_from_email`
   - `internal_notification_from_name`
   - `internal_notification_from_email`
   - `to_custom_email`         (where the "lead confirmed" internal alert emails go)
   - `to_custom_number`        (where the internal alert SMS goes)
   - `user_first_name`         (the rep greeted in internal alerts)
   - `intro_call_confirmation_website`
   - `2nd_chance_intro_call_calendar`  (the reschedule link used in cancellation messages)

5. **Set up the pipeline + stages.** The "No Confirmation" step creates an opportunity in a specific
   pipeline/stage. Point it at the new client's pipeline (the workflow step has a pipeline + stage
   dropdown; pick the right ones).

6. **Audit the wiring** (read-only, safe):
   ```
   python tools/intro_call_funnel.py audit --location <LOC> --pit <PIT>
   ```
   Fix anything it flags as STALE, MISMATCH, WRONG TOKEN, or MISSING.

7. **Re-point automatically** (optional, saves clicks). Dry run first, then apply:
   ```
   python tools/intro_call_funnel.py repoint --location <LOC> --pit <PIT>          # shows changes
   python tools/intro_call_funnel.py repoint --location <LOC> --pit <PIT> --apply  # writes them
   ```
   This fixes the Stage-1 trigger calendars (matched by role) and replaces both flip-webhook tokens
   with the new subaccount's PIT. It never changes status or trigger active-flags, so it cannot turn
   the funnel on.

8. **Verify the confirm trigger link.** In each Stage-2 workflow, open the confirmation SMS/email and
   the "If confirm link clicked" condition. They must all reference the **same** trigger link (the one
   the lead taps). Snapshots usually recreate it, but confirm the SMS/email link and the if/else
   condition match.

9. **Smoke test before going live:** book a test appointment on the Intro Call calendar, click the
   confirm link, and check that (a) the GHL appointment title changes to "🟢 CONFIRMED: ..." and (b)
   the linked Google Calendar event title flips too.

10. **Turn it on.** Publish each workflow (draft -> published) and set its trigger `active`. Do this
    only when the client is ready to receive live bookings.

---

## Variables reference (what changes per client)

| What | Source account value (test) | Per-client? |
|------|------------------------------|-------------|
| Intro Call calendar ID | `EbGqR5cY5Ykz6YtGNGnm` | yes - new ID |
| 2nd Chance calendar ID | `8Kq0BExJjBqBDGQZADWk` | yes - new ID |
| Home Estimate calendar ID | `0x75rqKB89fnlGKZuoEs` | yes if used |
| Flip-webhook PIT (x2 workflows) | the test sub's own PIT (in its Private Integrations) | yes - new sub's PIT |
| Confirm trigger link | `tycG9HsrRdqOe1sn2bfe` | recreated by snapshot |
| Opportunity pipeline / stage | `sdBUBRxljQHm2yb2w9MG` / `1105ee6a-...` | yes - new pipeline |
| The 9 custom values above | n/a | yes - set per client |
| Title-flip text | `🟢 CONFIRMED: {{contact.name}} Intro Call` | optional - keep or rebrand |

---

## One-time improvement: make the webhook PIT a custom value

Today each flip webhook hard-codes the PIT in its header, so duplicating means editing two webhooks
by hand every time. To remove that step for all future clients:

1. In the source account, create a custom value `location_api_token` and put that subaccount's PIT in it.
2. In both flip webhooks, change the `Authorization` header value from `Bearer pit-...` (the hard-coded token) to
   `Bearer {{custom_values.location_api_token}}`.
3. Re-snapshot.

After that, duplicating only requires setting `location_api_token` per client (step 4 above) instead
of editing webhook headers. The repoint tool still works either way.
