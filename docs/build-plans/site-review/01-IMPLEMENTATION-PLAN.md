# Site Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each client a "My Site" area to view live screenshots of their website/funnel pages and drop tracked pin-notes the agency works from a unified admin "Site Feedback" inbox.

**Architecture:** Full-page screenshots are captured from registered page URLs via an external screenshot API, stored in a private Supabase Storage bucket, and shown to the client on a scrollable canvas. Clients drop pins (stored as 0..1 coordinates bound to the capture version they were made on) and threads. Admin functions live under `/api/admin/...`; client functions under `/api/site/...`, both Cloudflare Pages Functions on the existing Supabase service-role + session middleware.

**Tech Stack:** React 19 + react-router 7 + TanStack Query, Tailwind v4, Cloudflare Pages Functions, Supabase (Postgres + Storage), vitest (added here for unit logic), ScreenshotOne (external capture API).

## Global Constraints

- **No em dashes** anywhere (code, comments, UI copy). Use commas, periods, parentheses, colons.
- **Design:** premium, calm, uncluttered per `command-center/app/PRODUCT.md` + `DESIGN.md`. Poppins display (500-600), Inter body. Reuse existing CSS vars (`--bg`, `--surface`, `--text`, `--brand-primary`, etc.) and existing components (`EmptyState`, `Toast`, `StatusBadge`) rather than new primitives.
- **Functions:** signature `PagesFunction<Env, string, ApiData>`. Admin routes get `ctx.data.admin`; client routes get `ctx.data.session` (use `ctx.data.session.tenantId`, fall back to `resolveTenantId(client, ctx.data.tenant.slug)`). Always `getServiceClient(ctx.env)`; return `503 {error:"supabase not configured"}` when null.
- **Migrations:** idempotent (`create table if not exists`, `on conflict do nothing`), `enable row level security` with NO policies (service-role only). Apply with `npm run db:migrate` from `command-center/app`. NEVER the Supabase SQL editor.
- **Coordinates:** pin position stored as `x_pct`/`y_pct` floats in `[0,1]`, relative to the full capture image.
- **TypeScript strict:** `npm run typecheck` (runs both app + functions tsconfig) MUST pass before any commit.
- **Working dir:** all paths below are relative to `command-center/app/` unless noted. Run all commands from there.

---

### Task 1: Database migration + storage bucket

**Files:**
- Create: `supabase/migrations/0017_site_review.sql`

**Interfaces:**
- Produces tables: `site_pages`, `site_captures`, `site_notes`, `site_note_replies`; storage bucket `site-captures`. Column names below are consumed verbatim by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- 0017: Site Review — clients annotate screenshots of their live site/funnel.
--
-- Snapshot board model (see docs/build-plans/site-review/00-DESIGN.md): we capture
-- full-page screenshots of registered page URLs into the private site-captures
-- bucket; clients drop pin-notes (x_pct/y_pct, 0..1) bound to the capture version
-- they were made on, so pins never drift when a page is recaptured. The agency
-- works notes from a unified admin inbox and replies; status closes the loop.
--
-- Run AFTER 0001..0015. Idempotent. Service-role only (RLS on, no policies),
-- same as admin_accounts / drive_* (0013).

