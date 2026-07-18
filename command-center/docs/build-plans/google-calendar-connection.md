# Google Calendar Connection: Spec + Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client connect their Google Calendar so the Jobs tab greys out the hours they are already busy, and appointments booked in the app land in their Google Calendar.

**Architecture:** Composio holds the per-client Google OAuth credential, keyed by tenant id as its `user_id`. Cloudflare Pages Functions call Composio's v3 REST API with plain `fetch` (no SDK, which is untested on the Workers runtime). Busy intervals become a third `CalendarSource` in the existing calendar view model, rendered as a background layer rather than a competing column.

**Tech Stack:** Cloudflare Pages Functions, React + TanStack Query, Vitest, Composio v3 REST API, Google Calendar API v3 (via Composio proxy).

---

## Part 1: Spec

### 1.1 What this is

Two one-way flows, not a sync engine:

1. **Busy in.** Read the client's free/busy intervals from Google, draw them as grey blocks on the Jobs tab calendar views so nobody books over their dentist appointment.
2. **Bookings out.** When an appointment is created or rescheduled in the app, mirror it into their Google Calendar.

### 1.2 What this explicitly is NOT

- Not two-way sync. No inbound webhooks, no watch channels, no sync tokens, no conflict resolution, no echo suppression.
- Not a calendar picker. `primary` only.
- Not event detail. The app never displays a Google event's title, attendees, or description. Only that the time is taken.

### 1.3 Decisions already made

| Decision | Choice | Rationale |
|---|---|---|
| Auth broker | Composio managed auth | Skips Google's sensitive-scope verification entirely, and avoids the 7-day refresh-token expiry that kills apps left in Testing status |
| Branding on consent screen | Accepted as Composio's | Owner explicitly does not care; swappable later to a BYO Google client without app code changes |
| Token storage | None of ours | Composio stores it, keyed by `user_id` |
| Busy display | Grey block, label "Busy" | Least invasive to the client |
| Calendar selection | `primary`, no picker | YAGNI |
| SDK vs REST | REST via `fetch` | `@composio/core` is untested on the Workers runtime; betting a client-facing page on that is a bad trade |

### 1.4 Known constraints discovered during research

These were verified against Composio's live OpenAPI spec (`https://backend.composio.dev/api/v3/openapi.json`) and live API, not doc pages (which 404 to fetchers and contain at least one stale tool slug).

1. **Use `POST /api/v3/connected_accounts/link`, not `POST /api/v3/connected_accounts`.** The latter returns `400` for Composio-managed OAuth2 as of 2026-07-03 for all orgs. That date has passed.
2. **Status enum has seven values**, not four: `INITIALIZING`, `INITIATED`, `ACTIVE`, `FAILED`, `EXPIRED`, `INACTIVE`, `REVOKED`. Only `ACTIVE` can execute tools.
3. **`successful: false` arrives with HTTP 200.** Branch on the response body, never the status code.
4. **`extendedProperties` is not writable through any Composio Google Calendar tool.** `GOOGLECALENDAR_EVENTS_LIST` can filter by `privateExtendedProperty`, but no write tool exposes the field. Writing it requires `POST /api/v3/tools/execute/proxy`.
5. **`GOOGLECALENDAR_CREATE_EVENT` splits duration** into `event_duration_hour` (0-24) and `event_duration_minutes` (**0-59 only**). Passing 60 minutes is invalid; use `event_duration_hour: 1`.
6. **Default managed scopes are `calendar` + `calendar.events`** (full read/write), not free/busy only. Narrowing is permitted by the schema but unproven at runtime. See Task 0.
7. **The connected account's email is not on the account record.** `state` and `data` are free-form with no declared properties, and `user_id` is deprecated on the single-account GET. Identity must be resolved by calling the provider.

### 1.5 Success criteria

- A client with no connection sees a Connect card in Settings, clicks it, completes Google consent, and returns to Settings showing connected.
- The Jobs tab Week and Agenda views grey out the hours Google reports as busy, within one minute of a change in Google.
- Turning the "Busy" source off in the calendar legend hides those blocks.
- A client with no connection sees the calendar exactly as it looks today, with no error and no placeholder chatter.
- Disconnecting revokes the grant upstream and the blocks disappear.
- An appointment booked in the app appears in the client's Google Calendar; rescheduling it moves the same event rather than creating a second one.

### 1.6 Out of scope for this build

- Multi-calendar selection
- Reading Google event titles
- Deleting the Google event when an app appointment is cancelled (log only; follow-up)
- Mobile layout for busy blocks (desktop first, matching the Jobs+Calendar merge which shipped desktop-only)

---

## Global Constraints

- **No em dashes** in any code comment, UI string, doc, or commit message. Use commas, periods, parentheses, or colons.
- **Never name GoHighLevel or GHL in client-facing UI.** Internal code and docs may.
- **No connected-placeholder chatter.** A connected client never sees "account connected, results will show up here" filler. Show real data or a short honest empty state.
- **Secrets go to Doppler** (`hauck-command-center` / `prd`), never hardcoded, never committed. Push with `cf-rebind --from-doppler`.
- **No new Supabase migration.** This build deliberately adds zero tables. If a task appears to need one, stop and escalate.
- Base branch is `origin/main`. Baseline is 56 test files / 490 tests passing.
- All new backend files are Cloudflare Workers runtime. No Node built-ins, no `fs`, no SDK imports.
- Run `npm test -- --run` from `command-center/app` after every task.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `command-center/app/functions/lib/composio.ts` | Thin authenticated `fetch` wrapper over Composio v3. Knows nothing about calendars. |
| `command-center/app/functions/lib/composio.test.ts` | Tests for the above. |
| `command-center/app/functions/lib/googleCalendar.ts` | Calendar semantics: connection lookup, busy read, event write. Knows nothing about HTTP plumbing. |
| `command-center/app/functions/lib/googleCalendar.test.ts` | Tests for the above. |
| `command-center/app/functions/api/connections/google-calendar/index.ts` | `GET` status, `DELETE` disconnect. |
| `command-center/app/functions/api/connections/google-calendar/start.ts` | `POST` returns the Composio redirect URL. |
| `command-center/app/functions/api/calendar/busy.ts` | `GET` busy intervals for a date window. |

**Modify:**

| Path | Change |
|---|---|
| `command-center/app/functions/lib/env.ts` | Add `COMPOSIO_API_KEY`, `COMPOSIO_GCAL_AUTH_CONFIG_ID`. |
| `command-center/app/functions/api/sales/jobs/index.ts` | `GhlEvent.endTime`, `ApiJob.endMinutes`, minutes helper. |
| `command-center/app/src/lib/jobsPipeline.ts` | `Job.endMinutes?: number \| null`. |
| `command-center/app/src/lib/calendarModel.ts` | `"busy"` source, `busyToItem`, real end times, busy excluded from lane packing. |
| `command-center/app/src/lib/calendarModel.test.ts` | Cover the above. |
| `command-center/app/src/index.css` | `--source-busy`, `--source-busy-tint`. |
| `command-center/app/src/hooks/useApi.ts` | Connection + busy hooks. |
| `command-center/app/src/components/settings/SettingsControls.tsx` | `GoogleCalendarControl`. |
| `command-center/app/src/routes/Settings.tsx` | Render the control. |
| `command-center/app/src/components/settings/SettingsDesktop.tsx` | Render the control. |
| `command-center/app/src/components/calendar/WeekView.tsx` | Busy background band. |
| `command-center/app/src/components/calendar/AgendaView.tsx` | Busy row, greyed. |
| `command-center/app/src/routes/sales/Jobs.tsx` | Merge busy items into `calendarItems`. |
| `command-center/app/docs/connections/calendar.md` | Document the connection. |

