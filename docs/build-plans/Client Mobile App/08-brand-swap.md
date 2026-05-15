# Section 08: Brand Swap (Per-Client Customization)

## Goal

Add a Client picker to the dev panel. Switching clients instantly swaps brand color, logo, app name, pipeline stage labels, and won-label across the whole app. This demonstrates per-client customization for prospective clients and for Jake's own validation that the same codebase can serve different niches without code changes.

## Depends on

Section 02 (3 mock clients with distinct brands), Section 07 (dev panel exists).

## Acceptance criteria

- Dev panel gains a **Client** picker (dropdown or radio with logo previews) listing all 3 mock clients
- Selecting a client:
  - Swaps `--brand-primary` CSS variable on `:root` (instant restyle, no flicker)
  - Updates the TopBar logo + app name
  - Updates the Login screen branding (if you nav back there)
  - Replaces all leads, users, and stats with that client's data
  - Resets the current user to the Owner of the new client (so role view doesn't break with a stale user from the previous client)
  - Renames the Won stage in pills, filters, and outcome buttons using the client's `wonLabel` ("Sold" / "Booked & Paid" / "Closed")
  - Renames the value input label using the client's `valueLabel` ("Job Value" / "Treatment Value")
- Pipeline stage order can vary per client (e.g. roofer has "Estimate Sent" between Contacted and Booked), list filters and detail buttons reflect this
- All three clients are demo-able end-to-end: login → dashboard → tap lead → mark Won → see the toast use the right wonLabel
- `pnpm typecheck` passes
- Visual check: each client looks genuinely distinct, not just a color swap. Logos differ, app names differ, terminology differs.

## Files created / modified

```
client-dashboard/src/
  context/
    ClientContext.tsx     (modified, expose setClient, write all brand CSS vars on switch)
  components/
    DevPanel.tsx          (modified, add Client picker)
    StagePill.tsx         (modified, read label from client.pipeline)
    StageFilter.tsx       (modified, read labels + stage order from client.pipeline)
  routes/
    LeadDetail.tsx        (modified, outcome buttons use client's labels)
    WonSheet.tsx          (modified, input label uses client.pipeline.valueLabel)
  lib/
    applyBrandVars.ts     (sets --brand-primary, --brand-fg, --brand-bg, derived shades)
```

## Steps

1. Build `applyBrandVars.ts`, takes a `Client['brand']` and writes CSS variables to `:root.style`. Derive a few shades from the primary color (e.g. `--brand-primary-tint`, `--brand-primary-dark`) using a simple lightness adjustment.
2. Modify `ClientContext` to call `applyBrandVars` whenever the active client changes, and to expose `setClient(clientId)`.
3. Add Client picker to `DevPanel`. When picked, call `setClient` then `setUser` to the Owner of the new client.
4. Audit every place stage labels are rendered (filter chips, pill, detail buttons) and switch them to read from `client.pipeline.stages` / `client.pipeline.wonLabel`. Don't hard-code "Won" / "Booked" anywhere user-facing.
5. Same for the Won-sheet's value input label.
6. Verify all 3 clients demo cleanly: roofer with navy + "Sold" + "Job Value", med-spa with rose + "Booked & Paid" + "Treatment Value", detailer with amber + "Closed" + "Service Total".

## Stop condition

Commit when the Client picker works and all three clients render distinctly and correctly across every screen.

**Commit message:** `client-dashboard: per-client brand and pipeline-label customization (section 08)`

## Token weight

Light to medium. Mostly threading `useClient()` into existing components that hard-coded labels.

## Notes

- This is the section where the "config-as-data not config-as-code" principle gets enforced. If you find yourself adding an `if (client.id === 'glow-medspa') ...` anywhere, stop and put the value in the client config instead.
- Brand shade derivation: simplest approach is HSL adjustment. Or skip derived shades and just use the primary with Tailwind's opacity modifiers (`bg-[var(--brand-primary)]/10` for tints).
- Logo handling: for the demo, use either an emoji-free initials approach (`SR` for Smith's Roofing in a colored circle) or simple SVG placeholders. Don't waste time hunting real logos.
- Per-client stage order: roofer pipeline = `new → contacted → estimate-sent → booked → won → lost`. Med-spa = `new → contacted → consultation → booked → won → lost`. Detailer = canonical 6 stages. This adds visible variety in the filter strip.
