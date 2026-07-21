# Setter Suite: Calendar tab

Spec and implementation plan in one document.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give setters a third tab in the Setter Suite that shows the selected client's booked appointments and Google busy hours as a week grid, and lets them book an existing GHL contact into any gap.

**Architecture:** Two new admin-gated read endpoints (booked events, Google busy) plus a contact-search endpoint feed a new `SetterCalendar` component. That component reuses the client app's existing `CalendarViews` / `WeekView` unchanged except for one additive prop: an optional empty-slot layer that reports the clicked day and minute. Clicking a gap opens a slide-over that already knows the time, so the setter only has to find the contact and confirm. Booking goes through the existing `POST /api/admin/setter/book`.

**Tech Stack:** Cloudflare Pages Functions, React 18 + TanStack Query, Vitest, Supabase (tenant rows), GHL v2 API, Composio (Google Calendar).

## Global Constraints

1. **Never fall back to env GHL credentials.** Every new endpoint resolves creds through `getGhlContextForTenant` (`functions/lib/tenantGhl.ts`), which hard-fails on the placeholders `''`, `pending`, `env`. The older `resolveGhlCreds` in `tenantResolve.ts` falls back to `env.GHL_LOCATION_ID` / `env.GHL_TOKEN`, which are Willis production credentials. Do not unify these two functions.
2. **Every write is audited.** Booking already calls `logAdminAction` in `book.ts`. Do not remove or bypass it.
3. **The client app does not change behaviourally.** `WeekView` gains one *optional* prop with a default that preserves current rendering exactly. `src/routes/sales/Jobs.tsx` is not modified.
4. **Admin gate on everything.** All new endpoints live under `functions/api/admin/` and return 401 unauthenticated.
5. **No inbox-style PII in the persisted cache.** Contact search results and booked-event contact names must be excluded from the localStorage snapshot via `NEVER_PERSIST_KEYS` in `src/lib/queryClient.ts`.
6. **No em dashes** in any code comment, UI string, or commit message.

---

## Part 1: Spec

### What this is

The Setter Suite has Board and Inbox. It gains **Calendar**, a third top-level tab sharing the same client picker.

The tab shows, for the selected client:

- **Booked appointments** from every active GHL calendar, as indigo blocks.
- **Google Calendar busy hours**, as quiet hatched slate bands, when that client has linked their calendar.

The setter books by either gesture:

- **Click an empty stretch** of the grid. A slide-over opens knowing the day and start time.
- **Press Book** in the toolbar. The same slide-over opens with no time preselected.

In both cases the setter picks a calendar, searches an existing GHL contact by name or phone, and confirms.

### Why

`SlotPicker` already books, but only from inside `SetterCockpit`, reachable only after opening one specific lead. A setter with someone on the phone has no way to answer "what have you got Thursday?" without leaving the lead. This gives them a place to stand.

### Decisions locked

Answered by Jake on 2026-07-21:

| Question | Decision |
|---|---|
| Purpose | Mirror of the client Jobs tab calendar, with booking |
| Grid content | Booked appointments + Google busy. Not pipeline estimates/jobs |
| Booking gesture | **Both**: click an empty slot, and a Book button |
| Contact source | **Search existing** GHL contacts. No contact creation |
| Client scope | Inherited from the Suite's existing client picker |
| Layout | **Option A**: week grid full width, slide-over from the right |

### Three gaps this closes

These are the reason the tab is not a thin UI job. In each case the capability exists one layer down, in the wrong scope.

**Gap 1: no admin path to a client's Google busy hours.** `functions/api/calendar/busy.ts` reads `ctx.data.tenant`, populated only by the client-app middleware. Admin routes short-circuit *before* tenant resolution (`functions/api/_middleware.ts:100-103` returns early once `ctx.data.admin` is set), so `ctx.data.tenant` is permanently undefined there.

**Gap 2: no helper lists booked events for an arbitrary tenant.** `functions/api/calendar/events.ts` does it, but client-scoped. `functions/api/lib/appointments.ts` has `listCalendars`, `getFreeSlots`, `createAppointment`, `rescheduleAppointment`, and no event listing at all.

**Gap 3: `WeekView` has no empty-slot target.** The hour lines (`WeekView.tsx:137-143`) are `absolute inset-x-0 border-t` rules with zero height. There is no cell element to attach a handler to.

### The `mode` problem, and its answer

`getBusy(env, tenantId, opts)` takes a **Composio user id**, not a UUID. That id is `composioUserId({slug, mode})` = `` `${mode}:${slug}` `` (`functions/lib/googleCalendar.ts:38-40`).

`slug` is on the tenant row. **`mode` is not** — `tenants` (migration `0001_init.sql`) has no `mode` column. `mode` is a property of the client-app *session*, assigned in `functions/api/_middleware.ts:117` (`"test"`) and `:164` (`"live"`).

Test-mode sessions never load a tenant row by id; they use `TEST_GHL_LOCATION_ID` env creds plus `testTenantSlug(env)`. Migration `0004` seeds a real `test-account` tenant row that the admin client picker *does* list.

So the correct derivation, and the only one that matches how a client's grant was actually stored:

```ts
const mode = row.slug === testTenantSlug(env) ? "test" : "live";
```

No migration. No schema change.

### Known limitation, deliberately not fixed here

Booking timezone is global: `slots.ts` uses `tenantTimezone(ctx.env)`, an env-level value, not a per-tenant column. The Suite already shipped with this. Fixing it is a separate change and is out of scope. The new endpoints use the same env timezone so nothing becomes *more* inconsistent.

### API contracts

#### GET /api/admin/setter/events?tenantId=&start=&end=

Booked appointments across all the client's active calendars.

```
200 { events: [ { id, title, startTime, endTime, status, contactId, contactName } ], timezone }
400 { error: "missing_tenant_id" | "missing_range" | "invalid_range" }
401 unauthenticated
502 { error: "ghl_error", status, body }
```

`start` and `end` are ISO-8601. The handler converts to epoch ms for GHL, which requires ms not ISO on this route. Range is capped at 62 days; a wider range returns `invalid_range` rather than silently fanning out hundreds of calls.

Unlike `calendar/events.ts`, this does **not** pull 1000 contacts to build a name map (`events.ts:83-115`). It uses the `contactName` GHL already returns on the event, falling back to `""`. The name map is an expensive client-app convenience and must not be copied into an admin route.

#### GET /api/admin/setter/busy?tenantId=&start=&end=

Google Calendar busy intervals for the client.

```
200 { connected: boolean, busy: [ { start, end } ] }
400 { error: "missing_tenant_id" | "missing_range" }
401 unauthenticated
```

Never 502. `getBusy` returns `[]` on any failure by design, and a client with no linked calendar is a normal state, not an error. `connected` distinguishes "linked, nothing busy" from "not linked".

#### GET /api/admin/setter/contacts?tenantId=&q=

Contact search for the booking slide-over.

```
200 { contacts: [ { id, name, phone, email } ] }
400 { error: "missing_tenant_id" | "missing_query" }
401 unauthenticated
502 { error: "ghl_error", status, body }
```

`q` must be at least 2 characters. Capped at 20 results. Hits GHL `GET /contacts/?locationId=&query=`, which searches name, phone and email server-side, so it finds leads with no conversation history. The inbox `q` filter was considered and rejected: it searches *conversations*, so a fresh lead who has never messaged would be invisible at exactly the moment a setter needs to book them.