**Rationale for the split:** `composio.ts` is transport, `googleCalendar.ts` is domain. Keeping them apart means the transport layer is testable with a fake `fetch` and the domain layer is testable with a fake transport, and swapping Composio for direct Google OAuth later touches one file.

---

## Task 0: Prove the Composio auth config (spike, no TDD)

This is a manual verification gate. **Do not start Task 2 until this passes**, because every later task depends on knowing the real scope set and response shapes.

**Files:** none committed except the doc note in Step 6.

- [ ] **Step 1: Confirm the API key is present**

```bash
doppler secrets get COMPOSIO_API_KEY --project hauck-command-center --config prd --plain
```

Expected: an `sk_...` value. If absent, stop and escalate to the owner.

- [ ] **Step 2: Confirm the toolkit offers managed auth**

```bash
curl -s -H "x-api-key: $COMPOSIO_API_KEY" \
  https://backend.composio.dev/api/v3/toolkits/googlecalendar | jq '.composio_managed_auth_schemes'
```

Expected: `["OAUTH2"]`.

- [ ] **Step 3: Create a narrowed auth config**

Try the narrowest set that can still serve both flows: free/busy read plus own-event write.

```bash
curl -s -X POST -H "x-api-key: $COMPOSIO_API_KEY" -H "Content-Type: application/json" \
  https://backend.composio.dev/api/v3/auth_configs \
  -d '{"toolkit":{"slug":"googlecalendar"},"auth_config":{"type":"use_composio_managed_auth","credentials":{"scopes":["https://www.googleapis.com/auth/calendar.freebusy","https://www.googleapis.com/auth/calendar.events"]}}}' | jq
```

Record the returned `ac_...` id.

- [ ] **Step 4: Link a throwaway account and consent with a real Google account**

```bash
curl -s -X POST -H "x-api-key: $COMPOSIO_API_KEY" -H "Content-Type: application/json" \
  https://backend.composio.dev/api/v3/connected_accounts/link \
  -d '{"auth_config_id":"ac_REPLACE","user_id":"spike-throwaway","callback_url":"https://app.hauckmarketing.com/settings"}' | jq
```

Open `redirect_url` in a browser, consent, then poll:

```bash
curl -s -H "x-api-key: $COMPOSIO_API_KEY" \
  "https://backend.composio.dev/api/v3/connected_accounts?user_ids=spike-throwaway" | jq '.items[] | {id,status}'
```

Expected: `status: "ACTIVE"`.

- [ ] **Step 5: Prove free/busy works on the narrowed scopes**

```bash
curl -s -X POST -H "x-api-key: $COMPOSIO_API_KEY" -H "Content-Type: application/json" \
  https://backend.composio.dev/api/v3/tools/execute/GOOGLECALENDAR_FIND_FREE_SLOTS \
  -d '{"user_id":"spike-throwaway","arguments":{"time_min":"2026-07-18T00:00:00Z","time_max":"2026-07-25T00:00:00Z","items":["primary"],"timezone":"America/Detroit"}}' | jq
```

Expected: `successful: true` and a `data` payload containing busy intervals.

**Record the exact JSON path to the intervals.** The rest of the plan assumes `data.response_data.calendars.primary.busy` as an array of `{start, end}` ISO strings. If it differs, note the real path here before continuing, and use it in Task 3.

- [ ] **Step 6: Record the outcome and clean up**

If Step 5 fails on narrowed scopes, repeat Steps 3 to 5 with the managed default (`calendar`, `calendar.events`) and record that the narrow set is unavailable.

Append the result to this file under a new `### Task 0 outcome` heading: the chosen scope list, the `ac_...` id, and the verified busy JSON path.

```bash
curl -s -X DELETE -H "x-api-key: $COMPOSIO_API_KEY" \
  "https://backend.composio.dev/api/v3/connected_accounts/ca_REPLACE?revoke_on_delete=true"
```

- [ ] **Step 7: Store the auth config id**

```bash
doppler secrets set COMPOSIO_GCAL_AUTH_CONFIG_ID="ac_REPLACE" --project hauck-command-center --config prd
```

- [ ] **Step 8: Commit the doc note**

```bash
git add command-center/docs/build-plans/google-calendar-connection.md
git commit -m "docs(calendar): record Composio auth config spike outcome"
```

---

## Task 1: Real job end times

**Why first:** `calendarModel.ts:76` hardcodes `endMinutes: null`, so every job renders as a flat 60 minutes via `DEFAULT_DURATION`. Drop real-duration busy blocks next to that and the calendar looks broken. This must land before busy blocks are visible.

**Files:**
- Modify: `command-center/app/functions/api/sales/jobs/index.ts`
- Modify: `command-center/app/src/lib/jobsPipeline.ts`
- Modify: `command-center/app/src/lib/calendarModel.ts:65-84`
- Test: `command-center/app/src/lib/calendarModel.test.ts`

**Interfaces:**
- Produces: `Job.endMinutes?: number | null` consumed by Task 5's layout work.

- [ ] **Step 1: Write the failing test**

Append to `command-center/app/src/lib/calendarModel.test.ts`:

```ts
it("carries a job's real end time onto the calendar item", () => {
  const job = { ...DEMO_JOBS[0], startMinutes: 540, endMinutes: 690 };
  expect(jobToItem(job).endMinutes).toBe(690);
});

it("leaves endMinutes null when the job has no end time", () => {
  const job = { ...DEMO_JOBS[0], startMinutes: 540 };
  expect(jobToItem(job).endMinutes).toBeNull();
});
```

Ensure `DEMO_JOBS` and `jobToItem` are imported at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd command-center/app && npm test -- --run src/lib/calendarModel.test.ts
```

Expected: FAIL, first test receives `null` instead of `690`.

- [ ] **Step 3: Add the optional field to the frontend Job type**

In `command-center/app/src/lib/jobsPipeline.ts`, inside `export interface Job` (starts line 37), directly after the `startMinutes: number;` field and its comment:

```ts
  // Minutes past midnight for the appointment end, when the upstream
  // appointment carries one. Null means "unknown", and the calendar falls back
  // to its default slot length. Optional so demo jobs need no end time.
  endMinutes?: number | null;
```

- [ ] **Step 4: Use it in the mapper**

In `command-center/app/src/lib/calendarModel.ts`, replace line 76 (`endMinutes: null,`) with:

```ts
    endMinutes: j.endMinutes ?? null,
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd command-center/app && npm test -- --run src/lib/calendarModel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Carry the end time through the API**

In `command-center/app/functions/api/sales/jobs/index.ts`:

Add to `interface GhlEvent` (line 55), after `startTime?: string;`:

```ts
  endTime?: string;
```

Add to `interface ApiJob` (line 146), after `startMinutes: number;`:

```ts
  // Minutes past midnight for the appointment end, or null when the upstream
  // appointment carries no end time. The calendar falls back to a default slot.
  endMinutes: number | null;
```

Add this helper directly below `partsFromIso` (which ends at line 188):

```ts
// Minutes past local midnight for an appointment end. Same wall-clock-literal
// parsing as partsFromIso: the offset in the string is the location's own, so
// converting would drift the time.
function endMinutesFromIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
```

In the object literal that builds each job (around line 281, where `startMinutes: parts.startMinutes,` sits), add directly after it:

