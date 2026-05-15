# Section 05: Lead Detail + Outcome Marking

## Goal

Tap a lead from the list → land on `/lead/:id` showing full lead info and outcome-marking controls. Mark Booked / Won (with $ value) / Lost / No-Show. State updates in memory and the list reflects the change on back-navigation.

## Depends on

Section 04 (lead list).

## Acceptance criteria

- `/lead/:id` renders for any valid lead ID. Invalid ID → friendly "Lead not found" + back button.
- Header: back chevron (returns to dashboard preserving filter state), lead name (h1), current stage pill
- Lead info card: phone (tap to call), email (tap to open mail app), source ad, source campaign, created date, last activity timestamp
- Outcome buttons section, large mobile-friendly:
  - "Mark Booked" (amber)
  - "Mark Won" (green) → opens a small bottom sheet asking for $ amount + a "Save" button
  - "Mark Lost" (red, secondary style)
  - "Mark No-Show" (grey, secondary style, only visible if current stage is Booked)
- Buttons disable for the current stage (you can't mark Won → Won)
- The Won bottom sheet: numeric input with $ prefix, "Save" confirms, "Cancel" dismisses. Validates > 0.
- Tapping any outcome button updates the lead in a `LeadsContext` (in-memory store keyed by client ID), navigates back to the dashboard, and the lead row shows the new stage immediately
- A subtle toast or inline confirmation appears on the dashboard after the update: "Marked as Sold, $4,500" (use client's `wonLabel` for terminology). Auto-dismisses in 3s.
- Phone link uses `tel:`, email link uses `mailto:`
- `pnpm typecheck` passes
- Manual check at 375px: outcome buttons stack vertically, all ≥44px tall, bottom sheet uses safe-area inset

## Files created / modified

```
client-dashboard/src/
  routes/
    LeadDetail.tsx        (real implementation)
  context/
    LeadsContext.tsx      (in-memory state store, seeded from mock data)
  components/
    OutcomeButton.tsx     (color-coded large button)
    WonSheet.tsx          (bottom sheet with $ input)
    Toast.tsx             (small dismissable notification)
    BackButton.tsx        (chevron + label)
  routes/
    Dashboard.tsx         (modified, read from LeadsContext instead of mock directly, show toast on return)
```

## Steps

1. Create `LeadsContext`. Initial state: load leads from `getMockData(client.id)`. Expose `leads`, `markStage(leadId, newStage, value?)`, `getLead(id)`. When client changes, reset to that client's mock leads. (Phase 2 swaps this for GHL API calls.)
2. Modify `Dashboard.tsx` to read from `useLeads()` instead of calling `getMockData` directly.
3. Build `OutcomeButton`, `BackButton`, `Toast`, `WonSheet` components.
4. Implement `LeadDetail.tsx`:
   - `useParams` to get `:id`, `useLeads` to get the lead
   - Render header + info card + outcome buttons
   - "Mark Won" opens `WonSheet`. On save: call `markStage(id, 'won', value)`, set a toast message in a query param or location state, navigate back to `/dashboard`
   - Other outcomes: call `markStage`, set toast, navigate back
5. Wire dashboard to read toast message from navigation state and show `Toast` component for 3s.
6. Verify the full flow: dashboard → tap lead → mark Won $4,500 → back to dashboard → see the lead in Won stage with toast confirmation.

## Stop condition

Commit when outcome marking works end-to-end: can move any lead between stages, Won captures a $ value, list reflects changes, toast confirms.

**Commit message:** `client-dashboard: lead detail with outcome marking and in-memory state (section 05)`

## Token weight

Medium. Most complex section so far, bottom sheet, state management, navigation state.

## Notes

- The bottom sheet doesn't need a full library. A fixed-position div with `bottom-0`, slide-in transition, backdrop. ~40 lines.
- Phone and email tappable links matter, owners on a job site will want to call leads directly from this screen. Make those visibly tap-able with brand-colored text and underline.
- The toast message uses the client's `wonLabel` ("Sold" for roofer, "Booked & Paid" for med-spa), pull from `useClient()`.
- Don't add a notes/comments field in Phase 1. Resist scope creep. Notes come in Phase 2 with the real backend.
- In-memory state means a page refresh resets everything. That's correct for the demo. Don't add localStorage persistence, it'd mask future bugs when Phase 2 wires the real backend.
