# Setter Suite - progress ledger

Plan: docs/build-plans/setter-suite.md
Worktree: C:/Users/games/Desktop/hml-worktrees/setter-suite
Branch: feat/setter-suite (off origin/main 5f2d0ba)
Plan commit: 4d015eb

## Tasks
- [x] Task 0: COMPLETE. DELETE /contacts/{id}/tags with body {tags:[]} PROVEN live (200, tagsRemoved, re-read confirms). Probe contact deleted.
- [x] Task 1: COMPLETE (e2d9785, 863 tests green, tsc clean). Review: spec PASS, quality PASS. Hard-fail on placeholder creds confirmed, no env fallback path.
- [x] Task 2: COMPLETE (fb8970d). Shipped as 0040_setter_dials.sql NOT 0027 (true max on origin/main was 0039; 0027 already taken). Applied live, idempotent, schema+constraint verified by live query.
- [x] Task 3: setterMetrics COMPLETE (f6d79b2 + fix 3079046, 13 tests green, tsc clean). Review: spec PASS, quality PASS after fix.
- [x] Task 4: read endpoints COMPLETE (3463889, 879 tests green, tsc clean). Live-verified against
      test-account: 8 pipelines confirmed, Trash Pipeline has 3 stages (not 2, corrects the doc). Leads
      endpoint only verified for empty state (test-account has 0 live opportunities in any pipeline);
      merge/truncated paths covered by pure-function tests instead. Full HTTP-level curl through a real
      admin session was blocked (classifier refused minting a test admin session); GHL calls verified
      directly with live test-account creds instead. `city` field on ApiSetterLead is unverified against
      real populated data, defaults to "".
- [x] Task 5: COMPLETE, review PASS/PASS (3b32c9a, 890 tests green). Live tag add/remove proven on own probe contact, cleaned up.
- [x] Task 6: COMPLETE, review CLEAN (1774821, 906 tests green). Booking proven live: real appt created + cancelled, probe contact deleted. Calendars: Home Estimate, Phone Appointment, Job, Dialers - Phone Appointment.
- [x] Task 7: board UI COMPLETE, 917 tests green, tsc clean, build clean. Client picker (local
      state, defaults to first admin client) + pipeline tabs (all 8, no hidden filtering) +
      SetterBoard/SetterCard grouped by live stageName. No source field exists on
      ApiSetterLead so the mockup's "source chip" was swapped for a real lastOutcome chip
      instead of fabricating one. Sales spine icon in AdminLayout now points at
      /admin/setter (old /admin/pillar/sales still reachable directly, untouched). Selection
      state + onSelectLead callback are the seam for Task 8's cockpit, no side panel built.
      NOT click-tested live (admin session still classifier-blocked); test-account's known
      zero-leads state was designed for explicitly (per-column honest empty copy) but not
      screenshotted. See task-7-report.md for full deviation list.
- [x] Task 8: COMPLETE + fix 8bd7268 (reused ui/Switch, error vs empty states) (8024781, 936 tests, build clean). Deviations: tag suggestions from contact history not location catalog; calendar name editable (no per-client calendar config exists).
- [x] Task 9: COMPLETE (995c3c6, 944 tests). Show/Close rate render pk-pending 'Needs close-out flow', never a number.
- [ ] Task 10: ship

## Minor findings roll-up (for final review triage)
- Task 1: readiness.ts now short-circuits tenants with literal `env` creds (old code only checked ``/`pending`). Behaviour change, but an improvement. ACCEPTED, do not revert.
- Task 1: import-staff.ts error string reworded to "the booking system"; rationale was wrong (admin-only route, surrounding UI says "Import from GHL"). Cosmetic. Fix in final wave.
- Task 1: TenantGhlError does not set this.name, unlike DriveNotConnectedError precedent. Cosmetic. Fix in final wave.

## ESCALATED TO JAKE (blocking Task 1)
1. tenants row `test-account` has ghl_location_id='env' and ghl_token='env'. Needs a real PIT
   for location r0WfsA12qpBv7M185V3v. Jake creating it.
2. resolveGhlCreds() (functions/lib/tenantResolve.ts:161-170) falls back to env GHL_* which are
   WILLIS PRODUCTION creds when a tenant row is placeholder. Plan Task 1 hard-fails instead,
   which contradicts that file's documented "admin endpoints MUST use this". Awaiting Jake's call.
   Recommendation: hard-fail for Setter Suite only, leave client-app fallback untouched.

- Task 5: tags.ts partial-failure (remove ok, add fails) returns generic 500, does not tell caller
  a partial write landed. GHL tag ops idempotent so retry is safe. Fix in final wave.
- Task 5: dials.ts does not verify contactId belongs to the given tenantId before inserting.
  Super-admin route so not privilege escalation, but a typo'd tenantId would misfile a dial.
