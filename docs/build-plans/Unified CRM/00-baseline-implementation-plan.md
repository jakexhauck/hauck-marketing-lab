# Unified CRM: Baseline Implementation Plan

Status: planning. Scope: get the plumbing working. No UI work in this plan (layouts,
screens, and design come later). The goal is a new web CRM and a desktop CRM that
**share logins** and **stay in sync** with the existing mobile PWA, all on one backend.

## Assumptions (state these out loud before building)

1. **Same audience, bigger surface.** The new web/desktop CRM serves the same person/team
   as the mobile app (the single tenant, e.g. Willis), just on a big screen with room for
   more features later. This is the baseline. Multi-client agency cockpit and per-user
   accounts are a clearly-marked later phase, not baseline.
2. **Keep the shared-password auth model** for now. "Same logins" is therefore trivially
   true: one password, one session, every app. Real per-user accounts (Supabase Auth) are
   an additive upgrade later, not part of getting the baseline working.
3. **Mobile app is frozen.** No behavior or UI change. The only thing that touches
   `client-dashboard/` is a no-runtime-change import refactor (Phase 1), which is optional
   and can be skipped if we accept short-term type duplication.
4. **One backend is the source of truth.** GHL + Supabase behind the existing Cloudflare
   Functions API. We do not fork or rebuild the backend. Every app is just another client
   of `/api/*`.

If assumption 1 or 2 is wrong (you actually want the agency-wide, multi-client, named-user
cockpit), jump to "Later phase: real accounts + multi-tenant" before starting, because it
changes Phases 2 and 3.

---

## Target architecture

```
                     ONE API ORIGIN  (existing Cloudflare Functions, unchanged logic)
                     api.hauckmarketing.com/api/*   (or keep dash.hauckmarketing.com/api)
                     verifySession(): accepts cookie OR Authorization: Bearer
                              |                 |                    |
              ┌──────────────┘                 │                    └───────────────┐
        ┌─────┴──────┐                  ┌───────┴────────┐                  ┌────────┴────────┐
        │  Mobile    │                  │   Web CRM      │                  │  Desktop CRM    │
        │  PWA       │                  │   (new)        │                  │  (Tauri wrap    │
        │  FROZEN    │                  │   browser      │                  │   of Web CRM)   │
        │            │                  │                │                  │                 │
        │ cookie auth│                  │  cookie auth   │                  │ bearer-token    │
        │ same-site  │                  │  same-site     │                  │ auth, token in  │
        │            │                  │                │                  │ OS keychain     │
        └────────────┘                  └────────────────┘                  └─────────────────┘
              \________________________________|___________________________________/
                         all read/write the same GHL + Supabase data
                         => sync is automatic (polling today; realtime optional later)
```

Two transports, one session format:

- **Web (mobile + web CRM):** HttpOnly cookie, exactly as today. Both frontends call the
  same API origin, and because they sit on subdomains of the same registrable domain
  (`hauckmarketing.com`), the cookie is same-site and `SameSite=Lax` keeps working. No new
  auth mechanics.
- **Desktop (Tauri):** the webview origin is `tauri://localhost` (opaque, cross-site to our
  domain), so browser cookies do not reliably attach. Desktop logs in, receives the **same
  signed session token** in the response body, stores it in the OS keychain, and sends it
  as `Authorization: Bearer <token>` on every request.

The single enabling change on the backend: `verifySession()` must read the token from the
cookie **or** the `Authorization` header. Everything else about the backend is untouched.

---

## Phase 0 — Decide deployment topology (1 short decision, no code)

Pick where the API lives. Two viable options:

- **Option A (least change): keep the API inside the mobile Pages project.** All apps call
  `https://dash.hauckmarketing.com/api/*`. The web CRM and desktop just point their API base
  there. Cheapest, ships fastest. Slight conceptual wart: the "API" is co-located with the
  mobile frontend.
