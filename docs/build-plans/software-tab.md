# Fulfillment: Software tab

Spec and implementation plan in one doc.

Date: 2026-07-19
Branch: `feat/software-tab` (worktree `hml-worktrees/software-tab`, off `origin/main` `fae84b5`)

## 1. What we are building

A new **Software** service tab in the per-client Fulfillment cockpit
(`/admin/delivery/:tenantId?tab=software`). It lists every page of the client
app in a grouped rail on the left and renders the selected page live, with that
client's real data, in a frame on the right.

Read-only. No status tracking, no notes, no editing. The point is to see the
whole product for one client in one place.

### Decisions taken

| Question | Answer |
| --- | --- |
| Purpose | Read-only inventory. Not a status tracker. |
| On click | Preview inside the tab, not a full-screen takeover. |
| Depth | Every page, every in-page tab, plus record pages (one lead, one contact, one job, one conversation). |
| Preview data | Live and real, not nightly screenshots. |
| Layout | List rail left, preview frame right. |
| Width toggle | Desktop and phone widths, included now (cheap now, awkward to retrofit). |
| First client | Willis. It is the only live tenant. |

### Out of scope

- Any write path. The frame is read-only and the server enforces it.
- Admin surfaces in the inventory. Client app only.
- Mobile layout for the Software tab itself. It is a desktop admin surface.

## 2. Why the page list must derive itself

A hand-written list of pages is wrong the day after it is written. The app
already has two sources of truth:

- `src/lib/nav.ts` - `NAV`, every sidebar row, already grouped into Marketing
  and Company sections.
- `src/lib/pageTabs.ts` - `PAID_ADS_TABS`, `WEBSITE_TABS`, `REVIEWS_TABS`,
  `REACTIVATION_TABS`, `LEADS_TABS` and friends, every in-page tab.

`softwareMap.ts` reads both. A new page added to either file appears in the
Software tab with no extra work. Only record pages are hand-listed, because a
record page needs a real record id to point at.

A unit test asserts every derived entry resolves to a route registered in
`App.tsx`, so the inventory cannot silently drift from reality.

## 3. How the live preview stays safe

### The problem

`hml_session` is one cookie for admin sessions, client sessions and previews
alike. Today `POST /api/admin/clients/:id/preview` **overwrites** the admin
cookie with a preview cookie (`functions/api/admin/clients/[tenantId]/preview.ts`),
which is why entering a client kicks you out of admin. An iframe is same-origin
and shares the cookie jar, so a naive frame would either render as the admin
(wrong tenant) or destroy the admin session.

### What already exists in our favour

Two things, both already shipped and proven:

1. `verifySession` (`functions/lib/session.ts:214`) already accepts a token
   instead of a cookie, via `readBearer`. `mintPreviewSessionToken` already
   exists and is already exported.
2. The read-only gate already exists. `functions/api/_middleware.ts:79`:
   ```ts
   if (session.preview && ctx.request.method !== "GET") {
     return json(403, { error: "preview is read-only" }, origin);
   }
   ```
   Any token carrying the `p: 1` preview claim is read-only server-side, with
   no new code.

So we reuse the existing preview claim shape verbatim and change only how the
token is **delivered**.

### The design

1. **New endpoint** `POST /api/admin/clients/[tenantId]/preview-token`.
   Mints a preview token with `mintPreviewSessionToken` and returns it in the
   JSON body. Sets **no cookie**. The caller's admin session is untouched.
   TTL 15 minutes, versus 2 hours for the existing cookie preview: this token
   travels in a URL fragment, so it gets a short life.

2. **New header** `x-preview-token`, read **first** in `verifySession`, ahead
   of the cookie:
   ```ts
   const raw = readPreviewHeader(req) ?? readCookie(req, COOKIE_NAME) ?? readBearer(req);
   ```
   A distinct header rather than flipping the existing cookie/Bearer precedence,
   so no existing auth path changes behaviour. Added to the CORS allowlist in
   `_middleware.ts:30`.

   The token is verified through the same HMAC path as every other session. A
   forged or expired one fails exactly as it does today.

3. **Fragment delivery, not query.** The frame loads
   `/marketing/paid-ads#preview_token=...`. A URL fragment is never sent to the
   server, so the token stays out of access logs, out of `Referer`, and out of
   the Cloudflare request log. The app reads it at boot, holds it in a module
   variable, and strips the fragment via `history.replaceState`.

4. **The frame never writes a cookie.** `previewFrame.ts` holds the token in
   memory only. Nothing persists, so closing the frame ends the preview.

### Found in security review, and fixed

An adversarial review of the token path found one critical hole and three real
ones. All are fixed and pinned by tests.

**CRITICAL: preview token could be traded for a 30-day admin cookie.**
`/api/auth/exit-preview` is a PUBLIC path, so the middleware's read-only gate
never runs for it. It verifies its own session and mints a fresh admin cookie
from the adminId inside a preview token. Once `verifySession` accepted a
JS-readable header token, a single curl turned a 15-minute read-only token into
full cross-tenant admin:

```
curl -X POST /api/auth/exit-preview -H "x-preview-token: <token>"
```

Fixed by deriving `SessionData.viaPreviewHeader` per request (never from signed
claims) and refusing it in `exit-preview`. The cookie preview, which is HttpOnly
and unreadable by JS, still works. Pinned by
`functions/api/auth/exitPreviewGuard.test.ts`, which asserts 403 for the header
path and 401 (not 403) for the cookie path.

