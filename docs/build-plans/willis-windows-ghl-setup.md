# Willis Windows — GHL Go-Live Task Sheet

Sub-account: `OznT3yyuwK3dqVXDsCaD` · pulled live 2026-07-01 via `ghl` CLI + `intro_call_funnel.py audit`.

The snapshot is loaded (4 calendars, 38 workflows, 28 custom values). Nothing is wired to run yet.
Below is exactly what's missing. Ordered by "will the funnel work at all" first.

---

## A. Blockers — the funnel is OFF and will not fire

1. **Turn on the workflows.** 32 of 38 are `draft`. Only 5 generic app-sync ones are live
   (Appointment Booked, Customer Replied, Lead Won, New Lead, Stage Changed). Every real automation
   (Intro Call, 2nd Chance, Review, Lead Form, Chat Widget, Missed-Call Text-Back, Conversions API,
   DR) is still draft. Publish each one you intend to use.
2. **Dedupe first, then publish.** The snapshot copied duplicates. Pick ONE of each and delete the
   rest before publishing, or contacts get double-messaged:
   - `1. Intro Call` — 4 copies (3 tag-trigger + 1 booking-trigger)
   - `2. Intro Call 2nd Chance` — 3 copies
   - `2. Intro Call` — 2 copies
   - `3. Lead Form`, `4. Website Form`, `5. Chat Widget`, `OPT OUT` — 2 copies each
   - `Show Report` vs `Show Report CLI` — pick one
3. **Set the `Location API Token` custom value (blank now).** Both "flip Google title to Confirmed"
   webhooks read `Bearer {{custom_values.location_api_token}}`. Blank = the confirm-link click can't
   flip the calendar title, so the confirmation loop silently fails. Create an all-scopes Private
   Integration Token in Willis (Settings → Private Integrations) and paste it here.

---

## B. Fill in the blank custom values (Settings → Custom Values)

**Already set (leave):** Company Name (Willis Windows), Company Phone + GHL Phone (313-766-2171),
User Full Name (Joshua Willis), Review Google URL, all 4 calendar booking links.

**Blank — fill these:**

| Custom value | What to put |
|---|---|
| Location API Token | all-scopes Willis PIT (see A3) |
| From Name | sender name on outbound emails (e.g. "Willis Windows") |
| From Email | verified sending address (see D3) |
| User First Name | Joshua |
| User Personal Phone Number | Josh's cell for internal alerts |
| Internal Notification From Name | who staff alerts appear from |
| Internal Notification From Email | address staff alerts send from |
| Internal Notification SMS | number staff SMS alerts send to |
| To Custom Email | inbox that gets new-lead notifications |
| To Custom Number | number that gets new-lead SMS |
| Intro Call Confirmation Website | the "you're confirmed" page URL |
| Intro Call 2nd Chance Confirmation Website | 2nd-chance confirmed page URL |
| Calendar Link | public booking link for general use |
| FB Calendar Link | booking link used in FB ad flows |
| review request link | the link texted/emailed asking for a review |
| Review Funnel Link | positive/negative review sorter page |
| GMB Google Reviews Link | Google Business Profile review link |
| Database Reactivation Offer | the DR campaign offer line |
| Database Reactivation Relevance | DR "why now" line |
| Custom Contest Prize | prize copy if the contest is used |

---

## C. Assign a user (snapshots never carry users)

- The **Intro Call** and **Intro Call 2nd Chance** calendars are round-robin with `teamMembers: []`
  — no one assigned, so bookings can't route. Add Josh (and any setter) as a GHL user and assign
  them to both round-robin calendars.
- Same user is referenced by "assign to user" steps and the internal-notification recipients —
  filling B covers the notification side; assigning the calendar covers routing.

---

## D. Connect integrations (not in any snapshot — verify each)

1. **Google Calendar OAuth** — two-way sync is what pushes the title flip to the real Google event.
   Without it, "Confirmed" never reaches Josh's calendar.
2. **Phone / LC Phone** — confirm the 313-766-2171 number is actually provisioned in this sub and
   A2P/10DLC registered, or no SMS sends.
3. **Email sending domain / from-address** — verify the From Email domain so email doesn't spam-box.
4. **Google Business Profile** — connect for the review link + GMB review flow.
5. **Meta / Conversions API** — the `Conversions API (Leads)` and `(Schedules)` workflows are drafts;
   they need the Meta dataset/pixel wired before publishing (ties into your FB ad setup below).

---

## E. Verify after wiring (one live pass)

- Book a test Intro Call → confirm via the link → watch the Google title flip to Confirmed.
- Submit a test Lead Form and Chat Widget lead → confirm notification + follow-up fires once (not
  duplicated, proves dedupe worked).
- Re-run: `python tools/intro_call_funnel.py audit --location OznT3yyuwK3dqVXDsCaD --pit <PIT>` and
  confirm 0 issues.

---

## F. Your separate (non-GHL) tasks — tracked here so it's one list

- [ ] Redo the Google review campaign copy.
- [ ] Set up the Facebook ads (feeds the FB Home Estimate calendar + Conversions API workflows).