- **Option B (cleaner long-term): promote the API to its own origin** `api.hauckmarketing.com`
  (a dedicated Pages/Worker project that only serves `functions/`). Mobile then sets
  `VITE_API_BASE=https://api.hauckmarketing.com` (a one-line env change, no code change,
  because `api.ts:11` already honors `VITE_API_BASE`). Web CRM and desktop point at the same.

Recommendation: **start with Option A to get the baseline working, migrate to Option B**
once the web CRM is real. The shared client (Phase 1) makes the base URL a single config
value, so the migration is changing one env var per app.

Cookie note for both options: the session cookie is currently host-only (no `Domain`
attribute, `session.ts:69`). That is fine as long as **every frontend calls the same API
host**. If we later split the API onto its own subdomain and want extra robustness, add
`Domain=.hauckmarketing.com` to the cookie. Not required for baseline.

---

## Phase 1 — Monorepo + shared core package

Goal: the web CRM and desktop reuse the mobile app's API types, fetch layer, and React Query
hooks without copy-paste drift. No runtime behavior change to mobile.

### 1.1 Introduce a pnpm workspace at the repo root

There is no root `package.json` today; `client-dashboard/` is standalone. Create:

- `/package.json` (private, workspace root, `packageManager: pnpm@10.18.0` to match).
- `/pnpm-workspace.yaml`:
  ```yaml
  packages:
    - "client-dashboard"
    - "crm-web"
    - "crm-desktop"
    - "packages/*"
  ```

The Tauri agency app (`app/`) stays out of the workspace; it is unrelated and we are not
touching it.

### 1.2 Extract `packages/core`

A framework-agnostic package containing the parts that must not drift between apps:

- **Types:** move the `ApiLead`, `ApiPipeline`, `ApiSummary`, `ApiContact`,
  `ApiConversation`, `ApiNote`, `ApiTask`, `ApiInvoice*`, `ApiTransaction`,
  `ApiCalendarEvent`, `ApiActivity`, `ApiNotification`, `AdminClient` interfaces out of
  `client-dashboard/src/lib/api.ts` (lines 46-216) into `packages/core/src/types.ts`.
- **API client factory:** replace the module-level `api<T>()` (which hardcodes
  `VITE_API_BASE` and `credentials: "include"`) with a factory:
  ```ts
  // packages/core/src/client.ts
  export type AuthTransport =
    | { mode: "cookie" }                              // web: browser handles the cookie
    | { mode: "bearer"; getToken(): string | null }; // desktop: attach Authorization

  export function createApiClient(opts: { baseUrl: string; auth: AuthTransport }) {
    return async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      if (init.body && !headers.has("content-type"))
        headers.set("content-type", "application/json");
      if (opts.auth.mode === "bearer") {
        const t = opts.auth.getToken();
        if (t) headers.set("authorization", `Bearer ${t}`);
      }
      const res = await fetch(`${opts.baseUrl}${path}`, {
        ...init,
        headers,
        credentials: opts.auth.mode === "cookie" ? "include" : "omit",
      });
      // ... identical body parsing + ApiError logic as today (api.ts:27-43)
    };
  }
  ```
  This preserves the exact mobile behavior when called with
  `createApiClient({ baseUrl: import.meta.env.VITE_API_BASE ?? "", auth: { mode: "cookie" }})`.

### 1.3 (Optional) re-point mobile at `packages/core`

To prevent drift, change `client-dashboard/src/lib/api.ts` to construct the client from the
factory and re-export the moved types. **This is a pure refactor: no runtime change.** Verify
by typecheck + the existing app smoke test. If you would rather not touch mobile at all right
now, skip this and let the web CRM import from `packages/core` while mobile keeps its current
copy; reconcile later. The downside is two copies of the types until then.

### 1.4 Hooks: keep in mobile for now, lift later

`client-dashboard/src/hooks/useApi.ts` is the richest reuse target, but it imports the
module-level `api()` and is tied to React Query setup. For baseline, **do not move it yet**.
The web CRM can import the hooks file directly from `client-dashboard` via the workspace, or
re-implement the handful it needs against `packages/core`. Lifting `useApi.ts` into
`packages/core` cleanly is a follow-up once the client factory is the single entry point.