```ts
      endMinutes: endMinutesFromIso(appt?.endTime),
```

- [ ] **Step 7: Run the full suite**

```bash
cd command-center/app && npm test -- --run
```

Expected: 490 passing plus the 2 new tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add command-center/app/functions/api/sales/jobs/index.ts command-center/app/src/lib/jobsPipeline.ts command-center/app/src/lib/calendarModel.ts command-center/app/src/lib/calendarModel.test.ts
git commit -m "feat(jobs): carry real appointment end times onto the calendar"
```

---

## Task 2: Composio REST transport

**Files:**
- Create: `command-center/app/functions/lib/composio.ts`
- Create: `command-center/app/functions/lib/composio.test.ts`
- Modify: `command-center/app/functions/lib/env.ts`

**Interfaces:**
- Produces, consumed by Tasks 3 and 4 and 9:
  - `composioConfigured(env: Env): boolean`
  - `linkAccount(env, opts: { userId: string; callbackUrl: string }): Promise<{ redirectUrl: string; connectedAccountId: string }>`
  - `listConnectedAccounts(env, userId: string): Promise<ComposioAccount[]>`
  - `deleteConnectedAccount(env, accountId: string): Promise<void>`
  - `executeTool<T>(env, slug: string, userId: string, args: Record<string, unknown>): Promise<T>`
  - `proxyCall<T>(env, opts: { connectedAccountId: string; endpoint: string; method: string; body?: unknown }): Promise<T>`
  - `interface ComposioAccount { id: string; status: string; }`

- [ ] **Step 1: Add the env vars**

In `command-center/app/functions/lib/env.ts`, alongside the existing `GOOGLE_OAUTH_CLIENT_ID` group (around line 32):

```ts
  // Composio brokers the per-client Google Calendar OAuth grant. The API key is
  // agency-wide (one Composio project); the auth config id is the shared
  // blueprint for the Google Calendar toolkit. Per-client isolation comes from
  // passing the tenant id as Composio's user_id, so neither value is per-tenant.
  COMPOSIO_API_KEY?: string;
  COMPOSIO_GCAL_AUTH_CONFIG_ID?: string;
```

- [ ] **Step 2: Write the failing tests**

Create `command-center/app/functions/lib/composio.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  composioConfigured,
  linkAccount,
  listConnectedAccounts,
  executeTool,
} from "./composio";

const env = {
  COMPOSIO_API_KEY: "sk_test",
  COMPOSIO_GCAL_AUTH_CONFIG_ID: "ac_test",
} as never;

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("composioConfigured", () => {
  it("is false when the key is missing", () => {
    expect(composioConfigured({} as never)).toBe(false);
  });

  it("is true when both values are present", () => {
    expect(composioConfigured(env)).toBe(true);
  });
});

describe("linkAccount", () => {
  it("posts to the link endpoint and returns the redirect url", async () => {
    const f = fakeFetch(200, {
      redirect_url: "https://accounts.google.com/x",
      connected_account_id: "ca_1",
    });
    vi.stubGlobal("fetch", f);

    const out = await linkAccount(env, {
      userId: "tenant-1",
      callbackUrl: "https://app.example.com/settings",
    });

    expect(out.redirectUrl).toBe("https://accounts.google.com/x");
    expect(out.connectedAccountId).toBe("ca_1");

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://backend.composio.dev/api/v3/connected_accounts/link");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk_test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      auth_config_id: "ac_test",
      user_id: "tenant-1",
    });
  });
});

describe("listConnectedAccounts", () => {
  it("filters by the plural user_ids param", async () => {
    const f = fakeFetch(200, { items: [{ id: "ca_1", status: "ACTIVE" }] });
    vi.stubGlobal("fetch", f);

    const out = await listConnectedAccounts(env, "tenant-1");

    expect(out).toEqual([{ id: "ca_1", status: "ACTIVE" }]);
    expect(f.mock.calls[0][0]).toContain("user_ids=tenant-1");
    expect(f.mock.calls[0][0]).toContain("auth_config_ids=ac_test");
  });
});

