# Client product tour (first-login walkthrough)

Date: 2026-06-26
App: `command-center/app` (package `client-dashboard`), the one responsive client app.

## Goal

When a client signs in for the first time, run a guided spotlight tour that walks
them through every surface: it dims the screen, highlights the real tab, explains
what it is, and auto-navigates them there. By the end they have seen the whole
product. When we ship a new feature later, we add one step to a registry and
returning clients automatically get a short "What's new" spotlight of only the
new step(s) on their next login. The full tour is always replayable from Settings.

Works on both layouts: desktop (sidebar rail) and phone (bottom tab bar).

## Definition of done

- A brand-new client, on first login, is walked through one step per top-level
  surface with a spotlight + auto-navigation, and can Back / Next / Skip.
- Finishing or skipping is remembered per person on the server, so it does not
  re-run on their other device.
- Adding a step with a higher `version` causes already-onboarded clients to see
  only that new step on their next login.
- The tour is suppressed for admin preview sessions, demo mode, and offline.
- Replayable from Settings ("Take the tour").
- Phone and desktop both work; surfaces without phone nav chrome fall back to a
  centered card.

## Decisions (locked with Jake)

- **Style:** spotlight + auto-navigate (Next drives them; no hard forced click, so
  empty data / missing elements can never soft-lock).
- **Updates:** versioned steps; first login = full tour; returning client with a
  lower completed version = "What's new" mini-tour of newer steps only; replayable.
- **Memory:** server-side, per person.
- **Scope v1:** one step per top-level tab. In-page spotlights are added later as
  additional versioned steps.
- **Copy:** real text drafted now in Jake's voice (no fluff, no em dashes).

## Architecture

Five pieces, each with one job.

### 1. Step registry: `src/lib/tourSteps.ts`

The single source of truth for tour content, a sibling to `nav.ts`. Pure data +
helpers, no React. A step:

```ts
export interface TourStep {
  id: string;                 // stable, unique
  version: number;            // monotonic; max across file = current tour version
  route: string;              // where Next navigates before highlighting
  target: { desktop: string; mobile: string | null };
  // mobile null => no nav chrome on phone for this surface; show centered card.
  title: string;
  body: string;               // plain explanation, Jake's voice
  capability?: Capability;    // gate: skipped if !can(capability, "view")
  ownerOnly?: boolean;        // gate: skipped for staff
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

export const TOUR_STEPS: TourStep[] = [ ... ];

export const CURRENT_TOUR_VERSION =
  TOUR_STEPS.reduce((m, s) => Math.max(m, s.version), 0);

// Steps this user should see, gated + ordered by version.
export function visibleSteps(opts: {
  isOwner: boolean;
  can: (c: Capability, a?: "view" | "edit") => boolean;
  sinceVersion: number | null; // null = full tour; N = only version > N
}): TourStep[];
```

Targets are CSS selectors resolved against `data-tour="..."` attributes we add to
existing nav items and a couple of in-page anchors. Additive, low risk.

Adding a feature later = append one `TourStep` with `version = CURRENT + 1`. That
is the entire "auto-add to the wizard" mechanism. No other file changes.

### 2. Server memory

Migration `command-center/app/supabase/migrations/0019_tour_progress.sql`:

```sql
create table if not exists tour_progress (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  person_key  text not null,          -- staff id, or owner's chosen GHL identity id
  completed_version int not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, person_key)
);
```

Apply with `npm run db:migrate` (never the SQL editor).

Endpoints, mirroring `functions/api/me/identity.ts` conventions:

- `GET /api/me/tour?personKey=...` -> `{ completedVersion: number | null }`
  (`null` when no row exists = never seen).
- `POST /api/me/tour` body `{ personKey, version }` -> upserts
  `completed_version = max(existing, version)`, returns `{ ok: true }`.

`personKey` is derived client-side: the staff id for staff sessions, otherwise the
chosen GHL identity id (falls back to `"owner"` when an owner skipped the picker).
The tenant comes from the session cookie server-side; `personKey` is never trusted
for auth, only as a per-person bucket within the already-authenticated tenant.

### 3. `TourContext` + `useTour` (`src/context/TourContext.tsx`)

