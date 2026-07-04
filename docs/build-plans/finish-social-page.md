# Finish the Social Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Run every code task in the existing `social-connections-wizard` worktree (branch `worktree-social-connections-wizard`), which already carries the connect hub. App root: `command-center/app`.

**Goal:** Take the client Social section from "connect-only" to fully real: a connected client sees their actual connected accounts, real scheduled/published posts, a real month calendar, and can create/schedule a real post from the composer, all through their GoHighLevel sub-account.

**Architecture:** The Command Center is a layer over GoHighLevel. The connect hub (already built, Phase 0) OAuths Facebook/Instagram/Google into the client's GHL sub-account. This plan adds the read + write data layer on top: Pages Functions under `functions/api/social/*` call GHL's Social Planner API via the existing `ghlFetch`/`ghlJson` helper; React hooks feed the five Social route components. Real session -> `api()` -> Pages Function -> GHL; demo session -> auto-registered demo handler. A real client never sees fabricated posts.

**Tech Stack:** React + Vite (client), Cloudflare Pages Functions (`/api/*`), GoHighLevel LeadConnector API (`services.leadconnectorhq.com`, Version `2021-07-28`), `functions/lib/ghl.ts`, `@tanstack/react-query`, vitest.

## Global Constraints

- **White-label:** Never name GoHighLevel / "GHL" / LeadConnector in any client-facing copy, status text, or error. (Standing policy: `project_team_tab_and_ghl_hidden`.)
- **No em dashes** anywhere: UI text, copy, comments, docs. Use commas, periods, parentheses, colons.
- **Golden rule:** a real (connected) client only ever sees real data. Zero posts renders an honest empty state, never demo rows, never a fabricated number.
- **Tenant from session:** every endpoint reads `ctx.data.tenant` (`ghl_token`, `ghl_location_id`); never hardcode a location. Set by `functions/api/_middleware.ts`.
- **GHL API version:** `2021-07-28` (already the `ghlFetch` default).
- **Reuse `ghlFetch`/`ghlJson`**; do not open new fetch wrappers. Keep social-planner helpers in `functions/lib/social.ts`.
- **Wiring contract:** real -> `api('/api/social/...')`; demo -> auto-registered handler in `src/demo/handlers/social.ts` (never edit `src/demo/handler.ts` or `src/demo/data.ts`).
- **TDD:** failing test first for every endpoint and pure helper. Commit after each green task.
- **AI is out of scope this version** (Jake's call, 2026-07-03): captions, ideas, "Plan my month", Rewrite stay gated/disabled. Do not build `/api/social/generate` or touch `ANTHROPIC_API_KEY`.

---

## Proven Task 0 findings (2026-07-03) — do NOT re-probe these

Probed live with the Willis tenant token (`GHL_TOKEN`, `pit-e920e3…`, carries `socialplanner/*`). Confirmed:

- `GET /social-media-posting/{locationId}/accounts` -> **200**. Connected accounts under `results.accounts` (each has `platform` string: facebook / instagram / google). Empty today: `{ results: { accounts: [], groups: [] } }`.
- `GET /users/?locationId=` -> **200** (user id for OAuth attach).
- `GET /social-media-posting/oauth/{facebook|instagram|google}/start?locationId=&userId=` -> **302** to the provider consent page. (Built in Phase 0.)
- `POST /social-media-posting/{locationId}/posts/list` -> **authorized** (returned 422 only because `limit` and `skip` must be **number strings**, e.g. `"10"`, `"0"`).
- Version header `2021-07-28` works for all.

STILL UNPROVEN (resolved in Task 1's spike): the posts/list response body shape (per-post fields, status enum, date fields), the create-post body shape, and delete. These require a live probe against the TEST sub-account before their handlers are trusted.

---

## File Structure

**Create (backend):**
- `functions/lib/social.ts` — types + `fetchSocialAccounts`, `fetchSocialPosts`, `createSocialPost`, `deleteSocialPost`, and pure mappers (platform normalizer, GHL post -> `SocialPost`).
- `functions/api/social/accounts.ts` — `GET` connected accounts + `connected` boolean.
- `functions/api/social/posts/index.ts` — `GET` list (status/from/to), `POST` create/schedule.
- `functions/api/social/posts/[postId].ts` — `DELETE` a post.
- Tests: `functions/lib/social.test.ts`, `functions/api/social/posts/index.test.ts`.

**Create (frontend):**
- `src/lib/socialData.ts` — client `SocialAccount`/`SocialPost` types + pure mappers (post -> up-next row, posts -> calendar cells, posts -> KPI counts). Tested.
- `src/hooks/useSocial.ts` — `useSocialAccounts`, `useSocialPosts`, `useCreatePost`, `useDeletePost`.
- `src/demo/handlers/social.ts` — auto-registered demo cases for the new paths.
- Test: `src/lib/socialData.test.ts`.

**Modify (frontend routes — the five tabs + composer):**
- `src/routes/social/SocialOverview.tsx`, `SocialPosts.tsx`, `SocialCalendar.tsx`, `SocialInsights.tsx`.
- `src/components/social/SocialComposerDialog.tsx`.
- `src/routes/social/SocialIdeas.tsx` — untouched (AI, out of scope; stays demo + not-connected).

**Demo data:** centralize the existing route-file sample arrays into `src/lib/socialDemo.ts` so the route demo branches and the demo handler share one source.

---

## Phase 0: Ship the connect hub + connect the accounts (mostly manual)

The connect hub is built and committed on this branch (`f5a2a4c`), verified (typecheck, 162 tests, build). This phase makes it live and gets real accounts connected, which every later task depends on.

- [ ] **Step 1 (Jake):** Put the social-scoped token (`pit-e920e3…`, already in Doppler `GHL_TOKEN`) into Willis's runtime so the live app uses it. Simplest: Admin -> Clients -> Willis -> "GHL token" field -> paste -> save. (Agent is blocked from Cloudflare/Doppler writes and the admin write is behind Jake's login.)
- [ ] **Step 2 (agent, on Jake's "ship it"):** From `command-center/app`, stage the connect-hub files, ensure `npm test` + `npm run build` are green, push `worktree-social-connections-wizard` to `main` (rebase first), watch the Cloudflare deploy, confirm the live bundle hash changed: `curl -s https://hauck-dashboard.pages.dev/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'`.
- [ ] **Step 3 (Jake):** On the live app, open `/company/connections`, click Connect Facebook, Connect Instagram, Connect Google, and complete each provider consent. Confirm each card flips to Connected.
- [ ] **Step 4 (agent):** Re-probe `GET /social-media-posting/{loc}/accounts` (headless via Doppler) and confirm `results.accounts` is now non-empty. Record the real per-account shape (id, platform, name, avatar) in `docs/connections/social.md`.

Once Step 4 shows real accounts, proceed to Task 1.

---

## Task 1: Spike the posts shapes (list / create / delete) against the TEST sub-account

**Files:**
- Modify: `docs/build-plans/finish-social-page.md` (append a "Posts spike findings" section)
- Modify: `docs/connections/social.md` (record the real shapes)

**Why:** The posts/list response fields, create body, status enum, and delete path are unproven. Probe them against the TEST sub-account (never post to Willis's real public accounts) so Tasks 2-4 build against real shapes.

- [ ] **Step 1: List posts (TEST token).** Use the test creds (`TEST_GHL_TOKEN` / `TEST_GHL_LOCATION_ID`, or the `gohighlevel-cli` test PIT). Note `limit`/`skip` are number strings.

```bash
doppler run --project hauck-command-center --config prd -- bash -c '
LOC="$TEST_GHL_LOCATION_ID"; TOK="$TEST_GHL_TOKEN"
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Version: 2021-07-28" \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -d "{\"type\":\"all\",\"limit\":\"20\",\"skip\":\"0\"}" \
  "https://services.leadconnectorhq.com/social-media-posting/$LOC/posts/list" | head -c 1500'
```
Record: the array path (e.g. `posts` vs `results.posts`), and per-post fields for id, caption/summary, status (and the exact enum values: scheduled / published / draft / failed), the schedule date field, the published date field, `accountIds`, and media.

- [ ] **Step 2: Create then delete a throwaway draft (TEST token).** Confirm the create body (`accountIds`, `summary`, `scheduleDate`, `status`, `type`), the returned post id path, and that `DELETE /social-media-posting/{loc}/posts/{postId}` returns 2xx. Delete the post you create so nothing lingers.

- [ ] **Step 3: Analytics check.** Try any per-post insights/statistics path the API exposes. If none returns real reach/engagement, mark Insights **deferred** here and Overview will drop reach-derived KPIs (never fabricate).

- [ ] **Step 4: Write findings.** Append "## Posts spike findings" with the exact list/create/delete shapes + the status enum. Tasks 2-4 read these.

- [ ] **Step 5: Commit**
```bash
git add docs/build-plans/finish-social-page.md docs/connections/social.md
git commit -m "docs(social): record posts list/create/delete spike findings"
```

---

## Task 2: `functions/lib/social.ts` — types, fetchers, mappers

**Files:**
- Create: `command-center/app/functions/lib/social.ts`
- Test: `command-center/app/functions/lib/social.test.ts`

**Interfaces:**
- Produces: `type SocialPlatform = "fb" | "ig" | "gb"`.
- Produces: `interface SocialAccount { id: string; platform: SocialPlatform; name: string; avatar: string }`.
- Produces: `interface SocialPost { id: string; summary: string; status: "scheduled" | "draft" | "posted" | "failed"; scheduleAt: string | null; publishedAt: string | null; platforms: SocialPlatform[]; accountIds: string[]; mediaUrls: string[] }`.
- Produces: `normalizeGhlPlatform(raw: string): SocialPlatform | null` (facebook->fb, instagram->ig, google/gmb->gb, else null).
- Produces: `shapeSocialPost(raw, accountsById): SocialPost` (maps GHL status enum -> our union using the Task 1 findings).
- Produces: `fetchSocialAccounts(ctx)`, `fetchSocialPosts(ctx, { from?, to?, status? })`, `createSocialPost(ctx, input)`, `deleteSocialPost(ctx, id)` — each wraps `ghlJson`.

- [ ] **Step 1: Write the failing test** for `normalizeGhlPlatform` and `shapeSocialPost`.

```ts
import { describe, it, expect } from "vitest";
import { normalizeGhlPlatform, shapeSocialPost } from "./social";

describe("normalizeGhlPlatform", () => {
  it("maps GHL platform strings onto fb/ig/gb", () => {
    expect(normalizeGhlPlatform("facebook")).toBe("fb");
    expect(normalizeGhlPlatform("instagram")).toBe("ig");
    expect(normalizeGhlPlatform("gmb")).toBe("gb");
    expect(normalizeGhlPlatform("tiktok")).toBeNull();
  });
});

describe("shapeSocialPost", () => {
  it("maps a scheduled post with its platform via accountIds", () => {
    const accountsById = new Map([["A1", "fb" as const]]);
    const post = shapeSocialPost(
      { id: "p1", summary: "hi", status: "scheduled", scheduleDate: "2026-07-10T18:00:00Z", accountIds: ["A1"] },
      accountsById,
    );
    expect(post.status).toBe("scheduled");
    expect(post.platforms).toEqual(["fb"]);
    expect(post.scheduleAt).toBe("2026-07-10T18:00:00Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run functions/lib/social.test.ts`
Expected: FAIL ("Cannot find module ./social").

- [ ] **Step 3: Implement `functions/lib/social.ts`** using the Task 1 status-enum mapping. `fetchSocialAccounts` reads `results.accounts` (proven); the fetchers wrap `ghlJson`. Example skeleton (fill the create/list bodies from Task 1):

```ts
import { ghlJson, type GhlContext } from "./ghl";

export type SocialPlatform = "fb" | "ig" | "gb";

export interface SocialAccount { id: string; platform: SocialPlatform; name: string; avatar: string }
export interface SocialPost {
  id: string; summary: string;
  status: "scheduled" | "draft" | "posted" | "failed";
  scheduleAt: string | null; publishedAt: string | null;
  platforms: SocialPlatform[]; accountIds: string[]; mediaUrls: string[];
}

export function normalizeGhlPlatform(raw: string): SocialPlatform | null {
  const p = (raw ?? "").toLowerCase();
  if (p.includes("facebook")) return "fb";
  if (p.includes("instagram")) return "ig";
  if (p.includes("google") || p.includes("gmb") || p.includes("business")) return "gb";
  return null;
}

// GHL status enum -> our union. EXACT source values confirmed in Task 1.
const STATUS: Record<string, SocialPost["status"]> = {
  scheduled: "scheduled", draft: "draft", published: "posted", posted: "posted", failed: "failed",
};

export function shapeSocialPost(
  raw: Record<string, any>,
  accountsById: Map<string, SocialPlatform>,
): SocialPost {
  const accountIds: string[] = raw.accountIds ?? [];
  const platforms = [...new Set(accountIds.map((id) => accountsById.get(id)).filter(Boolean))] as SocialPlatform[];
  return {
    id: String(raw.id ?? raw._id ?? ""),
    summary: String(raw.summary ?? raw.caption ?? ""),
    status: STATUS[String(raw.status ?? "").toLowerCase()] ?? "draft",
    scheduleAt: raw.scheduleDate ?? null,
    publishedAt: raw.publishedAt ?? raw.publishDate ?? null,
    platforms, accountIds,
    mediaUrls: (raw.media ?? []).map((m: any) => m?.url).filter(Boolean),
  };
}

interface AccountsResp { results?: { accounts?: Array<{ id?: string; platform?: string; name?: string; avatar?: string }> } }

export async function fetchSocialAccounts(ctx: GhlContext): Promise<SocialAccount[]> {
  const data = await ghlJson<AccountsResp>(ctx, `/social-media-posting/${encodeURIComponent(ctx.locationId)}/accounts`);
  const out: SocialAccount[] = [];
  for (const a of data.results?.accounts ?? []) {
    const platform = normalizeGhlPlatform(a.platform ?? "");
    if (platform && a.id) out.push({ id: a.id, platform, name: a.name ?? "", avatar: a.avatar ?? "" });
  }
  return out;
}

// fetchSocialPosts / createSocialPost / deleteSocialPost: fill request/response
// per Task 1 findings. list uses POST posts/list with limit/skip as STRINGS.
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run functions/lib/social.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/lib/social.ts functions/lib/social.test.ts
git commit -m "feat(social): GHL Social Planner lib (accounts, posts, mappers)"
```

---

## Task 3: `functions/api/social/accounts.ts` + `posts` endpoints

**Files:**
- Create: `functions/api/social/accounts.ts`, `functions/api/social/posts/index.ts`, `functions/api/social/posts/[postId].ts`
- Test: `functions/api/social/posts/index.test.ts`

**Interfaces:**
- Consumes: `fetchSocialAccounts`, `fetchSocialPosts`, `createSocialPost`, `deleteSocialPost` from Task 2.
- Produces: `GET /api/social/accounts` -> `{ accounts: SocialAccount[]; connected: boolean }` (`connected` = at least one account).
- Produces: `GET /api/social/posts?status=&from=&to=` -> `{ posts: SocialPost[]; total: number }`.
- Produces: `POST /api/social/posts` body `{ platforms: SocialPlatform[]; summary: string; scheduleAt?: string; status: "draft" | "scheduled" }` -> `{ post: SocialPost }`. Maps selected platforms -> account ids server-side.
- Produces: `DELETE /api/social/posts/:postId` -> `{ ok: true }`.

- [ ] **Step 1: Write the failing test** for the accounts endpoint (mock `fetchSocialAccounts`).

```ts
import { it, expect, vi } from "vitest";
import * as social from "../../../lib/social";
import { onRequestGet } from "./index";

it("lists posts with a total", async () => {
  vi.spyOn(social, "fetchSocialPosts").mockResolvedValue([
    { id: "p1", summary: "hi", status: "scheduled", scheduleAt: null, publishedAt: null, platforms: ["fb"], accountIds: [], mediaUrls: [] },
  ]);
  const ctx: any = {
    data: { tenant: { ghl_token: "t", ghl_location_id: "L1" } },
    request: new Request("http://x/api/social/posts?status=scheduled"),
  };
  const res = await onRequestGet(ctx);
  const json = await res.json();
  expect(json.total).toBe(1);
  expect(json.posts[0].id).toBe("p1");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run functions/api/social/posts/index.test.ts`
Expected: FAIL ("Cannot find module ./index").

- [ ] **Step 3: Implement the three endpoints.** Each reads `ctx.data.tenant` -> `{ token, locationId }`, delegates to the Task 2 fetchers, and returns `Response.json(...)`. `POST` resolves `platforms` to account ids by reading accounts first (or accept `accountIds` directly if Task 1 shows create needs ids). Follow the handler pattern in `functions/api/ads/insights.ts`. The `POST`/`DELETE` are terminal writes (no retry: `ghlFetch` already refuses to retry POST/DELETE... note DELETE IS retried by `ghlFetch`; that is safe here because deleting an already-deleted post is idempotent).

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run functions/api/social/posts/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/api/social
git commit -m "feat(social): accounts + posts list/create/delete endpoints"
```

---

## Task 4: Client data layer — `socialData.ts`, `socialDemo.ts`, `useSocial.ts`, demo handler

**Files:**
- Create: `src/lib/socialData.ts` (+ `src/lib/socialData.test.ts`), `src/lib/socialDemo.ts`, `src/hooks/useSocial.ts`, `src/demo/handlers/social.ts`

**Interfaces:**
- Consumes: `GET /api/social/accounts`, `GET /api/social/posts`, `POST /api/social/posts`, `DELETE /api/social/posts/:id`.
- Produces: `SocialAccount`/`SocialPost` client types (mirror the API); pure mappers `toUpNextRows(posts)`, `toCalendarCells(posts, month)`, `toKpis(posts)`.
- Produces hooks: `useSocialAccounts(enabled)`, `useSocialPosts({ status?, from?, to? }, enabled)`, `useCreatePost()`, `useDeletePost()` (mutations invalidate `["social","posts"]`).

- [ ] **Step 1: Write the failing test** for `toKpis` and `toCalendarCells` in `socialData.test.ts` (posts-this-month count, scheduled count; a post lands on its schedule day).

- [ ] **Step 2: Run** `npx vitest run src/lib/socialData.test.ts` -> FAIL.

- [ ] **Step 3: Implement** `socialData.ts` (types + pure mappers), `socialDemo.ts` (move the sample arrays out of the route files), `useSocial.ts` (react-query hooks via `api()`, following `src/hooks/useReactivation.ts`), and `src/demo/handlers/social.ts` (auto-registered; match `/api/social/accounts` -> demo accounts `connected:true`, `/api/social/posts` -> `socialDemo` posts filtered by `status`, `POST` -> echo, `DELETE` -> `{ok:true}`; template: `src/demo/handlers/reactivation.ts`).

- [ ] **Step 4: Run** `npx vitest run src/lib/socialData.test.ts` -> PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/socialData.ts src/lib/socialData.test.ts src/lib/socialDemo.ts src/hooks/useSocial.ts src/demo/handlers/social.ts
git commit -m "feat(social): client data layer + demo handler"
```

---

## Task 5: Wire My Posts + Overview to real data

**Files:**
- Modify: `src/routes/social/SocialPosts.tsx`, `src/routes/social/SocialOverview.tsx`

- [ ] **Step 1:** In `SocialPosts.tsx`, a real session reads `useSocialPosts({ status })` per tab instead of `rows = []`; keep the `demo` branch on `socialDemo`. Wire `removePost` to `useDeletePost` (live only fires the real DELETE; demo keeps the in-memory filter + toast). Counts come from the live data.
- [ ] **Step 2:** In `SocialOverview.tsx`, a real session fills the KPI row (`toKpis`), "Up next" (`toUpNextRows`, soonest first), and "Recently posted" (last N posted) from `useSocialPosts`. When accounts are connected but there are zero posts, soften `NotConnectedNotice` to a connected-but-empty message (accounts endpoint says `connected:true`). Keep the `demo` branch identical.
- [ ] **Step 3: Build + walk demo.** Run `npm run build`; open `/marketing/social?demo=1` and `/marketing/social/posts?demo=1`, confirm identical sample content and gated writes.
- [ ] **Step 4: Commit**
```bash
git add src/routes/social/SocialPosts.tsx src/routes/social/SocialOverview.tsx
git commit -m "feat(social): wire My Posts + Overview to real posts"
```

---

## Task 6: Wire the Calendar to real posts

**Files:**
- Modify: `src/routes/social/SocialCalendar.tsx`

- [ ] **Step 1:** A real session builds the month grid from `useSocialPosts({ from, to })` for the visible month via `toCalendarCells`, colored by platform; keep the demo June fixture for preview. Empty connected month shows an honest "nothing scheduled" state.
- [ ] **Step 2: Build + walk demo** (`/marketing/social/calendar?demo=1`).
- [ ] **Step 3: Commit**
```bash
git add src/routes/social/SocialCalendar.tsx
git commit -m "feat(social): real month calendar from Social Planner posts"
```

---

## Task 7: Composer create / schedule (terminal write)

**Files:**
- Modify: `src/components/social/SocialComposerDialog.tsx`

- [ ] **Step 1:** Seed platform toggles from `useSocialAccounts` (only show/enable connected fb/ig/gb). "Save draft" -> `useCreatePost({ status: "draft" })`; "Schedule" -> `useCreatePost({ status: "scheduled", scheduleAt })`. Live buttons enable only when at least one connected platform is selected and (for Schedule) a datetime is set. On success: toast, close, invalidate the posts queries so lists refetch.
- [ ] **Step 2: Keep demo unchanged** (toast only, no GHL call). Photo/media upload stays a "arrives with the backend" toast (media pipeline out of scope). AI Rewrite stays gated.
- [ ] **Step 3: Guarded live write:** create one draft against the TEST sub-account, confirm it appears via `GET /api/social/posts?status=draft`, then delete it. Do not post to Willis's real public accounts without Jake's go.
- [ ] **Step 4: Build + commit**
```bash
git add src/components/social/SocialComposerDialog.tsx
git commit -m "feat(social): composer creates real drafts + scheduled posts"
```

---

## Task 8: Insights — real analytics or documented deferral

**Files:**
- Modify: `src/routes/social/SocialInsights.tsx` (only if Task 1 Step 3 found analytics), else `docs/connections/social.md`

- [ ] **Step 1:** If Task 1 found a working per-post analytics source, add `functions/api/social/insights.ts` + wire the stat cards / bars / top posts. If NOT, leave `SocialInsights.tsx` as-is (demo populated, real session honest empty) and record the deferral in `docs/connections/social.md`. Do not synthesize numbers.
- [ ] **Step 2: Commit** (code or doc).

---

## Task 9: Verify + ship

- [ ] **Step 1: Full green.** From `command-center/app`: `npm run typecheck && npm test && npm run build`, all pass.
- [ ] **Step 2: Live read (Jake, authed session).** Overview / My Posts / Calendar show real posts or an honest connected-but-empty state, never demo rows. All `/api/social/*` return real JSON (not 401/empty) in a live session.
- [ ] **Step 3: Ship** per `finishing-a-development-branch`: rebase on main, push, watch the Cloudflare deploy, grep the live bundle for a shipped string.
- [ ] **Step 4: Doc.** Update `docs/connections/social.md` (mark accounts/posts/calendar/composer live; Insights + AI status). Delete this plan (`git rm docs/build-plans/finish-social-page.md`) in the shipping commit if every non-deferred task is done, per the delete-built-plans rule.

---

## Self-review notes

- **Spec coverage:** connect (Phase 0, built) -> posts spike (T1) -> lib (T2) -> endpoints (T3) -> client data + demo (T4) -> Overview/My Posts (T5) -> Calendar (T6) -> composer write (T7) -> Insights decision (T8) -> verify/ship (T9). Ideas tab and AI are explicitly out of scope.
- **Known unknowns front-loaded:** the only unproven surfaces (posts list/create/delete shapes, analytics existence) are resolved in Task 1 before any handler is trusted. Accounts + OAuth are already proven and built.
- **Golden-rule + white-label** enforced by the demo/real split in every route task and the connections-doc note; no fabricated posts in a real session.
- **Supersedes:** the guessed endpoint shapes in `docs/build-plans/social-wiring.md` (this plan carries the proven Task 0). The connect half of `docs/build-plans/self-serve-connections-wizard.md` is built; its calendar/email/A2P cards remain a separate future effort.