### Files

| File | Responsibility |
|---|---|
| `functions/lib/tenantGhl.ts` | **Modify.** Also return `slug` and derived `mode` |
| `functions/api/lib/appointments.ts` | **Modify.** Add `listCalendarEvents` |
| `functions/api/admin/setter/events.ts` | **Create.** Admin booked-events route |
| `functions/api/admin/setter/busy.ts` | **Create.** Admin Google-busy route |
| `functions/api/admin/setter/contacts.ts` | **Create.** Admin contact search |
| `src/lib/calendarModel.ts` | **Modify.** Add `appointment` source + mapper |
| `src/index.css` | **Modify.** Add `--source-appointment` vars, both themes |
| `src/components/calendar/WeekView.tsx` | **Modify.** Optional empty-slot layer |
| `src/components/calendar/CalendarViews.tsx` | **Modify.** Thread `onSlotClick` |
| `src/lib/api.ts` | **Modify.** Response types |
| `src/hooks/useApi.ts` | **Modify.** Three query hooks |
| `src/lib/queryClient.ts` | **Modify.** Never-persist the new PII keys |
| `src/components/admin/setter/SetterCalendar.tsx` | **Create.** Tab body: toolbar + views |
| `src/components/admin/setter/BookSlotPanel.tsx` | **Create.** Slide-over |
| `src/routes/admin/SetterSuite.tsx` | **Modify.** Third tab |

---

## Part 2: Implementation plan

### Task 1: `getGhlContextForTenant` returns slug and mode

**Files:**
- Modify: `command-center/app/functions/lib/tenantGhl.ts:33-52`
- Test: `command-center/app/functions/lib/tenantGhl.test.ts`

**Interfaces:**
- Produces: `GhlContext` widened to `{ token: string; locationId: string; slug: string; mode: "live" | "test" }`. Tasks 3 and 4 consume `slug` and `mode`.

- [ ] **Step 1: Write the failing test**

Append to `functions/lib/tenantGhl.test.ts`:

```ts
it("derives mode test for the seeded test-account tenant", async () => {
  const env = fakeEnv({
    tenants: {
      "t-test": { ghl_location_id: "loc1", ghl_token: "tok1", slug: "test-account" },
    },
  });
  const ctx = await getGhlContextForTenant(env, "t-test");
  expect(ctx.slug).toBe("test-account");
  expect(ctx.mode).toBe("test");
});

it("derives mode live for any other tenant", async () => {
  const env = fakeEnv({
    tenants: {
      "t-willis": { ghl_location_id: "loc2", ghl_token: "tok2", slug: "willis-windows" },
    },
  });
  const ctx = await getGhlContextForTenant(env, "t-willis");
  expect(ctx.slug).toBe("willis-windows");
  expect(ctx.mode).toBe("live");
});
```

If `fakeEnv` does not exist in that test file, read the file's existing Supabase mocking approach and match it exactly. Do not invent a new mocking style.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run functions/lib/tenantGhl.test.ts
```

Expected: FAIL, `ctx.slug` is `undefined`.

- [ ] **Step 3: Implement**

In `functions/lib/tenantGhl.ts`, import `testTenantSlug`:

```ts
import { testTenantSlug } from "./env";
```

Widen the interface:

```ts
// mode is NOT a tenants column. It is a property of the client-app session
// (functions/api/_middleware.ts:117 and :164). A Composio Google Calendar
// grant is stored under `${mode}:${slug}`, so to read a client's busy hours
// from an admin route we have to reconstruct the mode the client's own
// session would have had. Test-mode sessions use env creds and
// testTenantSlug(env); every other tenant row is served by a live session.
export interface GhlContext {
  token: string;
  locationId: string;
  slug: string;
  mode: "live" | "test";
}
```

Change the select at L42 to include `slug`:

```ts
.select("ghl_location_id, ghl_token, slug")
```

Change the return at L51:

```ts
return {
  token: data.ghl_token,
  locationId: data.ghl_location_id,
  slug: data.slug,
  mode: data.slug === testTenantSlug(env) ? "test" : "live",
};
```

- [ ] **Step 4: Run the full function test suite**

```bash
cd command-center/app && npx vitest run functions/
```

Expected: PASS. `GhlContext` is structurally widened, so existing consumers that destructure `{ token, locationId }` are unaffected.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/lib/tenantGhl.ts command-center/app/functions/lib/tenantGhl.test.ts
git commit -m "feat(setter): tenant GHL context carries slug and derived mode"
```

---

### Task 2: `listCalendarEvents` helper

**Files:**
- Modify: `command-center/app/functions/api/lib/appointments.ts`
- Test: `command-center/app/functions/api/lib/appointments.test.ts`

**Interfaces:**
- Consumes: `GhlContext` from Task 1, `listCalendars` (already exported, `appointments.ts:56`).
- Produces:
```ts
export interface CalendarEvent {
  id: string; title: string;
  startTime: string | null; endTime: string | null;
  status: string; contactId: string; contactName: string;
}
export async function listCalendarEvents(
  gctx: GhlContext, startMs: number, endMs: number,
): Promise<CalendarEvent[]>
```

- [ ] **Step 1: Write the failing test**

Append to `functions/api/lib/appointments.test.ts`:

```ts
it("lists events across every active calendar and dedupes by id", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/calendars/?")) {
      return jsonResponse({ calendars: [{ id: "c1", isActive: true }, { id: "c2", isActive: true }] });
    }
    if (url.includes("calendarId=c1")) {
      return jsonResponse({ events: [
        { id: "e1", title: "Estimate", startTime: "2026-07-24T13:00:00Z", endTime: "2026-07-24T14:00:00Z", contactId: "k1", contactName: "Tom Beckett" },
      ] });
    }
    return jsonResponse({ events: [
      { id: "e1", title: "Estimate", startTime: "2026-07-24T13:00:00Z", endTime: "2026-07-24T14:00:00Z", contactId: "k1", contactName: "Tom Beckett" },
      { id: "e2", title: "Phone", startTime: "2026-07-24T09:00:00Z", endTime: "2026-07-24T09:30:00Z", contactId: "k2", contactName: "Ruth Okafor" },
    ] });
  });
  vi.stubGlobal("fetch", fetchMock);

  const events = await listCalendarEvents(
    { token: "t", locationId: "L", slug: "willis-windows", mode: "live" },
    Date.parse("2026-07-20T00:00:00Z"),
    Date.parse("2026-07-27T00:00:00Z"),
  );

  expect(events.map((e) => e.id)).toEqual(["e2", "e1"]);
  expect(events[1].contactName).toBe("Tom Beckett");
});

it("returns an empty array when the client has no active calendars", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ calendars: [] })));
  const events = await listCalendarEvents(
    { token: "t", locationId: "L", slug: "s", mode: "live" }, 0, 1,
  );
  expect(events).toEqual([]);
});
```

Match the file's existing `jsonResponse` helper; if it is named differently, use the existing name.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run functions/api/lib/appointments.test.ts
```

Expected: FAIL, `listCalendarEvents is not a function`.

- [ ] **Step 3: Implement**

Append to `functions/api/lib/appointments.ts`:

```ts
// Booked events, as opposed to free slots. Lifted from the client-app route
// functions/api/calendar/events.ts so admin routes can list a client's
// appointments without a client-app session. Two things differ from that
// route on purpose: the events endpoint tolerates the default 2021-07-28
// version so this uses ghlJson rather than the private calFetch, and there
// is deliberately no contact-name map. events.ts pulls up to 1000 contacts
// per request to fill names in; that cost is not acceptable on a route a
// setter hits every time they change week.
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
}

