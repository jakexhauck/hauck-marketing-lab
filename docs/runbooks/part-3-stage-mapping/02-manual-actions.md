# Part 3: Your Manual Actions

Do these only after Claude reports Part 3 implementation complete. Click paths are in the [Software Guide](../SOFTWARE-GUIDE.md).

## Manual actions checklist (do these, in this order)

### A. Ship it

- [ ] 1. Read Claude's Part 3 report
- [ ] 2. Tell Claude: **"commit and push Part 3"** (Guide Recipe D)
- [ ] 3. Watch the deployment turn green (Guide Recipe C)

### B. Prepare one test lead per pipeline (in the TEST GHL sub-account)

The whole point of Part 3 is correctness across all five real pipelines, so test all five.

- [ ] 4. In GHL, create (or locate) one test opportunity in each pipeline:
  - Database Reactivation Pipeline
  - Google Review Campaign Pipeline
  - Organic Pipeline
  - Paid Ad's Pipeline
  - Sales Pipeline
- [ ] 5. Note which stage each one sits in (screenshot the GHL board if easiest)

### C. Verify stage display

- [ ] 6. In the app, open the **Leads** board, switch through all 5 pipelines with the pipeline switcher. Expected: every column header is a real GHL stage name in GHL's order; each test lead sits in the same column GHL shows
- [ ] 7. Open each of the 5 test leads' detail screens. Expected: the stage shown is the lead's true GHL stage name, never "new" unless it is genuinely in a stage named that way
- [ ] 8. Check Home/Today/Dashboard. Expected: no leftover vocabulary like "estimate-sent" / "no-show" buckets mislabeling your leads

### D. Verify stage moves (the critical one)

- [ ] 9. On the Paid Ad's Pipeline test lead, use the app's **Move stage** action and pick "Intro Call Waiting Confirmation". Expected: GHL shows the lead in exactly that stage within seconds
- [ ] 10. The regression that motivated this part: mark a Paid Ad's lead **Booked/Won-adjacent** flows. Tap **Won** in the app. Expected: in GHL the opportunity status flips to Won; the lead does NOT jump to "Lead In No Appointment Booked" or any other unexpected stage
- [ ] 11. Tap **Lost** on a different test lead. Expected: GHL status Lost
- [ ] 12. Move a lead via the Board (tap-to-move) and then check the lead's detail screen and Today view. Expected: the new stage shows everywhere without needing a full reload (this is fix 3.4)

### E. Close out

- [ ] 13. Clean up: move test leads back or delete the test opportunities in GHL
- [ ] 14. Anything off: paste exact behavior to Claude before proceeding
- [ ] 15. Tick Part 3's two boxes in [../README.md](../README.md)
- [ ] 16. Tell Claude: **"start Part 4"**

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| A lead shows "Unknown stage" | Its pipeline/stage was deleted in GHL, or pipelines cache is stale (5 min) | Wait 5 minutes or tell Claude to check `/api/pipelines` output |
| Stage move lands on the wrong stage | Stage ids drifted (pipeline edited mid-test) | Reload the app so the pipelines list refreshes, retry |
| Won did not change GHL | Status write failed; token scope or API error | Tell Claude; check the deployment logs together |
