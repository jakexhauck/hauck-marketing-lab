# Section 04: Lead List View

## Goal

The main dashboard screen. A scrollable, mobile-first list of leads with a stage filter strip across the top. Each row shows name, source ad, time since arrival, current stage. Tap a row to navigate to `/lead/:id` (detail screen built in Section 05).

## Depends on

Section 02 (mock data), Section 03 (auth + client context).

## Acceptance criteria

- `/dashboard` renders, scoped to the active client from `ClientContext`
- Filter chips across the top: All, New, Contacted, Booked, Won, Lost, No-Show. Tap to filter. Active chip uses brand color. Counts shown in each chip (e.g. "Booked 4")
- Lead list below: each row shows
  - Name (semibold)
  - Source ad (small, muted)
  - Stage pill (color-coded, green=won, amber=booked, slate=new, red=lost, grey=no-show)
  - Time-ago string ("3h ago", "2d ago")
- Rows are full-width, 64–72px tall, ≥44px touch target, divider lines between
- Tapping a row navigates to `/lead/:id`
- Empty state when filter has 0 leads: muted centered text "No leads in this stage yet."
- List is sorted by `lastActivityAt` descending
- Sticky top bar with client logo + app name + current month indicator ("May 2026")
- Pull-to-refresh visual is **not** required in Phase 1 (no data to refresh)
- `pnpm typecheck` passes
- Manual check at 375px: no horizontal scroll, all rows readable, filter chips wrap or scroll horizontally cleanly

## Files created / modified

```
client-dashboard/src/
  routes/
    Dashboard.tsx         (real implementation, replaces placeholder)
  components/
    TopBar.tsx            (logo + app name + month)
    StageFilter.tsx       (chip strip)
    LeadRow.tsx           (one row in the list)
    StagePill.tsx         (small color-coded pill, reused in Section 05)
    EmptyState.tsx
  lib/
    timeAgo.ts            (small "3h ago" formatter, no dayjs dep)
    stageColors.ts        (map stage → tailwind class names)
```

## Steps

1. Build `timeAgo.ts`, pure function, returns "Xs / Xm / Xh / Xd ago"
2. Build `stageColors.ts`, map of `LeadStage → { bg, fg, ring }` Tailwind classes
3. Build `StagePill.tsx` using `stageColors`
4. Build `LeadRow.tsx`, takes a `Lead`, renders the row, calls `onTap` callback
5. Build `StageFilter.tsx`, horizontal-scroll chip strip, takes counts map and active stage
6. Build `TopBar.tsx`, sticky, uses `useClient` for logo + app name, shows current month
7. Rewrite `Dashboard.tsx`:
   - Get leads for active client via `getMockData(client.id).leads`
   - Local state for active filter
   - Compute counts per stage
   - Filter + sort leads
   - Render TopBar, StageFilter, then map LeadRows
   - Tap handler → `navigate('/lead/' + id)`
8. Verify at 375px that scrolling is smooth, sticky bar stays put, no layout jank

## Stop condition

Commit when the dashboard loads, shows all leads for the default client, filters work, and tapping a row navigates to a still-placeholder detail screen.

**Commit message:** `client-dashboard: lead list view with stage filters and per-client scope (section 04)`

## Token weight

Medium. The biggest UI section so far. Several small components and the main list logic.

## Notes

- Use `LeadStage` labels from the client's `pipeline.stages` config eventually, but for Phase 1 the filter chip set is fixed to the canonical 6 stages. Per-client stage label overrides come in Section 08.
- Stage colors: green for won, amber for booked, slate for new, red for lost, grey for no-show, blue for contacted. Pick from Tailwind palette, intensity ~500–600 for foreground.
- Avoid virtualization. ~20 leads per client; native scroll is fine.
- No swipe-to-action gestures in Phase 1. Tap to detail, mark outcome in detail screen. Phase 2 may add swipe gestures if Jake wants them.
- The "current month" in TopBar is hardcoded to current real-world month from `new Date()`. Keep it simple.