-- 1. site_pages: a registered page/funnel step for a client.
create table if not exists public.site_pages (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  label             text not null,
  source_url        text not null,
  sort_order        integer not null default 0,
  latest_capture_id uuid,
  created_by        uuid references public.admin_accounts(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists site_pages_tenant_idx
  on public.site_pages (tenant_id, sort_order, created_at);
alter table public.site_pages enable row level security;

-- 2. site_captures: versioned full-page screenshots of a page.
create table if not exists public.site_captures (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.site_pages(id) on delete cascade,
  storage_path text not null,
  image_width  integer not null,
  image_height integer not null,
  status       text not null default 'ready' check (status in ('pending','ready','failed')),
  captured_at  timestamptz not null default now()
);
create index if not exists site_captures_page_idx
  on public.site_captures (page_id, captured_at desc);
alter table public.site_captures enable row level security;

-- latest_capture_id points at a capture (added after captures exists to avoid a
-- forward reference; nullable so a page can exist before its first capture).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'site_pages_latest_capture_fk'
  ) then
    alter table public.site_pages
      add constraint site_pages_latest_capture_fk
      foreign key (latest_capture_id) references public.site_captures(id)
      on delete set null;
  end if;
end $$;

-- 3. site_notes: a pin-note on a specific capture.
create table if not exists public.site_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  page_id     uuid not null references public.site_pages(id) on delete cascade,
  capture_id  uuid not null references public.site_captures(id) on delete cascade,
  x_pct       double precision not null check (x_pct >= 0 and x_pct <= 1),
  y_pct       double precision not null check (y_pct >= 0 and y_pct <= 1),
  body        text not null,
  status      text not null default 'new' check (status in ('new','in_progress','done')),
  created_by_staff uuid references public.staff_accounts(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists site_notes_tenant_status_idx
  on public.site_notes (tenant_id, status, created_at desc);
create index if not exists site_notes_page_idx
  on public.site_notes (page_id, created_at desc);
alter table public.site_notes enable row level security;

-- 4. site_note_replies: the thread on a note (admin <-> client).
create table if not exists public.site_note_replies (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.site_notes(id) on delete cascade,
  author_type text not null check (author_type in ('admin','client')),
  author_id   uuid,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists site_note_replies_note_idx
  on public.site_note_replies (note_id, created_at);
alter table public.site_note_replies enable row level security;

-- 5. Private bucket for capture PNGs. Served only via short-lived signed URLs
-- minted in the Functions; never public.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('site-captures', 'site-captures', false, 10485760)
  on conflict (id) do nothing;
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate`
Expected: ledger output shows `0017_site_review.sql` applied, no error. Re-running prints it as already applied (idempotent).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_site_review.sql
git commit -m "feat(site-review): schema + storage bucket for client site annotations"
```

---

### Task 2: Vitest setup + pure annotation logic

**Files:**
- Modify: `package.json` (add `vitest` devDep + `"test": "vitest run"` script)
- Create: `vitest.config.ts`
- Create: `src/lib/siteReview.ts`
- Create: `src/lib/siteReview.test.ts`

**Interfaces:**
- Produces (consumed by UI + functions):
  - `type SiteNoteStatus = "new" | "in_progress" | "done"`
  - `STATUS_ORDER: SiteNoteStatus[]` and `STATUS_LABEL: Record<SiteNoteStatus,string>`
  - `clampPct(n: number): number` — clamps to [0,1]
  - `pinFromClick(e: {clientX:number;clientY:number}, rect: {left:number;top:number;width:number;height:number}): {x_pct:number;y_pct:number}`
  - `canTransition(from: SiteNoteStatus, to: SiteNoteStatus): boolean`
  - `validateNoteBody(raw: string): {ok:true;body:string} | {ok:false;error:string}` (trim, 1..2000 chars)

- [ ] **Step 1: Add vitest + script**

In `package.json` add to `devDependencies`: `"vitest": "^3.2.0"`. Add to `scripts`: `"test": "vitest run"`. Then run: `pnpm install`.

- [ ] **Step 2: Add vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "functions/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/siteReview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  clampPct,
  pinFromClick,
  canTransition,
  validateNoteBody,
  STATUS_ORDER,
} from "./siteReview";

describe("clampPct", () => {
  it("clamps below 0 and above 1", () => {
    expect(clampPct(-0.2)).toBe(0);
    expect(clampPct(1.5)).toBe(1);
    expect(clampPct(0.42)).toBe(0.42);
  });
});

describe("pinFromClick", () => {
  it("maps a click to a 0..1 fraction of the image box", () => {
    const rect = { left: 100, top: 50, width: 200, height: 400 };
    expect(pinFromClick({ clientX: 200, clientY: 250 }, rect)).toEqual({
      x_pct: 0.5,
      y_pct: 0.5,
    });
  });
  it("clamps clicks outside the box", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(pinFromClick({ clientX: 200, clientY: -10 }, rect)).toEqual({
      x_pct: 1,
      y_pct: 0,
    });
  });
});

describe("canTransition", () => {
  it("allows any forward/back move between the three states", () => {
    expect(canTransition("new", "in_progress")).toBe(true);
    expect(canTransition("done", "new")).toBe(true);
  });
  it("rejects a no-op", () => {
    expect(canTransition("new", "new")).toBe(false);
  });
});

describe("validateNoteBody", () => {
  it("trims and accepts normal text", () => {
    expect(validateNoteBody("  make it green  ")).toEqual({
      ok: true,
      body: "make it green",
    });
  });
  it("rejects empty", () => {
    expect(validateNoteBody("   ").ok).toBe(false);
  });
  it("rejects over 2000 chars", () => {
    expect(validateNoteBody("x".repeat(2001)).ok).toBe(false);
  });
});

describe("STATUS_ORDER", () => {
  it("is new -> in_progress -> done", () => {
    expect(STATUS_ORDER).toEqual(["new", "in_progress", "done"]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL ("Cannot find module './siteReview'").

- [ ] **Step 5: Implement the util**

Create `src/lib/siteReview.ts`:

```ts
export type SiteNoteStatus = "new" | "in_progress" | "done";

export const STATUS_ORDER: SiteNoteStatus[] = ["new", "in_progress", "done"];

export const STATUS_LABEL: Record<SiteNoteStatus, string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
};

export function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function pinFromClick(
  e: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
): { x_pct: number; y_pct: number } {
  const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
  return { x_pct: clampPct(x), y_pct: clampPct(y) };
}

export function canTransition(from: SiteNoteStatus, to: SiteNoteStatus): boolean {
  return from !== to && STATUS_ORDER.includes(to);
}

export function validateNoteBody(
  raw: string,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = (raw ?? "").trim();
  if (!body) return { ok: false, error: "Note cannot be empty" };
  if (body.length > 2000) return { ok: false, error: "Note is too long (2000 max)" };
  return { ok: true, body };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS (all 5 suites green).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/lib/siteReview.ts src/lib/siteReview.test.ts
git commit -m "feat(site-review): vitest + pure annotation logic (pins, status, validation)"
```

---

### Task 3: PNG dimension parser + screenshot client

**Files:**
- Create: `functions/lib/png.ts`
- Create: `functions/lib/png.test.ts`
- Create: `functions/lib/screenshot.ts`
- Modify: `functions/lib/env.ts` (add `SCREENSHOT_ACCESS_KEY?: string` to `Env`)

**Interfaces:**
- Produces:
  - `pngDimensions(bytes: Uint8Array): {width:number;height:number}` (throws on non-PNG)
  - `captureFullPage(env: Env, url: string): Promise<{bytes:Uint8Array;width:number;height:number}>`

- [ ] **Step 1: Write the failing test**

Create `functions/lib/png.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pngDimensions } from "./png";

// Minimal PNG: 8-byte signature + IHDR length/type + 13-byte IHDR
// (width=800, height=1200, then bit depth/color/etc).
function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("pngDimensions", () => {
  it("reads width/height from the IHDR chunk", () => {
    expect(pngDimensions(fakePng(800, 1200))).toEqual({ width: 800, height: 1200 });
  });
  it("throws on a non-PNG buffer", () => {
    expect(() => pngDimensions(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL ("Cannot find module './png'").

- [ ] **Step 3: Implement the PNG parser**

Create `functions/lib/png.ts`:

```ts
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Read the pixel dimensions from a PNG's IHDR chunk. Width is the big-endian
// uint32 at byte 16, height at byte 20 (signature[8] + length[4] + "IHDR"[4]).
// We only ever store PNGs (the capture API is asked for format=png), so this is
// all the parsing the capture pipeline needs.
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) throw new Error("buffer too small to be a PNG");
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error("not a PNG (bad signature)");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height) throw new Error("PNG has zero dimension");
  return { width, height };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Add the env field**

In `functions/lib/env.ts`, add to the `Env` interface: `SCREENSHOT_ACCESS_KEY?: string;` (place it near the other optional integration keys, with a one-line comment: `// ScreenshotOne access key for Site Review full-page captures.`).

- [ ] **Step 6: Implement the screenshot client**

Create `functions/lib/screenshot.ts`:

```ts
import type { Env } from "./env";
import { pngDimensions } from "./png";

// Capture a full-page PNG of a URL via ScreenshotOne and return the bytes plus
// pixel dimensions (needed so the client can position pins as a fraction of the
// image). Throws if the key is missing or the API errors, so the caller can mark
// the capture failed. block_ads/cookie_banners keep the shot clean.
export async function captureFullPage(
  env: Env,
  url: string,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (!env.SCREENSHOT_ACCESS_KEY) {
    throw new Error("SCREENSHOT_ACCESS_KEY not configured");
  }
  const params = new URLSearchParams({
    access_key: env.SCREENSHOT_ACCESS_KEY,
    url,
    full_page: "true",
    format: "png",
    block_ads: "true",
    block_cookie_banners: "true",
    block_chats: "true",
    viewport_width: "1280",
    cache: "false",
  });
  const res = await fetch(`https://api.screenshotone.com/take?${params.toString()}`);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`screenshot API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { width, height } = pngDimensions(bytes);
  return { bytes, width, height };
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm test && npm run typecheck`
Expected: tests PASS, typecheck clean.

```bash
git add functions/lib/png.ts functions/lib/png.test.ts functions/lib/screenshot.ts functions/lib/env.ts
git commit -m "feat(site-review): screenshot capture client + PNG dimension parser"
```

---

### Task 4: Shared server helper for site data

**Files:**
- Create: `functions/lib/siteData.ts`

**Interfaces:**
- Consumes: `getServiceClient` (supabase.ts), `captureFullPage` (screenshot.ts).
- Produces (consumed by Tasks 5, 6, 7):
  - `type DbSitePage`, `DbSiteCapture`, `DbSiteNote`, `DbSiteNoteReply` row types (mirror the migration columns).
  - `signedCaptureUrl(client, storagePath): Promise<string|null>` — 1h signed URL from `site-captures`.
  - `captureAndStore(client, env, page): Promise<DbSiteCapture>` — capture, upload to storage at `{tenant_id}/{page_id}/{timestamp}.png`, insert `site_captures` row, update the page's `latest_capture_id`. Marks a `failed` row and rethrows on capture error.
  - `tenantIdForSession(client, ctx): Promise<string|null>` — `ctx.data.session.tenantId` or slug fallback.

- [ ] **Step 1: Implement the helper**

Create `functions/lib/siteData.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ApiData } from "./env";
import { resolveTenantId } from "./supabase";
import { captureFullPage } from "./screenshot";

export interface DbSitePage {
  id: string;
  tenant_id: string;
  label: string;
  source_url: string;
  sort_order: number;
  latest_capture_id: string | null;
  created_at: string;
}

export interface DbSiteCapture {
  id: string;
  page_id: string;
  storage_path: string;
  image_width: number;
  image_height: number;
  status: "pending" | "ready" | "failed";
  captured_at: string;
}

export interface DbSiteNote {
  id: string;
  tenant_id: string;
  page_id: string;
  capture_id: string;
  x_pct: number;
  y_pct: number;
  body: string;
  status: "new" | "in_progress" | "done";
  created_by_staff: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface DbSiteNoteReply {
  id: string;
  note_id: string;
  author_type: "admin" | "client";
  author_id: string | null;
  body: string;
  created_at: string;
}

const BUCKET = "site-captures";

export async function signedCaptureUrl(
  client: SupabaseClient,
  storagePath: string,
): Promise<string | null> {
  const { data } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

// Resolve the tenant uuid for a client (owner/staff) session. The session id is
// authoritative; fall back to a slug lookup for legacy sessions (see middleware).
export async function tenantIdForSession(
  client: SupabaseClient,
  ctx: { data: ApiData },
): Promise<string | null> {
  const sid = ctx.data.session?.tenantId;
  if (sid) return sid;
  return ctx.data.tenant ? resolveTenantId(client, ctx.data.tenant.slug) : null;
}

// Capture a page, store the PNG, record the row, and point the page at it. On a
// capture/upload failure, persist a 'failed' capture row (best effort) and
// rethrow so the route returns 502.
export async function captureAndStore(
  client: SupabaseClient,
  env: Env,
  page: DbSitePage,
): Promise<DbSiteCapture> {
  let shot: { bytes: Uint8Array; width: number; height: number };
  try {
    shot = await captureFullPage(env, page.source_url);
  } catch (err) {
    await client.from("site_captures").insert({
      page_id: page.id,
      storage_path: "",
      image_width: 0,
      image_height: 0,
      status: "failed",
    });
    throw err;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${page.tenant_id}/${page.id}/${stamp}.png`;
  const up = await client.storage
    .from(BUCKET)
    .upload(path, shot.bytes, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error(`storage upload failed: ${up.error.message}`);

  const { data, error } = await client
    .from("site_captures")
    .insert({
      page_id: page.id,
      storage_path: path,
      image_width: shot.width,
      image_height: shot.height,
      status: "ready",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "could not record capture");

  await client.from("site_pages").update({ latest_capture_id: data.id }).eq("id", page.id);
  return data as DbSiteCapture;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add functions/lib/siteData.ts
git commit -m "feat(site-review): shared server helper for pages, captures, signed urls"
```

---

### Task 5: Admin functions — page management + capture

**Files:**
- Create: `functions/api/admin/clients/[tenantId]/site/pages/index.ts` (GET list, POST create)
- Create: `functions/api/admin/clients/[tenantId]/site/pages/[pageId].ts` (DELETE)
- Create: `functions/api/admin/clients/[tenantId]/site/pages/[pageId]/capture.ts` (POST)

**Interfaces:**
- Consumes: `getServiceClient`, `getTenantById`, `logAdminAction` (adminAuth.ts), `captureAndStore`, `signedCaptureUrl`, `DbSitePage` (siteData.ts).
- Produces JSON shapes consumed by Task 9 (`AdminSitePage` with `latestCaptureUrl`, `imageWidth`, `imageHeight`).

- [ ] **Step 1: Implement list + create**

Create `functions/api/admin/clients/[tenantId]/site/pages/index.ts`:

```ts
import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../../../lib/adminAuth";
import {
  signedCaptureUrl,
  type DbSitePage,
  type DbSiteCapture,
} from "../../../../../../lib/siteData";

async function shape(client: ReturnType<typeof getServiceClient>, p: DbSitePage) {
  let latestCaptureUrl: string | null = null;
  let imageWidth: number | null = null;
  let imageHeight: number | null = null;
  let capturedAt: string | null = null;
  if (p.latest_capture_id && client) {
    const { data } = await client
      .from("site_captures")
      .select("*")
      .eq("id", p.latest_capture_id)
      .maybeSingle();
    const cap = data as DbSiteCapture | null;
    if (cap && cap.status === "ready") {
      latestCaptureUrl = await signedCaptureUrl(client, cap.storage_path);
      imageWidth = cap.image_width;
      imageHeight = cap.image_height;
      capturedAt = cap.captured_at;
    }
  }
  return {
    id: p.id,
    label: p.label,
    sourceUrl: p.source_url,
    sortOrder: p.sort_order,
    latestCaptureUrl,
    imageWidth,
    imageHeight,
    capturedAt,
  };
}

// GET /api/admin/clients/:tenantId/site/pages
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;

  const { data } = await client
    .from("site_pages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const pages = (data as DbSitePage[] | null) ?? [];
  const shaped = await Promise.all(pages.map((p) => shape(client, p)));
  return Response.json({ pages: shaped });
};

interface CreateBody {
  label?: string;
  sourceUrl?: string;
}

// POST /api/admin/clients/:tenantId/site/pages  { label, sourceUrl }
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const label = (body.label ?? "").trim();
  const sourceUrl = (body.sourceUrl ?? "").trim();
  if (!label) return Response.json({ error: "label is required" }, { status: 400 });
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return Response.json({ error: "a valid http(s) URL is required" }, { status: 400 });
  }

  const { data, error } = await client
    .from("site_pages")
    .insert({ tenant_id: tenantId, label, source_url: sourceUrl, created_by: ctx.data.admin!.id })
    .select("*")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not create page" }, { status: 500 });
  }
  await logAdminAction(client, ctx.data.admin!.id, "site.page.create", tenantId, { label });
  return Response.json({ page: await shape(client, data as DbSitePage) }, { status: 201 });
};
```

- [ ] **Step 2: Implement delete**

Create `functions/api/admin/clients/[tenantId]/site/pages/[pageId].ts`:

```ts
import type { Env, ApiData } from "../../../../../../lib/env";
import { getServiceClient } from "../../../../../../lib/supabase";
import { logAdminAction } from "../../../../../../lib/adminAuth";

// DELETE /api/admin/clients/:tenantId/site/pages/:pageId
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const pageId = ctx.params.pageId as string;

  const { error } = await client
    .from("site_pages")
    .delete()
    .eq("id", pageId)
    .eq("tenant_id", tenantId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logAdminAction(client, ctx.data.admin!.id, "site.page.delete", tenantId, { pageId });
  return Response.json({ ok: true });
};
```

- [ ] **Step 3: Implement capture**

Create `functions/api/admin/clients/[tenantId]/site/pages/[pageId]/capture.ts`:

```ts
import type { Env, ApiData } from "../../../../../../../lib/env";
import { getServiceClient } from "../../../../../../../lib/supabase";
import { logAdminAction } from "../../../../../../../lib/adminAuth";
import { captureAndStore, signedCaptureUrl, type DbSitePage } from "../../../../../../../lib/siteData";

// POST /api/admin/clients/:tenantId/site/pages/:pageId/capture
// Re-screenshot the page now and make it the latest capture.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = ctx.params.tenantId as string;
  const pageId = ctx.params.pageId as string;

  const { data } = await client
    .from("site_pages")
    .select("*")
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const page = data as DbSitePage | null;
  if (!page) return Response.json({ error: "page not found" }, { status: 404 });

  let capture;
  try {
    capture = await captureAndStore(client, ctx.env, page);
  } catch (err) {
    const message = err instanceof Error ? err.message : "capture failed";
    return Response.json({ error: message }, { status: 502 });
  }
  await logAdminAction(client, ctx.data.admin!.id, "site.page.capture", tenantId, { pageId });
  return Response.json({
    capture: {
      url: await signedCaptureUrl(client, capture.storage_path),
      imageWidth: capture.image_width,
      imageHeight: capture.image_height,
      capturedAt: capture.captured_at,
    },
  });
};
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add functions/api/admin/clients/[tenantId]/site
git commit -m "feat(site-review): admin page management + on-demand capture endpoints"
```

---

### Task 6: Admin functions — unified notes inbox + status + replies

**Files:**
- Create: `functions/api/admin/site/notes/index.ts` (GET unified inbox)
- Create: `functions/api/admin/site/notes/[noteId].ts` (PATCH status)
- Create: `functions/api/admin/site/notes/[noteId]/replies.ts` (GET thread, POST reply)

**Interfaces:**
- Consumes: `getServiceClient`, `logAdminAction`, `DbSiteNote`, `DbSiteNoteReply`, `signedCaptureUrl`.
- Produces JSON consumed by Task 9 (`AdminFeedbackNote` with client name, page label, thumbnail URL).
- Side effect (Task 10 wires the helper): on reply/status change, call `notifyClientOfSiteUpdate(...)`.

- [ ] **Step 1: Implement the unified inbox**

Create `functions/api/admin/site/notes/index.ts`:

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { signedCaptureUrl, type DbSiteNote } from "../../../../lib/siteData";

// GET /api/admin/site/notes?status=new|in_progress|done&tenantId=...
// Unified queue across every client. Joins page label, tenant name, and a signed
// thumbnail of the capture the note sits on.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const url = new URL(ctx.request.url);
  const status = url.searchParams.get("status");
  const tenantId = url.searchParams.get("tenantId");

  let q = client
    .from("site_notes")
    .select(
      "*, site_pages(label), tenants(name), site_captures(storage_path)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  if (tenantId) q = q.eq("tenant_id", tenantId);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data as (DbSiteNote & {
    site_pages: { label: string } | null;
    tenants: { name: string } | null;
    site_captures: { storage_path: string } | null;
  })[]) ?? [];

  const notes = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      clientName: r.tenants?.name ?? "Unknown",
      pageId: r.page_id,
      pageLabel: r.site_pages?.label ?? "Page",
      captureId: r.capture_id,
      body: r.body,
      status: r.status,
      xPct: r.x_pct,
      yPct: r.y_pct,
      createdAt: r.created_at,
      thumbnailUrl: r.site_captures?.storage_path
        ? await signedCaptureUrl(client, r.site_captures.storage_path)
        : null,
    })),
  );
  return Response.json({ notes });
};
```

- [ ] **Step 2: Implement status change**

Create `functions/api/admin/site/notes/[noteId].ts`:

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import type { DbSiteNote } from "../../../../lib/siteData";

const STATUSES = new Set(["new", "in_progress", "done"]);

interface PatchBody {
  status?: string;
}

// PATCH /api/admin/site/notes/:noteId  { status }
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const noteId = ctx.params.noteId as string;

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.status || !STATUSES.has(body.status)) {
    return Response.json({ error: "invalid status" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { status: body.status };
  patch.resolved_at = body.status === "done" ? new Date().toISOString() : null;

  const { data, error } = await client
    .from("site_notes")
    .update(patch)
    .eq("id", noteId)
    .select("*")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "not found" }, { status: 404 });
  }
  const note = data as DbSiteNote;
  await logAdminAction(client, ctx.data.admin!.id, "site.note.status", note.tenant_id, {
    noteId,
    status: body.status,
  });
  // Task 10 inserts a client-facing activity row here.
  return Response.json({ ok: true, status: note.status });
};
```