describe("executeTool", () => {
  it("unwraps the data envelope", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: { ok: 1 }, error: null, successful: true }));
    await expect(executeTool(env, "SOME_TOOL", "tenant-1", {})).resolves.toEqual({ ok: 1 });
  });

  it("throws when successful is false even on HTTP 200", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { data: null, error: "nope", successful: false }));
    await expect(executeTool(env, "SOME_TOOL", "tenant-1", {})).rejects.toThrow(/nope/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd command-center/app && npm test -- --run functions/lib/composio.test.ts
```

Expected: FAIL, cannot resolve `./composio`.

- [ ] **Step 4: Write the implementation**

Create `command-center/app/functions/lib/composio.ts`:

```ts
import type { Env } from "./env";

// Thin transport over Composio's v3 REST API. Deliberately no SDK: the
// @composio/core package is untested on the Workers runtime, and everything we
// need is four JSON endpoints. This file knows nothing about calendars.
const BASE = "https://backend.composio.dev/api/v3";

export interface ComposioAccount {
  id: string;
  status: string;
}

export function composioConfigured(env: Env): boolean {
  return Boolean(env.COMPOSIO_API_KEY && env.COMPOSIO_GCAL_AUTH_CONFIG_ID);
}

async function call<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // Lowercase per the OpenAPI spec's securityScheme.
      "x-api-key": env.COMPOSIO_API_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`composio ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function linkAccount(
  env: Env,
  opts: { userId: string; callbackUrl: string },
): Promise<{ redirectUrl: string; connectedAccountId: string }> {
  // POST /connected_accounts (singular) returns 400 for Composio-managed OAuth2
  // as of 2026-07-03. /link is the supported path.
  const body = await call<{ redirect_url: string; connected_account_id: string }>(
    env,
    "/connected_accounts/link",
    {
      method: "POST",
      body: JSON.stringify({
        auth_config_id: env.COMPOSIO_GCAL_AUTH_CONFIG_ID,
        user_id: opts.userId,
        callback_url: opts.callbackUrl,
      }),
    },
  );
  return {
    redirectUrl: body.redirect_url,
    connectedAccountId: body.connected_account_id,
  };
}

export async function listConnectedAccounts(env: Env, userId: string): Promise<ComposioAccount[]> {
  // Query params are plural arrays, not singular.
  const qs = new URLSearchParams({
    user_ids: userId,
    auth_config_ids: env.COMPOSIO_GCAL_AUTH_CONFIG_ID ?? "",
  });
  const body = await call<{ items?: ComposioAccount[] }>(env, `/connected_accounts?${qs}`);
  return body.items ?? [];
}

export async function deleteConnectedAccount(env: Env, accountId: string): Promise<void> {
  // revoke_on_delete also drops the upstream Google grant, which is what a
  // client pressing Disconnect expects.
  await call(env, `/connected_accounts/${encodeURIComponent(accountId)}?revoke_on_delete=true`, {
    method: "DELETE",
  });
}

export async function executeTool<T>(
  env: Env,
  slug: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<T> {
  const body = await call<{ data: T; error: unknown; successful: boolean }>(
    env,
    `/tools/execute/${encodeURIComponent(slug)}`,
    { method: "POST", body: JSON.stringify({ user_id: userId, arguments: args }) },
  );
  // A failed tool call still arrives as HTTP 200, so branch on the body.
  if (!body.successful) {
    throw new Error(`composio tool ${slug} failed: ${JSON.stringify(body.error)}`);
  }
  return body.data;
}

export async function proxyCall<T>(
  env: Env,
  opts: { connectedAccountId: string; endpoint: string; method: string; body?: unknown },
): Promise<T> {
  // Passes through to the provider API with Composio's managed token. Needed
  // for fields no Composio tool exposes, e.g. extendedProperties.
  const body = await call<{ data: T; error: unknown; successful: boolean }>(
    env,
    "/tools/execute/proxy",
    {
      method: "POST",
      body: JSON.stringify({
        connected_account_id: opts.connectedAccountId,
        endpoint: opts.endpoint,
        method: opts.method,
        ...(opts.body === undefined ? {} : { body: opts.body }),
      }),
    },
  );
  if (!body.successful) {
    throw new Error(`composio proxy ${opts.method} ${opts.endpoint} failed: ${JSON.stringify(body.error)}`);
  }
  return body.data;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd command-center/app && npm test -- --run functions/lib/composio.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/functions/lib/composio.ts command-center/app/functions/lib/composio.test.ts command-center/app/functions/lib/env.ts
git commit -m "feat(composio): REST transport for the Workers runtime"
```

---

## Task 3: Google Calendar domain layer

**Files:**
- Create: `command-center/app/functions/lib/googleCalendar.ts`
- Create: `command-center/app/functions/lib/googleCalendar.test.ts`

**Interfaces:**
- Consumes from Task 2: `composioConfigured`, `listConnectedAccounts`, `executeTool`, `deleteConnectedAccount`.
- Produces, consumed by Tasks 4 and 9:
  - `interface BusyInterval { start: string; end: string; }`
  - `interface GcalConnection { connected: boolean; accountId: string | null; status: string; }`
  - `getConnection(env, tenantId: string): Promise<GcalConnection>`
  - `getBusy(env, tenantId, opts: { timeMin: string; timeMax: string; timezone: string }): Promise<BusyInterval[]>`

**Note:** If Task 0 Step 5 recorded a different JSON path for busy intervals, use that path in `parseBusy` below instead of `response_data.calendars`.

**Note on mocking:** the tests below use `vi.spyOn` against the `./composio` module namespace. Vitest supports this for Vite-transformed ES modules, but if the spies do not intercept (the real `fetch` gets called and the test hangs or throws a network error), switch that file to explicit module mocking instead. Add this above the imports and replace each `vi.spyOn(composio, "x").mockResolvedValue(v)` with `vi.mocked(composio.x).mockResolvedValue(v)`:

```ts
vi.mock("./composio", () => ({
  composioConfigured: vi.fn(() => true),
  listConnectedAccounts: vi.fn(),
  executeTool: vi.fn(),
  deleteConnectedAccount: vi.fn(),
  proxyCall: vi.fn(),
}));
```

Note that mocking the module this way also stubs `composioConfigured`, so the "not configured" test must then assert against a `composioConfigured` mock returning `false` rather than passing an empty env.

- [ ] **Step 1: Write the failing tests**

Create `command-center/app/functions/lib/googleCalendar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConnection, getBusy, parseBusy } from "./googleCalendar";
import * as composio from "./composio";

const env = {
  COMPOSIO_API_KEY: "sk_test",
  COMPOSIO_GCAL_AUTH_CONFIG_ID: "ac_test",
} as never;

beforeEach(() => vi.restoreAllMocks());

describe("getConnection", () => {
  it("reports disconnected when Composio is not configured", async () => {
    const out = await getConnection({} as never, "tenant-1");
    expect(out).toEqual({ connected: false, accountId: null, status: "not_configured" });
  });

  it("reports connected only for an ACTIVE account", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: true,
      accountId: "ca_1",
      status: "ACTIVE",
    });
  });

  it("reports disconnected for a non-ACTIVE account but keeps the status", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockResolvedValue([
      { id: "ca_1", status: "EXPIRED" },
    ]);
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: false,
      accountId: "ca_1",
      status: "EXPIRED",
    });
  });

  it("never throws when Composio errors, it reports disconnected", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockRejectedValue(new Error("boom"));
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: false,
      accountId: null,
      status: "error",
    });
  });
});

describe("parseBusy", () => {
  it("flattens busy intervals across calendars", () => {
    const raw = {
      response_data: {
        calendars: {
          primary: { busy: [{ start: "2026-07-20T14:00:00Z", end: "2026-07-20T15:00:00Z" }] },
        },
      },
    };
    expect(parseBusy(raw)).toEqual([
      { start: "2026-07-20T14:00:00Z", end: "2026-07-20T15:00:00Z" },
    ]);
  });

  it("returns an empty array for an unexpected shape", () => {
    expect(parseBusy({})).toEqual([]);
    expect(parseBusy(null)).toEqual([]);
  });
});

describe("getBusy", () => {
  it("returns an empty array when disconnected rather than throwing", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockResolvedValue([]);
    const out = await getBusy(env, "tenant-1", {
      timeMin: "2026-07-18T00:00:00Z",
      timeMax: "2026-07-25T00:00:00Z",
      timezone: "America/Detroit",
    });
    expect(out).toEqual([]);
  });

  it("asks Composio for the primary calendar", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    const exec = vi.spyOn(composio, "executeTool").mockResolvedValue({
      response_data: { calendars: { primary: { busy: [] } } },
    } as never);

    await getBusy(env, "tenant-1", {
      timeMin: "2026-07-18T00:00:00Z",
      timeMax: "2026-07-25T00:00:00Z",
      timezone: "America/Detroit",
    });

    expect(exec).toHaveBeenCalledWith(
      env,
      "GOOGLECALENDAR_FIND_FREE_SLOTS",
      "tenant-1",
      expect.objectContaining({ items: ["primary"], timezone: "America/Detroit" }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command-center/app && npm test -- --run functions/lib/googleCalendar.test.ts
```

Expected: FAIL, cannot resolve `./googleCalendar`.

- [ ] **Step 3: Write the implementation**

Create `command-center/app/functions/lib/googleCalendar.ts`:

```ts
import type { Env } from "./env";
import {
  composioConfigured,
  deleteConnectedAccount,
  executeTool,
  listConnectedAccounts,
} from "./composio";

// Calendar semantics on top of the Composio transport. The tenant id is the
// Composio user_id, which is what gives us per-client isolation without a
// credentials table of our own.

export interface BusyInterval {
  start: string;
  end: string;
}

export interface GcalConnection {
  connected: boolean;
  accountId: string | null;
  status: string;
}

const FREE_SLOTS_TOOL = "GOOGLECALENDAR_FIND_FREE_SLOTS";

// A missing or broken connection is a normal state, not a failure: the client
// simply has not connected yet. Never throw out of here, or the Jobs tab breaks
// for every client who has not opted in.
export async function getConnection(env: Env, tenantId: string): Promise<GcalConnection> {
  if (!composioConfigured(env)) {
    return { connected: false, accountId: null, status: "not_configured" };
  }
  try {
    const accounts = await listConnectedAccounts(env, tenantId);
    const active = accounts.find((a) => a.status === "ACTIVE");
    if (active) {
      return { connected: true, accountId: active.id, status: "ACTIVE" };
    }
    const first = accounts[0];
    if (first) {
      return { connected: false, accountId: first.id, status: first.status };
    }
    return { connected: false, accountId: null, status: "none" };
  } catch {
    return { connected: false, accountId: null, status: "error" };
  }
}

export async function disconnect(env: Env, tenantId: string): Promise<void> {
  const accounts = await listConnectedAccounts(env, tenantId);
  for (const a of accounts) {
    await deleteConnectedAccount(env, a.id);
  }
}

// Exported for tests: the tool wraps its payload and the exact nesting is the
// least stable part of this integration.
export function parseBusy(raw: unknown): BusyInterval[] {
  const calendars = (raw as { response_data?: { calendars?: Record<string, { busy?: unknown }> } })
    ?.response_data?.calendars;
  if (!calendars || typeof calendars !== "object") return [];
  const out: BusyInterval[] = [];
  for (const entry of Object.values(calendars)) {
    const busy = entry?.busy;
    if (!Array.isArray(busy)) continue;
    for (const b of busy) {
      const start = (b as BusyInterval)?.start;
      const end = (b as BusyInterval)?.end;
      if (typeof start === "string" && typeof end === "string") out.push({ start, end });
    }
  }
  return out;
}

export async function getBusy(
  env: Env,
  tenantId: string,
  opts: { timeMin: string; timeMax: string; timezone: string },
): Promise<BusyInterval[]> {
  const conn = await getConnection(env, tenantId);
  if (!conn.connected) return [];
  try {
    const raw = await executeTool(env, FREE_SLOTS_TOOL, tenantId, {
      items: ["primary"],
      time_min: opts.timeMin,
      time_max: opts.timeMax,
      timezone: opts.timezone,
    });
    return parseBusy(raw);
  } catch {
    // A calendar read failing must never take the Jobs tab down with it.
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd command-center/app && npm test -- --run functions/lib/googleCalendar.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/lib/googleCalendar.ts command-center/app/functions/lib/googleCalendar.test.ts
git commit -m "feat(calendar): Google Calendar connection and busy read"
```

---

## Task 4: Connection and busy routes

**Files:**
- Create: `command-center/app/functions/api/connections/google-calendar/index.ts`
- Create: `command-center/app/functions/api/connections/google-calendar/start.ts`
- Create: `command-center/app/functions/api/calendar/busy.ts`

**Interfaces:**
- Consumes from Task 3: `getConnection`, `disconnect`, `getBusy`.
- Consumes from Task 2: `linkAccount`.
- Produces, consumed by Task 6:
  - `GET /api/connections/google-calendar` returns `{ connected: boolean; status: string }`
  - `POST /api/connections/google-calendar/start` returns `{ redirectUrl: string }`
  - `DELETE /api/connections/google-calendar` returns `{ ok: true }`
  - `GET /api/calendar/busy?start=ISO&end=ISO` returns `{ connected: boolean; busy: { start: string; end: string }[] }`

**Note on tenant resolution:** `functions/api/_middleware.ts` already resolves the tenant and puts it on `ctx.data.tenant`. Read the tenant id from there. Do not resolve it yourself. Follow the exact accessor used by a neighbouring route such as `functions/api/calendar/events.ts`.

**Note on the OAuth callback:** Composio performs the token exchange, so no callback route of ours is needed. Point `callback_url` straight at the SPA settings page. Build the absolute origin with the existing helper in `functions/lib/origin.ts`.

- [ ] **Step 1: Write the status and disconnect route**

Create `command-center/app/functions/api/connections/google-calendar/index.ts`:

```ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { getConnection, disconnect } from "../../../lib/googleCalendar";

// Client-facing, tenant-session gated by _middleware. Not under /api/admin,
// because the client connects their own calendar, not an agency admin.
export const onRequestGet: PagesFunction = async (ctx) => {
  const tenantId = (ctx.data as { tenant?: { id?: string } })?.tenant?.id ?? "";
  const conn = await getConnection(ctx.env as never, tenantId);
  return Response.json({ connected: conn.connected, status: conn.status });
};

export const onRequestDelete: PagesFunction = async (ctx) => {
  const tenantId = (ctx.data as { tenant?: { id?: string } })?.tenant?.id ?? "";
  await disconnect(ctx.env as never, tenantId);
  return Response.json({ ok: true });
};
```

- [ ] **Step 2: Write the start route**

Create `command-center/app/functions/api/connections/google-calendar/start.ts`:

```ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { linkAccount, composioConfigured } from "../../../lib/composio";

export const onRequestPost: PagesFunction = async (ctx) => {
  const tenantId = (ctx.data as { tenant?: { id?: string } })?.tenant?.id ?? "";
  if (!composioConfigured(ctx.env as never)) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  const origin = new URL(ctx.request.url).origin;
  const { redirectUrl } = await linkAccount(ctx.env as never, {
    userId: tenantId,
    // Composio completes the token exchange itself, so this bounces the client
    // straight back to the page they started from.
    callbackUrl: `${origin}/settings?calendar=connected`,
  });
  return Response.json({ redirectUrl });
};
```

- [ ] **Step 3: Write the busy route**

Create `command-center/app/functions/api/calendar/busy.ts`:

```ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { getBusy, getConnection } from "../../lib/googleCalendar";

export const onRequestGet: PagesFunction = async (ctx) => {
  const tenantId = (ctx.data as { tenant?: { id?: string } })?.tenant?.id ?? "";
  const url = new URL(ctx.request.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!start || !end) {
    return Response.json({ error: "start and end are required" }, { status: 400 });
  }

  const conn = await getConnection(ctx.env as never, tenantId);
  if (!conn.connected) {
    // Not an error. Most clients will not have connected, and the calendar must
    // render exactly as it does today for them.
    return Response.json({ connected: false, busy: [] });
  }

  const tz = (ctx.data as { tenant?: { timezone?: string } })?.tenant?.timezone || "UTC";
  const busy = await getBusy(ctx.env as never, tenantId, {
    timeMin: start,
    timeMax: end,
    timezone: tz,
  });
  return Response.json(
    { connected: true, busy },
    // Short cache: busy changes are not urgent, and this shields the Composio
    // shared-quota rate limit from a client flipping between calendar views.
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
};
```

- [ ] **Step 4: Verify tenant accessor and timezone field against a neighbour**

Open `command-center/app/functions/api/calendar/events.ts` and confirm how it reads the tenant id and the location timezone. If the accessor differs from `ctx.data.tenant.id`, or if timezone comes from elsewhere, correct all three new files to match. Do not invent a new accessor.

- [ ] **Step 5: Typecheck and run the suite**

```bash
cd command-center/app && npx tsc --noEmit && npm test -- --run
```

Expected: no type errors, all tests passing.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/functions/api/connections command-center/app/functions/api/calendar/busy.ts
git commit -m "feat(calendar): connection and busy routes"
```

---

## Task 5: Busy as a calendar source

**Files:**
- Modify: `command-center/app/src/lib/calendarModel.ts`
- Modify: `command-center/app/src/lib/calendarModel.test.ts`
- Modify: `command-center/app/src/index.css`

**Interfaces:**
- Produces, consumed by Tasks 7 and 8:
  - `CalendarSource` gains `"busy"`
  - `busyToItem(b: { start: string; end: string }, index: number): CalendarItem`
  - `packDayColumns` ignores busy items
  - `splitBusy(items: CalendarItem[]): { busy: CalendarItem[]; rest: CalendarItem[] }`

- [ ] **Step 1: Write the failing tests**

Append to `command-center/app/src/lib/calendarModel.test.ts`:

```ts
describe("busy items", () => {
  it("maps a busy interval onto a calendar item", () => {
    const item = busyToItem(
      { start: "2026-07-20T09:00:00-04:00", end: "2026-07-20T10:30:00-04:00" },
      0,
    );
    expect(item.source).toBe("busy");
    expect(item.title).toBe("Busy");
    expect(item.date).toBe("2026-07-20");
    expect(item.startMinutes).toBe(540);
    expect(item.endMinutes).toBe(630);
    expect(item.id).toBe("busy:0");
  });

  it("never leaks event detail onto a busy item", () => {
    const item = busyToItem(
      { start: "2026-07-20T09:00:00-04:00", end: "2026-07-20T10:00:00-04:00" },
      1,
    );
    expect(item.subtitle).toBe("");
    expect(item.amount).toBeNull();
    expect(item.location).toBe("");
    expect(item.contactId).toBe("");
  });

  it("keeps busy items out of lane packing so jobs are not squashed", () => {
    const job = jobToItem({ ...DEMO_JOBS[0], date: "2026-07-20", startMinutes: 540 });
    const busy = busyToItem(
      { start: "2026-07-20T09:00:00-04:00", end: "2026-07-20T17:00:00-04:00" },
      0,
    );
    const placed = packDayColumns([job, busy]);
    expect(placed).toHaveLength(1);
    expect(placed[0].item.source).not.toBe("busy");
    expect(placed[0].cols).toBe(1);
  });

  it("splits busy from the rest", () => {
    const job = jobToItem(DEMO_JOBS[0]);
    const busy = busyToItem(
      { start: "2026-07-20T09:00:00-04:00", end: "2026-07-20T10:00:00-04:00" },
      0,
    );
    const out = splitBusy([job, busy]);
    expect(out.busy).toHaveLength(1);
    expect(out.rest).toHaveLength(1);
    expect(out.rest[0].source).not.toBe("busy");
  });
});
```

Add `busyToItem`, `packDayColumns`, and `splitBusy` to the imports at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command-center/app && npm test -- --run src/lib/calendarModel.test.ts
```

Expected: FAIL, `busyToItem` is not exported.

- [ ] **Step 3: Add the source**

In `command-center/app/src/lib/calendarModel.ts`, replace line 7:

```ts
export type CalendarSource = "estimate" | "job" | "busy";
```

Add to `CALENDAR_SOURCE_META` after the `job` entry:

```ts
  busy: {
    label: "Busy",
    plural: "Busy",
    varName: "--source-busy",
    tintVar: "--source-busy-tint",
  },
```

Replace `CALENDAR_SOURCE_ORDER` so busy sorts last in the legend:

```ts
export const CALENDAR_SOURCE_ORDER: CalendarSource[] = [
  "estimate",
  "job",
  "busy",
];
```

- [ ] **Step 4: Add the mapper and the splitter**

Add below `jobToItem` in the same file:

```ts
// Wall-clock literal out of an ISO timestamp. The offset in the string is the
// client's own location offset, so the literal IS the intended local time.
// Converting through Date would drift it. Mirrors partsFromIso on the API side.
function localPartsFromIso(iso: string): { date: string; minutes: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) };
}

// A block of time the client's own Google Calendar reports as taken. Carries no
// detail beyond the interval: the app never reads or shows event titles, so
// there is deliberately nothing else to map.
export function busyToItem(b: { start: string; end: string }, index: number): CalendarItem {
  const s = localPartsFromIso(b.start);
  const e = localPartsFromIso(b.end);
  return {
    id: `busy:${index}`,
    source: "busy",
    title: "Busy",
    subtitle: "",
    date: s?.date ?? "",
    startMinutes: s?.minutes ?? null,
    endMinutes: e?.minutes ?? null,
    timeLabel: s ? minutesToLabel(s.minutes) : "",
    status: "busy",
    amount: null,
    location: "",
    meetingUrl: "",
    contactId: "",
  };
}

// Busy blocks are a background layer, never a lane peer. A client with a full
// personal calendar would otherwise push every job into a sliver.
export function splitBusy(items: CalendarItem[]): {
  busy: CalendarItem[];
  rest: CalendarItem[];
} {
  return {
    busy: items.filter((i) => i.source === "busy"),
    rest: items.filter((i) => i.source !== "busy"),
  };
}
```

- [ ] **Step 5: Exclude busy from lane packing**

In `packDayColumns`, change the first filter (line 139) from:

```ts
    .filter((i) => i.startMinutes != null)
```

to:

```ts
    // Busy blocks render behind the day, so they never consume a lane.
    .filter((i) => i.startMinutes != null && i.source !== "busy")
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd command-center/app && npm test -- --run src/lib/calendarModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Add the CSS tokens**

In `command-center/app/src/index.css`, beside the existing `--source-estimate` and `--source-job` declarations, add matching light and dark entries:

```css
  --source-busy: #94a3b8;
  --source-busy-tint: rgba(148, 163, 184, 0.16);
```

Add them to every theme block that defines the other two source vars. Grep for `--source-job` to find them all.

- [ ] **Step 8: Run the full suite and commit**

```bash
cd command-center/app && npm test -- --run
git add command-center/app/src/lib/calendarModel.ts command-center/app/src/lib/calendarModel.test.ts command-center/app/src/index.css
git commit -m "feat(calendar): busy as a third calendar source"
```

---

## Task 6: Frontend data hooks

**Files:**
- Modify: `command-center/app/src/hooks/useApi.ts`

**Interfaces:**
- Consumes from Task 4: the four routes.
- Produces, consumed by Tasks 7 and 8:
  - `useGoogleCalendarConnection(): UseQueryResult<{ connected: boolean; status: string }>`
  - `useStartGoogleCalendarConnect(): UseMutationResult<{ redirectUrl: string }, Error, void>`
  - `useDisconnectGoogleCalendar(): UseMutationResult<{ ok: boolean }, Error, void>`
  - `useCalendarBusy(start: string, end: string): UseQueryResult<{ connected: boolean; busy: { start: string; end: string }[] }>`

- [ ] **Step 1: Read the existing pattern**

Open `command-center/app/src/hooks/useApi.ts` and read `useCalendarEventsQuery` (around line 1001) and `useCreateAppointment` (around line 921). Match their shape exactly: same `api()` helper, same query key style, same error handling. Do not introduce a new fetch pattern.

- [ ] **Step 2: Add the hooks**

Append near the other calendar hooks:

```ts
// The client's own Google Calendar connection. Not connected is a normal state,
// so this never surfaces an error to the UI.
export function useGoogleCalendarConnection() {
  return useQuery({
    queryKey: ["connections", "google-calendar"],
    queryFn: () => api<{ connected: boolean; status: string }>("/api/connections/google-calendar"),
    staleTime: 30_000,
  });
}

export function useStartGoogleCalendarConnect() {
  return useMutation({
    mutationFn: () =>
      api<{ redirectUrl: string }>("/api/connections/google-calendar/start", { method: "POST" }),
  });
}

export function useDisconnectGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ ok: boolean }>("/api/connections/google-calendar", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections", "google-calendar"] });
      qc.invalidateQueries({ queryKey: ["calendar", "busy"] });
    },
  });
}