interface RawEvent {
  id?: string;
  _id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
  status?: string;
  contactId?: string;
  contactName?: string;
}

export async function listCalendarEvents(
  gctx: GhlContext,
  startMs: number,
  endMs: number,
): Promise<CalendarEvent[]> {
  const calendars = await listCalendars(gctx);
  if (calendars.length === 0) return [];

  const byId = new Map<string, CalendarEvent>();
  for (const cal of calendars) {
    const data = await ghlJson<{ events?: RawEvent[] }>(
      gctx,
      `/calendars/events?locationId=${encodeURIComponent(gctx.locationId)}` +
        `&calendarId=${encodeURIComponent(cal.id)}` +
        `&startTime=${startMs}&endTime=${endMs}`,
    );
    for (const ev of data.events ?? []) {
      const id = ev.id ?? ev._id ?? "";
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        title: ev.title ?? "Appointment",
        startTime: ev.startTime ?? null,
        endTime: ev.endTime ?? null,
        status: (ev.appointmentStatus ?? ev.status ?? "booked").toLowerCase(),
        contactId: ev.contactId ?? "",
        contactName: ev.contactName ?? "",
      });
    }
  }

  return [...byId.values()].sort((a, b) =>
    (a.startTime ?? "").localeCompare(b.startTime ?? ""),
  );
}
```

Confirm `ghlJson` is already imported in this file. If it is not, add it from `../../lib/ghl`.

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run functions/api/lib/appointments.test.ts
```

Expected: PASS, both new tests plus all existing ones.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/lib/appointments.ts command-center/app/functions/api/lib/appointments.test.ts
git commit -m "feat(setter): listCalendarEvents helper for booked appointments"
```

---

### Task 3: `GET /api/admin/setter/events`

**Files:**
- Create: `command-center/app/functions/api/admin/setter/events.ts`
- Test: `command-center/app/functions/api/admin/setter/events.test.ts`

**Interfaces:**
- Consumes: `getGhlContextForTenant` (Task 1), `listCalendarEvents` (Task 2).
- Produces: `export function parseEventsQuery(params: URLSearchParams): ParsedEventsQuery`, mirroring the shape `slots.ts:47` already uses.

Read `functions/api/admin/setter/slots.ts` in full before writing this. Copy its handler skeleton, its `TenantGhlError` catch, and its export style exactly. This task should look like it was written by the same hand.

- [ ] **Step 1: Write the failing test**

Create `functions/api/admin/setter/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseEventsQuery } from "./events";

