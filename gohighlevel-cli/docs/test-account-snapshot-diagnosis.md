# Test Account Snapshot Diagnosis (`r0WfsA12qpBv7M185V3v`)

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

Full diagnosis of the GHL test subaccount for the purpose of building **one clean snapshot** that
duplicates to new clients easily. Read-only audit, nothing in the account was changed.

## Verdict

**The account is in good shape to snapshot.** It already uses the right mechanism: a 26-entry
**custom-values layer** is the per-client config, and every message is 100% merge-field driven (no
hard-coded URLs, phone numbers, or emails anywhere). A GHL snapshot carries and auto-remaps almost
everything. There is **one** real gap (a hard-coded token) and a short list of things a snapshot
*never* carries (integrations, users) that must be set per client.

## What's in the account

| Component | Count | Snapshot behavior |
|---|---|---|
| Workflows | 32 (incl. duplicates, left as-is) | Copied; internal IDs remapped |
| Custom values | 26 (mostly blank) | Copied; **this is the per-client fill-in layer** |
| Custom fields | 17 | Copied |
| Pipelines | 5 | Copied; stage IDs remapped |
| Calendars | 4 | Copied; IDs remapped |
| Trigger links | 5 | Copied; IDs remapped |
| Forms | 4 | Copied |
| Funnels | 7 (Home Services + Fitness + confirmation) | Copied |
| Users | 1 | **NOT copied by snapshots** |

## Account-specific values embedded in workflows

What the scan found baked into workflow steps/triggers, and whether a snapshot handles it:

| Embedded reference | Count | Carried by snapshot? |
|---|---|---|
| Calendar IDs (Intro Call, 2nd Chance, Home Estimate) | 3 | Yes - remapped |
| Pipeline IDs (all 5 pipelines) + their stages | 5 | Yes - remapped |
| Trigger links (Intro Call Confirm, Review Request) | 2 | Yes - recreated |
| **Hard-coded PIT in the 2 "flip title" webhooks** | 1 token | **NO - must be re-set per client** |
| Hard-coded URLs / phones / emails in messages | 0 | n/a - all merge fields |

## The one real gap: the flip-webhook token

Both "Flip Google Title to Confirmed" webhooks carry `Authorization: Bearer pit-...` as a literal
string. A PIT only works in the subaccount it was created in, and a snapshot copies the literal
token, so in a new client those two webhooks would call the wrong account and fail.

**Fix it once so it stops being a per-client chore:** create a custom value `Location API Token`,
and change both webhook headers to `Bearer {{custom_values.location_api_token}}`. After that, the
token is just one more blank to fill in step 1 below, and the snapshot stays clean.

## Custom-value coverage (the per-client fill-in layer)

26 defined; 17 are referenced by workflows (all resolve, 0 broken); 9 more feed funnels/forms. Group
them for filling in per client:

- **Brand:** Company Name, Company Phone Number, From Name, From Email, Calendar Link
- **Rep / internal alerts:** user first name, User Full Name, User Personal Phone Number, Internal
  Notification From Name, Internal Notification From Email, Internal Notification SMS, To Custom
  Email, To Custom Number
- **Calendars:** Intro Call Calendar, Intro Call 2nd Chance Calendar, Home Estimate Calendar,
  Facebook Home Estimate Calendar, FB Calendar Link
- **Confirmation pages:** Intro Call Confirmation Website, Intro Call 2nd Chance Confirmation Website
- **Reviews:** review request link, Review Google URL, GMB Google Reviews Link
- **Database reactivation:** Database Reactivation Offer, Database Reactivation Relevance, Custom
  Contest Prize

## Things a snapshot NEVER carries (set per client, every time)

1. **The flip-webhook token** (the gap above) - until it's converted to a custom value.
2. **Users** - the single user is referenced by calendar round-robin, "assign to user" steps, and
   the internal-notification recipients. Each new client needs its own user(s) added and assigned.
3. **Connected integrations** - none of these live in a snapshot:
   - Google Calendar OAuth (the two-way sync that makes the title flip actually reach Google)
   - Phone number / LC Phone (so SMS sends)
   - Email sending domain / from-address verification
   - GMB / Google review link
   - Any Meta / ad connections

## Recommended snapshot-readiness steps (optional, not done - account left as-is)

These would make the snapshot cleaner but involve changing the account, so they were not performed:

1. Convert the 2 flip-webhook tokens to `{{custom_values.location_api_token}}`.
2. Blank out any custom values that still hold test data, so the template ships empty.
3. (If desired later) dedupe the duplicate workflows and the duplicate "Review Request Link".

## Per-client duplication flow (once the snapshot exists)

1. Load the snapshot into the new subaccount.
2. Fill in the 26 custom values (grouped above).
3. Create an all-scopes PIT in the new sub; put it in `Location API Token` (or paste into the 2 webhooks).
4. Add + assign the client's user(s) to the calendars and workflows.
5. Connect integrations: Google Calendar, phone, email domain, review link.
6. Run `python tools/intro_call_funnel.py audit --location <LOC> --pit <PIT>` to confirm wiring.
7. Smoke-test: book → confirm → watch the title flip. Then publish + activate.

See also: `docs/duplicate-intro-call-funnel.md` for the funnel-specific detail.
