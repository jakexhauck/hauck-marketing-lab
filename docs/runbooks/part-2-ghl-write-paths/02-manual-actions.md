# Part 2: Your Manual Actions

Do these only after Claude reports Part 2 implementation complete. Click paths for every dashboard are in the [Software Guide](../SOFTWARE-GUIDE.md); each action below names its recipe.

## Manual actions checklist (do these, in this order)

### A. Ship it

- [ ] 1. Read Claude's Part 2 report; raise anything unclear before deploying
- [ ] 2. Tell Claude: **"commit and push Part 2"** (Guide Recipe D)
- [ ] 3. Watch the deployment turn green (Guide Recipe C)

### B. One-time setup so rep filtering can be tested

Rep filtering needs the team table synced from GHL, and team sync needs you in the admins allowlist.

- [ ] 4. Ask Claude: **"what is my GHL user id in the test account"** (Claude pulls it via the GHL CLI and gives you the exact id string)
- [ ] 5. In the Supabase SQL Editor (Guide Recipe A; this short snippet is safe to copy from this file), run, replacing the placeholder with the id from action 4:
      ```sql
      insert into public.admins (ghl_user_id)
      values ('YOUR_GHL_USER_ID')
      on conflict do nothing;
      ```
- [ ] 6. Sign in to the app (test mode) and pick YOUR identity at the "who are you?" step. If you previously skipped it, log out and back in to be re-prompted
- [ ] 7. Trigger the team sync. Easiest: ask Claude **"run the team sync"** (Claude curls POST /api/team/sync with your identity header). Expected response: `{"synced": N}` where N is your GHL user count
- [ ] 8. Confirm in Supabase: `select ghl_user_id, name, role from public.tenant_users;` shows your GHL users

### C. Verify each fix in the app against the test GHL account

- [ ] 9. **Won note (2.1):** open any test lead in the app, mark it **Won** with a value. In GHL, open that contact > Notes. Expected: a note "Marked won in the dashboard. Value: $X." within seconds
- [ ] 10. **Lead notes (2.2):** add a note from the lead screen in the app. Expected: it appears in the app's notes list AND on the GHL contact's notes
- [ ] 11. **Tasks (2.3):** from a lead/contact in the app, create a task with a due date. Expected: no error toast, task visible in GHL on the contact (Contacts > contact > Tasks). Then edit only its title in the app: expected no error. Then complete it: checkbox syncs to GHL
- [ ] 12. **Threads render (2.4):** open a conversation that has both SMS and email in it. Expected: thread loads (no error screen), channels labeled correctly per message
- [ ] 13. **Long threads (2.6):** pick the test contact with the longest history (create one by sending 25+ messages if needed). Expected: the full history renders, not just the last ~20
- [ ] 14. **Rep filtering (2.5):** in GHL, assign one test opportunity to a non-owner user. In the app, log out, log in, pick that user's identity. Expected: Today/Dashboard show exactly that one lead. Pick your own identity again afterward
- [ ] 15. **No duplicate sends (2.9):** send one SMS from the app to a test contact. Expected: exactly one message in GHL, even if the app showed a retry/slow moment

### D. Close out

- [ ] 16. Anything unexpected: paste exact behavior to Claude before proceeding
- [ ] 17. Tick Part 2's two boxes in [../README.md](../README.md)
- [ ] 18. Tell Claude: **"start Part 3"**

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Team sync returns 403 | Action 5 not done, or identity not picked (action 6) | Re-check both; the x-identity sent must equal the admins row value |
| Team sync returns 500 mentioning ON CONFLICT | Migration 0006 not applied | Part 1 step 1 incomplete; finish it first |
| Won note missing in GHL | Token lacks contacts notes scope | Tell Claude; we inspect the Private Integration scopes together |
| Rep sees zero leads | Opportunity not actually assigned in GHL, or identity mismatch | In GHL check the opportunity's "Owner"; it must be the same user picked in the app |