**HIGH: the token was persisted to localStorage.** `useClientPreviewToken` is a
react-query query, and the persister dehydrates every successful query to
`localStorage`, refreshing a live token every 12 minutes. Fixed with a
`NEVER_PERSIST_KEYS` list in `queryClient.ts` plus a cache-buster bump, so
existing snapshots are discarded on load.

**MEDIUM: service-worker cache bleed.** Workbox keys runtime caches by URL only,
so client A's cached `/api/leads` would paint inside client B's frame. Fixed by
skipping the runtime caches for any request carrying a preview token.

**MEDIUM: "open in new tab" leaked the token into browser history.** Chrome
commits a navigation to its on-disk history before a script can strip the
fragment. The button is removed; "Enter live app" in the cockpit header remains
the full-screen path.

Also added `public/_headers` with `frame-ancestors 'self'`, which permits
exactly this feature and blocks all other framing.

### Why this cannot escalate

- The token carries `p: 1`, so `verifySession` takes the preview branch
  (`session.ts:241`) which is checked **before** the plain-admin branch. It
  resolves to `{ preview: true, tenantId, adminId }`, never to an admin session.
- `_middleware.ts:87` gates `/api/admin/*` on `session.adminId && !session.preview`,
  so a preview token cannot reach any admin endpoint.
- `_middleware.ts:79` blocks every non-GET.
- Minting requires an existing admin session, since the new endpoint sits under
  `/api/admin/*`.

Net new authority: none. This is the existing preview session, delivered
without clobbering the admin cookie.

## 4. Files

### Backend

| File | Change |
| --- | --- |
| `functions/lib/session.ts` | Add `readPreviewHeader`; check it first in `verifySession`. Add `PREVIEW_TOKEN_MAX_AGE_SECONDS` (900) and a `ttlSeconds` argument to `mintPreviewSessionToken`, defaulting to the current 2 hours so the cookie path is unchanged. |
| `functions/api/_middleware.ts` | Add `x-preview-token` to the CORS allowed-headers list. |
| `functions/api/admin/clients/[tenantId]/preview-token.ts` | New. `onRequestPost`: validate tenant, mint a 15-minute preview token, return `{ token, expiresAt }`, no `set-cookie`. Log `client.preview_token` via `logAdminAction`. |

### Frontend

| File | Change |
| --- | --- |
| `src/lib/previewFrame.ts` | New. Reads `#preview_token=` at module load, stores in memory, strips the fragment. Exports `isPreviewFrame()`, `previewHeaders()`. |
| `src/lib/api.ts` | Merge `previewHeaders()` into every request. |
| `src/context/AuthContext.tsx` | Merge `previewHeaders()` into the raw `fetch` calls that bypass `api()` (`reconcileSession` in particular, so the framed app resolves as the client and not the admin). |
| `src/lib/softwareMap.ts` | New. Derives the grouped inventory from `NAV` + the `*_TABS` arrays, plus `RECORD_PAGES`. |
| `src/lib/softwareMap.test.ts` | New. Asserts coverage of `NAV`, no duplicate paths, and that every path matches a route registered in `App.tsx`. |
| `src/components/admin/cockpit/software/SoftwareTab.tsx` | New. Split layout, selection state, width toggle. |
| `src/components/admin/cockpit/software/PagePreviewFrame.tsx` | New. Renders the iframe, width toggle, reload. No "open in new tab" (see security review). |
| `src/lib/queryClient.ts`, `src/main.tsx` | Never persist credential-bearing queries; cache-buster bumped. |
| `src/sw.ts` | Skip runtime caches for preview requests. |
| `functions/api/auth/exit-preview.ts` | Refuse header-borne preview sessions. |
| `public/_headers` | New. `frame-ancestors 'self'`. |
| `src/hooks/useApi.ts` | Add `usePreviewToken(tenantId)` and `useSoftwareRecordIds(tenantId)`. |
| `src/lib/deliveryCockpit.ts` | Add `software` to `ServiceTab` and `SERVICE_TABS`. |
| `src/routes/admin/DeliveryCockpit.tsx` | Render `SoftwareTab` for the new tab. |
| `src/routes/sales/Jobs.tsx` | Accept `?view=jobs\|month\|week\|agenda`. URL wins, else the saved preference, else `jobs`. Default behaviour unchanged. |
| `src/index.css` | Styles for the split layout. |

### Record ids

`useSoftwareRecordIds(tenantId)` asks the existing admin-scoped endpoints for
the client's most recent lead, contact, customer and conversation, and returns
their ids. A record page with no available record renders a disabled row that
says so, rather than a broken frame.

## 5. Order of work

1. Backend token endpoint + `session.ts` header support, with unit tests.
2. `previewFrame.ts` + `api.ts` + `AuthContext.tsx` plumbing.
3. `softwareMap.ts` + its test.
4. `Jobs.tsx` `?view=` param.
5. `SoftwareTab.tsx` + `PagePreviewFrame.tsx` + styles.
6. Record id resolution.
7. Security review of the whole token path.
8. Full suite, then live verification against Willis with Playwright.

## 6. Definition of done

- Software tab lists every page in `NAV` and every in-page tab, grouped.
- Clicking a page renders it live in the frame with Willis's real data.
- The admin session survives. After clicking through ten pages, the cockpit
  around the frame is still there and still admin.
- A write attempted from inside the frame is refused by the server.
- The token is absent from the URL bar after load.
- Desktop and phone widths both render.
- Full test suite green.
- Screenshots of real pages in the frame as evidence.
