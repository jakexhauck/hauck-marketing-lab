# Section 06: Stats Strip (KPIs)

## Goal

A row of KPI cards at the top of the dashboard (below the TopBar, above the StageFilter) showing Leads MTD, Booked MTD, Won MTD, CPA, ROAS. Numbers animate when they change. This is the metric that makes the dashboard feel like a product, not a list.

## Depends on

Section 02 (mock data + stats helper), Section 05 (LeadsContext so stats recompute on outcome changes).

## Acceptance criteria

- Below TopBar on `/dashboard`, a horizontally-scrolling row of 5 KPI cards
- Cards show: **Leads**, **Booked**, **Won**, **CPA**, **ROAS**, each with a big number + small label + tiny secondary line ("vs $X spend", "this month")
- Numbers reflect the current client's leads filtered to the current calendar month
- When an outcome is marked in Section 05 and we return to the dashboard, stats update visibly
- Number transitions animate (count-up from previous to new value over ~400ms), small touch, makes the dashboard feel alive
- CPA = `spend / wonCount` (or `-` if wonCount is 0). ROAS = `revenue / spend` (or `-` if spend is 0). Round to one decimal place. Currency-format with `$`.
- Cards are roughly 130–150px wide, horizontal scroll on mobile, snap to card boundaries
- Card backgrounds: white surface, subtle border, brand color accent on the number for the "Won" and "ROAS" cards
- `pnpm typecheck` passes
- Manual check at 375px: cards snap-scroll smoothly, numbers don't truncate, accessible labels for screen readers

## Files created / modified

```
client-dashboard/src/
  components/
    StatsStrip.tsx        (the row container)
    StatCard.tsx          (one card)
    AnimatedNumber.tsx    (count-up tween, no deps)
  lib/
    formatMoney.ts        (`$1,234` / `$1.2k` / `$12k`)
    computeStats.ts       (extract from src/mock/stats.ts, recompute live from current leads)
  routes/
    Dashboard.tsx         (modified, render <StatsStrip> above filters)
```

## Steps

1. Build `formatMoney.ts`, handles `null`, `0`, small numbers literal, ≥1000 with k-shortening
2. Build `computeStats.ts`, pure function `(leads: Lead[], spendMtd: number) → Stats`. Filter leads to current month before counting.
3. Build `AnimatedNumber.tsx`, takes a `value` prop, uses `useEffect` + `requestAnimationFrame` to tween from previous value to new. No animation library, ~30 lines.
4. Build `StatCard.tsx`, fixed-width card, large number (using `AnimatedNumber`), label, secondary line. Accent color via prop.
5. Build `StatsStrip.tsx`, flex row with `overflow-x-auto snap-x snap-mandatory`, renders 5 `StatCard`s
6. Wire into `Dashboard.tsx` above the filter strip. Use `useLeads()` and `useClient()` for inputs. Get mock spend from the mock data.
7. Verify on dev server: mark a lead Won → return to dashboard → "Won" card and "ROAS" card animate up.

## Stop condition

Commit when stats are visible, accurate, and animate when outcomes change.

**Commit message:** `client-dashboard: stats strip with live KPIs and animated transitions (section 06)`

## Token weight

Light. Components are small, math is trivial, animation is a known pattern.

## Notes

- "MTD" = month-to-date based on `new Date()`. Edge case: month boundary changes mid-session, fine to ignore in Phase 1, demo only.
- The animation is the small polish that makes the dashboard feel "real". Don't skip it. ~30 lines.
- Spend is mock, pull from `clients.ts` or a `mockSpend.ts` map. Realistic values: roofer $2,500/mo, med-spa $1,800/mo, detailer $900/mo.
- Resist adding more KPIs. Five is the right number for a mobile screen. Show-rate, average ticket, etc. can come in Phase 2 if owners ask for them.
- Format ROAS as "4.2×" not "420%". Local owners read multiples better than percentages.