describe("parseEventsQuery", () => {
  const q = (s: string) => parseEventsQuery(new URLSearchParams(s));

  it("rejects a missing tenant id", () => {
    expect(q("start=2026-07-20T00:00:00Z&end=2026-07-27T00:00:00Z"))
      .toEqual({ ok: false, code: "missing_tenant_id" });
  });

  it("rejects a missing range", () => {
    expect(q("tenantId=t1")).toEqual({ ok: false, code: "missing_range" });
  });

  it("rejects an unparseable date", () => {
    expect(q("tenantId=t1&start=nonsense&end=2026-07-27T00:00:00Z"))
      .toEqual({ ok: false, code: "invalid_range" });
  });

  it("rejects an inverted range", () => {
    expect(q("tenantId=t1&start=2026-07-27T00:00:00Z&end=2026-07-20T00:00:00Z"))
      .toEqual({ ok: false, code: "invalid_range" });
  });

  it("rejects a range wider than 62 days", () => {
    expect(q("tenantId=t1&start=2026-01-01T00:00:00Z&end=2026-06-01T00:00:00Z"))
      .toEqual({ ok: false, code: "invalid_range" });
  });

  it("accepts a valid week and returns epoch ms", () => {
    const r = q("tenantId=t1&start=2026-07-20T00:00:00Z&end=2026-07-27T00:00:00Z");
    expect(r).toEqual({
      ok: true,
      query: {
        tenantId: "t1",
        startMs: Date.parse("2026-07-20T00:00:00Z"),
        endMs: Date.parse("2026-07-27T00:00:00Z"),
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run functions/api/admin/setter/events.test.ts
```

Expected: FAIL, cannot resolve `./events`.

- [ ] **Step 3: Implement**

Create `functions/api/admin/setter/events.ts`:

```ts
// Booked appointments for one client, for the Setter Suite Calendar tab.
//
// The client app has functions/api/calendar/events.ts, but it reads
// ctx.data.tenant, which the admin middleware never populates: admin requests
// return early at functions/api/_middleware.ts:100 before tenant resolution.
// So this route resolves creds per tenant instead, through
// getGhlContextForTenant, which hard-fails on placeholder credentials rather
// than falling back to the env GHL vars (those are Willis production).
import type { Env, ApiData } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { listCalendarEvents } from "../../lib/appointments";

// A setter changing week must not be able to fan out hundreds of GHL calls
// per active calendar, so the window is bounded.
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

export interface EventsQuery {
  tenantId: string;
  startMs: number;
  endMs: number;
}

export type ParsedEventsQuery =
  | { ok: true; query: EventsQuery }
  | { ok: false; code: string };

export function parseEventsQuery(params: URLSearchParams): ParsedEventsQuery {
  const tenantId = (params.get("tenantId") ?? "").trim();
  if (!tenantId) return { ok: false, code: "missing_tenant_id" };

  const start = (params.get("start") ?? "").trim();
  const end = (params.get("end") ?? "").trim();
  if (!start || !end) return { ok: false, code: "missing_range" };

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, code: "invalid_range" };
  }
  if (endMs <= startMs) return { ok: false, code: "invalid_range" };
  if (endMs - startMs > MAX_RANGE_MS) return { ok: false, code: "invalid_range" };

  return { ok: true, query: { tenantId, startMs, endMs } };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const parsed = parseEventsQuery(new URL(ctx.request.url).searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });

  const { tenantId, startMs, endMs } = parsed.query;

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const events = await listCalendarEvents(gctx, startMs, endMs);
    return Response.json({ events });
  } catch (e) {
    if (e instanceof TenantGhlError) {
      return Response.json({ error: e.code }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "ghl_error", body: msg }, { status: 502 });
  }
};
```

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run functions/api/admin/setter/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/admin/setter/events.ts command-center/app/functions/api/admin/setter/events.test.ts
git commit -m "feat(setter): admin endpoint for a client's booked appointments"
```

---

### Task 4: `GET /api/admin/setter/busy`

**Files:**
- Create: `command-center/app/functions/api/admin/setter/busy.ts`
- Test: `command-center/app/functions/api/admin/setter/busy.test.ts`

**Interfaces:**
- Consumes: `getGhlContextForTenant` (Task 1, needs `slug` and `mode`), `composioUserId` / `getConnection` / `getBusy` from `functions/lib/googleCalendar.ts`.
- Produces: `export function parseBusyQuery(params: URLSearchParams): ParsedBusyQuery`.

- [ ] **Step 1: Write the failing test**

Create `functions/api/admin/setter/busy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseBusyQuery } from "./busy";

describe("parseBusyQuery", () => {
  const q = (s: string) => parseBusyQuery(new URLSearchParams(s));

  it("rejects a missing tenant id", () => {
    expect(q("start=2026-07-20T00:00:00Z&end=2026-07-27T00:00:00Z"))
      .toEqual({ ok: false, code: "missing_tenant_id" });
  });

  it("rejects a missing range", () => {
    expect(q("tenantId=t1&start=2026-07-20T00:00:00Z"))
      .toEqual({ ok: false, code: "missing_range" });
  });

  it("passes ISO strings straight through, since getBusy wants ISO not ms", () => {
    expect(q("tenantId=t1&start=2026-07-20T00:00:00Z&end=2026-07-27T00:00:00Z"))
      .toEqual({
        ok: true,
        query: {
          tenantId: "t1",
          timeMin: "2026-07-20T00:00:00Z",
          timeMax: "2026-07-27T00:00:00Z",
        },
      });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run functions/api/admin/setter/busy.test.ts
```

Expected: FAIL, cannot resolve `./busy`.

- [ ] **Step 3: Implement**

Create `functions/api/admin/setter/busy.ts`:

```ts
// A client's Google Calendar busy hours, for the Setter Suite Calendar tab.
//
// The client app has functions/api/calendar/busy.ts, but it resolves the
// Composio user id from ctx.data.tenant, which admin requests never have.
//
// getBusy's second argument is NOT a tenant UUID. It is a Composio user id,
// `${mode}:${slug}` (functions/lib/googleCalendar.ts:38). mode is not a
// tenants column: it belongs to the client-app session. Task 1 reconstructs
// it on the GHL context, which is why this route reads gctx.slug and
// gctx.mode rather than looking anything up itself.
//
// This route never returns 502. getBusy swallows failures and returns [] by
// design, and a client who has not linked their calendar is a normal state,
// not an error. `connected` is what tells those two apart in the UI.
import type { Env, ApiData } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { composioUserId, getConnection, getBusy } from "../../../lib/googleCalendar";
import { tenantTimezone } from "../../../lib/env";

export interface BusyQuery {
  tenantId: string;
  timeMin: string;
  timeMax: string;
}

export type ParsedBusyQuery =
  | { ok: true; query: BusyQuery }
  | { ok: false; code: string };

export function parseBusyQuery(params: URLSearchParams): ParsedBusyQuery {
  const tenantId = (params.get("tenantId") ?? "").trim();
  if (!tenantId) return { ok: false, code: "missing_tenant_id" };

  const timeMin = (params.get("start") ?? "").trim();
  const timeMax = (params.get("end") ?? "").trim();
  if (!timeMin || !timeMax) return { ok: false, code: "missing_range" };

  return { ok: true, query: { tenantId, timeMin, timeMax } };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const parsed = parseBusyQuery(new URL(ctx.request.url).searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });

  const { tenantId, timeMin, timeMax } = parsed.query;

  let userId: string;
  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    userId = composioUserId({ slug: gctx.slug, mode: gctx.mode });
  } catch (e) {
    if (e instanceof TenantGhlError) {
      return Response.json({ error: e.code }, { status: e.status });
    }
    throw e;
  }

  const connection = await getConnection(ctx.env, userId);
  if (connection.status !== "ACTIVE") {
    return Response.json({ connected: false, busy: [] });
  }

  const busy = await getBusy(ctx.env, userId, {
    timeMin,
    timeMax,
    timezone: tenantTimezone(ctx.env),
  });

  return new Response(JSON.stringify({ connected: true, busy }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, max-age=60",
    },
  });
};
```

Before writing, open `functions/api/calendar/busy.ts` and confirm the `getConnection` status check matches how that route decides "connected". Mirror it exactly rather than inventing a different rule.

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run functions/api/admin/setter/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/admin/setter/busy.ts command-center/app/functions/api/admin/setter/busy.test.ts
git commit -m "feat(setter): admin endpoint for a client's Google busy hours"
```

---

### Task 5: `GET /api/admin/setter/contacts`

**Files:**
- Create: `command-center/app/functions/api/admin/setter/contacts.ts`
- Test: `command-center/app/functions/api/admin/setter/contacts.test.ts`

**Interfaces:**
- Produces: `export function parseContactsQuery(params: URLSearchParams): ParsedContactsQuery` and the response type `{ contacts: { id, name, phone, email }[] }`.

- [ ] **Step 1: Write the failing test**

Create `functions/api/admin/setter/contacts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseContactsQuery, shapeContact } from "./contacts";

describe("parseContactsQuery", () => {
  const q = (s: string) => parseContactsQuery(new URLSearchParams(s));

  it("rejects a missing tenant id", () => {
    expect(q("q=beck")).toEqual({ ok: false, code: "missing_tenant_id" });
  });

  it("rejects a query under two characters", () => {
    expect(q("tenantId=t1&q=b")).toEqual({ ok: false, code: "missing_query" });
  });

  it("trims and accepts a real query", () => {
    expect(q("tenantId=t1&q=%20beck%20"))
      .toEqual({ ok: true, query: { tenantId: "t1", q: "beck" } });
  });
});

describe("shapeContact", () => {
  it("builds a display name from first and last", () => {
    expect(shapeContact({ id: "k1", firstName: "Tom", lastName: "Beckett", phone: "+13135550142" }))
      .toEqual({ id: "k1", name: "Tom Beckett", phone: "+13135550142", email: "" });
  });

  it("prefers contactName when GHL supplies it", () => {
    expect(shapeContact({ id: "k2", contactName: "Ruth Okafor", email: "r@example.com" }))
      .toEqual({ id: "k2", name: "Ruth Okafor", phone: "", email: "r@example.com" });
  });

  it("falls back to the phone number when there is no name at all", () => {
    expect(shapeContact({ id: "k3", phone: "+15865550198" }))
      .toEqual({ id: "k3", name: "+15865550198", phone: "+15865550198", email: "" });
  });

  it("falls back to Unknown contact when there is nothing to show", () => {
    expect(shapeContact({ id: "k4" }))
      .toEqual({ id: "k4", name: "Unknown contact", phone: "", email: "" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run functions/api/admin/setter/contacts.test.ts
```

Expected: FAIL, cannot resolve `./contacts`.

- [ ] **Step 3: Implement**

Create `functions/api/admin/setter/contacts.ts`:

```ts
// Contact search for the Setter Suite booking slide-over.
//
// The inbox route's `q` filter was considered for this and rejected: it
// searches CONVERSATIONS, so a fresh lead who has never sent a message is
// invisible to it. That is exactly the contact a setter is most likely to be
// booking. GHL's /contacts/?query= searches name, phone and email
// server-side, so it finds them.
import type { Env, ApiData } from "../../../lib/env";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { ghlJson } from "../../../lib/ghl";

const MIN_QUERY = 2;
const MAX_RESULTS = 20;

export interface ContactsQuery {
  tenantId: string;
  q: string;
}

export type ParsedContactsQuery =
  | { ok: true; query: ContactsQuery }
  | { ok: false; code: string };

export function parseContactsQuery(params: URLSearchParams): ParsedContactsQuery {
  const tenantId = (params.get("tenantId") ?? "").trim();
  if (!tenantId) return { ok: false, code: "missing_tenant_id" };

  const q = (params.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) return { ok: false, code: "missing_query" };

  return { ok: true, query: { tenantId, q } };
}

export interface RawContact {
  id?: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

export interface ShapedContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export function shapeContact(raw: RawContact): ShapedContact {
  const phone = raw.phone ?? "";
  const joined = [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
  // A setter searching by phone needs to recognise the row they get back, so
  // an unnamed contact shows its number rather than a bare placeholder.
  const name = (raw.contactName ?? "").trim() || joined || phone || "Unknown contact";
  return { id: raw.id ?? "", name, phone, email: raw.email ?? "" };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const parsed = parseContactsQuery(new URL(ctx.request.url).searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });

  const { tenantId, q } = parsed.query;

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const data = await ghlJson<{ contacts?: RawContact[] }>(
      gctx,
      `/contacts/?locationId=${encodeURIComponent(gctx.locationId)}` +
        `&query=${encodeURIComponent(q)}&limit=${MAX_RESULTS}`,
    );
    const contacts = (data.contacts ?? [])
      .map(shapeContact)
      .filter((c) => c.id)
      .slice(0, MAX_RESULTS);
    return Response.json({ contacts });
  } catch (e) {
    if (e instanceof TenantGhlError) {
      return Response.json({ error: e.code }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "ghl_error", body: msg }, { status: 502 });
  }
};
```

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run functions/api/admin/setter/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/admin/setter/contacts.ts command-center/app/functions/api/admin/setter/contacts.test.ts
git commit -m "feat(setter): admin contact search for the booking panel"
```

---

### Task 6: `appointment` calendar source

**Files:**
- Modify: `command-center/app/src/lib/calendarModel.ts:7`, `:30-52`, `:55-59`
- Modify: `command-center/app/src/index.css` (both theme blocks)
- Test: `command-center/app/src/lib/calendarModel.test.ts`

**Interfaces:**
- Consumes: `CalendarItem` (existing, `calendarModel.ts:9-26`).
- Produces: `CalendarSource` gains `"appointment"`; `export function appointmentToItem(e: ApiSetterEvent): CalendarItem`.

The file's own comment states the extension contract: a new stream is a new mapper plus a source entry, never a change to the views. Honour that. Do not touch `MonthView`, `AgendaView`, or `Block`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/calendarModel.test.ts`:

```ts
describe("appointmentToItem", () => {
  it("maps a booked GHL appointment onto a timed calendar item", () => {
    const item = appointmentToItem({
      id: "e1",
      title: "Estimate",
      startTime: "2026-07-24T13:00:00.000Z",
      endTime: "2026-07-24T14:00:00.000Z",
      status: "confirmed",
      contactId: "k1",
      contactName: "Tom Beckett",
    });
    expect(item.id).toBe("appointment:e1");
    expect(item.source).toBe("appointment");
    // The contact is the useful headline for a setter, not the calendar name.
    expect(item.title).toBe("Tom Beckett");
    expect(item.subtitle).toBe("Estimate");
    expect(item.contactId).toBe("k1");
    expect(item.status).toBe("confirmed");
    expect(item.endMinutes! - item.startMinutes!).toBe(60);
  });

  it("falls back to the event title when the contact has no name", () => {
    const item = appointmentToItem({
      id: "e2", title: "Phone consultation",
      startTime: "2026-07-24T09:00:00.000Z", endTime: "2026-07-24T09:30:00.000Z",
      status: "booked", contactId: "", contactName: "",
    });
    expect(item.title).toBe("Phone consultation");
    expect(item.subtitle).toBe("");
  });

  it("survives an appointment with no times rather than throwing", () => {
    const item = appointmentToItem({
      id: "e3", title: "Broken", startTime: null, endTime: null,
      status: "booked", contactId: "", contactName: "",
    });
    expect(item.startMinutes).toBeNull();
    expect(item.endMinutes).toBeNull();
  });
});

it("orders appointment ahead of busy so blocks sit above bands", () => {
  expect(CALENDAR_SOURCE_ORDER.indexOf("appointment"))
    .toBeLessThan(CALENDAR_SOURCE_ORDER.indexOf("busy"));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run src/lib/calendarModel.test.ts
```

Expected: FAIL, `appointmentToItem is not defined`.

- [ ] **Step 3: Implement**

In `src/lib/calendarModel.ts`, widen the union at L7:

```ts
export type CalendarSource = "estimate" | "job" | "busy" | "appointment";
```

Add to `CALENDAR_SOURCE_META`:

```ts
  appointment: {
    label: "Appointment",
    plural: "Appointments",
    varName: "--source-appointment",
    tintVar: "--source-appointment-tint",
  },
```

Add to `CALENDAR_SOURCE_ORDER`, before `busy`:

```ts
export const CALENDAR_SOURCE_ORDER: CalendarSource[] = [
  "estimate",
  "job",
  "appointment",
  "busy",
];
```

Append the mapper. Read `jobToItem` first and match its date/minutes derivation exactly rather than writing new local-time maths:

```ts
// A booked GHL appointment. Written for the Setter Suite Calendar tab, where
// the person matters more than the calendar the booking landed on, so the
// contact name is the headline and the event title drops to the subtitle.
export interface ApiSetterEventLike {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
}

export function appointmentToItem(e: ApiSetterEventLike): CalendarItem {
  const start = e.startTime ? new Date(e.startTime) : null;
  const end = e.endTime ? new Date(e.endTime) : null;
  const valid = start && !Number.isNaN(start.getTime());

  const startMinutes = valid ? start!.getHours() * 60 + start!.getMinutes() : null;
  const endMinutes =
    end && !Number.isNaN(end.getTime()) ? end.getHours() * 60 + end.getMinutes() : null;

  const named = e.contactName.trim();

  return {
    id: `appointment:${e.id}`,
    source: "appointment",
    title: named || e.title,
    subtitle: named ? e.title : "",
    date: valid ? toLocalIsoDate(start!) : "",
    startMinutes,
    endMinutes,
    timeLabel: startMinutes === null ? "" : minutesToLabel(startMinutes),
    status: e.status,
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: e.contactId,
  };
}
```

`toLocalIsoDate` is whatever helper `jobToItem` already uses to produce a local `YYYY-MM-DD`. Use that exact function. If it is inlined rather than named, inline the same expression here rather than adding a new helper.

In `src/index.css`, add to the light block (near `--source-busy` at L228) and to the dark block (near L277):

```css
  /* Booked appointments on the Setter Suite calendar. Brand indigo: unlike
     busy, which is time taken, an appointment is the thing the setter is
     working towards, so it earns the accent. */
  --source-appointment: var(--brand);
  --source-appointment-tint: color-mix(in srgb, var(--brand) 18%, transparent);
```

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run src/lib/calendarModel.test.ts
```

Expected: PASS. Then typecheck, because widening `CalendarSource` breaks any exhaustive `Record<CalendarSource, T>`:

```bash
cd command-center/app && npx tsc --noEmit
```

Expected: PASS. If it reports a missing `appointment` key on a `Record<CalendarSource, boolean>` (the `connected` prop on `CalendarViews`), that is a real call site to fix, not an error to suppress.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/calendarModel.ts command-center/app/src/lib/calendarModel.test.ts command-center/app/src/index.css
git commit -m "feat(setter): appointment calendar source and mapper"
```

---

### Task 7: `WeekView` empty-slot layer

**Files:**
- Modify: `command-center/app/src/components/calendar/WeekView.tsx:14-22`, `:41-49`, `:124-200`
- Modify: `command-center/app/src/components/calendar/CalendarViews.tsx:24-37`, `:169`
- Test: `command-center/app/src/components/calendar/WeekView.test.tsx`

**Interfaces:**
- Produces: `WeekView` and `CalendarViews` both accept `onSlotClick?: (iso: string, startMinutes: number) => void`. Task 9 consumes it.

**This must be purely additive.** With `onSlotClick` undefined, the rendered output must be identical to today, because `src/routes/sales/Jobs.tsx` renders this for clients and is not being changed.

- [ ] **Step 1: Write the failing test**

Create `src/components/calendar/WeekView.test.tsx`. Match the render/query helpers the repo's other component tests use:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeekView } from "./WeekView";

const props = { items: [], anchorIso: "2026-07-22", todayIso: "2026-07-21" };

describe("WeekView slot layer", () => {
  it("renders no slot buttons when onSlotClick is absent", () => {
    render(<WeekView {...props} />);
    expect(screen.queryAllByRole("button", { name: /book/i })).toHaveLength(0);
  });

  it("renders a slot button per interval per day when onSlotClick is given", () => {
    render(<WeekView {...props} onSlotClick={vi.fn()} />);
    // 07:00 to 19:00 is 12 hours, two 30-minute slots per hour, seven days.
    expect(screen.getAllByRole("button", { name: /book/i })).toHaveLength(12 * 2 * 7);
  });

  it("reports the day and start minute of the clicked slot", async () => {
    const onSlotClick = vi.fn();
    render(<WeekView {...props} onSlotClick={onSlotClick} />);
    // Week of Sun 2026-07-19. First button of the third day column is Tue
    // 2026-07-21 at 07:00; the fourth slot into that day is 08:30.
    const buttons = screen.getAllByRole("button", { name: /book/i });
    await userEvent.click(buttons[2 * 24 + 3]);
    expect(onSlotClick).toHaveBeenCalledWith("2026-07-21", 8 * 60 + 30);
  });
});
```

If the week does not start on Sunday, or `layoutWeek` orders columns differently, read `layoutWeek` in `calendarModel.ts:227` and correct the index and expected values in the third test before implementing. Do not change the implementation to fit a wrong test.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run src/components/calendar/WeekView.test.tsx
```

Expected: FAIL, the second test finds zero buttons.

- [ ] **Step 3: Implement**

In `WeekView.tsx`, add beside the existing constants at L14-22:

```ts
// Bookable granularity for the empty-slot layer. Thirty minutes matches the
// shortest appointment GHL calendars are configured for.
const SLOT_MIN = 30;
```

Widen the props at L41-49:

```ts
export function WeekView({
  items,
  anchorIso,
  todayIso,
  onSlotClick,
}: {
  items: CalendarItem[];
  anchorIso: string;
  todayIso: string;
  // Setter Suite only. When absent, no slot layer renders at all and this
  // component behaves exactly as it does on the client Jobs tab, which is
  // read-only and must stay that way.
  onSlotClick?: (iso: string, startMinutes: number) => void;
}) {
```

Inside the day-column wrapper at L125-135, immediately **after** the hour lines and **before** the busy bands, insert:

```tsx
{onSlotClick ? (
  <div className="absolute inset-0">
    {Array.from(
      { length: (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN },
      (_, i) => DAY_START_MIN + i * SLOT_MIN,
    ).map((min) => (
      <button
        key={min}
        type="button"
        onClick={() => onSlotClick(col.iso, min)}
        aria-label={`Book ${WD[new Date(`${col.iso}T00:00:00`).getDay()]} ${minutesToLabel(min)}`}
        className="group absolute inset-x-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        style={{ top: (min - DAY_START_MIN) * PPM, height: SLOT_MIN * PPM }}
      >
        <span className="pointer-events-none rounded border border-dashed border-[var(--brand)] bg-surface px-2 text-[10px] font-semibold text-[var(--brand)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          + Book
        </span>
      </button>
    ))}
  </div>
) : null}
```

Import `minutesToLabel` from `../../lib/calendarModel` if it is not already imported.

Ordering matters and is why this goes where it does: the slot layer must sit **below** the busy bands and item blocks in DOM order so a real appointment is never covered by an invisible button. The busy bands are already `pointer-events-none` (`WeekView.tsx:156`), so they do not swallow clicks on a free stretch behind them. Item blocks are not, so they correctly win over the slot underneath.

In `CalendarViews.tsx`, add `onSlotClick` to the prop type at L24-37 and pass it through at L169:

```tsx
<WeekView items={visible} anchorIso={anchor} todayIso={todayIso} onSlotClick={onSlotClick} />
```

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run src/components/calendar/ && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Verify the client app is visually unchanged**

```bash
cd command-center/app && npx vitest run src/
```

Expected: PASS, including any existing `Jobs` route tests. `onSlotClick` is optional and `Jobs.tsx` does not pass it, so the client grid renders no buttons.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/src/components/calendar/WeekView.tsx command-center/app/src/components/calendar/WeekView.test.tsx command-center/app/src/components/calendar/CalendarViews.tsx
git commit -m "feat(setter): optional empty-slot layer on WeekView"
```

---

### Task 8: Frontend types and query hooks

**Files:**
- Modify: `command-center/app/src/lib/api.ts` (types, near `ApiSetterCalendar` at L947)
- Modify: `command-center/app/src/hooks/useApi.ts` (near the setter hooks at L610-673)
- Modify: `command-center/app/src/lib/queryClient.ts` (`NEVER_PERSIST_KEYS`)

**Interfaces:**
- Consumes: endpoints from Tasks 3, 4, 5. The `api<T>` helper at `src/lib/api.ts:18`.
- Produces:
```ts
useSetterEventsQuery(tenantId: string, startIso: string, endIso: string, enabled: boolean)
useSetterBusyQuery(tenantId: string, startIso: string, endIso: string, enabled: boolean)
useSetterContactSearchQuery(tenantId: string, q: string, enabled: boolean)
```

- [ ] **Step 1: Add the response types**

In `src/lib/api.ts`, beside `ApiSetterCalendar`:

```ts
export interface ApiSetterEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
}

export interface ApiSetterBusy {
  connected: boolean;
  busy: { start: string; end: string }[];
}

export interface ApiSetterContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}
```

- [ ] **Step 2: Add the hooks**

In `src/hooks/useApi.ts`, following the exact shape of `useSetterSlotsQuery` at L628:

```ts
export function useSetterEventsQuery(
  tenantId: string,
  startIso: string,
  endIso: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["admin", "setter", "events", tenantId, startIso, endIso],
    queryFn: () =>
      api<{ events: ApiSetterEvent[] }>(
        `/api/admin/setter/events?tenantId=${encodeURIComponent(tenantId)}` +
          `&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
      ),
    enabled: enabled && !!tenantId && !!startIso && !!endIso,
    staleTime: 30_000,
  });
}

export function useSetterBusyQuery(
  tenantId: string,
  startIso: string,
  endIso: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["admin", "setter", "busy", tenantId, startIso, endIso],
    queryFn: () =>
      api<ApiSetterBusy>(
        `/api/admin/setter/busy?tenantId=${encodeURIComponent(tenantId)}` +
          `&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
      ),
    enabled: enabled && !!tenantId && !!startIso && !!endIso,
    staleTime: 60_000,
    // A client with no linked calendar is a normal state, and the endpoint
    // never 502s, so a failure here is a real one and not worth retrying
    // behind the setter's back.
    retry: false,
  });
}

export function useSetterContactSearchQuery(
  tenantId: string,
  q: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["admin", "setter", "contacts", tenantId, q],
    queryFn: () =>
      api<{ contacts: ApiSetterContact[] }>(
        `/api/admin/setter/contacts?tenantId=${encodeURIComponent(tenantId)}` +
          `&q=${encodeURIComponent(q)}`,
      ),
    enabled: enabled && !!tenantId && q.trim().length >= 2,
    staleTime: 30_000,
    retry: false,
  });
}
```

Import the three new types from `../lib/api`.

- [ ] **Step 3: Exclude the new PII keys from the persisted cache**

The Suite already had a deferred finding about customer PII in localStorage. Booked-event contact names and contact-search results are the same class of data.

In `src/lib/queryClient.ts`, add to `NEVER_PERSIST_KEYS`:

```ts
  // Customer names, phones and emails. These must not sit on disk on
  // whatever machine a setter happens to be using.
  "admin,setter,contacts",
  "admin,setter,events",
```

Read the existing entries first and match their exact format. If the list holds arrays or prefixes rather than comma-joined strings, use that format instead.

- [ ] **Step 4: Verify**

```bash
cd command-center/app && npx tsc --noEmit && npx vitest run src/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/api.ts command-center/app/src/hooks/useApi.ts command-center/app/src/lib/queryClient.ts
git commit -m "feat(setter): query hooks for calendar events, busy and contact search"
```

---

### Task 9: `BookSlotPanel` slide-over

**Files:**
- Create: `command-center/app/src/components/admin/setter/BookSlotPanel.tsx`
- Test: `command-center/app/src/components/admin/setter/BookSlotPanel.test.tsx`

**Interfaces:**
- Consumes: `useSetterCalendarsQuery` (existing, `useApi.ts:610`), `useSetterContactSearchQuery` and `useSetterBookMutation` (existing, `useApi.ts:662`), `SetterBookInput` (existing, `useApi.ts:646`).
- Produces:
```ts
export function BookSlotPanel(props: {
  tenantId: string;
  slot: { iso: string; startMinutes: number } | null;
  onClose: () => void;
  onBooked: () => void;
}): JSX.Element | null
```

Renders `null` when `slot` is `null`. A `slot` with `startMinutes` of `-1` means the setter pressed the toolbar Book button rather than clicking the grid, so no time is preselected and the panel shows the existing slot list from `useSetterSlotsQuery` instead.

Read `SlotPicker.tsx` before writing this and reuse its calendar dropdown and slot-list rendering rather than authoring new ones.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/setter/BookSlotPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookSlotPanel } from "./BookSlotPanel";

const base = { tenantId: "t1", onClose: vi.fn(), onBooked: vi.fn() };

describe("BookSlotPanel", () => {
  it("renders nothing without a slot", () => {
    const { container } = render(<BookSlotPanel {...base} slot={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the clicked day and time as the heading context", () => {
    render(<BookSlotPanel {...base} slot={{ iso: "2026-07-24", startMinutes: 13 * 60 }} />);
    expect(screen.getByText(/24 July/)).toBeInTheDocument();
    expect(screen.getByText(/13:00/)).toBeInTheDocument();
  });

  it("disables Confirm until a contact is chosen", () => {
    render(<BookSlotPanel {...base} slot={{ iso: "2026-07-24", startMinutes: 13 * 60 }} />);
    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeDisabled();
  });
});
```

Wrap renders in whatever `QueryClientProvider` test helper the repo's other component tests use. Find it before writing; do not create a second one.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run src/components/admin/setter/BookSlotPanel.test.tsx
```

Expected: FAIL, cannot resolve `./BookSlotPanel`.

- [ ] **Step 3: Implement**

Build the panel with these rules, matching the mockup:

- Fixed-position right panel, `w-[302px]`, `border-l`, own scroll, `role="dialog"` and `aria-label="Book this slot"`.
- Heading "Book this slot", close button, then the slot as `Fri 24 July · 13:00 - 14:00`. Default duration 60 minutes; use `DEFAULT_DURATION` from `calendarModel.ts:186` rather than a new literal.
- Calendar `<select>` from `useSetterCalendarsQuery`, defaulting to the first calendar.
- Contact search `<input>`, debounced 300ms, feeding `useSetterContactSearchQuery`. Results as a selectable list showing name and phone. Selecting one sets `contactId`.
- Confirm button disabled unless `contactId` and `calendarId` are both set, and while the mutation is pending.
- On confirm, call `useSetterBookMutation` with `startTime` and `endTime` as ISO strings built from `slot.iso` plus minutes, then call `onBooked()`.
- On a `needs_staff` or `calendar_not_found` error, show the message inline in the panel. Do not swallow it. Copy the exact error strings `SlotPicker.tsx` already uses so the two surfaces read the same.
- Escape closes the panel.

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run src/components/admin/setter/ && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/components/admin/setter/BookSlotPanel.tsx command-center/app/src/components/admin/setter/BookSlotPanel.test.tsx
git commit -m "feat(setter): booking slide-over for the calendar tab"
```

---

### Task 10: `SetterCalendar` tab body

**Files:**
- Create: `command-center/app/src/components/admin/setter/SetterCalendar.tsx`
- Test: `command-center/app/src/components/admin/setter/SetterCalendar.test.tsx`

**Interfaces:**
- Consumes: Tasks 6, 7, 8, 9.
- Produces: `export function SetterCalendar({ tenantId, clientName }: { tenantId: string; clientName: string }): JSX.Element`

Composition:

1. Toolbar: `Month | Week | Agenda` segmented control defaulting to **Week**, previous/next range buttons, the range label, a source legend, and a `+ Book` button.
2. `CalendarViews` with `view`, `items`, `connected`, `onRangeChange`, and `onSlotClick`.
3. `BookSlotPanel`, open when `slot` is non-null.

`items` merges two mapped streams:

```ts
const items = useMemo(
  () => [
    ...(eventsQuery.data?.events ?? []).map(appointmentToItem),
    ...(busyQuery.data?.busy ?? []).map(busyToItem),
  ],
  [eventsQuery.data, busyQuery.data],
);
```

`busyToItem` already exists (`calendarModel.ts`) and takes `(b, index)`, so pass the index.

`connected` is `Record<CalendarSource, boolean>`, so supply all four keys:

```ts
const connected = {
  estimate: false,
  job: false,
  appointment: true,
  busy: busyQuery.data?.connected ?? false,
};
```

`estimate` and `job` are `false` because this tab deliberately does not show pipeline items.

`onRangeChange` writes `startIso` / `endIso` into state, which drives both queries.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/setter/SetterCalendar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SetterCalendar } from "./SetterCalendar";

describe("SetterCalendar", () => {
  it("defaults to the week view, which is the only one you can book from", () => {
    render(<SetterCalendar tenantId="t1" clientName="Willis Windows" />);
    expect(screen.getByRole("button", { name: /^week$/i }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("offers a Book button even before any slot is clicked", () => {
    render(<SetterCalendar tenantId="t1" clientName="Willis Windows" />);
    expect(screen.getByRole("button", { name: /^\+ book$/i })).toBeInTheDocument();
  });

  it("tells the setter when the client has not linked a calendar, rather than showing an empty grid", () => {
    render(<SetterCalendar tenantId="t1" clientName="Willis Windows" />);
    expect(screen.getByText(/has not linked a Google Calendar/i)).toBeInTheDocument();
  });
});
```

The third test matters. Per the standing "no connected-placeholder chatter" rule this is a short, honest empty state, not filler. Exact copy:

> `Willis Windows has not linked a Google Calendar, so busy hours are not shown.`

Show it only when `busyQuery.data?.connected === false`, as a single quiet line under the toolbar. Never show it while loading.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run src/components/admin/setter/SetterCalendar.test.tsx
```

Expected: FAIL, cannot resolve `./SetterCalendar`.

- [ ] **Step 3: Implement**

Build per the composition above. The Book button sets `slot` to `{ iso: <today or anchor>, startMinutes: -1 }`. `onSlotClick` sets it to the real clicked values.

`onBooked` invalidates `["admin","setter","events",tenantId]` and closes the panel.

- [ ] **Step 4: Run tests**

```bash
cd command-center/app && npx vitest run src/ && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/components/admin/setter/SetterCalendar.tsx command-center/app/src/components/admin/setter/SetterCalendar.test.tsx
git commit -m "feat(setter): calendar tab body with week grid and booking"
```

---

### Task 11: Wire the tab into the Suite

**Files:**
- Modify: `command-center/app/src/routes/admin/SetterSuite.tsx:16`, `:19-31`, `:63`, `:138-157`, and the view switch at `:159`

- [ ] **Step 1: Write the failing test**

Append to the existing `SetterSuite` test file if one exists; otherwise create `src/routes/admin/SetterSuite.test.tsx`:

```tsx
it("offers Board, Inbox and Calendar", () => {
  renderSuite();
  expect(screen.getByRole("button", { name: /board/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /inbox/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /calendar/i })).toBeInTheDocument();
});

it("restores a persisted calendar view on mount", () => {
  window.localStorage.setItem("hml_setter_view", "calendar");
  renderSuite();
  expect(screen.getByRole("button", { name: /calendar/i }))
    .toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npx vitest run src/routes/admin/SetterSuite.test.tsx
```

Expected: FAIL, no Calendar button.

- [ ] **Step 3: Implement**

L16, widen the union:

```ts
type SetterView = "board" | "inbox" | "calendar";
```

L19-21, extend the guard:

```ts
function isSetterView(v: string | null | undefined): v is SetterView {
  return v === "board" || v === "inbox" || v === "calendar";
}
```

`initialSetterView` needs no change: it already validates through `isSetterView`.

Add the tab button after Inbox, matching the existing two exactly:

```tsx
<button
  type="button"
  className={`pk-tab${view === "calendar" ? " on" : ""}`}
  onClick={() => selectView("calendar")}
  aria-current={view === "calendar" ? "page" : undefined}
>
  <CalendarDays size={15} aria-hidden />
  Calendar
</button>
```

Import `CalendarDays` from `lucide-react` alongside the existing icons.

Change the body switch at L159 from a ternary to a branch that handles three cases:

```tsx
{view === "inbox" ? (
  <SetterInbox key={activeTenantId} tenantId={activeTenantId} clientName={activeClient.name} />
) : view === "calendar" ? (
  <SetterCalendar key={activeTenantId} tenantId={activeTenantId} clientName={activeClient.name} />
) : (
  <>
    {/* existing board branch, unchanged */}
  </>
)}
```

`boardEnabled` at L63 is already `view === "board" && !!activeTenantId`, so the board's queries switch off on the calendar tab with no change needed. Confirm this rather than assuming it.

- [ ] **Step 4: Run the whole suite**

```bash
cd command-center/app && npx vitest run && npx tsc --noEmit && npm run build
```

Expected: all green, clean build.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/routes/admin/SetterSuite.tsx command-center/app/src/routes/admin/SetterSuite.test.tsx
git commit -m "feat(setter): add the Calendar tab to the Setter Suite"
```

---

### Task 12: Verify and ship

- [ ] **Step 1: Full local verification**

```bash
cd command-center/app && npx vitest run && npx tsc --noEmit && npm run build
```

Record the actual test count and the built bundle hash from `dist/assets/`. Both go in the ship report.

- [ ] **Step 2: Verify the endpoints are admin-gated**

Start the local dev server, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8788/api/admin/setter/events?tenantId=x&start=2026-07-20T00:00:00Z&end=2026-07-27T00:00:00Z"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8788/api/admin/setter/busy?tenantId=x&start=2026-07-20T00:00:00Z&end=2026-07-27T00:00:00Z"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8788/api/admin/setter/contacts?tenantId=x&q=beck"
```

Expected: `401` from all three. Any other status is a gate failure and blocks the ship.

- [ ] **Step 3: Merge and push**

```bash
git checkout main && git pull --ff-only
git merge --no-ff feat/setter-suite
npx vitest run && npm run build
git push origin main
```

If `feat/setter-suite` has diverged from `main`, rebase rather than forcing. `src/lib/api.ts`, `src/hooks/useApi.ts`, `src/lib/queryClient.ts` and `src/App.tsx` are the known conflict points with other in-flight branches.

- [ ] **Step 4: Watch the deploy and smoke-test live**

Poll the live bundle for a **string** unique to this change, not the local bundle hash. Cloudflare builds a different hash, so polling for the local one never matches.

```bash
curl -s https://app.hauckmarketing.com/assets/index-*.js | grep -c "has not linked a Google Calendar"
```

Expected: `1`.

- [ ] **Step 5: Delete this plan**

```bash
git rm docs/build-plans/setter-calendar-tab.md
git commit -m "docs(setter): retire the calendar tab plan, it shipped"
```

Before deleting, append any outstanding Jake actions to
`docs/build-plans/Agency Desktop App/what jake needs to get done/README.md`.

Known items to append:

1. Eyeball `/admin/setter` → Calendar. It is admin-gated, so it cannot be verified without a real admin session.
2. Book one appointment from the grid and confirm it lands in GHL.
3. Decide whether setters should be able to link a client's Google Calendar on their behalf. Today `functions/api/connections/google-calendar/start.ts:16` hardcodes a redirect to `/sales/jobs`, so only the client can do it. Until then, busy hours appear only for clients who linked it themselves.

---

## Self-review

**Spec coverage.** Contracts for `events`, `busy` and `contacts` map to Tasks 3, 4, 5. Gap 1 to Task 4 with its `mode` prerequisite in Task 1. Gap 2 to Task 2. Gap 3 to Task 7. Both booking gestures to Tasks 9 and 10. The third tab to Task 11. Constraint 5 (no PII in the persisted cache) to Task 8 Step 3. Constraint 3 (client app unchanged) is enforced by Task 7 Step 5.

**Type consistency.** `GhlContext` widens once in Task 1 and every later task uses `{ token, locationId, slug, mode }`. `CalendarEvent` (Task 2, server) and `ApiSetterEvent` (Task 8, client) are deliberately separate declarations of the same shape, matching how the repo already mirrors server types into `src/lib/api.ts`. `appointmentToItem` takes `ApiSetterEventLike` so `calendarModel.ts` does not import from `api.ts`, preserving its current dependency direction.

**Known soft spots, flagged rather than hidden.**

- Task 7's third test hardcodes a button index derived from an assumed Sunday week start. The step says to verify `layoutWeek` first and correct the test if wrong.
- Task 6 assumes a local-date helper exists next to `jobToItem`. The step says to use whatever is actually there.
- Task 8 Step 3 assumes `NEVER_PERSIST_KEYS` holds comma-joined strings. The step says to match the real format.
- GHL's `/contacts/?query=` response key is assumed to be `contacts`. If Task 5's integration behaves oddly against a real location, that key is the first thing to check.
