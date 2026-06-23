# Admin Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-console calendar at `/admin/calendar` where Jake creates colored work blocks on a month grid, with an optional one-click Google Calendar connection that syncs blocks two-way.

**Architecture:** A new admin route renders a month grid backed by a `work_blocks` Supabase table (service-role only, same as `drive_connection`). Google sync mirrors the working Assets/Drive direct-OAuth flow: a singleton `calendar_connection` token store, a `calendarGoogle.ts` server lib for token refresh + Calendar REST, and push-on-mutation (block create/edit/delete writes to Google) plus pull-overlay (Google events for the visible month render as read-only chips). The page is fully usable with no Google connection.

**Tech Stack:** React 19 + react-router + Tailwind tokens (command-center/app/src), Cloudflare Pages Functions (command-center/app/functions), Supabase (service-role), Vitest for pure-logic unit tests, Google Calendar REST v3.

## Global Constraints

- **No em dashes (—) anywhere** — chat, code comments, UI text, copy. Use commas, periods, parentheses, or colons.
- All Supabase access from Functions uses the **service-role client** (`getServiceClient`); tables have RLS on with **no policies** (same as `drive_connection`).
- `/api/admin/*` is **admin-gated by `functions/_middleware.ts`**; handlers read `ctx.data.admin` and never re-check identity.
- Migrations apply via **`npm run db:migrate`** (never the Supabase SQL editor). Next free migration number is **0018**.
- Reuse existing env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT`.
- Styling uses existing CSS tokens (`bg-surface`, `text-text`, `border-border`, `--radius`, `--brand`, etc.). No raw hex unless a category swatch needs it.
- Google failures during a block mutation must NOT fail the in-app write. The block row is the source of truth.
- Run all commands from `command-center/app/` unless stated otherwise.

---

### Task 1: Database migration (work_blocks + calendar_connection)

**Files:**
- Create: `command-center/app/supabase/migrations/0018_admin_calendar.sql`

**Interfaces:**
- Produces: tables `work_blocks` (columns: id, title, starts_at, ends_at, color, google_event_id, created_by, created_at, updated_at) and `calendar_connection` (singleton: id, refresh_token, access_token, access_token_expires_at, connected_email, scope, google_calendar_id, connected_by, updated_at).

- [ ] **Step 1: Write the migration file**

```sql
-- 0018: Admin calendar. Work blocks Jake paints on the month grid, plus the
-- singleton Google Calendar connection (one agency Google account, OAuth refresh
-- token), mirroring drive_connection (0015). Service-role only, RLS on, no
-- policies. Run AFTER 0017. Idempotent.

create table if not exists public.work_blocks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  -- Category key: deep | client | admin | off (rendered to a color client-side).
  color           text not null default 'deep',
  -- Set when the block has been mirrored to Google; null when sync is off/failed.
  google_event_id text,
  created_by      uuid references public.admin_accounts(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists work_blocks_starts_at_idx on public.work_blocks (starts_at);

alter table public.work_blocks enable row level security;
-- No policies: reachable only via the service-role client in Functions.

create table if not exists public.calendar_connection (
  id                       boolean primary key default true,
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  connected_email          text,
  scope                    text,
  google_calendar_id       text not null default 'primary',
  connected_by             uuid references public.admin_accounts(id) on delete set null,
  updated_at               timestamptz not null default now(),
  constraint calendar_connection_singleton check (id = true)
);

alter table public.calendar_connection enable row level security;
-- No policies: reachable only via the service-role client in Functions.
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate`
Expected: output lists `0018_admin_calendar` as applied (the ledger advances); no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0018_admin_calendar.sql
git commit -m "feat(command-center): admin calendar tables (work_blocks, calendar_connection)"
```

---

### Task 2: Pure work-block logic + unit tests

The category list, time validation, and Google-overlay dedupe are pure functions, so they get real Vitest tests (matching `src/lib/sopTriage.test.ts`). Rendering, API, and sync are verified manually later.

**Files:**
- Create: `command-center/app/src/lib/workBlocks.ts`
- Test: `command-center/app/src/lib/workBlocks.test.ts`

**Interfaces:**
- Produces:
  - `type WorkBlockCategory = "deep" | "client" | "admin" | "off"`
  - `interface WorkBlockCategoryMeta { key: WorkBlockCategory; label: string; chipClass: string; dotClass: string }`
  - `const WORK_BLOCK_CATEGORIES: WorkBlockCategoryMeta[]`
  - `function categoryMeta(key: string): WorkBlockCategoryMeta` (falls back to the `deep` entry for unknown keys)
  - `function validateBlockTimes(startIso: string, endIso: string): string | null` (returns an error message, or null when valid)
  - `function dedupeGoogleEvents<T extends { id: string }>(events: T[], blockEventIds: Array<string | null>): T[]` (drops Google events already represented by a work block)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  WORK_BLOCK_CATEGORIES,
  categoryMeta,
  validateBlockTimes,
  dedupeGoogleEvents,
} from "./workBlocks";

describe("work block categories", () => {
  it("exposes the four v1 categories in order", () => {
    expect(WORK_BLOCK_CATEGORIES.map((c) => c.key)).toEqual([
      "deep",
      "client",
      "admin",
      "off",
    ]);
  });

  it("falls back to deep for an unknown key", () => {
    expect(categoryMeta("nope").key).toBe("deep");
    expect(categoryMeta("client").label).toBe("Client");
  });
});

