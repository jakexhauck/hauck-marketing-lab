# Plan 05 — Admin view INSIDE the one app (MERGE track)

**You are one of several Claude instances. Read `00-INDEX.md` first.** Address Jake as
**"Sir"**. **No em dashes.** **Ask clarifying questions** about admin workflows.

**Depends on Plan 04** (the unified responsive app exists).

## Goal

The admin view is **the same Command Center**, not a separate app. Jake's admin login unlocks
an admin section inside `app.hauckmarketing.com` where he can set up a client and configure
**that client's view and settings** entirely in-app: branding, which surfaces they see,
staff + permissions, GHL creds, owner login. This is the in-app control Jake asked for so he
can make changes to a client "all within the app."

## Background
The admin UI already exists in the (now-retired) Desktop App and the endpoints live in the
shared backend. Bring the UI into the unified app and gate it behind the admin session.

- Backend (already built, keep): `Mobile App/functions/api/admin/**`
  - `GET/POST /api/admin/clients` (list / create; create can also make the owner login)
  - `GET/PATCH /api/admin/clients/:id` (detail / update branding, labels, GHL, owner password)
  - `PATCH /api/admin/clients/:id/entitlements` (toggle a surface on/off = the client's "view")
  - `POST /api/admin/clients/:id/staff`, `PATCH/DELETE .../staff/:staffId`
  - `POST /api/admin/clients/:id/import-staff` (pull GHL users)
- UI to port (from the retired Desktop App): `src/routes/admin/AdminClients.tsx`,
  `AdminClientDetail.tsx`, and their modals (business edit, staff editor, features card).
- Admin session: `/api/auth/admin-login`; gate in `functions/api/_middleware.ts` already
  forbids non-admins from `/api/admin/*`.

## Work
1. **Port the admin routes** into the unified app under `src/routes/admin/`, rendered in the
   same responsive shell. Add an `/admin` area visible only when the session is an admin
   (`isAdmin` from `/api/auth/me`).
2. **Gate it.** Non-admins never see admin nav and are redirected away from `/admin/*`.
3. **In-app client controls** (wire to the endpoints above) so Jake can, per client:
   - Create a client (name, niche, owner email + password, GHL creds, branding, labels).
   - Edit branding: app name, brand color, initials, Won/value labels.
   - Edit the **client's view**: toggle entitlements (which surfaces they see). Confirm the
     change reflects immediately for that client.
   - Manage staff: add/disable, set role, set per-surface view/edit permissions, import from GHL.
   - Set/replace GHL creds + owner credentials.
4. **Drop the dead `subdomain` field** from the admin forms (account login made it obsolete).
   Keep owner email + password.
5. **Ask Jake** whether he wants a "**preview as this client**" mode (impersonate a client's
   view read-only) now or later; if now, scope it minimally and safely (admin-only, no writes).

## Definition of done
- Logged in as admin at `app.hauckmarketing.com`, Jake sees an admin section; logged in as a
  client he does not.
- Jake can create a new client end-to-end and that client can immediately log in.
- Toggling a surface for a client changes what that client sees; changing branding updates
  the client's app name/color.
- Staff add + GHL import work; permissions enforce.

## MANUAL ACTIONS — JAKE MUST DO
1. Answer the "preview as client" question and confirm the exact set of per-client controls
   you want surfaced first.
2. Test creating a throwaway second client and logging in as it, to confirm the full flow.

## Manual actions ALREADY DONE FOR YOU
- All admin endpoints exist; create-client already provisions the owner login. This plan is a
  UI port + gating, not new backend work (unless "preview as client" is chosen).
