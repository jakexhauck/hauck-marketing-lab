# Handoffs / Sales, Go Live

Wire the owner-side **Sales → Leads** flow to Willis's real GoHighLevel instead of
demo data. Read the live leads in, write the outcomes back.

Do it in three phases, in order. Each phase is shippable on its own.

---

## 0. What's already done

- **Owner UI** (demo): Sales page with **Leads** + **Schedule** tabs, the outcome
  picker (Estimate booked / Job booked / Won / Lost / Follow up), the calendar
  slot picker + booking form (Address / Service / Notes), and job pre-fill.
- **Setter button** (LIVE already): "Hand off to owner" in the Setter Suite
  cockpit, drops the `lead hand off` tag via the real tag endpoint.
- **GHL is ready**: Sales Pipeline built with the exact stages, Customers pipeline
  removed, Home Estimate + Job calendars exist.

The frontend already calls `/api/handoffs` and `/api/handoffs/:id`. In demo those
hit the in-memory handler; going live means building the **real backend at those
same paths** and flipping the client gate from "demo only" to "demo or session".

---

## 1. Reference: the real IDs (Willis)

| Thing | ID |
|---|---|
| Location | `OznT3yyuwK3dqVXDsCaD` |
| Sales Pipeline | `7MJx8GtDCrni5AO54sGQ` |
| Stage · Handed Off | `7a3284b5-442d-4f28-8c3d-c24ee354c67a` |
| Stage · Estimate Booked | `89f9d347-80fd-41ae-95db-d4d514a77853` |
| Stage · Job Booked | `2183e4b6-d75b-412c-b41d-ceb527ea1bc6` |
| Stage · Won | `edce7a5f-bebb-433b-a61b-c3b964eddf53` |
| Stage · Lost | `d8fc71b5-8dc1-4c9f-8670-4ac2bcd77422` |
| Stage · Follow Up | `206d6d45-d541-43b2-b957-7255afd25ee4` |
| Calendar · Home Estimate | `nHoNSfAklWggzVxdbhBJ` |
| Calendar · Job | `TKVLqqRuB25T4xgCctyI` |

**Resolve by NAME, not hardcoded IDs.** Match the codebase: look up the pipeline
named "Sales" and calendars "Home Estimate" / "Job" at request time (see
`resolveStageByName` in `functions/api/lib/writes.ts`). Keep the IDs above only as
a last-resort fallback for Willis. That way it works for every cloned client.

**Stage → app status map (1:1):**

| GHL stage | App status |
|---|---|
| Handed Off | `new` |
| Estimate Booked | `estimate_set` |
| Job Booked | `job_booked` |
| Won | `won` |
| Lost | `lost` |
| Follow Up | `later` |

**Tags (owner buttons):** `owner won`, `owner lost`, `owner follow up`. Estimate /
Job add **no** tag from the app (the appointment booking is the trigger).

---

## 2. Architecture decision

The app is **authoritative for the stage move** (it directly PUTs the opportunity
into the target stage) AND **applies the tag** so your downstream automations
(review requests, nurture, etc.) still fire. This is more reliable than waiting on
a tag→stage automation to catch up, and the owner sees the move instantly.

So each outcome does two things: **move the opportunity's stage** + **apply the
tag / write the extra data** (value, note, task, appointment).

---

## 3. Backend helpers to reuse (already exist)

- Tenant GHL creds (owner endpoint): `ctx.data.tenant` (set by `functions/api/_middleware.ts`) → `{ ghl_token, ghl_location_id }`.
- GHL calls: `ghlFetch`, `ghlJson`, `fetchAllOpportunities(gctx, { pipelineId })` in `functions/lib/ghl.ts`.
- Update opportunity (stage + value): `putOpportunity(gctx, oppId, { pipelineStageId, status, monetaryValue })` in `functions/api/lib/writes.ts`.
- Resolve pipeline/stage by name: `resolveStageByName(gctx, "sales", "<stage>")` in `functions/api/lib/writes.ts`.
- Apply tag: `POST /contacts/{id}/tags { tags: [...] }` (see `functions/api/admin/setter/tags.ts`).
- Add note: `POST /contacts/{id}/notes { body }` (see `functions/api/contacts/[contactId]/notes.ts`).
- Add task: `POST /contacts/{id}/tasks { title, dueDate, body }` (see `functions/api/contacts/[contactId]/tasks.ts`).
- Book appointment: `createAppointment(gctx, { calendarId, contactId, startTime, endTime, title })` in `functions/api/lib/appointments.ts`.

---

## PHASE 1 — Read live leads into the list

**Goal:** the owner's Sales → Leads shows Willis's real Sales-pipeline leads.

