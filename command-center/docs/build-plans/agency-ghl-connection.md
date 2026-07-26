# Connecting the agency's own GoHighLevel to the admin console

Agreed with Jake on 2026-07-26. The admin console stays the cockpit; GHL becomes the
record and the automation layer. Everything the caller does in the app shows up in
GHL, so the workflows, sequences and dialer filters already sitting in that account
have real records to fire on.

Built in four stages, each verified on localhost before it goes live.

## The account (surveyed 2026-07-26)

- Location `wbrjjHYzznyEHx9wumSr`, "Hauck Marketing", America/New_York, one user
  (Jake, `kQawsNSJbC7UApa6f4Am`).
- Pipelines: **Cold Call Leads** `LwznFibQdlfvzPDYn7e6`
  (Dialed / Call Again (No Answer) / Hot Lead / Booked / Lost), **Sales Pipeline**
  (New Lead / Not Interested / Appointment Booked / Appointment Showed / No-Show /
  New Client), SMS Pipeline, Main FB Ads Pipeline, Main.
- Calendars: Hauck Marketing Onboarding, Hauck Marketing Demo Call (already used by
  the cold-call booking route).
- Tags in use: dialed, no answer, keep calling, hot lead, booked, demo call booked,
  lost, sms, facebook lead, proven angle*.
- 12 contacts, **0 opportunities**, 10 conversations. The GHL side is effectively
  empty of prospects: the app holds the list.

## Direction (decided)

The app pushes. GHL is never asked what a lead's status is; the app tells it. Reads
from GHL are limited to things GHL owns: appointments, conversations, calendars.

That rules out sync conflicts entirely, which is the point: a two-way sync between a
44-row list and a CRM with its own automations is a support burden neither of us
wants.

## Stage 1 — Cold call leads and outcomes

**Definition of done:** a lead in the app exists as a contact in GHL, and every
outcome button moves that contact's opportunity and sets the tags Jake's workflows
already watch for.

### Mapping (needs Jake's sign-off before it is coded)

| In the app | Cold Call Leads stage | Tags added | Tags removed |
| --- | --- | --- | --- |
| Lead imported / assigned | (no opportunity yet) | none, `source` = list name | - |
| No answer | Call Again (No Answer) | dialed, no answer | - |
| Brush-off | Dialed | dialed, keep calling | no answer |
| Not interested | Lost | dialed, lost | keep calling, hot lead |
| Callback | Hot Lead | dialed, keep calling | no answer |
| Booked | Booked | dialed, booked, demo call booked | keep calling, no answer |

The opportunity is created on the FIRST outcome, not on import: every stage in that
pipeline describes a call that has already happened, so a lead nobody has rung has no
honest stage to sit in. The contact is created on import, because the SMS sequence and
the power dialer both need a contact to act on.

### Files

1. `functions/lib/agencyGhl.ts` — add the pipeline/stage/tag map and the outcome ->
   (stage, tags) resolution. Pure, unit-tested; the IDs live in one place.
2. `functions/lib/agencyCrm.ts` (+ test) — the push itself: upsert contact, apply and
   strip tags, create-or-move the opportunity. Every call idempotent, every failure
   swallowed into a stored "not pushed" state rather than blocking the caller.
3. `supabase/migrations/0053_lead_ghl_link.sql` — `leads.ghl_contact_id`,
   `leads.ghl_opportunity_id`, `leads.ghl_synced_at`, `leads.ghl_error`.
4. `functions/api/admin/cold-call/dials.ts` — after the dial row is written, push.
5. `functions/api/admin/tracker/leads.ts` (import + create) — upsert the contact.
6. Admin UI — a quiet "in GHL" marker on the call card, and a plain error line when a
   push failed, so a silent divergence is impossible.

### Rules

- A push failure never fails the call. The dial is already recorded; GHL catching up
  later is a smaller problem than a caller staring at an error mid-conversation.
- Nothing is deleted in GHL, ever. The app can create and move; removing a contact or
  an opportunity stays a human decision made in GHL.
- Contact upsert is keyed on phone/email (the account's own duplicate rule), so
  re-importing a list cannot double a prospect.

## Stage 2 — Sales pipeline (booked to closed)

A booked meeting becomes an opportunity in **Sales Pipeline** at Appointment Booked,
and the app grows the two buttons that pipeline needs: Showed and No-Show, then New
Client. This is the "booked -> showed -> closed" gap in the Scoreboard, answered with
Jake's own pipeline rather than new app fields.

## Stage 3 — Conversations and SMS

Read the agency's conversations into the admin console and send from it. The SMS
tracker's hand-typed counts give way to what was actually sent, the same way the
dialing counts just did.

## Stage 4 — Meetings calendar

The Onboarding and Demo Call calendars, read live: what is booked, what showed, what
is coming. Replaces the appointment date sitting on a lead row.

## Verify (every stage)

`npm test && npm run typecheck && npm run build`, then the local stack against the
real account, with a throwaway contact removed afterwards. Live only once Jake has
seen it working on localhost.