describe("validateBlockTimes", () => {
  it("accepts a valid range", () => {
    expect(
      validateBlockTimes("2026-06-23T09:00:00Z", "2026-06-23T11:00:00Z"),
    ).toBeNull();
  });

  it("rejects end before or equal to start", () => {
    expect(
      validateBlockTimes("2026-06-23T11:00:00Z", "2026-06-23T09:00:00Z"),
    ).toMatch(/end/i);
    expect(
      validateBlockTimes("2026-06-23T09:00:00Z", "2026-06-23T09:00:00Z"),
    ).toMatch(/end/i);
  });

  it("rejects unparseable input", () => {
    expect(validateBlockTimes("nonsense", "2026-06-23T11:00:00Z")).toMatch(
      /valid/i,
    );
  });
});

describe("dedupeGoogleEvents", () => {
  it("drops events already mirrored by a work block", () => {
    const events = [{ id: "g1" }, { id: "g2" }, { id: "g3" }];
    expect(dedupeGoogleEvents(events, ["g2", null, "g3"])).toEqual([
      { id: "g1" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/workBlocks.test.ts`
Expected: FAIL ("Failed to resolve import './workBlocks'" or "is not a function").

- [ ] **Step 3: Write minimal implementation**

```ts
// Pure helpers for admin work blocks. No React, no I/O, so this is unit-tested.

export type WorkBlockCategory = "deep" | "client" | "admin" | "off";

export interface WorkBlockCategoryMeta {
  key: WorkBlockCategory;
  label: string;
  // Filled chip for an in-app block (token-based; no raw hex).
  chipClass: string;
  // Small swatch dot for the editor's category picker.
  dotClass: string;
}

export const WORK_BLOCK_CATEGORIES: WorkBlockCategoryMeta[] = [
  { key: "deep", label: "Deep Work", chipClass: "bg-brand text-brand-fg", dotClass: "bg-brand" },
  { key: "client", label: "Client", chipClass: "bg-info text-white", dotClass: "bg-info" },
  { key: "admin", label: "Admin", chipClass: "bg-surface-3 text-text", dotClass: "bg-surface-3" },
  { key: "off", label: "Off", chipClass: "bg-danger-tint text-danger", dotClass: "bg-danger" },
];

export function categoryMeta(key: string): WorkBlockCategoryMeta {
  return WORK_BLOCK_CATEGORIES.find((c) => c.key === key) ?? WORK_BLOCK_CATEGORIES[0];
}

export function validateBlockTimes(startIso: string, endIso: string): string | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Enter a valid start and end time.";
  }
  if (end <= start) return "End time must be after the start time.";
  return null;
}

export function dedupeGoogleEvents<T extends { id: string }>(
  events: T[],
  blockEventIds: Array<string | null>,
): T[] {
  const taken = new Set(blockEventIds.filter((x): x is string => !!x));
  return events.filter((e) => !taken.has(e.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/workBlocks.test.ts`
Expected: PASS (4 tests).

Note: if `bg-info`, `text-white`, or `bg-surface-3` are not defined tokens, swap to the nearest existing token (check `src/styles` / tailwind config). The test does not assert class names, so any valid token string passes; pick ones that render.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workBlocks.ts src/lib/workBlocks.test.ts
git commit -m "feat(command-center): work-block categories, time validation, overlay dedupe"
```

---

### Task 3: Google Calendar server lib

**Files:**
- Create: `command-center/app/functions/lib/calendarGoogle.ts`

**Interfaces:**
- Consumes: `getServiceClient` from `functions/lib/supabase.ts`; `Env` from `functions/lib/env.ts`.
- Produces:
  - `const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"`
  - `class CalendarNotConnectedError extends Error`
  - `async function calendarConnection(supabase): Promise<{ connected: boolean; email: string|null; calendarId: string }>`
  - `async function getCalendarAccessToken(env, supabase): Promise<string>` (throws `CalendarNotConnectedError` when no refresh token)
  - `interface WorkBlockEvent { title: string; startsAt: string; endsAt: string }`
  - `async function insertEvent(token, calendarId, block, tz): Promise<string>` (returns the Google event id)
  - `async function patchEvent(token, calendarId, eventId, block, tz): Promise<void>`
  - `async function deleteEvent(token, calendarId, eventId): Promise<void>` (ignores 404/410)
  - `interface GoogleCalEvent { id: string; title: string; startTime: string|null; endTime: string|null; allDay: boolean }`
  - `async function listEvents(token, calendarId, fromIso, toIso): Promise<GoogleCalEvent[]>`

- [ ] **Step 1: Write the implementation** (mirrors `functions/lib/driveDirect.ts` token handling)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

// Google Calendar REST helpers for the admin calendar. One agency Google account
// whose refresh token lives in calendar_connection (mirrors drive_connection).

const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// calendar.events: read + write events on the connected account's calendars.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export class CalendarNotConnectedError extends Error {
  constructor(message = "Google Calendar is not connected yet.") {
    super(message);
    this.name = "CalendarNotConnectedError";
  }
}

interface ConnectionRow {
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  connected_email: string | null;
  google_calendar_id: string | null;
}

export async function calendarConnection(
  supabase: SupabaseClient,
): Promise<{ connected: boolean; email: string | null; calendarId: string }> {
  const { data } = await supabase
    .from("calendar_connection")
    .select("refresh_token, connected_email, google_calendar_id")
    .eq("id", true)
    .maybeSingle();
  const row = data as Pick<ConnectionRow, "refresh_token" | "connected_email" | "google_calendar_id"> | null;
  return {
    connected: !!row?.refresh_token,
    email: row?.connected_email ?? null,
    calendarId: row?.google_calendar_id || "primary",
  };
}

export async function getCalendarAccessToken(env: Env, supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("calendar_connection")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("id", true)
    .maybeSingle();
  const row = data as ConnectionRow | null;
  if (!row?.refresh_token) throw new CalendarNotConnectedError();

  const exp = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (row.access_token && Number.isFinite(exp) && exp - Date.now() > 60_000) {
    return row.access_token;
  }

  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured (missing client id/secret).");

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    if (text.includes("invalid_grant")) {
      throw new CalendarNotConnectedError("Google access was revoked. Reconnect the calendar.");
    }
    throw new Error(`Google token refresh failed (${resp.status}): ${text}`);
  }
  const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error(`Google token refresh returned no access_token: ${text}`);
  const expiresAt = new Date(Date.now() + (parsed.expires_in ?? 3600) * 1000).toISOString();

  await supabase
    .from("calendar_connection")
    .update({ access_token: parsed.access_token, access_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", true);

  return parsed.access_token;
}

export interface WorkBlockEvent {
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
}

function eventBody(block: WorkBlockEvent, tz: string) {
  return {
    summary: block.title,
    start: { dateTime: new Date(block.startsAt).toISOString(), timeZone: tz },
    end: { dateTime: new Date(block.endsAt).toISOString(), timeZone: tz },
  };
}

export async function insertEvent(token: string, calendarId: string, block: WorkBlockEvent, tz: string): Promise<string> {
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(eventBody(block, tz)),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Google insert event failed (${resp.status}): ${text}`);
  const parsed = JSON.parse(text) as { id?: string };
  if (!parsed.id) throw new Error("Google insert event returned no id");
  return parsed.id;
}

export async function patchEvent(token: string, calendarId: string, eventId: string, block: WorkBlockEvent, tz: string): Promise<void> {
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(eventBody(block, tz)),
  });
  if (!resp.ok) throw new Error(`Google patch event failed (${resp.status}): ${await resp.text()}`);
}

export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  // 404/410: already gone on Google's side. Treat as success.
  if (resp.ok || resp.status === 404 || resp.status === 410) return;
  throw new Error(`Google delete event failed (${resp.status}): ${await resp.text()}`);
}

export interface GoogleCalEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

interface RawGoogleEvent {
  id?: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function listEvents(token: string, calendarId: string, fromIso: string, toIso: string): Promise<GoogleCalEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date(fromIso).toISOString(),
    timeMax: new Date(toIso).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Google list events failed (${resp.status}): ${text}`);
  const parsed = JSON.parse(text) as { items?: RawGoogleEvent[] };
  return (parsed.items ?? [])
    .filter((e) => e.id && e.status !== "cancelled")
    .map((e) => ({
      id: e.id as string,
      title: e.summary ?? "(busy)",
      startTime: e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null),
      endTime: e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null),
      allDay: !!e.start?.date,
    }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If `bg-info`/`text-white`/etc. unrelated; this file is pure TS. Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add functions/lib/calendarGoogle.ts
git commit -m "feat(command-center): Google Calendar server lib (token refresh + events REST)"
```

---

### Task 4: OAuth connect / callback / disconnect endpoints

**Files:**
- Create: `command-center/app/functions/api/admin/calendar/oauth/start.ts`
- Create: `command-center/app/functions/api/admin/calendar/oauth/callback.ts`
- Create: `command-center/app/functions/api/admin/calendar/disconnect.ts`

**Interfaces:**
- Consumes: `CALENDAR_SCOPE` from `functions/lib/calendarGoogle.ts`; `getServiceClient` from `functions/lib/supabase.ts`.
- Produces: `GET /api/admin/calendar/oauth/start`, `GET /api/admin/calendar/oauth/callback`, `POST /api/admin/calendar/disconnect`. Callback upserts `calendar_connection` and redirects to `/admin/calendar?connected=1`.

- [ ] **Step 1: Write `oauth/start.ts`** (mirrors assets start.ts; cookie path scoped to this route)

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { CALENDAR_SCOPE } from "../../../../lib/calendarGoogle";

// GET /api/admin/calendar/oauth/start — begin connecting the agency Google
// account for calendar sync. Admin-only (gated in _middleware.ts).
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Google OAuth is not configured (set GOOGLE_OAUTH_CLIENT_ID)." }, { status: 503 });
  }

  const url = new URL(ctx.request.url);
  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT_CALENDAR || `${url.origin}/api/admin/calendar/oauth/callback`;
  const state = crypto.randomUUID();

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", CALENDAR_SCOPE);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent"); // force a fresh refresh_token
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: auth.toString(),
      "set-cookie": `cal_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/admin/calendar/oauth; Max-Age=600`,
    },
  });
};
```

Note: a dedicated `GOOGLE_OAUTH_REDIRECT_CALENDAR` env is optional. If the OAuth client only allows one redirect, leave it unset and the default `${origin}/api/admin/calendar/oauth/callback` is used (add that URI to the OAuth client). Add `GOOGLE_OAUTH_REDIRECT_CALENDAR?: string;` to `functions/lib/env.ts` in this step.

- [ ] **Step 2: Add the env field**

In `command-center/app/functions/lib/env.ts`, after the `GOOGLE_OAUTH_REDIRECT?: string;` line (around line 31), add:

```ts
  // Optional separate redirect for the calendar OAuth flow. Defaults to
  // `${origin}/api/admin/calendar/oauth/callback` when unset.
  GOOGLE_OAUTH_REDIRECT_CALENDAR?: string;
```

- [ ] **Step 3: Write `oauth/callback.ts`** (mirrors assets callback.ts; identifies the account via the userinfo endpoint since the drive `about` endpoint is not in scope here)

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";

// GET /api/admin/calendar/oauth/callback?code=...&state=...
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return calRedirect(url.origin, `google_${error}`);
  if (!code) return calRedirect(url.origin, "missing_code");

  const cookieState = readCookie(ctx.request, "cal_oauth_state");
  if (!state || !cookieState || state !== cookieState) return calRedirect(url.origin, "bad_state");

  const clientId = ctx.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = ctx.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return calRedirect(url.origin, "not_configured");
  const redirectUri = ctx.env.GOOGLE_OAUTH_REDIRECT_CALENDAR || `${url.origin}/api/admin/calendar/oauth/callback`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  const tokenText = await tokenResp.text();
  if (!tokenResp.ok) return calRedirect(url.origin, "token_exchange_failed");
  const tokens = JSON.parse(tokenText) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tokens.refresh_token) return calRedirect(url.origin, "no_refresh_token");

  // Identify the connected account (cosmetic). The calendarList primary entry
  // carries the account's own calendar id/email.
  let connectedEmail: string | null = null;
  if (tokens.access_token) {
    try {
      const meResp = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary?fields=id",
        { headers: { authorization: `Bearer ${tokens.access_token}` } },
      );
      if (meResp.ok) connectedEmail = ((await meResp.json()) as { id?: string }).id ?? null;
    } catch {
      /* email is cosmetic */
    }
  }

  const supabase = getServiceClient(ctx.env);
  if (!supabase) return calRedirect(url.origin, "no_db");

  const expiresAt = tokens.access_token ? new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString() : null;
  const { error: upsertErr } = await supabase.from("calendar_connection").upsert(
    {
      id: true,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? null,
      access_token_expires_at: expiresAt,
      connected_email: connectedEmail,
      scope: tokens.scope ?? null,
      google_calendar_id: "primary",
      connected_by: ctx.data.admin?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upsertErr) return calRedirect(url.origin, "save_failed");

  return new Response(null, {
    status: 302,
    headers: {
      location: `${url.origin}/admin/calendar?connected=1`,
      "set-cookie": "cal_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/admin/calendar/oauth; Max-Age=0",
    },
  });
};

function calRedirect(origin: string, reason: string): Response {
  return Response.redirect(`${origin}/admin/calendar?connect_error=${encodeURIComponent(reason)}`, 302);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
```

- [ ] **Step 4: Write `disconnect.ts`**

```ts
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// POST /api/admin/calendar/disconnect — forget the connected Google account.
// Work blocks stay; they just stop mirroring. Admin-only.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { error } = await supabase.from("calendar_connection").delete().eq("id", true);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
};
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/api/admin/calendar/oauth functions/api/admin/calendar/disconnect.ts functions/lib/env.ts
git commit -m "feat(command-center): admin calendar Google OAuth connect/callback/disconnect"
```

---

### Task 5: Work-block API endpoints (list/create/edit/delete + Google mirror)

**Files:**
- Create: `command-center/app/functions/api/admin/calendar/blocks/index.ts`
- Create: `command-center/app/functions/api/admin/calendar/blocks/[blockId].ts`

**Interfaces:**
- Consumes: `getServiceClient`; `calendarConnection`, `getCalendarAccessToken`, `insertEvent`, `patchEvent`, `deleteEvent`, `listEvents`, `CalendarNotConnectedError`, `WorkBlockEvent`, `GoogleCalEvent` from `calendarGoogle.ts`; `tenantTimezone` from `env.ts`.
- Produces:
  - `GET /api/admin/calendar/blocks?from=&to=` -> `{ blocks: ApiWorkBlock[]; googleEvents: GoogleCalEvent[]; connection: { connected: boolean; email: string|null }; syncError?: string }`
  - `POST /api/admin/calendar/blocks` body `{ title, startsAt, endsAt, color }` -> `{ block: ApiWorkBlock }`
  - `PATCH /api/admin/calendar/blocks/:blockId` body partial -> `{ block: ApiWorkBlock }`
  - `DELETE /api/admin/calendar/blocks/:blockId` -> `{ ok: true }`
  - `interface ApiWorkBlock { id, title, startsAt, endsAt, color, googleEventId: string|null }`

- [ ] **Step 1: Write `blocks/index.ts`**

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { tenantTimezone } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import {
  calendarConnection,
  getCalendarAccessToken,
  insertEvent,
  listEvents,
  type GoogleCalEvent,
} from "../../../../lib/calendarGoogle";

interface BlockRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  color: string;
  google_event_id: string | null;
}

interface ApiWorkBlock {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  color: string;
  googleEventId: string | null;
}

function toBlock(r: BlockRow): ApiWorkBlock {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    color: r.color,
    googleEventId: r.google_event_id,
  };
}

const DAY = 24 * 60 * 60_000;

// GET /api/admin/calendar/blocks?from=&to=
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const now = Date.now();
  const parseMs = (raw: string | null, fb: number) => {
    if (!raw) return fb;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : fb;
  };
  const fromMs = parseMs(url.searchParams.get("from"), now - 7 * DAY);
  const toMs = parseMs(url.searchParams.get("to"), now + 45 * DAY);
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const { data, error } = await supabase
    .from("work_blocks")
    .select("id, title, starts_at, ends_at, color, google_event_id")
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const blocks = ((data ?? []) as BlockRow[]).map(toBlock);

  const conn = await calendarConnection(supabase);
  let googleEvents: GoogleCalEvent[] = [];
  let syncError: string | undefined;
  if (conn.connected) {
    try {
      const token = await getCalendarAccessToken(ctx.env, supabase);
      googleEvents = await listEvents(token, conn.calendarId, fromIso, toIso);
    } catch (e) {
      // Degrade: the page still renders blocks if the overlay fetch fails.
      syncError = e instanceof Error ? e.message : "Google overlay unavailable";
      console.warn("[calendar.blocks] overlay fetch failed", e);
    }
  }

  return Response.json({
    blocks,
    googleEvents,
    connection: { connected: conn.connected, email: conn.email },
    ...(syncError ? { syncError } : {}),
  });
};

interface CreateBody {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  color?: string;
}

// POST /api/admin/calendar/blocks
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  const startMs = Date.parse(body.startsAt ?? "");
  const endMs = Date.parse(body.endsAt ?? "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return Response.json({ error: "valid startsAt/endsAt required (end after start)" }, { status: 400 });
  }
  const color = (body.color ?? "deep").trim() || "deep";

  // Mirror to Google first (best effort) so we can store the event id in one write.
  let googleEventId: string | null = null;
  const conn = await calendarConnection(supabase);
  if (conn.connected) {
    try {
      const token = await getCalendarAccessToken(ctx.env, supabase);
      googleEventId = await insertEvent(
        token,
        conn.calendarId,
        { title, startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() },
        tenantTimezone(ctx.env),
      );
    } catch (e) {
      console.warn("[calendar.blocks] google insert failed", e);
    }
  }

  const { data, error } = await supabase
    .from("work_blocks")
    .insert({
      title,
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
      color,
      google_event_id: googleEventId,
      created_by: ctx.data.admin?.id ?? null,
    })
    .select("id, title, starts_at, ends_at, color, google_event_id")
    .single();
  if (error || !data) return Response.json({ error: error?.message ?? "could not create block" }, { status: 500 });

  return Response.json({ block: toBlock(data as BlockRow) }, { status: 201 });
};
```

- [ ] **Step 2: Write `blocks/[blockId].ts`**

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { tenantTimezone } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import {
  calendarConnection,
  getCalendarAccessToken,
  insertEvent,
  patchEvent,
  deleteEvent,
} from "../../../../lib/calendarGoogle";

interface BlockRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  color: string;
  google_event_id: string | null;
}

function toBlock(r: BlockRow) {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    color: r.color,
    googleEventId: r.google_event_id,
  };
}

interface PatchBody {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  color?: string;
}

// PATCH /api/admin/calendar/blocks/:blockId
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const blockId = ctx.params.blockId as string;

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return Response.json({ error: "title cannot be empty" }, { status: 400 });
    update.title = t;
  }
  if (typeof body.color === "string" && body.color.trim()) update.color = body.color.trim();
  if (typeof body.startsAt === "string") {
    const ms = Date.parse(body.startsAt);
    if (!Number.isFinite(ms)) return Response.json({ error: "invalid startsAt" }, { status: 400 });
    update.starts_at = new Date(ms).toISOString();
  }
  if (typeof body.endsAt === "string") {
    const ms = Date.parse(body.endsAt);
    if (!Number.isFinite(ms)) return Response.json({ error: "invalid endsAt" }, { status: 400 });
    update.ends_at = new Date(ms).toISOString();
  }

  const { data, error } = await supabase
    .from("work_blocks")
    .update(update)
    .eq("id", blockId)
    .select("id, title, starts_at, ends_at, color, google_event_id")
    .single();
  if (error || !data) return Response.json({ error: error?.message ?? "block not found" }, { status: 404 });
  const row = data as BlockRow;

  // Mirror the edit to Google (best effort). Create the event if missing.
  const conn = await calendarConnection(supabase);
  if (conn.connected && (update.starts_at || update.ends_at || update.title)) {
    try {
      const token = await getCalendarAccessToken(ctx.env, supabase);
      const ev = { title: row.title, startsAt: row.starts_at, endsAt: row.ends_at };
      if (row.google_event_id) {
        await patchEvent(token, conn.calendarId, row.google_event_id, ev, tenantTimezone(ctx.env));
      } else {
        const newId = await insertEvent(token, conn.calendarId, ev, tenantTimezone(ctx.env));
        await supabase.from("work_blocks").update({ google_event_id: newId }).eq("id", blockId);
        row.google_event_id = newId;
      }
    } catch (e) {
      console.warn("[calendar.blocks] google patch failed", e);
    }
  }

  return Response.json({ block: toBlock(row) });
};

// DELETE /api/admin/calendar/blocks/:blockId
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const supabase = getServiceClient(ctx.env);
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const blockId = ctx.params.blockId as string;

  // Read the google_event_id before deleting so we can clean up the mirror.
  const { data } = await supabase
    .from("work_blocks")
    .select("google_event_id")
    .eq("id", blockId)
    .maybeSingle();
  const googleEventId = (data as { google_event_id: string | null } | null)?.google_event_id ?? null;

  const { error } = await supabase.from("work_blocks").delete().eq("id", blockId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (googleEventId) {
    const conn = await calendarConnection(supabase);
    if (conn.connected) {
      try {
        const token = await getCalendarAccessToken(ctx.env, supabase);
        await deleteEvent(token, conn.calendarId, googleEventId);
      } catch (e) {
        console.warn("[calendar.blocks] google delete failed", e);
      }
    }
  }

  return Response.json({ ok: true });
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add functions/api/admin/calendar/blocks
git commit -m "feat(command-center): work-block API with best-effort Google mirror"
```

---

### Task 6: Calendar UI (month grid, editor, connect card) + route + nav

**Files:**
- Modify: `command-center/app/src/lib/api.ts` (add types)
- Create: `command-center/app/src/components/admin/calendar/MonthGrid.tsx`
- Create: `command-center/app/src/components/admin/calendar/BlockEditorModal.tsx`
- Create: `command-center/app/src/components/admin/calendar/ConnectGoogleCard.tsx`
- Create: `command-center/app/src/routes/admin/AdminCalendar.tsx`
- Modify: `command-center/app/src/routes/admin/AdminLayout.tsx` (nav item)
- Modify: `command-center/app/src/App.tsx` (route)

**Interfaces:**
- Consumes: `api` helper from `src/lib/api.ts`; `WORK_BLOCK_CATEGORIES`, `categoryMeta`, `validateBlockTimes`, `dedupeGoogleEvents` from `src/lib/workBlocks.ts`; `DesktopPage` from `src/components/desktop/DesktopPage`; `Button` from `src/components/ui/Button`.
- Produces: route `/admin/calendar` rendering `AdminCalendar`; nav entry.

- [ ] **Step 1: Add API types to `src/lib/api.ts`**

Append near the other exported interfaces (do not duplicate the `api` function):

```ts
export interface ApiWorkBlock {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  color: string;
  googleEventId: string | null;
}

export interface ApiGoogleCalEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

export interface CalendarBlocksResponse {
  blocks: ApiWorkBlock[];
  googleEvents: ApiGoogleCalEvent[];
  connection: { connected: boolean; email: string | null };
  syncError?: string;
}
```

- [ ] **Step 2: Write `ConnectGoogleCard.tsx`**

```tsx
import { CalendarCheck, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../../lib/api";

export default function ConnectGoogleCard({
  connected,
  email,
  onChange,
}: {
  connected: boolean;
  email: string | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    setBusy(true);
    try {
      await api("/api/admin/calendar/disconnect", { method: "POST" });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-sm)]">
      <span className="grid h-9 w-9 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text">
        <CalendarCheck size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-text">
          {connected ? "Google Calendar connected" : "Google Calendar (optional)"}
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {connected
            ? `Blocks sync to ${email ?? "your Google account"}. Your Google events show below.`
            : "Connect to mirror blocks to your phone and see your Google events here."}
        </div>
      </div>
      {connected ? (
        <button
          onClick={() => void disconnect()}
          disabled={busy}
          className="flex items-center gap-2 rounded-[var(--radius)] border border-border px-3 py-2 text-[13px] font-semibold text-muted transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Disconnect
        </button>
      ) : (
        <a
          href="/api/admin/calendar/oauth/start"
          className="flex items-center gap-2 rounded-[var(--radius)] bg-brand px-3 py-2 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          <Link2 size={15} /> Connect Google Calendar
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `BlockEditorModal.tsx`** (local datetime <-> ISO handled here)

```tsx
import { useState, type FormEvent } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { WORK_BLOCK_CATEGORIES, validateBlockTimes } from "../../../lib/workBlocks";
import type { ApiWorkBlock } from "../../../lib/api";

const inputCls =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time. Convert
// to/from an ISO string so the API always gets a real instant.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

export interface BlockDraft {
  id?: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  color: string;
}

export default function BlockEditorModal({
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: BlockDraft;
  onClose: () => void;
  onSave: (b: BlockDraft) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(draft.title);
  const [start, setStart] = useState(isoToLocalInput(draft.startsAt));
  const [end, setEnd] = useState(isoToLocalInput(draft.endsAt));
  const [color, setColor] = useState(draft.color);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErr("Give the block a title.");
    const startIso = localInputToIso(start);
    const endIso = localInputToIso(end);
    const invalid = validateBlockTimes(startIso, endIso);
    if (invalid) return setErr(invalid);
    setBusy(true);
    setErr(null);
    try {
      await onSave({ id: draft.id, title: title.trim(), startsAt: startIso, endsAt: endIso, color });
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]"
      >
        <h2 className="mb-4 font-display text-[16px] font-semibold text-text">
          {draft.id ? "Edit block" : "New work block"}
        </h2>

        <label className="mb-1 block text-[12.5px] font-medium text-muted">Title</label>
        <input className={`${inputCls} mb-3`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deep work" autoFocus />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-muted">Start</label>
            <input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-muted">End</label>
            <input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <label className="mb-1 block text-[12.5px] font-medium text-muted">Category</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {WORK_BLOCK_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.key}
              onClick={() => setColor(c.key)}
              className={[
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                color === c.key ? "bg-text text-bg" : "border border-border text-muted hover:text-text",
              ].join(" ")}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${c.dotClass}`} /> {c.label}
            </button>
          ))}
        </div>

        {err && <p className="mb-3 text-[13px] text-danger">{err}</p>}

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={busy}>Save</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          {draft.id && onDelete && (
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(draft.id as string);
                  onClose();
                } catch {
                  setBusy(false);
                }
              }}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-faint hover:bg-danger-tint hover:text-danger"
              aria-label="Delete block"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
```

Note: confirm `Button` supports `variant="ghost"` and a `loading` prop (AdminTasks uses `variant="primary" loading`). If `ghost` is not a variant, use `variant="secondary"` or a plain styled `<button>`.

- [ ] **Step 4: Write `MonthGrid.tsx`**

```tsx
import { useMemo } from "react";
import { categoryMeta } from "../../../lib/workBlocks";
import type { ApiWorkBlock, ApiGoogleCalEvent } from "../../../lib/api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 6 rows x 7 cols covering the visible month (leading/trailing days included).
function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function MonthGrid({
  year,
  month,
  blocks,
  googleEvents,
  onPickDay,
  onPickBlock,
}: {
  year: number;
  month: number;
  blocks: ApiWorkBlock[];
  googleEvents: ApiGoogleCalEvent[];
  onPickDay: (day: Date) => void;
  onPickBlock: (b: ApiWorkBlock) => void;
}) {
  const cells = useMemo(() => monthMatrix(year, month), [year, month]);
  const todayKey = dayKey(new Date());

  const blocksByDay = useMemo(() => {
    const m = new Map<string, ApiWorkBlock[]>();
    for (const b of blocks) {
      const k = dayKey(new Date(b.startsAt));
      (m.get(k) ?? m.set(k, []).get(k)!).push(b);
    }
    return m;
  }, [blocks]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, ApiGoogleCalEvent[]>();
    for (const e of googleEvents) {
      if (!e.startTime) continue;
      const k = dayKey(new Date(e.startTime));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [googleEvents]);

  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="grid grid-cols-7 border-b border-divider bg-surface-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === month;
          const isToday = k === todayKey;
          const dayBlocks = blocksByDay.get(k) ?? [];
          const dayEvents = eventsByDay.get(k) ?? [];
          return (
            <button
              key={k}
              onClick={() => onPickDay(d)}
              className={[
                "flex min-h-[104px] flex-col gap-1 border-b border-r border-divider p-1.5 text-left transition-colors hover:bg-surface-2",
                inMonth ? "" : "bg-surface-2/40",
              ].join(" ")}
            >
              <span
                className={[
                  "ml-auto grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
                  isToday ? "bg-brand text-brand-fg" : inMonth ? "text-text" : "text-faint",
                ].join(" ")}
              >
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {dayBlocks.map((b) => {
                  const meta = categoryMeta(b.color);
                  return (
                    <span
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onPickBlock(b); }}
                      className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.chipClass}`}
                      title={b.title}
                    >
                      {timeFmt.format(new Date(b.startsAt))} {b.title}
                    </span>
                  );
                })}
                {dayEvents.map((ev) => (
                  <span
                    key={ev.id}
                    className="truncate rounded border border-border bg-transparent px-1.5 py-0.5 text-[11px] text-muted"
                    title={`Google: ${ev.title}`}
                  >
                    {ev.allDay || !ev.startTime ? "" : `${timeFmt.format(new Date(ev.startTime))} `}{ev.title}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `AdminCalendar.tsx`** (route shell, month nav, data load, modal wiring)

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import MonthGrid from "../../components/admin/calendar/MonthGrid";
import ConnectGoogleCard from "../../components/admin/calendar/ConnectGoogleCard";
import BlockEditorModal, { type BlockDraft } from "../../components/admin/calendar/BlockEditorModal";
import { api, type ApiWorkBlock, type CalendarBlocksResponse } from "../../lib/api";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// A default 9-11am block on a clicked day, in local time, as ISO.
function defaultDraftForDay(day: Date): BlockDraft {
  const s = new Date(day); s.setHours(9, 0, 0, 0);
  const e = new Date(day); e.setHours(11, 0, 0, 0);
  return { title: "", startsAt: s.toISOString(), endsAt: e.toISOString(), color: "deep" };
}

export default function AdminCalendar() {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [data, setData] = useState<CalendarBlocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BlockDraft | null>(null);

  const { fromIso, toIso } = useMemo(() => {
    const from = new Date(cursor.year, cursor.month, 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(cursor.year, cursor.month + 1, 0);
    to.setDate(to.getDate() + 14);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }, [cursor]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api<CalendarBlocksResponse>(`/api/admin/calendar/blocks?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the calendar.");
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso]);

  useEffect(() => { void load(); }, [load]);

  const saveBlock = async (b: BlockDraft) => {
    if (b.id) {
      await api(`/api/admin/calendar/blocks/${b.id}`, { method: "PATCH", body: JSON.stringify({ title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, color: b.color }) });
    } else {
      await api("/api/admin/calendar/blocks", { method: "POST", body: JSON.stringify({ title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, color: b.color }) });
    }
    await load();
  };

  const deleteBlock = async (id: string) => {
    await api(`/api/admin/calendar/blocks/${id}`, { method: "DELETE" });
    await load();
  };

  const move = (delta: number) => setCursor((c) => {
    const m = c.month + delta;
    return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });

  const blockToDraft = (b: ApiWorkBlock): BlockDraft => ({ id: b.id, title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, color: b.color });

  return (
    <DesktopPage
      title="Calendar"
      subtitle={`${MONTHS[cursor.month]} ${cursor.year}`}
      actions={
        <div className="flex items-center gap-1.5">
          <button onClick={() => move(-1)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted hover:bg-surface-2 hover:text-text"><ChevronLeft size={16} /></button>
          <button onClick={() => setCursor(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; })} className="rounded-[var(--radius)] border border-border px-3 py-2 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-text">Today</button>
          <button onClick={() => move(1)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted hover:bg-surface-2 hover:text-text"><ChevronRight size={16} /></button>
          <Button variant="primary" onClick={() => setEditing(defaultDraftForDay(new Date()))}><Plus size={16} /> New block</Button>
        </div>
      }
    >
      {data && <ConnectGoogleCard connected={data.connection.connected} email={data.connection.email} onChange={() => void load()} />}
      {data?.syncError && (
        <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
          Google sync notice: {data.syncError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Loading calendar...</div>
      ) : error ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>
      ) : data ? (
        <MonthGrid
          year={cursor.year}
          month={cursor.month}
          blocks={data.blocks}
          googleEvents={data.googleEvents}
          onPickDay={(day) => setEditing(defaultDraftForDay(day))}
          onPickBlock={(b) => setEditing(blockToDraft(b))}
        />
      ) : null}

      {editing && (
        <BlockEditorModal
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={saveBlock}
          onDelete={deleteBlock}
        />
      )}
    </DesktopPage>
  );
}
```

- [ ] **Step 6: Add the nav item in `AdminLayout.tsx`**

In the lucide import block (lines 3-14) add `CalendarDays,`. In `ADMIN_NAV` (after the Tasks entry) add:

```ts
  { to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
```

- [ ] **Step 7: Register the route in `App.tsx`**

Add an import near the other admin imports (top of file):

```ts
import AdminCalendar from "./routes/admin/AdminCalendar";
```

Add a route inside the admin route block (e.g. after the `/admin/tasks` route, before `/admin/assets`):

```tsx
              <Route
                path="/admin/calendar"
                element={
                  <AdminRoute>
                    <AdminCalendar />
                  </AdminRoute>
                }
              />
```

- [ ] **Step 8: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS. Fix any token/prop mismatches flagged (e.g. unknown `Button` variant, missing color token).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/api.ts src/components/admin/calendar src/routes/admin/AdminCalendar.tsx src/routes/admin/AdminLayout.tsx src/App.tsx
git commit -m "feat(command-center): admin calendar UI (month grid, block editor, connect card)"
```

---

### Task 7: Local verification with the real app

**Files:** none (verification only).

- [ ] **Step 1: Run the full dev stack (Vite + Functions)**

Run: `npm run dev:full`
Expected: Vite on its port, wrangler Pages on 8788. (Functions are needed for `/api/admin/*`.)

- [ ] **Step 2: Drive the app with Playwright (no Google connection path)**

- Navigate to the app, sign in as admin, go to `/admin/calendar`.
- Verify: month grid renders, "Calendar" nav item is active, the Connect card shows the "optional" state.
- Click a day -> editor opens with a 9-11am default. Set a title, pick a category, Save.
- Verify the chip appears on that day in the category color. Click it -> edit -> change time -> Save -> chip updates. Delete -> chip disappears.
- Use prev/next/today to confirm month navigation.
- Take screenshots of: empty month, a month with two colored blocks, the editor open.

- [ ] **Step 3: Record evidence**

Confirm in writing which checks passed and attach the screenshots. Do not claim success without the screenshots.

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(command-center): admin calendar verification fixes"
```

---

### Task 8: Ship — deploy + Google sync smoke test

**Files:** none (deploy + ops).

- [ ] **Step 1: Add the calendar scope + redirect URI in Google Cloud**

In the agency Google Cloud project (same one used for Drive/Assets):
1. OAuth consent screen -> add scope `https://www.googleapis.com/auth/calendar.events`.
2. The OAuth client -> Authorized redirect URIs -> add `https://app.hauckmarketing.com/api/admin/calendar/oauth/callback`.

- [ ] **Step 2: Apply the migration on the live DB (if not already)**

Run: `npm run db:migrate`
Expected: `0018_admin_calendar` applied.

- [ ] **Step 3: Deploy**

Push the branch and merge per the team's flow; CF Pages builds from the merge. Watch the deploy to green.

- [ ] **Step 4: Live smoke test**

- Visit `https://app.hauckmarketing.com/admin/calendar`. Create/edit/delete a block (no connection) and confirm it persists across reload.
- Click "Connect Google Calendar", consent with the agency Google account, confirm redirect back with the connected card showing the account.
- Create a block -> confirm it appears on the real Google Calendar (check Google Calendar / phone).
- Confirm an existing Google event for the visible month shows as a read-only outlined chip.
- Edit the block's time -> confirm the Google event moves. Delete -> confirm the Google event is removed.

- [ ] **Step 5: Update the architecture map**

Per the workspace rule, update `blueprint/index.html` (NODES / GAPS) to reflect the admin calendar + Google sync, then commit.

---

## Notes for the implementer

- **v1 sync is one-directional in practice:** blocks authored in-app push to Google and Google events overlay read-only. Edits made on Google's side to a pushed block do NOT flow back. This is intentional for v1 (full two-way needs Google sync tokens / push channels).
- **Timezone:** events are written with `tenantTimezone(env)` (America/Chicago default). The editor uses the browser's local time for the datetime inputs. If Jake is not in Chicago time, revisit before relying on exact slot positions on Google.
- **Best-effort mirror:** every Google call in a mutation is wrapped so a Google failure never fails the Supabase write. A failed push leaves `google_event_id` null; the next edit re-attempts an insert.