- [ ] **Step 3: Implement thread read + admin reply**

Create `functions/api/admin/site/notes/[noteId]/replies.ts`:

```ts
import type { Env, ApiData } from "../../../../../lib/env";
import { getServiceClient } from "../../../../../lib/supabase";
import { logAdminAction } from "../../../../../lib/adminAuth";
import type { DbSiteNote, DbSiteNoteReply } from "../../../../../lib/siteData";

// GET /api/admin/site/notes/:noteId/replies — full thread.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const noteId = ctx.params.noteId as string;
  const { data } = await client
    .from("site_note_replies")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  return Response.json({ replies: (data as DbSiteNoteReply[] | null) ?? [] });
};

interface ReplyBody {
  body?: string;
}

// POST /api/admin/site/notes/:noteId/replies  { body } — agency reply.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const noteId = ctx.params.noteId as string;

  let payload: ReplyBody = {};
  try {
    payload = (await ctx.request.json()) as ReplyBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const text = (payload.body ?? "").trim();
  if (!text) return Response.json({ error: "reply cannot be empty" }, { status: 400 });
  if (text.length > 2000) return Response.json({ error: "reply too long" }, { status: 400 });

  const { data: noteRow } = await client
    .from("site_notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();
  const note = noteRow as DbSiteNote | null;
  if (!note) return Response.json({ error: "note not found" }, { status: 404 });

  const { data, error } = await client
    .from("site_note_replies")
    .insert({ note_id: noteId, author_type: "admin", author_id: ctx.data.admin!.id, body: text })
    .select("*")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not add reply" }, { status: 500 });
  }
  await logAdminAction(client, ctx.data.admin!.id, "site.note.reply", note.tenant_id, { noteId });
  // Task 10 inserts a client-facing activity row here.
  return Response.json({ reply: data as DbSiteNoteReply }, { status: 201 });
};
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add functions/api/admin/site
git commit -m "feat(site-review): admin unified notes inbox, status, and replies"
```

