# Section 07: Role Toggle (Owner / Manager / Rep)

## Goal

Demo per-role views. A hidden dev toggle (top-right gear icon) lets you switch between Owner, Manager, and Rep. Each role scopes the dashboard and KPI strip differently. This proves multi-tenancy + role logic works without needing a real backend.

## Depends on

Section 04 (lead list), Section 06 (stats strip), Section 02 (users in mock data).

## Acceptance criteria

- Top-right gear icon on `/dashboard` opens a small panel with two switches:
  - **Role**: Owner / Manager / Rep, radio
  - **As user**: dropdown of users with that role for the current client (Section 08 will add Client switcher)
- Switching role+user instantly reskins the dashboard with that user's scope:
  - **Owner**: sees all leads, all KPIs (including revenue + CPA + ROAS)
  - **Manager**: sees all leads, but the Revenue, CPA, ROAS cards are replaced with placeholder "-" or hidden entirely. Booked rate / show rate visible.
  - **Rep**: sees only leads where `assignedUserId === currentUser.id`. Stats are scoped to their own leads only. No CPA/ROAS card, replaced with "My Won This Month" instead.
- The role + user selection persists in `AuthContext` for the session (no localStorage)
- A small chip in the TopBar shows the current user's name + role (e.g. "Mike Davis, Rep")
- The mock data has enough variation that role differences are obvious: at least 2 reps per client with leads assigned across them
- `pnpm typecheck` passes
- Manual check: cycling through roles visibly changes what's on screen, no flicker, no errors

## Files created / modified

```
client-dashboard/src/
  components/
    DevPanel.tsx          (gear icon + slide-out panel)
    UserChip.tsx          (current user pill in TopBar)
  context/
    AuthContext.tsx       (modified, expose setUser to switch users in session)
  routes/
    Dashboard.tsx         (modified, filter leads by role, branch stats cards by role)
  lib/
    rolePermissions.ts    (centralized: can this role see revenue? assigned-only?)
```

## Steps

1. Define role permissions in `rolePermissions.ts`:
   ```ts
   const RolePermissions = {
     owner: { seeRevenue: true, assignedOnly: false },
     manager: { seeRevenue: false, assignedOnly: false },
     rep: { seeRevenue: false, assignedOnly: true },
   } as const;
   ```
2. Update `AuthContext` to expose `setUser(user)` so the dev panel can swap.
3. Build `DevPanel.tsx`, gear button → slide-out panel from right, radio group for role, dropdown for user (filtered by role + current client). Section 08 will add a Client picker to this same panel.
4. Build `UserChip.tsx` and place it in `TopBar`.
5. Modify `Dashboard.tsx`:
   - Filter the leads passed into the list and stats by `assignedOnly` rule
   - In the stats strip, conditionally render the Revenue / CPA / ROAS cards based on `seeRevenue`. For Rep, show a "My Won MTD" card instead.
6. Verify: cycle Owner → Manager → Rep, confirm visible differences. Switch between two reps for the same client, confirm each sees only their own leads.

## Stop condition

Commit when the dev panel works and the three roles each render their correct scoped view.

**Commit message:** `client-dashboard: role-scoped views with Owner/Manager/Rep toggle (section 07)`

## Token weight

Medium. Role logic is small but touches the dashboard, stats strip, and TopBar.

## Notes

- The gear icon is intentionally a dev-mode affordance. Section 10 should hide it behind an env var or a query param (`?dev=1`) before public deploy. We want to show it to Jake and to friendly demo viewers, not to a public visitor.
- Resist building a real role-based access control system in Phase 1. This is mock data with frontend filtering. Phase 2 enforces via Supabase RLS at the database layer.
- Make the Rep view's "My Won MTD" card actually feel useful, local sales reps care about their own commission. Add a tiny "commission rate 10%" line ("est commission $1,250") if it fits, to make the demo more vivid. Easy 5-line touch that lands well in sales calls.
- The user-switch dropdown should default to the first user matching the chosen role so cycling is one click.