**Acceptance:** `pnpm -r typecheck` passes; mobile app builds and behaves identically;
`packages/core` has zero React/DOM dependencies and compiles standalone.

---

## Phase 2 — Make the backend session transport-agnostic

This is the only meaningful backend change in the entire baseline. Three small edits, all in
`client-dashboard/functions/`. Logic for GHL/Supabase/tenants is untouched.

### 2.1 `verifySession()` reads cookie OR bearer header

In `functions/lib/session.ts`, the verifier currently only calls `readCookie()`
(`session.ts:90`). Add a header fallback so the same signed-token format is accepted from
desktop:

```ts
function readBearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export async function verifySession(req: Request, env: Env): Promise<SessionData | null> {
  const raw = readCookie(req, COOKIE_NAME) ?? readBearer(req);  // <-- only change to flow
  if (!raw) return null;
  // ... existing HMAC verify + expiry logic, unchanged (session.ts:92-110)
}
```

The token format (`<payload>.<sig>`, HMAC-SHA256 over `exp.mode`) is identical whether it
rides in a cookie or a header. No new crypto, no new secret.

### 2.2 Login returns the raw token (additively)

`functions/api/auth/login.ts:81-88` mints the cookie and returns `{ ok, mode }`. We need the
raw token value in the body for non-cookie clients. Refactor `mintSessionCookie` so the token
value and the `Set-Cookie` string come from one place:

- Add `mintSessionToken(env, mode): Promise<string>` in `session.ts` that returns just the
  `<payload>.<sig>` value (factor it out of the current `mintSessionCookie`, which then wraps
  it with the cookie attributes).
- In `login.ts`, compute the token once, set the cookie header from it (web unchanged), and
  add it to the JSON body: `{ ok: true, mode, token }`.

Web clients ignore `token` and keep using the cookie. Desktop reads `token` and stores it.

Security note: the token is bearer-equivalent to the session cookie, so treat the login
response as sensitive (it already is over HTTPS). Desktop must store it in the OS keychain,
not plaintext. See Phase 4.

### 2.3 CORS: allow the web CRM origin

`functions/api/_middleware.ts:5-10` has a hardcoded `allowedOrigins` set. Add the web CRM's
origin(s):

```ts
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:8788",
  "http://localhost:5174",                 // web CRM dev server (pick a port)
  "https://dash.hauckmarketing.com",        // mobile (existing)
  "https://crm.hauckmarketing.com",         // web CRM (new)
  "https://hauck-dashboard.pages.dev",
]);
```

CORS already advertises `access-control-allow-credentials: true` and the right methods
(`_middleware.ts:17-24`), so credentialed cross-subdomain requests from the web CRM work once
its origin is listed.

Desktop (Tauri) sends `Origin: tauri://localhost` (or no Origin). Because desktop uses bearer
auth with `credentials: "omit"`, it does **not** need to be in `allowedOrigins` and does not
need CORS credentials. If a preflight ever complains, allow the Tauri origin explicitly, but
with bearer + omit it generally will not.

**Acceptance (curl, no UI needed):**
1. `POST /api/auth/login` returns `{ ok, mode, token }` and a `Set-Cookie`.
2. `GET /api/summary` with `Cookie: hml_session=...` returns 200 (web path still works).
3. `GET /api/summary` with `Authorization: Bearer <token>` and no cookie returns 200 (new
   desktop path works).
4. `GET /api/summary` with neither returns 401.
5. Mobile app, end to end, still logs in and loads data (regression check).

---

## Phase 3 — Web CRM app skeleton (wiring only, no UI)

Goal: a deployable second frontend that logs in with the same password and reads the same
data. Looks bare on purpose; layout comes later.

### 3.1 Scaffold `crm-web/`

- React 19 + Vite + TypeScript, mirroring `client-dashboard`'s toolchain (same versions to
  avoid duplicate transitive installs in the workspace).