### Backend
- [ ] Create `functions/api/handoffs/index.ts` (owner endpoint, `onRequestGet`).
  - Read `const t = ctx.data.tenant;` (401 if missing).
  - Resolve the "Sales" pipeline by name → `pipelineId` (fallback `7MJx8GtDCrni5AO54sGQ`).
  - `const opps = await fetchAllOpportunities({ token: t.ghl_token, locationId: t.ghl_location_id }, { pipelineId });`
  - Map each opp → `ApiHandoff` (see `src/lib/api.ts`):
    - `id` = opp.id, `contactId` = opp.contact?.id, `name`, `phone`
    - `status` = stageId → status via the stage map (normalize the stage NAME, strip emoji/lowercase, so it survives an id change)
    - `value` = opp.monetaryValue ?? null
    - `handedAt` = opp.createdAt
    - `estimateAt` / `jobAt` = from the contact's appointments if present (Phase 3 fills these; null for now)
    - `address` / `service` = from the contact record / custom field (null for now)
    - `setterName` = "Setter" (or the opp's source; refine later)
    - `lostReason`, `followUpAt`, `followUpNote`, `closedAt` = null for now
  - Return `{ handoffs: [...] }` sorted active-first (match the demo `sorted()`).

### Frontend
- [ ] `src/routes/Handoffs.tsx` (`HandoffsBoard`): change `const enabled = demoMode();`
      to `const enabled = demoMode() || Boolean(session);` (pull `session` from `useAuth`).
- [ ] Confirm the demo and live shapes match `ApiHandoff` exactly (they should).
- [ ] Keep the demo handler as-is (demo mode still routes to it).

### Verify
- [ ] `npm run dev:full` (Vite + wrangler + Doppler dev-vars), log into the live
      Willis app, open Sales → Leads. Real leads currently in Handed Off (and the
      other stages) appear with the right status chips.

Ship Phase 1 (see Deploy). This alone is a big win: real leads, live.

---

## PHASE 2 — Write outcomes: Won / Lost / Follow Up

**Goal:** tapping Won / Lost / Follow Up moves the GHL opportunity + writes data.

### Backend
- [ ] Create `functions/api/handoffs/[id]/index.ts` (owner endpoint, `onRequestPatch`).
  - `id` = the opportunity id. Read `ctx.data.tenant`.
  - Read body `{ status, value, lostReason, followUpAt, followUpNote }`.
  - Resolve the target stage id by name for the given status.
  - **Won:** `putOpportunity(gctx, id, { pipelineStageId: WON, status: "won", monetaryValue: value })` + `POST /contacts/{contactId}/tags { tags: ["owner won"] }`.
  - **Lost:** `putOpportunity(gctx, id, { pipelineStageId: LOST })` + note `POST /contacts/{contactId}/notes { body: "Lost: <reason>" }` + tag `owner lost`.
  - **Follow Up:** `putOpportunity(gctx, id, { pipelineStageId: FOLLOW_UP })` + task `POST /contacts/{contactId}/tasks { title: "Follow up: <name>", dueDate: followUpAt, body: followUpNote }` + tag `owner follow up`.
  - Need the opportunity's `contactId` (fetch the opp first, or pass it from the client).
  - Return the updated handoff (re-read or echo).

### Frontend
- [ ] `useUpdateHandoff` already PATCHes `/api/handoffs/:id` with the right body,
      no change needed once the backend exists.

### Verify
- [ ] In the live app, mark a test lead Won ($ value), Lost (reason), Follow up
      (date + note). Confirm in GHL: stage moved, value set, note/task created,
      tag applied.

---

## PHASE 3 — Calendar booking: Estimate / Job

**Goal:** Estimate/Job show real open times and book a real appointment.

### Backend
- [ ] Availability: `functions/api/handoffs/slots.ts` (`onRequestGet`), params
      `calendar=home-estimate|job` + `date=YYYY-MM-DD`. Resolve the calendar by
      name, call GHL `GET /calendars/{calendarId}/free-slots?startDate&endDate`,
      return open slots for that day.
- [ ] Booking: extend the PATCH in `functions/api/handoffs/[id]` for
      `status: estimate_set | job_booked` with `estimateAt` / `jobAt`:
  - `createAppointment(gctx, { calendarId: <resolved>, contactId, startTime, endTime, title: "<Home Estimate|Install> — <name>" })`
  - Then `putOpportunity(gctx, id, { pipelineStageId: ESTIMATE_BOOKED | JOB_BOOKED })`.
  - Write `address` to the contact + `service` to a note/custom field so the Job
    booking pre-fill has real data.

### Frontend
- [ ] `src/routes/sales/Jobs.tsx` `BookingSlots`: in live mode, replace the
      demo-jobs "blocked" logic with a fetch to `/api/handoffs/slots` for the
      selected day + calendar. Keep the demo path for `?demo=1`.
- [ ] Pre-fill (`prefillAddress` / `prefillService`) now reads real contact data.

### Verify
- [ ] Book an estimate on a real open slot, confirm the appointment lands on the
      **Home Estimate** calendar in GHL and the lead moves to Estimate Booked.
      Repeat for Job on the **Job** calendar.

---

## 4. Your GHL to-do (do these when you set up automations)

- [ ] `lead hand off` tag → move opportunity into **Sales · Handed Off** (this is
      what pulls a setter's lead into the owner's Leads list). Confirm it also
      creates the Sales opportunity if one doesn't exist yet.
- [ ] `owner won` → your review-request flow (post-job) if you want it automated.
- [ ] `owner follow up` → any nurture you want on parked leads.
- [ ] Add a **Service + scope** custom field on the contact (so the app can read/
      write it for the Job pre-fill). Address uses the standard contact address.

*(The app moves the stage directly, so stage-moving automations are optional. The
tags are for your downstream sequences.)*

---

## 5. Deploy (each phase)

- [ ] `npm run typecheck` and `npm run test` green.
- [ ] Commit on a branch, push, open PR (or push to `main` per the deploy flow).
- [ ] Watch the Cloudflare Pages build (`scripts/cf.mjs`), confirm it finishes.
- [ ] Smoke-test the **live** app URL, not just local: real leads load, an outcome
      writes through to GHL.

---

## 6. Open questions / risks

- **One opportunity per lead:** a handed-off lead needs a Sales-pipeline
  opportunity to act on. Confirm the `lead hand off` automation creates it (or the
  setter tag already lands it in Sales · Handed Off).
- **Setter name / source:** the read endpoint has no clean "which setter" field
  yet, defaults to generic. Wire later if you want per-setter reporting.
- **Rate/latency:** each outcome is 2, 3 GHL calls (stage + tag + note/task). Fine
  at this volume; batch later only if it drags.
- **CLI vs app token:** the app uses the tenant token from Supabase (via Doppler in
  prod), not the `ghl` CLI. No change needed, just don't confuse the two.