---

### Task 7: Client functions — pages, notes, replies (tenant-scoped)

**Files:**
- Create: `functions/api/site/pages.ts` (GET this client's pages + latest captures)
- Create: `functions/api/site/pages/[pageId]/notes.ts` (GET page notes, POST new note)
- Create: `functions/api/site/notes/[noteId]/replies.ts` (GET thread, POST client reply)

**Interfaces:**
- Consumes: `getServiceClient`, `tenantIdForSession`, `signedCaptureUrl`, `DbSitePage`, `DbSiteCapture`, `DbSiteNote`, `DbSiteNoteReply`.
- Note: these paths match NO rule in `functions/lib/permissions.ts`, so they are allowed for any signed-in client user (owner or staff) of the resolved tenant. The middleware already scopes to the caller's tenant; every query below also filters by `tenant_id` for defense in depth. (Deliberate v1 simplification: My Site is not capability-gated. See 00-DESIGN out-of-scope.)

- [ ] **Step 1: Implement pages list**

Create `functions/api/site/pages.ts`:

```ts
import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import {
  tenantIdForSession,
  signedCaptureUrl,
  type DbSitePage,
  type DbSiteCapture,
} from "../../lib/siteData";

// GET /api/site/pages — the signed-in client's pages, each with its latest
// ready capture (signed URL + dimensions) so the board can render immediately.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ pages: [] });
  const tenantId = await tenantIdForSession(client, ctx);
  if (!tenantId) return Response.json({ pages: [] });

  const { data } = await client
    .from("site_pages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const pages = (data as DbSitePage[] | null) ?? [];

  const shaped = await Promise.all(
    pages.map(async (p) => {
      let capture: DbSiteCapture | null = null;
      if (p.latest_capture_id) {
        const { data: c } = await client
          .from("site_captures")
          .select("*")
          .eq("id", p.latest_capture_id)
          .maybeSingle();
        capture = c as DbSiteCapture | null;
      }
      const ready = capture && capture.status === "ready" ? capture : null;
      return {
        id: p.id,
        label: p.label,
        captureId: ready?.id ?? null,
        imageUrl: ready ? await signedCaptureUrl(client, ready.storage_path) : null,
        imageWidth: ready?.image_width ?? null,
        imageHeight: ready?.image_height ?? null,
        capturedAt: ready?.captured_at ?? null,
      };
    }),
  );
  return Response.json({ pages: shaped });
};
```

- [ ] **Step 2: Implement page notes (read + create)**

Create `functions/api/site/pages/[pageId]/notes.ts`:

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { tenantIdForSession, type DbSiteNote, type DbSitePage } from "../../../../lib/siteData";

// GET /api/site/pages/:pageId/notes — every note on this page (newest first).
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ notes: [] });
  const tenantId = await tenantIdForSession(client, ctx);
  if (!tenantId) return Response.json({ notes: [] });
  const pageId = ctx.params.pageId as string;

  const { data } = await client
    .from("site_notes")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .order("created_at", { ascending: false });
  return Response.json({ notes: (data as DbSiteNote[] | null) ?? [] });
};