// Busy intervals for a visible window. Keyed by window so switching weeks does
// not refetch the whole range, and cached briefly because Composio's managed
// auth shares a rate-limit quota across all of its customers.
export function useCalendarBusy(start: string, end: string) {
  return useQuery({
    queryKey: ["calendar", "busy", start, end],
    queryFn: () =>
      api<{ connected: boolean; busy: { start: string; end: string }[] }>(
        `/api/calendar/busy?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      ),
    enabled: Boolean(start && end),
    staleTime: 60_000,
    placeholderData: (prev: unknown) => prev,
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
cd command-center/app && npx tsc --noEmit
```

Expected: no errors. If `api`, `useQuery`, `useMutation`, or `useQueryClient` are imported differently in this file, match the file.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/hooks/useApi.ts
git commit -m "feat(calendar): connection and busy hooks"
```

---

## Task 7: Settings connection card

**Files:**
- Modify: `command-center/app/src/components/settings/SettingsControls.tsx`
- Modify: `command-center/app/src/routes/Settings.tsx`
- Modify: `command-center/app/src/components/settings/SettingsDesktop.tsx`

**Interfaces:**
- Consumes from Task 6: all four hooks.
- Produces: `GoogleCalendarControl` exported from `SettingsControls.tsx`.

**Design note:** Mockups are required before this task is considered visually final. Build the functional version here; the visual pass happens at the mockup gate before ship.

- [ ] **Step 1: Read the existing control pattern**

Open `SettingsControls.tsx` and read `ChannelsControl` (line 271). Copy its card chrome, heading style, spacing, and button classes exactly. Do not invent new styling.

- [ ] **Step 2: Add the control**

```tsx
// Lets a client connect their own Google Calendar so the Jobs calendar can grey
// out hours they are already booked. The app reads availability only: it never
// reads or displays what the events actually are.
export function GoogleCalendarControl() {
  const conn = useGoogleCalendarConnection();
  const start = useStartGoogleCalendarConnect();
  const disconnect = useDisconnectGoogleCalendar();

  const connected = conn.data?.connected ?? false;
  const notConfigured = conn.data?.status === "not_configured";

  if (notConfigured) return null;

  const onConnect = async () => {
    const { redirectUrl } = await start.mutateAsync();
    window.location.href = redirectUrl;
  };

  return (
    <div className="setting-card">
      <div className="setting-card-head">
        <h3>Google Calendar</h3>
        <p>
          {connected
            ? "Your booked time is blocked out on the Jobs calendar."
            : "Block out the times you are already busy on the Jobs calendar."}
        </p>
      </div>

      {conn.isLoading ? (
        <p className="muted">Checking...</p>
      ) : connected ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate()}
        >
          {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
        </button>
      ) : (
        <button
          type="button"
          className="btn-primary"
          disabled={start.isPending}
          onClick={onConnect}
        >
          {start.isPending ? "Opening Google..." : "Connect Google Calendar"}
        </button>
      )}

      {start.isError ? (
        <p className="error">Could not reach Google just now. Try again.</p>
      ) : null}
    </div>
  );
}
```

Replace `setting-card`, `btn-primary`, `btn-secondary`, `muted`, and `error` with the actual class names `ChannelsControl` uses.

- [ ] **Step 3: Render it**

In `command-center/app/src/routes/Settings.tsx`, add `GoogleCalendarControl` to the import block at line 7-11, then render it directly after `<ThisDeviceControl />` (line 168):

```tsx
          <GoogleCalendarControl />
```

Do the same in `SettingsDesktop.tsx`, matching how that file composes the other controls.

- [ ] **Step 4: Typecheck, test, and eyeball**

```bash
cd command-center/app && npx tsc --noEmit && npm test -- --run && npm run dev
```

Open `/settings`. Expected: the card renders, shows Connect, and the button is not dead. With no Composio env vars set locally the status is `not_configured` and the card correctly does not render at all. Set the two vars in `.dev.vars` to see it.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/components/settings command-center/app/src/routes/Settings.tsx
git commit -m "feat(settings): Google Calendar connection card"
```

---

## Task 8: Render busy on the Jobs calendar

**Files:**
- Modify: `command-center/app/src/routes/sales/Jobs.tsx:124`
- Modify: `command-center/app/src/components/calendar/WeekView.tsx`
- Modify: `command-center/app/src/components/calendar/AgendaView.tsx`

**Interfaces:**
- Consumes from Task 5: `busyToItem`, `splitBusy`.
- Consumes from Task 6: `useCalendarBusy`.

**Design decision:** Busy appears in Week and Agenda only. Month view is an overview at a density where grey blocks are noise, and the client can already see their own month in Google. `CalendarViews` keeps the source legend, so busy is toggleable off.

- [ ] **Step 1: Merge busy into the calendar items**

In `command-center/app/src/routes/sales/Jobs.tsx`, near the existing `useJobs()` call at line 92, derive the visible window and fetch busy. Read how `CalendarViews` computes its anchor before writing this, and use the same window it renders.

```tsx
  const busyQuery = useCalendarBusy(windowStartIso, windowEndIso);

  const calendarItems = useMemo(() => {
    const jobItems = jobs.map(jobToItem);
    const busyItems = (busyQuery.data?.busy ?? []).map(busyToItem);
    return [...jobItems, ...busyItems];
  }, [jobs, busyQuery.data]);
```

Note `busyToItem` takes `(interval, index)`, which `Array.prototype.map` supplies directly.

- [ ] **Step 2: Render busy behind the week grid**

In `WeekView.tsx`, split before packing:

```tsx
  const { busy, rest } = splitBusy(dayItems);
  const placed = packDayColumns(rest);
```

Render the busy blocks first, absolutely positioned across the full column width, beneath the placed items in stacking order:

```tsx
  {busy.map((b) => (
    <div
      key={b.id}
      className="week-busy-block"
      style={{
        top: `${((b.startMinutes ?? 0) / 60) * HOUR_HEIGHT}px`,
        height: `${(((b.endMinutes ?? 0) - (b.startMinutes ?? 0)) / 60) * HOUR_HEIGHT}px`,
        background: "var(--source-busy-tint)",
        borderLeft: "2px solid var(--source-busy)",
      }}
      aria-label="Busy"
    />
  ))}
```

Use the file's real hour-height constant and positioning convention rather than `HOUR_HEIGHT` if it differs.

- [ ] **Step 3: Render busy in the agenda**

In `AgendaView.tsx`, render busy rows in the same list, styled with `--source-busy`, showing only the time range and the word Busy. No customer, no service, no amount.

- [ ] **Step 4: Verify against the real app**

```bash
cd command-center/app && npm run dev
```

Check all four, with a connected calendar in `.dev.vars`:

1. Week view shows grey bands at the busy hours.
2. A long busy block does not squash jobs into slivers. This is the regression Task 5 Step 5 exists to prevent.
3. Toggling Busy off in the legend hides the bands.
4. With no connection, the calendar looks exactly as it did before this build.

- [ ] **Step 5: Run the full suite and commit**

```bash
cd command-center/app && npm test -- --run
git add command-center/app/src/routes/sales/Jobs.tsx command-center/app/src/components/calendar
git commit -m "feat(jobs): grey out busy hours on the calendar"
```

---

## Task 9: Push app bookings into Google

**Files:**
- Modify: `command-center/app/functions/lib/googleCalendar.ts`
- Modify: `command-center/app/functions/lib/googleCalendar.test.ts`
- Modify: `command-center/app/functions/api/lib/appointments.ts`

**Interfaces:**
- Consumes from Task 2: `proxyCall`, `executeTool`.
- Produces:
  - `mirrorAppointment(env, tenantId, appt: { appointmentId: string; title: string; startIso: string; endIso: string; location: string }): Promise<void>`

**Why the proxy:** no Composio Google Calendar write tool exposes `extendedProperties`, so `GOOGLECALENDAR_CREATE_EVENT` cannot stamp our appointment id onto the event. Without that stamp there is no way to find the event again on reschedule, and every reschedule would create a duplicate. The proxy passes a raw Google event body through Composio's managed token, which keeps zero tables and still gives us the stamp.

- [ ] **Step 1: Write the failing tests**

Append to `googleCalendar.test.ts`:

```ts
describe("mirrorAppointment", () => {
  const appt = {
    appointmentId: "appt-1",
    title: "Window clean, Tom Willis",
    startIso: "2026-07-20T09:00:00-04:00",
    endIso: "2026-07-20T11:00:00-04:00",
    location: "Rochester Hills, 48307",
  };

  it("does nothing when the client has not connected", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockResolvedValue([]);
    const proxy = vi.spyOn(composio, "proxyCall");
    await mirrorAppointment(env, "tenant-1", appt);
    expect(proxy).not.toHaveBeenCalled();
  });

  it("creates a new event stamped with the appointment id", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.spyOn(composio, "executeTool").mockResolvedValue({ items: [] } as never);
    const proxy = vi.spyOn(composio, "proxyCall").mockResolvedValue({} as never);

    await mirrorAppointment(env, "tenant-1", appt);

    const call = proxy.mock.calls[0][1];
    expect(call.method).toBe("POST");
    expect(call.endpoint).toContain("/calendars/primary/events");
    expect((call.body as Record<string, never>).extendedProperties).toEqual({
      private: { hmlAppointmentId: "appt-1" },
    });
  });

  it("updates the existing event instead of creating a second one", async () => {
    vi.spyOn(composio, "listConnectedAccounts").mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.spyOn(composio, "executeTool").mockResolvedValue({
      items: [{ id: "gcal-event-1" }],
    } as never);
    const proxy = vi.spyOn(composio, "proxyCall").mockResolvedValue({} as never);

    await mirrorAppointment(env, "tenant-1", appt);

    const call = proxy.mock.calls[0][1];
    expect(call.method).toBe("PATCH");
    expect(call.endpoint).toContain("gcal-event-1");
  });
});
```

Add `mirrorAppointment` to the imports.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd command-center/app && npm test -- --run functions/lib/googleCalendar.test.ts
```

Expected: FAIL, `mirrorAppointment` is not exported.

- [ ] **Step 3: Implement**

First extend the **existing** import block at the top of `googleCalendar.ts` (added in Task 3) to include `proxyCall`. Do not add a second `import ... from "./composio"` statement:

```ts
import {
  composioConfigured,
  deleteConnectedAccount,
  executeTool,
  listConnectedAccounts,
  proxyCall,
} from "./composio";
```

Then append to `googleCalendar.ts`:

```ts
// Our marker on a mirrored event. Written through the proxy because no Composio
// write tool exposes extendedProperties, and read back through EVENTS_LIST,
// which does support filtering on it. This is what keeps reschedules from
// creating duplicate events without us storing a mapping table.
const APPT_KEY = "hmlAppointmentId";

export async function mirrorAppointment(
  env: Env,
  tenantId: string,
  appt: {
    appointmentId: string;
    title: string;
    startIso: string;
    endIso: string;
    location: string;
  },
): Promise<void> {
  const conn = await getConnection(env, tenantId);
  if (!conn.connected || !conn.accountId) return;

  const body = {
    summary: appt.title,
    location: appt.location,
    start: { dateTime: appt.startIso },
    end: { dateTime: appt.endIso },
    extendedProperties: { private: { [APPT_KEY]: appt.appointmentId } },
  };

  let existingId = "";
  try {
    const found = await executeTool<{ items?: { id?: string }[] }>(
      env,
      "GOOGLECALENDAR_EVENTS_LIST",
      tenantId,
      {
        calendarId: "primary",
        privateExtendedProperty: `${APPT_KEY}=${appt.appointmentId}`,
        maxResults: 1,
      },
    );
    existingId = found?.items?.[0]?.id ?? "";
  } catch {
    // Lookup failure falls through to create. A duplicate event is a far
    // smaller problem than a booking that never reaches the client's calendar.
  }

  await proxyCall(env, {
    connectedAccountId: conn.accountId,
    endpoint: existingId
      ? `/calendars/primary/events/${encodeURIComponent(existingId)}`
      : "/calendars/primary/events",
    method: existingId ? "PATCH" : "POST",
    body,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd command-center/app && npm test -- --run functions/lib/googleCalendar.test.ts
```

Expected: PASS.

- [ ] **Step 5: Call it from the booking paths**

In `command-center/app/functions/api/lib/appointments.ts`, after the successful create (around line 143) and the successful reschedule (around line 170), mirror the appointment. The mirror must never fail the booking:

```ts
  // Best effort. The booking itself has already succeeded, and a client whose
  // Google Calendar is not connected is the normal case, so a failure here is
  // logged and swallowed rather than surfaced.
  try {
    await mirrorAppointment(env, tenantId, {
      appointmentId: created.id,
      title: `${contactName}, ${serviceLabel}`,
      startIso: created.startTime,
      endIso: created.endTime,
      location: created.address ?? "",
    });
  } catch (e) {
    console.error("google calendar mirror failed", e);
  }
```

Match the real variable names in that file. If `env` or `tenantId` are not in scope at those call sites, thread them through from the route handlers rather than resolving them locally.

- [ ] **Step 6: Full suite and commit**

```bash
cd command-center/app && npx tsc --noEmit && npm test -- --run
git add command-center/app/functions
git commit -m "feat(calendar): mirror app bookings into Google Calendar"
```

---

## Task 10: Documentation and ship

**Files:**
- Modify: `command-center/app/docs/connections/calendar.md`
- Delete: `command-center/docs/build-plans/google-calendar-connection.md`

- [ ] **Step 1: Document the connection**

Rewrite `command-center/app/docs/connections/calendar.md` to cover: which routes exist, that Composio brokers the OAuth and holds the token, that the tenant id is the Composio `user_id`, the two Doppler secrets, the scope set recorded in Task 0, that busy is read-only and detail is never fetched, and the known limitation that cancelling an app appointment does not remove the Google event.

- [ ] **Step 2: Push the secrets to Cloudflare**

```bash
cf-rebind --from-doppler
```

- [ ] **Step 3: Verify live**

Deploy, then on the live app: connect a real Google Calendar, confirm a busy block appears on the Jobs Week view, book an appointment in the app, and confirm it lands in Google. Reschedule it and confirm the same event moves rather than a second appearing.

- [ ] **Step 4: Delete this plan and commit**

Per the standing rule, a shipped build plan is removed in the same commit. Append any owner to-dos to `docs/build-plans/Agency Desktop App/what jake needs to get done/README.md` first.

```bash
git rm command-center/docs/build-plans/google-calendar-connection.md
git add -A
git commit -m "docs(calendar): document the Google Calendar connection"
```

---

## Open risks

| Risk | Mitigation |
|---|---|
| Composio managed auth shares a rate-limit quota with every other Composio customer | 60s cache on the busy route and hook. If it bites, swap the auth config to a BYO Google client, which is a dashboard change and needs no app code. |
| Narrowed scopes may not work on the managed client | Task 0 proves it before any code is written. Falls back to managed defaults. |
| Busy JSON path from `FIND_FREE_SLOTS` is the least stable part of this | Isolated in `parseBusy`, directly unit tested, returns `[]` on any unexpected shape. |
| Composio outage takes the Jobs tab down | `getConnection` and `getBusy` both swallow errors and report disconnected. The calendar degrades to exactly today's behaviour. |
| Cancelling an app appointment leaves an orphan Google event | Known and documented. Follow-up, not in this build. |
