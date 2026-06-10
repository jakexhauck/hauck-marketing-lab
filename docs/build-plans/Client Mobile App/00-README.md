# Client Mobile App: Build Plan

The mobile PWA (`client-dashboard/`) is roughly 85% done and already deployable. These
docs cover the work in two phases of numbered, dependency-ordered tasks:

- **Phase 1 (03 to 06): finish the test account.** The remaining work to make the existing
  app feel like a finished product (backend, users, webhooks, push). We finish this in the
  **test account** first, then promote the same build into real clients.
  - **Done and shipped:** 01 (deploy + smoke test), 02 (pagination fix), and 07 (offline
    caching) are complete and live; their docs have been removed. The app is deployed,
    logging in against the test account, and showing real leads.
- **Phase 2 (08 to 14): GHL feature expansion.** New sections that surface more of GHL inside
  the app (notes, tasks, calendar, full messaging, pipeline board, billing, notifications).
  Each is independently shippable. Two of them complete features that are already partly built
  (messaging send and pipeline write-back both already work, see those docs).
  - **Built (code-complete, pending live verification against the test account):** 08 (notes),
    09 (tasks), 10 (calendar), 11 (multi-channel messaging), 12 (pipeline board), 13 (invoices
    & payments). These pass typecheck + `pnpm build` and are wired into the app. They still need
    a live walk-through in the test account, since the invoices/payments/calendar response
    shapes were built defensively against the GHL docs, not a live response. One caveat: the
    pipeline board uses a tap-to-move "Move to stage" sheet rather than gesture drag-and-drop
    (touch DnD across snap-scroll columns needs on-device testing first).
  - **14 (notification center) is now built (code-complete).** It rides on the existing
    `activity_log` backend (the 03/05/06 code is present and degrades gracefully without
    Supabase), so it is no longer blocked. It adds a `read_at` column (migration 0005), a
    `GET /api/notifications` feed + unread count, a `POST /api/notifications/read` (one or
    all), a `<NotificationBell>` in the Home hero, and a day-grouped `Notifications` feed that
    deep-links each item. It shares the webhook's single write path and the push deep-link
    logic. It shows real data only once Supabase is provisioned; until then it is an empty,
    zero-unread feed like the rest of the activity surface.

## Conventions used throughout

- **Test first.** Every step is verified in test mode (`TEST_GHL_*` env vars, the test
  password) before it touches a live client. The app already supports a `live | test`
  session mode end to end (`functions/lib/session.ts`, `functions/api/_middleware.ts`).
- **No em dashes** in any code, comment, doc, or UI string. Commas, parentheses, colons.
- **Single source of truth for tenant creds** is the middleware (`ctx.data.tenant`). Never
  read `GHL_TOKEN` directly in a route. Always use `ctx.data.tenant.ghl_token`.
- File references are written as `path:line` against the state of the repo on 2026-06-09.
  Line numbers drift; treat them as a starting point, not gospel.

## The dependency graph

```
01 Deploy + smoke test  ──── DONE (live HTTPS URL, app deployed)
02 Pagination fix  ───────── DONE (100-record cap removed)
07 Offline caching  ──────── DONE (stale-while-revalidate)

03 Supabase wiring  ──────┬─ 04 Real user management   (reads tenant_users / admins)
   (foundation)           ├─ 05 Webhook processing     (writes activity_log)
                          └─ 06 Push notifications      (writes push_subscriptions)

05 Webhook processing  ───── 06 Push notifications      (webhook triggers the send)

--- Phase 2: feature expansion (08+) -----------------------------------------

08 Notes  ────────────────┬─ smallest write feature; sets the per-contact route pattern
                          └─ 09 Tasks reuses its exact route + mutation shape

09 Tasks  ────────────────── pairs with 10 (tasks + appointments = the client's day)

10 Calendar  ─────────────── independent; read-only agenda first, booking is phase two

11 Two-way messaging  ────── completes the already-built SMS send (multi-channel)

12 Pipeline board  ───────── UI over the already-built stage write-back; better after 02

13 Invoices & payments  ──── independent; different API convention (altId/altType)

14 Notification center  ──── needs 03 (store), 05 (events), 06 (transport); built last
                              because it aggregates events the other features produce
```