interface CreateBody {
  captureId?: string;
  xPct?: number;
  yPct?: number;
  body?: string;
}

// POST /api/site/pages/:pageId/notes  { captureId, xPct, yPct, body }
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = await tenantIdForSession(client, ctx);
  if (!tenantId) return Response.json({ error: "no tenant" }, { status: 400 });
  const pageId = ctx.params.pageId as string;

  let payload: CreateBody = {};
  try {
    payload = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const text = (payload.body ?? "").trim();
  const x = Number(payload.xPct);
  const y = Number(payload.yPct);
  if (!text) return Response.json({ error: "note cannot be empty" }, { status: 400 });
  if (text.length > 2000) return Response.json({ error: "note too long" }, { status: 400 });
  if (!payload.captureId) return Response.json({ error: "captureId required" }, { status: 400 });
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
    return Response.json({ error: "coordinates out of range" }, { status: 400 });
  }

  // Confirm the page belongs to this tenant before writing.
  const { data: pageRow } = await client
    .from("site_pages")
    .select("id")
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!(pageRow as Pick<DbSitePage, "id"> | null)) {
    return Response.json({ error: "page not found" }, { status: 404 });
  }

  const { data, error } = await client
    .from("site_notes")
    .insert({
      tenant_id: tenantId,
      page_id: pageId,
      capture_id: payload.captureId,
      x_pct: x,
      y_pct: y,
      body: text,
      created_by_staff: ctx.data.session?.staffId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not save note" }, { status: 500 });
  }
  // Task 10 notifies admins of the new note here.
  return Response.json({ note: data as DbSiteNote }, { status: 201 });
};
```

- [ ] **Step 3: Implement client thread read + reply**

Create `functions/api/site/notes/[noteId]/replies.ts`:

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { tenantIdForSession, type DbSiteNote, type DbSiteNoteReply } from "../../../../lib/siteData";

// Confirm the note belongs to the caller's tenant. Returns the note or null.
async function ownNote(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  noteId: string,
  tenantId: string,
): Promise<DbSiteNote | null> {
  const { data } = await client
    .from("site_notes")
    .select("*")
    .eq("id", noteId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as DbSiteNote | null) ?? null;
}

// GET /api/site/notes/:noteId/replies
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ replies: [] });
  const tenantId = await tenantIdForSession(client, ctx);
  if (!tenantId) return Response.json({ replies: [] });
  const noteId = ctx.params.noteId as string;
  if (!(await ownNote(client, noteId, tenantId))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const { data } = await client
    .from("site_note_replies")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  return Response.json({ replies: (data as DbSiteNoteReply[] | null) ?? [] });
};

interface ReplyBody {
  body?: string;
}

// POST /api/site/notes/:noteId/replies  { body } — client reply.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenantId = await tenantIdForSession(client, ctx);
  if (!tenantId) return Response.json({ error: "no tenant" }, { status: 400 });
  const noteId = ctx.params.noteId as string;
  if (!(await ownNote(client, noteId, tenantId))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  let payload: ReplyBody = {};
  try {
    payload = (await ctx.request.json()) as ReplyBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const text = (payload.body ?? "").trim();
  if (!text) return Response.json({ error: "reply cannot be empty" }, { status: 400 });
  if (text.length > 2000) return Response.json({ error: "reply too long" }, { status: 400 });

  const { data, error } = await client
    .from("site_note_replies")
    .insert({
      note_id: noteId,
      author_type: "client",
      author_id: ctx.data.session?.staffId ?? null,
      body: text,
    })
    .select("*")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "could not add reply" }, { status: 500 });
  }
  return Response.json({ reply: data as DbSiteNoteReply }, { status: 201 });
};
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add functions/api/site
git commit -m "feat(site-review): client-facing pages, notes, and reply endpoints"
```

---

### Task 8: Frontend API types + data hooks

**Files:**
- Modify: `src/lib/api.ts` (add Site Review response interfaces at end)
- Create: `src/hooks/useSiteReview.ts`

**Interfaces:**
- Consumes: `api` (api.ts), `useQuery`/`useMutation`/`useQueryClient` (TanStack).
- Produces hooks consumed by Tasks 9 + admin UI:
  - Client: `useSitePages(enabled)`, `useSitePageNotes(pageId, enabled)`, `useCreateSiteNote()`, `useSiteNoteReplies(noteId, enabled)`, `useCreateSiteReply()`.
  - Admin: `useAdminSitePages(tenantId, enabled)`, `useCreateAdminSitePage()`, `useDeleteAdminSitePage()`, `useRecaptureAdminSitePage()`, `useAdminFeedbackNotes(filters, enabled)`, `useAdminNoteReplies(noteId, enabled)`, `useCreateAdminNoteReply()`, `useSetAdminNoteStatus()`.

- [ ] **Step 1: Add response types to `src/lib/api.ts`**

Append:

```ts
import type { SiteNoteStatus } from "./siteReview";

export interface ApiSitePage {
  id: string;
  label: string;
  captureId: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  capturedAt: string | null;
}

export interface ApiSiteNote {
  id: string;
  page_id: string;
  capture_id: string;
  x_pct: number;
  y_pct: number;
  body: string;
  status: SiteNoteStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface ApiSiteReply {
  id: string;
  note_id: string;
  author_type: "admin" | "client";
  body: string;
  created_at: string;
}

export interface ApiAdminSitePage {
  id: string;
  label: string;
  sourceUrl: string;
  sortOrder: number;
  latestCaptureUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  capturedAt: string | null;
}

export interface ApiAdminFeedbackNote {
  id: string;
  tenantId: string;
  clientName: string;
  pageId: string;
  pageLabel: string;
  captureId: string;
  body: string;
  status: SiteNoteStatus;
  xPct: number;
  yPct: number;
  createdAt: string;
  thumbnailUrl: string | null;
}
```

- [ ] **Step 2: Create the hooks**

Create `src/hooks/useSiteReview.ts` with the queries/mutations below (follow the invalidation conventions already in `useApi.ts`):

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ApiSitePage,
  type ApiSiteNote,
  type ApiSiteReply,
  type ApiAdminSitePage,
  type ApiAdminFeedbackNote,
} from "../lib/api";
import type { SiteNoteStatus } from "../lib/siteReview";

/* ---------- client side ---------- */

export function useSitePages(enabled: boolean) {
  return useQuery({
    queryKey: ["site", "pages"],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<{ pages: ApiSitePage[] }>("/api/site/pages"),
  });
}

export function useSitePageNotes(pageId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["site", "page", pageId, "notes"],
    enabled: enabled && !!pageId,
    staleTime: 15_000,
    queryFn: () => api<{ notes: ApiSiteNote[] }>(`/api/site/pages/${pageId}/notes`),
  });
}

export function useCreateSiteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      pageId: string;
      captureId: string;
      xPct: number;
      yPct: number;
      body: string;
    }) =>
      api<{ note: ApiSiteNote }>(`/api/site/pages/${input.pageId}/notes`, {
        method: "POST",
        body: JSON.stringify({
          captureId: input.captureId,
          xPct: input.xPct,
          yPct: input.yPct,
          body: input.body,
        }),
      }),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["site", "page", v.pageId, "notes"] }),
  });
}

