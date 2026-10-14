# Cold Call — every attempt recorded, and the prospect's local time

Acquisition > Cold Call. Two changes, agreed with Jake on 2026-07-26:

1. **Log every attempt automatically.** The outcome buttons become the write path
   for the dialing numbers. Dials, pickups, pass-through and bookings stop being
   hand-typed claims and become app-recorded facts.
2. **Show the prospect's local time** on the call card, so nobody rings a
   Californian at 6am.

Deliberately out of scope for now (Jake's number 5, next up): tracking a booked
meeting through showed / closed.

## 1. Definition of done

- Pressing an outcome writes one `cold_call_dials` row: who called, which lead,
  when, whether they picked up, whether it got to a pitch, the outcome.
- The Tracker's four count columns fill themselves from those rows. A cell may
  still be typed over (dialing done off-app), and a typed cell is visibly marked
  as typed so the Scoreboard's two kinds of number never blur.
- The Scoreboard reports recorded numbers as recorded, and names any day that was
  typed over.
- The call card shows the prospect's current local time, and says so quietly when
  that time is outside 8am-9pm.

## 2. The five outcomes

Four buttons could not tell "they hung up on hello" from "they heard the pitch
and said no", so pass-through could never be recorded. Five can:

| Button | outcome | spoke | pitched | counts as |
| --- | --- | --- | --- | --- |
| No answer | `no_answer` | false | false | 1 dial |
| Brush-off | `brush_off` | true | false | dial + pickup |
| Not interested | `not_interested` | true | true | dial + pickup + pass-through |
| Callback | `callback` | true | true | dial + pickup + pass-through |
| Booked | `booked` | true | true | dial + pickup + pass-through + booking |

A `booked` dial is written only after the appointment endpoint succeeds: a
recorded booking that does not exist on the calendar is worse than a missing one.

## 3. Data model

Migration `0052_cold_call_dials.sql`. Agency-global (no tenant_id), append-only,
modelled on `setter_dials` (0040) which does the same job for client setters.

```
cold_call_dials
  id         uuid pk
  lead_id    uuid null references leads(id) on delete set null   -- history outlives the lead
  caller_id  uuid not null references admin_accounts(id) on delete cascade
  day        date not null        -- agency-local calendar day, decided server-side
  dialed_at  timestamptz not null default now()
  spoke      boolean not null default false
  pitched    boolean not null default false
  outcome    text not null check (outcome in (the five above))
  note       text
  created_at timestamptz not null default now()
```

`day` is stored, not derived at read time: a dial at 11:40pm Detroit is 03:40 UTC
the next day, and the month grid must agree with the caller's own day. Indexes on
`(caller_id, day)` and `(lead_id, dialed_at desc)`.

## 4. Typed vs recorded

`cold_calls` (the typed grid) keeps its columns and its meaning: **an override**.
A day now has up to two numbers per column and the rule is one line: show the
typed one if there is one, otherwise the recorded one.

`ColdCallRow` gains `recorded: { callsMade, pickups, passThrough, meetingsBooked } | null`.
Days with dials but no typed row are synthesised into the GET response, so the
grid shows a day nobody typed into.

## 5. File-by-file

1. `supabase/migrations/0052_cold_call_dials.sql` — the table.
2. `functions/lib/coldCallDials.ts` (+ test) — the outcome set, the counting
   rules, roll-up by day, and the merge of recorded days into typed rows. Pure.
3. `functions/api/admin/cold-call/dials.ts` — `POST` appends one dial. Caller is
   the session (an owner may write on someone's behalf with `callerId`), day is
   computed server-side in the agency timezone.
4. `functions/api/admin/tracker/cold-calls.ts` — `GET` also reads the month's
   dials and merges them in as `recorded`.
5. `src/lib/api.ts` — `recorded` on the DTO, `logColdCallDial` fetcher.
6. `src/hooks/useColdCall.ts` — `useLogColdCallDial`, invalidating the month and
   the leads list.
7. `src/lib/coldCall.ts` (+ test) — typed-or-recorded resolution, which cells are
   typed overrides, summary counts off the resolved values.
8. `src/components/admin/tracker/DailyTracker.tsx` — optional `cellClass`,
   `cellTitle`, `legendExtra`. Purely additive; other trackers unchanged.
9. `src/components/admin/acquisition/ColdCallSurface.tsx` — mark typed cells,
   add the "Recorded" legend dot.
10. `src/lib/leadLocalTime.ts` (+ test) — timezone for a lead (its own field
    first, else inferred from the NANP area code), current time in that zone,
    outside-calling-hours check.
11. `src/components/admin/acquisition/CallWorkspace.tsx` — five buttons, dial
    logging, the local-time line.
12. `src/components/admin/acquisition/ColdCallScoreboard.tsx` — recorded numbers
    presented as recorded; typed days named.

## 6. Verify

`npm test && npm run typecheck && npm run build`, `npm run db:migrate`, then in
the running app: press each outcome, watch the Tracker's counts move on their
own, type over one and see it marked, and check the Scoreboard's split.