Mounted once inside `Shell` (above both layouts). State machine:

- `idle` -> on first authed settle, fetch `completedVersion`.
- Decide:
  - demo / preview / offline / `needsIdentity` unresolved -> stay `idle` (never run).
  - `completedVersion === null` -> `active` with `visibleSteps(sinceVersion: null)`
    (full tour).
  - `completedVersion < CURRENT_TOUR_VERSION` -> `active` with
    `visibleSteps(sinceVersion: completedVersion)` ("What's new").
  - else -> `idle`.
- Exposes `{ status, steps, index, next, back, skip, startFull }`.
- `next` past the last step and `skip` both POST `CURRENT_TOUR_VERSION` and go
  `idle`. Skip = caught up (no future nagging for current content).
- `startFull()` (replay) runs the full tour without writing progress unless they
  complete it.

Gating reuses `useAuth().can` / `isOwner` so steps match exactly what the user can
open, same as the nav.

### 4. `TourOverlay` (`src/components/tour/TourOverlay.tsx`)

Renders only when `status === "active"`. Per step:

1. `navigate(step.route)` if not already there.
2. Resolve the target selector for the current layout (`window.matchMedia("(min-width: 1024px)")` picks desktop vs mobile, matching the `lg` breakpoint).
3. Wait (rAF poll, 2s cap) for the element; on resolve, scroll into view, measure
   its rect.
4. Render: a dimmed full-screen layer with a spotlight cutout over the rect (SVG
   mask or four-quadrant divs), plus a tooltip card positioned by `placement`
   (title, body, progress dots, Back / Next / Skip tour).
5. If the element never resolves (timeout) or `target` is null for this layout ->
   centered card, no spotlight, still advances. This is how phone handles Paid
   Ads / Calendar / Billing / Activity (no bottom-bar chrome).

Re-measures on resize / scroll. Traps focus, `Esc` = skip. `aria-live` on the card.

### 5. Anchors + replay entry

- Add `data-tour` attributes to `Sidebar` nav items (`nav-<route>`) and `BottomNav`
  items (`bottomnav-<route>`), plus the Settings link. Cosmetic, no behavior change.
- Settings gets a "Take the tour" row calling `startFull()`.

## Step list (v1, version 1 unless noted)

Order = nav order. Each gated by its capability so staff see only their surfaces.

1. **Welcome** (center, no target) - "This is your command center. Sixty seconds and you will know where everything lives."
2. **Home** (`/home`, `overview`) - the daily snapshot: new leads, what needs attention, today's numbers.
3. **Pipeline** (`/leads`, `pipeline`) - every lead and the stage it sits in. Reads the live stage names from `PipelinesContext` and lists them, then explains dragging a lead forward as it progresses.
4. **Inbox** (`/conversations`, `inbox`) - every text and email with a lead in one thread; reply from here.
5. **Contacts** (`/contacts`, `contacts`) - the full database of everyone who ever came in.
6. **Paid Ads** (`/paid-ads`, `paid_ads`) - what the ads are spending and bringing back. Phone: centered card.
7. **Calendar** (`/calendar`, `calendar`) - booked appointments and intro calls. Phone: centered card.
8. **Billing** (`/billing`, `billing`) - invoices and payment status. Phone: centered card.
9. **Activity** (`/activity`, `activity`) - the running log of everything happening in the account. Phone: centered card.
10. **Chat** (`/comms`, no capability) - the line straight to the Hauck team.
11. **Finish** (center) - "That is the whole thing. Replay it any time from Settings."

Final copy lives in `tourSteps.ts`; the above is the intent.

## Testing

- `tourSteps.test.ts`: ids unique; versions monotonic-friendly; `CURRENT_TOUR_VERSION`
  = max; `visibleSteps` filters by capability, ownerOnly, and `sinceVersion`
  (full vs what's-new vs none).
- Manual / Playwright: first-login full run desktop + phone; replay from Settings;
  add a fake `version: 99` step and confirm an onboarded user gets only that step.

## Out of scope (later, as added versions)

- In-page element spotlights (stage columns, composer, spend number).
- Per-surface deep tours.
- Analytics on drop-off step.