export function useSiteNoteReplies(noteId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["site", "note", noteId, "replies"],
    enabled: enabled && !!noteId,
    staleTime: 10_000,
    queryFn: () => api<{ replies: ApiSiteReply[] }>(`/api/site/notes/${noteId}/replies`),
  });
}

export function useCreateSiteReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { noteId: string; body: string }) =>
      api<{ reply: ApiSiteReply }>(`/api/site/notes/${input.noteId}/replies`, {
        method: "POST",
        body: JSON.stringify({ body: input.body }),
      }),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["site", "note", v.noteId, "replies"] }),
  });
}

/* ---------- admin side ---------- */

export function useAdminSitePages(tenantId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "site", tenantId, "pages"],
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
    queryFn: () =>
      api<{ pages: ApiAdminSitePage[] }>(`/api/admin/clients/${tenantId}/site/pages`),
  });
}

export function useCreateAdminSitePage(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; sourceUrl: string }) =>
      api<{ page: ApiAdminSitePage }>(`/api/admin/clients/${tenantId}/site/pages`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "site", tenantId, "pages"] }),
  });
}

export function useDeleteAdminSitePage(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) =>
      api<{ ok: boolean }>(`/api/admin/clients/${tenantId}/site/pages/${pageId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "site", tenantId, "pages"] }),
  });
}

export function useRecaptureAdminSitePage(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) =>
      api<{ capture: { url: string; imageWidth: number; imageHeight: number } }>(
        `/api/admin/clients/${tenantId}/site/pages/${pageId}/capture`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "site", tenantId, "pages"] }),
  });
}

export function useAdminFeedbackNotes(
  filters: { status?: string; tenantId?: string },
  enabled: boolean,
) {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.tenantId) qs.set("tenantId", filters.tenantId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return useQuery({
    queryKey: ["admin", "site", "feedback", filters.status ?? "all", filters.tenantId ?? "all"],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: () => api<{ notes: ApiAdminFeedbackNote[] }>(`/api/admin/site/notes${suffix}`),
  });
}

export function useAdminNoteReplies(noteId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "site", "note", noteId, "replies"],
    enabled: enabled && !!noteId,
    staleTime: 10_000,
    queryFn: () => api<{ replies: ApiSiteReply[] }>(`/api/admin/site/notes/${noteId}/replies`),
  });
}

export function useCreateAdminNoteReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { noteId: string; body: string }) =>
      api<{ reply: ApiSiteReply }>(`/api/admin/site/notes/${input.noteId}/replies`, {
        method: "POST",
        body: JSON.stringify({ body: input.body }),
      }),
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["admin", "site", "note", v.noteId, "replies"] }),
  });
}

export function useSetAdminNoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { noteId: string; status: SiteNoteStatus }) =>
      api<{ ok: boolean; status: SiteNoteStatus }>(`/api/admin/site/notes/${input.noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "site", "feedback"] }),
  });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/lib/api.ts src/hooks/useSiteReview.ts
git commit -m "feat(site-review): frontend api types + query/mutation hooks"
```

---

### Task 9: Client UI — annotation board (the centerpiece)

**Files:**
- Create: `src/components/site/SiteAnnotationBoard.tsx` (image canvas + pins + composer + thread)
- Create: `src/routes/MySite.tsx` (page list + selected page board)
- Modify: `src/lib/nav.ts` (add the My Site nav entry)
- Modify: `src/App.tsx` (add the `/site` route)

**Interfaces:**
- Consumes: hooks from Task 8, `pinFromClick`/`validateNoteBody`/`STATUS_LABEL` (siteReview.ts), `Shell`, `EmptyState`, toast.
- Produces: the `/site` route reachable from nav.

- [ ] **Step 1: Add the nav entry**

In `src/lib/nav.ts`: import `Globe` from `lucide-react`, and add to `NAV` (after the Billing entry, before Activity):

```ts
  { to: "/site", label: "My Site", icon: Globe },
