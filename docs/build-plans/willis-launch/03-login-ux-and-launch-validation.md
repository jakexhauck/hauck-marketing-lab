# Plan 03 — Login UX + full end-to-end launch validation (LAUNCH track)

**You are one of several Claude instances. Read `00-INDEX.md` first.** Address Jake as
**"Sir"**. **No em dashes.** **Ask clarifying questions** when behavior is ambiguous.

**Depends on Plans 01 + 02.** This is the launch gate: when this passes, Willis is live.

## Goal

1. Finish the login experience so an **owner signs in with their own email + password**
   (not the legacy shared-password tab), on **both** the desktop and mobile builds.
2. Run a complete end-to-end validation on a real desktop browser **and** an installed phone
   PWA, for both an owner and a rep, and get Jake's launch sign-off.

## Background you need

Account-based login is already built on the backend: `/api/auth/staff-login` takes email +
password, finds the person across all clients, and mints a session carrying the tenant. An
owner is just a `staff_accounts` row with role `owner`. The OLD `/api/auth/login`
(shared password) still exists as a single-tenant fallback but should not be the primary path.

Both frontends currently show an "Owner" tab (shared password) and a "Staff" tab (email +
password):
- Desktop: `Hauck Command Center (Clients)/Desktop App/src/routes/Login.tsx` + `AuthContext.tsx`.
- Mobile: `Hauck Command Center (Clients)/Mobile App/src/routes/Login.tsx` + `AuthContext.tsx`.

## Work

### A. Login UX (both builds)
- Make **email + password the primary login** for everyone (owner + staff). Simplest correct
  change: drop/hide the shared-password "Owner" tab and present one email + password form that
  posts to `/api/auth/staff-login`; keep the **Admin** tab (`/api/auth/admin-login`) for Jake.
- Keep the live/test mode toggle only if Jake still wants a test account; otherwise hide it.
- **Ask Jake:** "Keep a test-account mode, or live-only?" and "Should there be any visible
  'owner vs staff' distinction at login, or just one email/password form?"
- Confirm logout clears the session (`/api/auth/logout`) and, on mobile, clears any app badge.

> Note: this UX work is on the existing builds and will be re-applied in the merged app
> (Plan 04). That is expected (launch-first path). Keep the change small and self-contained.

### B. End-to-end validation matrix
Run every cell. Use the Playwright tools for the desktop browser; use a real phone (or a
phone-sized install) for the PWA cells. Record pass/fail with notes.

| Check | Desktop browser | Installed phone PWA |
|---|---|---|
| Owner logs in (email + password) | | |
| Rep logs in; sees ONLY permitted surfaces | | |
| Leads/pipeline shows Willis's real GHL data, correct stages | | |
| Conversations thread loads; can send a message | | |
| Calendar shows Willis's appointments | | |
| Contacts load | | |
| Billing (if enabled) loads | | |
| Disabled surface is hidden AND returns 403 if hit directly | | |
| Branding correct (app name, color, initials, Won/value labels) | | |
| Logout works; session cleared | | |
| Wrong password rejected; rate-limit holds | | |

- Mobile-only: confirm the PWA **installs** (Add to Home Screen) and launches standalone.
- Confirm the desktop build and the mobile app show the **same data** for the same login
  (same backend).

### C. Triage
- File any failures as concrete fixes. Auth/permission bugs are launch blockers; cosmetic
  desktop-width issues are NOT (the responsive merge is Plan 04). Get Jake to confirm which
  failures block launch vs defer.

## Definition of done
- Owner + at least one rep log in with email + password on desktop AND installed phone PWA.
- The validation matrix passes for all enabled surfaces (or Jake explicitly defers a cell).
- Jake gives launch sign-off. **Willis is live.**

## MANUAL ACTIONS — JAKE MUST DO
1. Be available to test on your own phone (install the PWA) and a desktop browser.
2. Decide test-mode keep/drop and the login form shape (questions in section A).
3. Give launch sign-off, or list the must-fix items.

## Manual actions ALREADY DONE FOR YOU
- Backend account-based login + owner-as-account are implemented; this plan only finishes the
  frontend login form and validates.