- Task 5: outcomes other than no_answer accept spoke:false (semantically odd, does not corrupt
  either computed rate today). Consider tightening.
- ALL TASKS: no endpoint has been driven through a real signed admin request. Minting a local
  admin session is classifier-blocked (same limitation recorded for the admin redesign ship).
  Jake must click through once before trusting it.

- Task 6: slots.ts uses deployment-wide tenantTimezone(env) but the Setter Suite is CROSS-TENANT.
  Second client outside Detroit = wrong slot times. Pre-existing gap (inherited from
  appointments/slots.ts); no per-tenant timezone column exists. RAISE BEFORE 2nd CLIENT.

## Task 0 result (recorded)
Tag remove PROVEN: DELETE /contacts/{id}/tags with JSON body {"tags":[...]} -> 200 {tagsRemoved},
re-read confirms actually removed. No fallback shape needed. Probe contact created and deleted.

## Blocker status 2026-07-20
Jake says he saved the test-account PIT, but a direct query of public.tenants shows slug
`test-account` STILL has ghl_location_id='env' and ghl_token='env'. Token did not reach the DB row.
Offered: (1) he sets BOTH fields in admin console, or (2) he puts it in Doppler as TEST_GHL_TOKEN
and I write both fields via script. Awaiting his choice. Tasks 1, 4, 5, 6 remain blocked.
Tasks 2 (migration) and 7-9 (UI) are NOT blocked by this.

## Decisions 2026-07-20 (Jake)
- Test account has ZERO opportunities. Jake: ship the board empty for now. Iterate UI to a
  finished product afterwards, THEN point at Willis.
- Implication to raise before the Willis step: Willis still runs the OLD 6-pipeline structure.
  Pointing at it needs either a GHL migration of Willis or the per-client mapping layer Jake
  declined at spec time. Not blocking now.
- Doc correction needed: plan section 1.2 says Trash Pipeline has 2 stages. Live shows 3
  (Services Uninterested, Services Unqualified, Bad Intent).

## UI iteration follow-ups (Jake wants a UI pass after ship)
- Tag picker should offer the client's FULL live tag list (test account has 49) via the location
  tags endpoint, not just tags this contact already had.
- Booking calendar name is a free text field defaulted to "Home Estimate". Needs the per-client
  Estimate/Job calendar mapping from the Automation Library (net-new, no DB column exists).
- Board card "stale" state was color-only; fixed in the Task 7 fix wave.

- Task 9: rate strip counts ONLY the active pipeline, not client-wide. "Total leads in" is
  really "total in this pipeline". Misleading headline. UI ITERATION ITEM.
- Task 9: booking rate derived from lastOutcome=='booked' (logged dial), not from a live
  appointment lookup. Undercounts if a booking is not logged. Spec said appointments.

## FINAL REVIEW (opus, whole branch) - verdict was NOT SAFE TO MERGE
Tenant isolation confirmed AIRTIGHT across whole branch (no resolveGhlCreds anywhere in setter code).
Blockers found and FIXED in 5c48196 (958 tests green):
1. leads.ts .in() with up to 1000 ids -> ~25KB URL -> Supabase rejects -> whole board 500s.
   FIXED: chunked into batches of 100.
2. Rate strip rendered "Total leads in: 0" above a "could not load" error. FIXED: all 5 tiles
   go pending on failure.
3. useSetterTagsMutation had no onSettled; a partly-applied tag write left stale tags on screen.
   FIXED.
4. SlotPicker fired 2 live CRM calls per keystroke. FIXED: 400ms debounce, empty default.
5. getGhlContextForTenant had NO tests (the whole wrong-client guarantee rested on a comment).
   FIXED: 16 tests incl. sentinel proving env GHL_* never read.
6. Dead duplicate computeRates deleted.

## STILL OPEN - awaiting Jake
Finding 2 of final review: slots.ts resolves booking times from the GLOBAL TENANT_TIMEZONE env
var on a CROSS-TENANT screen. Needs a per-tenant timezone column + migration. LATENT not live:
Willis and the Allen Park test account are both Detroit. Bites on client #3 outside Detroit.
Reading tz from GHL would be WORSE: GHL has Willis as America/Cancun.
Jake asked: ship now and fix before client two, or add the migration now? NO ANSWER YET.
DO NOT PUSH TO MAIN UNTIL ANSWERED.

## Re-review of fix wave: 5 of 6 genuinely closed. Fix 2 sent back and re-fixed (f184680).
Fix 2 first pass only handled isError, not isLoading, so "Total leads in: 0" still rendered on
every page load. Now a 3-state model: loading / failed / ready. Only genuine emptiness yields a
non-pending "0". 964 tests green.

## BRANCH STATE: ready to ship pending Jake's go.
Commits: 4d015eb..f184680 on feat/setter-suite (off origin/main 5f2d0ba).
Migration 0040_setter_dials ALREADY APPLIED to production.