- Depends on `packages/core` for the API client + types.
- `VITE_API_BASE` env points at the chosen API origin (Phase 0). In dev, either proxy `/api`
  to the running Functions server (as mobile does) or set `VITE_API_BASE` to the deployed API.

### 3.2 Auth wiring

- Construct the client in **cookie mode**:
  `createApiClient({ baseUrl: import.meta.env.VITE_API_BASE, auth: { mode: "cookie" } })`.
- Port the minimal auth flow from `client-dashboard/src/context/AuthContext.tsx`: a login call
  to `/api/auth/login`, a session check via `/api/auth/me`, and `signOut` via
  `/api/auth/logout`. No identity picker needed for baseline (single tenant).

### 3.3 Prove data flow

Stand up React Query and call a couple of existing endpoints (`/api/summary`, `/api/leads`)
to confirm the whole chain works. A plain `<pre>{JSON.stringify(data)}</pre>` is sufficient,
this is the "no UI" baseline. The point is: same login, same data, separate app.

### 3.4 Deploy

Cloudflare Pages project for `crm-web`, served at `crm.hauckmarketing.com`. If using
topology Option A, it has **no** `functions/` of its own (it calls the mobile project's API).
If Option B, the API is its own project and both frontends call it.

**Acceptance:** open the web CRM in a browser, enter the same password as mobile, see live
GHL data. Edit a lead in mobile, refetch in web CRM, see the change (sync via shared backend).

---

## Phase 4 — Desktop CRM (Tauri wrap of the web CRM)

Goal: an installable computer app that is the web CRM in a native shell, authenticating via
bearer token in the keychain. Build this **after** the web CRM works, because it is largely
the same frontend plus a thin native auth/token layer.

### 4.1 Scaffold `crm-desktop/` (Tauri 2)

- Reuse your existing Tauri 2 experience from `app/`, but this is a **new, separate** Tauri
  project. Do not entangle it with the agency app.
- Frontend source = the web CRM. Two ways to share it:
  - **Bundle the built web CRM** as the Tauri frontend (static `dist/` assets), API calls go
    to the remote API origin. App-like startup, survives brief offline for cached data.
    Recommended.
  - Or point Tauri's window at the remote web CRM URL. Simpler, but always needs connectivity
    and you lose the native packaging benefits.
- Practically, factor the web CRM so its build output can be consumed by both `crm-web`
  (Pages) and `crm-desktop` (Tauri). Easiest: `crm-desktop` depends on `crm-web` as a
  workspace package and builds its frontend, or shares a common `crm-app` package that both
  the Pages project and the Tauri project wrap.

### 4.2 Auth transport = bearer

- Construct the API client in **bearer mode**:
  `createApiClient({ baseUrl: API_ORIGIN, auth: { mode: "bearer", getToken } })`.
- Login screen posts to `/api/auth/login`, reads `token` from the response body (Phase 2.2),
  and stores it.
- **Token storage:** use the OS keychain, not localStorage. Options:
  - `tauri-plugin-stronghold` (encrypted vault), or
  - a keyring plugin / the `keyring` crate via a small Rust command.
  Expose two Tauri commands: `save_session_token(token)` and `load_session_token()`. The JS
  `getToken()` calls `load_session_token()` (cache in memory after first read).
- On 401 from any call, clear the stored token and return to the login screen.

### 4.3 Why bearer and not cookies

Tauri's webview origin is opaque/cross-site relative to `hauckmarketing.com`, so a
`SameSite=Lax`, host-only cookie set by the API will not reliably be sent on desktop requests.
Bearer sidesteps the entire cookie/CORS-credentials problem: `credentials: "omit"`, just an
`Authorization` header. This is exactly why Phase 2.1 made `verifySession` header-aware.

**Acceptance:** install the desktop app, log in with the same password, see the same live
data as mobile and web. Kill and relaunch: still logged in (token restored from keychain).
Log out: token removed from keychain, 401s send you back to login.

---

## Phase 5 — Sync (baseline is already done; realtime is optional)

Sync is a consequence of one shared backend, not a feature to build. All three apps read and
write the same GHL + Supabase data, so a change made anywhere is visible everywhere on the
next fetch.

- **Baseline (ship this):** the polling already in `useApi.ts` (summary every 60s, activity
  and notifications every 30s, leads `staleTime` 15s). Reuse it in the web CRM. This is
  "they sync to each other" for the baseline.
- **Optional upgrade (later):** Supabase Realtime subscription on `activity_log`. On an
  inserted row, call `queryClient.invalidateQueries(...)` so all connected clients refetch
  immediately instead of waiting for the poll. This is additive, touches only the frontends'
  query layer, and is not required to call the baseline "working."

---

## Sequencing and dependencies

```
Phase 0  decide topology            (decision only)
   │
Phase 1  monorepo + packages/core   (enables reuse; mobile untouched at runtime)
   │
Phase 2  transport-agnostic session (backend; unblocks desktop)  ── can run parallel to P1
   │
Phase 3  web CRM skeleton           (needs P1 client + P2 CORS)
   │
Phase 4  desktop wrap               (needs P2 bearer + P3 frontend)
   │
Phase 5  sync                       (P3/P4 reuse existing polling; realtime optional)
```

Phases 1 and 2 are independent and can be done in either order or in parallel. Phase 3 needs
both. Phase 4 needs Phase 3.

---

## Testing strategy (no UI required)

- **Backend (Phase 2):** curl/httpie matrix from the Phase 2 acceptance list; optionally a
  small vitest suite around `verifySession` (cookie-only, bearer-only, both, neither, expired,
  bad signature).
- **Core package (Phase 1):** unit test `createApiClient` for header injection (bearer sets
  `Authorization`; cookie sets `credentials: include`) and `ApiError` behavior on non-2xx.
- **Web CRM (Phase 3):** a login + `/api/summary` smoke check; the bare JSON dump is the test
  surface.
- **Desktop (Phase 4):** manual install/login/relaunch/logout per acceptance; plus a Rust
  unit test that keychain save/load round-trips.
- **Regression:** the mobile app must pass its existing smoke test unchanged after Phase 1
  and Phase 2.

---

## Risks and watch-items

1. **Cross-origin cookie behavior.** Mitigated by having all web frontends call one API host
   on the same registrable domain (same-site, Lax works). If the API ever moves to a truly
   different domain, switch the cookie to `SameSite=None; Secure` and add `Domain=`. Not
   needed for baseline.
2. **Bearer token = cookie-equivalent secret.** Must live in the OS keychain on desktop, never
   plaintext, and be cleared on logout/401. The login response now carries it, so keep that
   over HTTPS only.
3. **Frontend drift.** The whole point of `packages/core` is to stop the web CRM and mobile
   from forking types. Resist the temptation to copy `api.ts` into the new app; import it.
4. **Build duplication in the workspace.** Pin React/Vite/TS to the same versions across
   `client-dashboard`, `crm-web`, and the shared frontend package so pnpm dedupes cleanly.
5. **Touching the frozen app.** Phase 1.3 is the only edit to mobile and it is a no-runtime
   refactor. If risk appetite is zero, skip it and accept temporary type duplication.

---

## Later phases (explicitly out of baseline)

These are the forks that would expand the work; none are needed to get the baseline running.

- **Real per-user accounts + roles (Supabase Auth).** Replaces the shared password with named
  logins, role-based access (admin vs client), and an audit trail. Requires schema work
  (`tenant_users` already exists as a foundation), a new login flow, and middleware that
  resolves a user rather than a mode. This is the big one; do it only if the CRM must
  distinguish who is who.
- **Multi-tenant agency cockpit.** One CRM that manages all clients, switching tenant context.
  Builds on real accounts; the existing `tenants`/`tenant_users` tables and the desktop app's
  `provision_mobile_tenant` flow are the starting points.
- **Realtime sync** (Phase 5 optional) via Supabase Realtime.
- **All UI/UX:** desktop layouts, dense tables, bulk actions, reporting, keyboard shortcuts.
  Deliberately excluded here per request.
```