## Build order (recommended)

### Phase 1: finish the test account

Done: **01** (deploy + smoke test), **02** (pagination fix), **07** (offline caching). Remaining:

| # | Doc | Blocks | Size | Why this order |
|---|-----|--------|------|----------------|
| 03 | Supabase wiring | 04, 05, 06, 14 | M | The schema already exists. Wiring the client once is the foundation for users, activity log, and push subscriptions. Build it once, not three times. |
| 04 | Real user management | none | M | Replace mock users and `?dev=1` gating with real GHL team members + Supabase roles. |
| 05 | Webhook processing | 06, 14 | S/M | Turn the logging-only webhook into something that writes an activity feed and invalidates caches. |
| 06 | Push notifications | 14 | M | The single biggest "why is this an app" feature. Needs 03 (storage) and 05 (trigger). |

### Phase 2: GHL feature expansion

| # | Doc | Builds on | Size | Why this order |
|---|-----|-----------|------|----------------|
| 08 | Contact & lead notes | 04 (soft) | S | Smallest write feature. Establishes the per-contact route + mutation pattern 09 reuses. Proves write-back on a low-risk object. |
| 09 | Tasks & follow-ups | 08 | S | Copy of 08's shape with a new noun. "What's next" to notes' "what happened." Pairs with the calendar. |
| 10 | Calendar & appointments | none | M | Most-requested section. Read-only agenda first; in-app booking is an explicit phase two inside the doc. |
| 11 | Two-way messaging (multi-channel) | existing SMS send | M | SMS send already works; this completes it for email and social/DM channels. Highest daily-use surface. |
| 12 | Pipeline board | existing stage write-back, 02 | M | Stage write-back already works; this adds the kanban board + multi-pipeline support. Better after 02 so columns aren't capped at 100. |
| 13 | Invoices & payments | none | M | Self-contained billing visibility. Note the different `altId/altType` API convention. Read-first. |
| 14 | Notification center | 03, 05, 06 | M | In-app activity feed + bell. Built last: it aggregates the events every prior feature produces and is webhook-sourced, not a GHL pull. |

## Minimum path to "test app feels finished"

With 01, 02, and 07 done, the shortest remaining route to a test app that feels like a real
product is **03 → 06.** That adds a real backend and push notifications on top of the already
deployed, no-data-loss, offline-capable app. 04 and 05 are quality and can follow.

Phase 2 (08 to 14) is feature work, not a path to "finished," so it has no minimum subset.
Pick features by client demand. 08 and 09 are the cheapest wins; 10 (calendar) and 11
(messaging) are the highest daily-use; 14 (notifications) should come after 03/05/06 since it
sits on the same event pipeline as push.

## What each doc contains

Every numbered doc has the same shape so they are predictable to execute:

1. **Objective** and **why it matters**
2. **Dependencies** and **prerequisites**
3. **Current state** with exact file references and code
4. **Target state** with the code to write
5. **Step-by-step** implementation
6. **Testing** in test mode
7. **Acceptance criteria** (checklist)
8. **Rollback** notes

## Promoting from test to a real client (the "later" part)

These docs finish the test account. Promoting to a client is then mechanical:

1. Provision the client's GHL sub-account, capture its location ID + token.
2. Either set `GHL_LOCATION_ID` / `GHL_TOKEN` for a single-tenant deploy (current model), or
   add a row to the Supabase `tenants` table once multi-tenant routing is wired (a future
   doc, out of scope here).
3. Set `APP_PASSWORD`, regenerate `SESSION_SECRET`, point the custom domain.
4. Re-run the doc 01 smoke test against the client's data.

Multi-tenant routing (one deploy serving many clients off the `tenants` table) is a separate
effort and intentionally not in this set. The current single-tenant-per-deploy model is the
right call for the first few clients.