```

(No `capability` and no `ownerOnly`, so it always shows, like Settings. Deliberate v1 choice.)

- [ ] **Step 2: Build the annotation board component**

Create `src/components/site/SiteAnnotationBoard.tsx`. This is the core interaction: a scrollable wrapper around the full-page image; click on the image to place a draft pin and compose a note; existing pins render as numbered dots that open a thread popover. Key logic (use exactly this for placement and rendering):

```tsx
import { useRef, useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import type { ApiSitePage, ApiSiteNote } from "../../lib/api";
import {
  pinFromClick,
  validateNoteBody,
  STATUS_LABEL,
  type SiteNoteStatus,
} from "../../lib/siteReview";
import {
  useSitePageNotes,
  useCreateSiteNote,
  useSiteNoteReplies,
  useCreateSiteReply,
} from "../../hooks/useSiteReview";

const STATUS_TINT: Record<SiteNoteStatus, string> = {
  new: "var(--brand-primary)",
  in_progress: "#d97706",
  done: "#16a34a",
};

export default function SiteAnnotationBoard({ page }: { page: ApiSitePage }) {
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ xPct: number; yPct: number } | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const notesQuery = useSitePageNotes(page.id, true);
  const createNote = useCreateSiteNote();
  const notes = notesQuery.data?.notes ?? [];

  function handleImageClick(e: React.MouseEvent) {
    if (!imgWrapRef.current || !page.captureId) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    setDraft(pinFromClick(e, rect));
    setOpenNoteId(null);
    setDraftBody("");
  }

  async function submitDraft() {
    if (!draft || !page.captureId) return;
    const v = validateNoteBody(draftBody);
    if (!v.ok) return;
    await createNote.mutateAsync({
      pageId: page.id,
      captureId: page.captureId,
      xPct: draft.xPct,
      yPct: draft.yPct,
      body: v.body,
    });
    setDraft(null);
    setDraftBody("");
  }

  if (!page.imageUrl) {
    return (
      <div className="p-8 text-center text-[var(--text-muted)]">
        This page has not been captured yet. Check back shortly.
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="mb-3 flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
        <MessageSquarePlus size={15} /> Tap anywhere on the page to leave a note.
      </p>
      <div
        ref={imgWrapRef}
        onClick={handleImageClick}
        className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-[var(--border)]"
      >
        <img src={page.imageUrl} alt={page.label} className="block w-full select-none" draggable={false} />

        {notes.map((n, i) => (
          <Pin
            key={n.id}
            index={i + 1}
            note={n}
            open={openNoteId === n.id}
            onToggle={(e) => {
              e.stopPropagation();
              setOpenNoteId(openNoteId === n.id ? null : n.id);
              setDraft(null);
            }}
            onClose={() => setOpenNoteId(null)}
          />
        ))}

        {draft && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${draft.xPct * 100}%`, top: `${draft.yPct * 100}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-5 w-5 rounded-full border-2 border-white shadow"
                 style={{ background: STATUS_TINT.new }} />
            <div className="mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
              <textarea
                autoFocus
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="What would you like changed here?"
                className="h-20 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-[13px] text-[var(--text)] outline-none"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setDraft(null)}
                        className="rounded-lg px-2.5 py-1 text-[12.5px] text-[var(--text-muted)]">
                  Cancel
                </button>
                <button onClick={submitDraft} disabled={createNote.isPending || !draftBody.trim()}
                        className="rounded-lg px-3 py-1 text-[12.5px] font-medium text-white disabled:opacity-50"
                        style={{ background: "var(--brand-primary)" }}>
                  {createNote.isPending ? "Saving..." : "Add note"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Pin({
  index,
  note,
  open,
  onToggle,
  onClose,
}: {
  index: number;
  note: ApiSiteNote;
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  const replies = useSiteNoteReplies(note.id, open);
  const createReply = useCreateSiteReply();
  const [text, setText] = useState("");

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${note.x_pct * 100}%`, top: `${note.y_pct * 100}%` }}
    >
      <button
        onClick={onToggle}
        className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow"
        style={{ background: STATUS_TINT[note.status] }}
      >
        {index}
      </button>
      {open && (
        <div className="mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg"
             onClick={(e) => e.stopPropagation()}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {STATUS_LABEL[note.status]}
            </span>
            <button onClick={onClose} className="text-[var(--text-faint)]"><X size={14} /></button>
          </div>
          <p className="text-[13px] text-[var(--text)]">{note.body}</p>

          <div className="mt-2 space-y-1.5">
            {(replies.data?.replies ?? []).map((r) => (
              <div key={r.id} className="rounded-lg px-2 py-1.5 text-[12.5px]"
                   style={{
                     background: r.author_type === "admin" ? "var(--brand-primary-tint)" : "var(--surface-2)",
                     color: "var(--text)",
                   }}>
                <span className="mr-1 font-semibold">
                  {r.author_type === "admin" ? "Hauck" : "You"}:
                </span>
                {r.body}
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Reply..."
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12.5px] text-[var(--text)] outline-none"
            />
            <button
              disabled={!text.trim() || createReply.isPending}
              onClick={async () => {
                if (!text.trim()) return;
                await createReply.mutateAsync({ noteId: note.id, body: text.trim() });
                setText("");
              }}
              className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--brand-primary)" }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build the My Site route**

Create `src/routes/MySite.tsx`: a `Shell`-wrapped screen with a header, a horizontal page selector (buttons from `useSitePages`), and the `SiteAnnotationBoard` for the selected page. Use `EmptyState` when there are no pages ("Your site pages will appear here once we add them."). Follow the header/spacing pattern from an existing route such as `src/routes/Billing.tsx`.

```tsx
import { useState } from "react";
import Shell from "../components/Shell";
import EmptyState from "../components/EmptyState";
import SiteAnnotationBoard from "../components/site/SiteAnnotationBoard";
import { useSitePages } from "../hooks/useSiteReview";

export default function MySite() {
  const { data, isLoading } = useSitePages(true);
  const pages = data?.pages ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = pages.find((p) => p.id === activeId) ?? pages[0] ?? null;

  return (
    <Shell>
      <div className="px-4 pt-5 lg:px-8">
        <h1 className="font-display text-[22px] font-semibold text-[var(--text)]">My Site</h1>
        <p className="mt-0.5 text-[13.5px] text-[var(--text-muted)]">
          Review your pages and leave notes for anything you would like changed.
        </p>

        {!isLoading && pages.length === 0 && (
          <div className="mt-8">
            <EmptyState title="No pages yet" body="Your site pages will appear here once we add them." />
          </div>
        )}

        {pages.length > 0 && (
          <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium"
                  style={
                    active?.id === p.id
                      ? { background: "var(--brand-primary-tint)", color: "var(--brand-text)" }
                      : { color: "var(--text-muted)" }
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-3 pb-12">{active && <SiteAnnotationBoard page={active} />}</div>
          </>
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 4: Wire the route**

In `src/App.tsx`: import `MySite` and add inside `<Routes>` (next to the other client routes):

```tsx
<Route path="/site" element={<ProtectedRoute><MySite /></ProtectedRoute>} />
```

- [ ] **Step 5: Verify in the running app**

Run: `npm run typecheck` (expect clean), then `npm run dev:full` and sign in as a client. Confirm "My Site" appears in the sidebar and bottom bar, the page list renders, clicking the image opens the composer, and a saved note appears as a numbered pin that opens a thread. (Pages must exist first; create one via Task 9-admin or seed manually.)

- [ ] **Step 6: Commit**

```bash
git add src/components/site src/routes/MySite.tsx src/lib/nav.ts src/App.tsx
git commit -m "feat(site-review): client My Site annotation board + nav + route"
```

---

### Task 10: Admin UI — Site Feedback inbox + per-client Site tab

**Files:**
- Create: `src/routes/admin/AdminSiteFeedback.tsx` (unified inbox)
- Create: `src/components/admin/AdminSitePagesPanel.tsx` (manage pages + recapture, for the client detail tab)
- Modify: `src/App.tsx` (add `/admin/site-feedback` route)
- Modify: `src/routes/admin/AdminLayout.tsx` (add "Site Feedback" to the admin nav)
- Modify: `src/routes/admin/AdminClientDetail.tsx` (add a "Site" tab rendering `AdminSitePagesPanel`)

**Interfaces:**
- Consumes: admin hooks from Task 8, `STATUS_LABEL`/`STATUS_ORDER`/`canTransition` (siteReview.ts).

- [ ] **Step 1: Build the unified inbox**

Create `src/routes/admin/AdminSiteFeedback.tsx`: a filterable queue from `useAdminFeedbackNotes`. Each row shows client name, page label, note snippet, a status pill, and the thumbnail. Selecting a row opens a detail panel (reuse the same layout idiom as `AdminTasks.tsx`) with: the note body, a status control (buttons for each `STATUS_ORDER` value, calling `useSetAdminNoteStatus`, guarded by `canTransition`), the reply thread (`useAdminNoteReplies`), and a reply box (`useCreateAdminNoteReply`). Filter controls: status (all/new/in_progress/done) and optionally client. Use the existing admin page chrome from `AdminLayout`.

Minimum row + status control logic:

```tsx
import { useState } from "react";
import { useAdminFeedbackNotes, useSetAdminNoteStatus } from "../../hooks/useSiteReview";
import { STATUS_ORDER, STATUS_LABEL, canTransition, type SiteNoteStatus } from "../../lib/siteReview";

export default function AdminSiteFeedback() {
  const [status, setStatus] = useState<string>("new");
  const { data } = useAdminFeedbackNotes({ status: status === "all" ? undefined : status }, true);
  const setNoteStatus = useSetAdminNoteStatus();
  const notes = data?.notes ?? [];

  return (
    <div className="px-6 py-6">
      <h1 className="font-display text-[20px] font-semibold text-[var(--text)]">Site Feedback</h1>
      <div className="mt-3 flex gap-2">
        {["new", "in_progress", "done", "all"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
                  className="rounded-lg px-3 py-1.5 text-[13px]"
                  style={status === s ? { background: "var(--brand-primary-tint)", color: "var(--brand-text)" } : { color: "var(--text-muted)" }}>
            {s === "all" ? "All" : STATUS_LABEL[s as SiteNoteStatus]}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            {n.thumbnailUrl && (
              <img src={n.thumbnailUrl} alt="" className="h-12 w-12 rounded-lg object-cover object-top" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[var(--text-faint)]">{n.clientName} · {n.pageLabel}</div>
              <div className="truncate text-[13.5px] text-[var(--text)]">{n.body}</div>
            </div>
            <div className="flex gap-1">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  disabled={!canTransition(n.status, s) || setNoteStatus.isPending}
                  onClick={() => setNoteStatus.mutate({ noteId: n.id, status: s })}
                  className="rounded-md px-2 py-1 text-[11.5px] font-medium disabled:opacity-40"
                  style={n.status === s ? { background: "var(--brand-primary)", color: "white" } : { background: "var(--surface-2)", color: "var(--text-muted)" }}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ))}
        {notes.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Nothing here.</p>}
      </div>
    </div>
  );
}
```

(The reply thread panel reuses `useAdminNoteReplies` + `useCreateAdminNoteReply` exactly like the client `Pin` thread; add it as a side panel or expandable row following the `AdminTasks.tsx` detail pattern.)

- [ ] **Step 2: Build the per-client pages panel**

Create `src/components/admin/AdminSitePagesPanel.tsx`: takes a `tenantId`, lists pages via `useAdminSitePages`, shows each page's thumbnail + label + URL + "Recapture" button (`useRecaptureAdminSitePage`) + delete (`useDeleteAdminSitePage`), and an add-page form (label + URL → `useCreateAdminSitePage`). Use the form/list idiom already in the staff section of `AdminClientDetail.tsx`.

- [ ] **Step 3: Wire admin route + nav + tab**

- In `src/App.tsx`, add: `<Route path="/admin/site-feedback" element={<AdminRoute><AdminSiteFeedback /></AdminRoute>} />` (import `AdminSiteFeedback`).
- In `src/routes/admin/AdminLayout.tsx`, add a nav link to `/admin/site-feedback` labeled "Site Feedback" following the existing admin nav-link pattern in that file (icon `MessageSquare`).
- In `src/routes/admin/AdminClientDetail.tsx`, add a "Site" tab to the existing tab set that renders `<AdminSitePagesPanel tenantId={...} />`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` (clean), then in `npm run dev:full` as an admin: add a page URL for a client, Recapture (requires `SCREENSHOT_ACCESS_KEY` in dev vars), confirm the thumbnail appears, then as that client leave a note and confirm it shows in Site Feedback with working status buttons and replies.

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin/AdminSiteFeedback.tsx src/components/admin/AdminSitePagesPanel.tsx src/App.tsx src/routes/admin/AdminLayout.tsx src/routes/admin/AdminClientDetail.tsx
git commit -m "feat(site-review): admin Site Feedback inbox + per-client pages panel"
```

---

### Task 11: Notifications (in-app)

**Files:**
- Create: `functions/lib/siteNotify.ts`
- Modify: `functions/api/site/pages/[pageId]/notes.ts` (notify admins on new note)
- Modify: `functions/api/admin/site/notes/[noteId].ts` (notify client on status change)
- Modify: `functions/api/admin/site/notes/[noteId]/replies.ts` (notify client on reply)
- Modify: `src/lib/activityLabels.ts` (labels for the new actions)

**Interfaces:**
- Produces: `notifyClientOfSiteUpdate(client, tenantId, summary)` and `countNewNotesForAdmin(client)` (used by an admin badge if desired). Client notifications reuse `activity_log` (the existing bell + feed read it; see `functions/api/notifications/index.ts`).

- [ ] **Step 1: Implement the notify helper**

Create `functions/lib/siteNotify.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

// Surface a Site Review update to the client by writing an activity_log row for
// their tenant. The existing notification center (GET /api/notifications) and the
// bell already read activity_log, so this lights up the client's feed with no new
// plumbing. action drives the label in src/lib/activityLabels.ts.
export async function notifyClientOfSiteUpdate(
  client: SupabaseClient,
  tenantId: string,
  action: "site.reply" | "site.status",
  summary: string,
): Promise<void> {
  try {
    await client.from("activity_log").insert({
      tenant_id: tenantId,
      action,
      payload: { summary },
    });
  } catch {
    // best effort: a notification must never break the action it announces
  }
}
```

- [ ] **Step 2: Call it on reply + status change**

In `functions/api/admin/site/notes/[noteId]/replies.ts`, after the successful admin reply insert, add:

```ts
await notifyClientOfSiteUpdate(client, note.tenant_id, "site.reply", "Hauck replied to your site note.");
```

In `functions/api/admin/site/notes/[noteId].ts`, after a successful status update, add:

```ts
await notifyClientOfSiteUpdate(client, note.tenant_id, "site.status", `Your site note is now ${note.status.replace("_", " ")}.`);
```

(Import `notifyClientOfSiteUpdate` in both.)

- [ ] **Step 3: Admin-side new-note signal**

In `functions/api/site/pages/[pageId]/notes.ts`, the admin inbox already polls every 30s (`useAdminFeedbackNotes` `refetchInterval`), so new notes surface without extra writes. Add a one-line comment where the "Task 10 notifies admins" marker was, noting the poll is the v1 admin signal and cross-device admin push is v2 (per 00-DESIGN). No code needed here.

- [ ] **Step 4: Add activity labels**

In `src/lib/activityLabels.ts`, add label mappings for `site.reply` ("Site note reply") and `site.status` ("Site note update") following the existing map shape in that file, so the bell/feed render them with friendly text instead of the raw action key.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add functions/lib/siteNotify.ts functions/api/site/pages/[pageId]/notes.ts functions/api/admin/site src/lib/activityLabels.ts
git commit -m "feat(site-review): in-app notifications for replies and status changes"
```

---

### Task 12: Verify, screenshot proof, ship

**Files:** none (verification + integration)

- [ ] **Step 1: Full typecheck + unit tests + build**

Run: `pnpm test && npm run typecheck && npm run build`
Expected: tests PASS, typecheck clean, production build succeeds.

- [ ] **Step 2: End-to-end smoke (Playwright / manual)**

With `SCREENSHOT_ACCESS_KEY` set in dev vars and `npm run dev:full` running:
1. As admin: add a page (real client URL), Recapture, confirm thumbnail.
2. As that client: open My Site, drop a note on the image, reply on it.
3. As admin: see it in Site Feedback, change status to In progress, reply.
4. As client: confirm the bell shows the update and the pin reflects the new status.

Capture Playwright screenshots of the client board and the admin inbox as visual proof (per build rules M9). Save them only long enough to confirm; do not commit screenshots.

- [ ] **Step 3: Confirm env requirement is documented**

Add `SCREENSHOT_ACCESS_KEY` to `.env.example` with a comment, so deploys know it is required for capture.

```bash
git add .env.example
git commit -m "docs(site-review): document SCREENSHOT_ACCESS_KEY requirement"
```

- [ ] **Step 4: Ship**

Push the branch, open a PR (or merge per `finishing-a-development-branch`), watch the Cloudflare deploy, and smoke-test the live URL. Set `SCREENSHOT_ACCESS_KEY` in the Cloudflare Pages project env before relying on capture in production.

---

## Self-Review

**Spec coverage:**
- Snapshot board view → Tasks 3, 4, 9. ✓
- Auto-capture from URL (on-demand MVP) → Tasks 3, 4, 5. ✓ (nightly = v2, out of scope.)
- Versioned captures + pins bound to capture (no drift) → migration `capture_id` FK + `x_pct/y_pct` (Task 1), enforced on create (Task 7). ✓
- Tracked notes with status + replies (two-way) → Tasks 6, 7, 9, 10. ✓
- Unified admin inbox + per-client board → Task 10. ✓
- Notifications reuse existing center → Task 11. ✓
- Private storage + signed URLs → Tasks 1, 4. ✓

**Placeholder scan:** No "TBD"/"handle errors appropriately" left. UI tasks 9-10 give full code for the novel logic (pin placement, thread, status control) and name the exact existing components to mirror for surrounding chrome, which is concrete and reviewable.

**Type consistency:** `SiteNoteStatus` is defined once (Task 2) and imported everywhere. DB row types (`DbSite*`, Task 4) and API shapes (`ApiSite*`/`ApiAdmin*`, Task 8) are distinct by design (snake_case DB vs camelCase API) and used consistently. Hook names in Task 8 match their call sites in Tasks 9-10. Capture JSON fields (`imageUrl`/`imageWidth`/`captureId`) match between Task 5/7 producers and Task 9 consumers.

**Out-of-scope confirmed:** live/iframe/proxy annotation, nightly cron capture, manual upload fallback, capability-gating My Site, cross-device admin push. All deferred per 00-DESIGN.
