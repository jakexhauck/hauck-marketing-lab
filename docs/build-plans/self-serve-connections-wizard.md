# Self-Serve Connections Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client connect their own accounts (Facebook/Instagram, Google Business Profile, Google Calendar, email sending domain, A2P) from inside the Command Center, so the agency never has to touch GoHighLevel to onboard integrations.

**Architecture:** The Command Center is a layer over GoHighLevel; every connection must land back in the client's GHL sub-account so existing automations keep working. For the OAuth integrations the app proxies GHL's own OAuth-start endpoint, which 302-redirects the client to the provider's consent screen (Facebook/Google) and lets GHL capture the callback. For non-OAuth pieces (email domain, A2P) the app renders guided flows: API-assisted for email (create domain, show DNS, poll verify), guided-instructional for A2P. A persistent client-facing hub shows live status per integration; the same cards surface during onboarding; an admin mirror shows every tenant's status.

**Tech Stack:** React + Vite (client), Cloudflare Pages Functions (`/api/*`), GoHighLevel LeadConnector API (`services.leadconnectorhq.com`), existing `functions/lib/ghl.ts` helper, existing session/tenant middleware.

## Global Constraints

- **White-label:** Never name GoHighLevel/"GHL" in any client-facing copy, status text, or error. Consent screens must be the provider's own (Facebook/Google), never a GHL-branded page. (Standing policy: `project_team_tab_and_ghl_hidden`.)
- **No em dashes** anywhere in UI text, copy, comments, or docs. Use commas, periods, parentheses, colons.
- **Server-side secrets only:** `GHL_TOKEN` and all tokens stay in Pages Functions. The browser only ever receives a provider consent URL or DNS records, never a token.
- **Tenant from session:** every endpoint reads `ctx.data.tenant` (`ghl_token`, `ghl_location_id`); never hardcode a location.
- **GHL API version:** `2021-07-28` (already the default in `functions/lib/ghl.ts`).
- **TDD:** write the failing test first for every endpoint and pure helper. Commit after each green task.
- **Reuse `ghlFetch`/`ghlJson`** from `functions/lib/ghl.ts`; do not open new fetch wrappers.

---

## File Structure

**Create (backend):**
- `functions/lib/connections.ts` - shared types + helpers: `ConnectionStatus`, `resolveLocationUserId(ctx)`, `readSocialAccounts(ctx)`.
- `functions/api/connections/status.ts` - `GET` aggregate status for the session tenant.
- `functions/api/connections/oauth/[platform]/start.ts` - `GET` proxy that returns the provider consent URL.
- `functions/api/connections/email/domain.ts` - `POST` create sending domain, `GET` verification status.
- `functions/api/connections/a2p/status.ts` - `GET` read A2P/phone registration status.
- `functions/api/admin/connections/[tenantId].ts` - `GET` per-tenant status for the admin mirror.

**Create (frontend):**
- `src/lib/connectionsModel.ts` - the integration catalog (id, label, kind, "what this unlocks"), pure.
- `src/hooks/useConnections.ts` - fetch + shape `/api/connections/status`.
- `src/routes/connections/ConnectionsHub.tsx` - the client hub page.
- `src/routes/connections/ConnectionCard.tsx` - one integration card (status pill + action).
- `src/routes/connections/EmailDomainFlow.tsx` - API-assisted email domain sub-flow.
- `src/routes/connections/A2PFlow.tsx` - guided A2P sub-flow.
- `src/routes/admin/AdminConnections.tsx` - admin status mirror.

**Modify:**
- `src/App.tsx` - register `/company/connections` and `/admin/connections` routes.
- `src/lib/nav.ts` - add "Connections" to the Company group.
- `src/lib/onboarding.ts` - add a "Connect your accounts" onboarding step pointing at the hub.

---

## Task 0: Spike - confirm the two unverified GHL surfaces

**Files:**
- Modify: `docs/build-plans/self-serve-connections-wizard.md` (append a "Spike findings" section)

**Why:** Two mechanisms are assumed but not yet proven against the live API. The Facebook/Google *social* OAuth start is proven (returns a 302 to the provider). These two are not:
1. **Google Calendar two-way sync** - is there an API-initiable OAuth, or only a manual/deep-link connect?
2. **Email sending domain** - does the GHL API expose domain create + DNS records + verification status?

- [ ] **Step 1: Probe the calendar connect surface.** Using the `gohighlevel-cli` `.env` token, check for a calendar OAuth start (try `GET /calendars/` connect endpoints and the GHL API docs). Record whether an API OAuth URL is returned.

Run (from `gohighlevel-cli`):
```bash
KEY=$(grep '^GHL_API_KEY=' .env | cut -d= -f2-); LOC=$(grep '^GHL_LOCATION_ID=' .env | cut -d= -f2-)
curl -s -D - "https://services.leadconnectorhq.com/calendars/?locationId=$LOC" -H "Authorization: Bearer $KEY" -H "Version: 2021-04-15" -o /dev/null -w "%{http_code}\n"
```
Expected: document what connect mechanism exists.

- [ ] **Step 2: Probe the email domain API.** Check for a domains endpoint under LC Email.

```bash
curl -s "https://services.leadconnectorhq.com/emails/schedule?locationId=$LOC" -H "Authorization: Bearer $KEY" -H "Version: 2021-07-28" | head -c 300
```
Then consult the GHL API reference for a `domains` resource. Record the exact create + status endpoints, or conclude the domain step must degrade to guided instructions.

- [ ] **Step 3: Write findings.** Append a "## Spike findings" section: for calendar and email, record `mechanism = oauth-api | deep-link | guided` and the exact endpoints. Tasks 3 and the calendar card read these decisions.

- [ ] **Step 4: Commit**
```bash
git add docs/build-plans/self-serve-connections-wizard.md
git commit -m "docs(connections): record calendar + email-domain API spike findings"
```

---

## Task 1: OAuth start proxy + userId helper (the proven core)

**Files:**
- Create: `functions/lib/connections.ts`
- Create: `functions/api/connections/oauth/[platform]/start.ts`
- Test: `functions/lib/connections.test.ts`

**Interfaces:**
- Produces: `resolveLocationUserId(ctx: GhlContext): Promise<string>` - returns the first GHL user id in the location (the social OAuth start requires a `userId`).
- Produces: endpoint `GET /api/connections/oauth/:platform/start` where `platform in {facebook, instagram, google}` returns `{ url: string }` (the provider consent URL) or `{ error }` with status 400/502.

- [ ] **Step 1: Write the failing test** for `resolveLocationUserId` (mock `ghlJson` to return `{ users: [{ id: "U1" }] }`).

```ts
// functions/lib/connections.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveLocationUserId } from "./connections";
import * as ghl from "./ghl";

describe("resolveLocationUserId", () => {
  it("returns the first user id for the location", async () => {
    vi.spyOn(ghl, "ghlJson").mockResolvedValue({ users: [{ id: "U1" }, { id: "U2" }] } as never);
    const id = await resolveLocationUserId({ token: "t", locationId: "L1" });
    expect(id).toBe("U1");
  });
  it("throws a white-label error when no users exist", async () => {
    vi.spyOn(ghl, "ghlJson").mockResolvedValue({ users: [] } as never);
    await expect(resolveLocationUserId({ token: "t", locationId: "L1" }))
      .rejects.toThrow("No user available to attach the connection");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run functions/lib/connections.test.ts`
Expected: FAIL ("resolveLocationUserId is not a function").

- [ ] **Step 3: Implement `functions/lib/connections.ts`**

```ts
import { ghlJson, type GhlContext } from "./ghl";

export const OAUTH_PLATFORMS = ["facebook", "instagram", "google"] as const;
export type OAuthPlatform = (typeof OAUTH_PLATFORMS)[number];

interface UsersResponse { users?: Array<{ id: string; roles?: { role?: string } }> }

/** The social OAuth start requires a userId in the sub-account. Attach to the first user. */
export async function resolveLocationUserId(ctx: GhlContext): Promise<string> {
  const data = await ghlJson<UsersResponse>(ctx, `/users/?locationId=${ctx.locationId}`);
  const first = data.users?.[0]?.id;
  if (!first) throw new Error("No user available to attach the connection");
  return first;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run functions/lib/connections.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the start endpoint** `functions/api/connections/oauth/[platform]/start.ts`

```ts
import type { Env, ApiData } from "../../../../lib/env";
import { ghlFetch } from "../../../../lib/ghl";
import { resolveLocationUserId, OAUTH_PLATFORMS, type OAuthPlatform } from "../../../../lib/connections";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const platform = ctx.params.platform as OAuthPlatform;
  if (!OAUTH_PLATFORMS.includes(platform)) {
    return Response.json({ error: "Unsupported connection" }, { status: 400 });
  }
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const userId = await resolveLocationUserId(gctx);
  // GHL returns a 302 whose Location header is the provider consent URL.
  const res = await ghlFetch(
    gctx,
    `/social-media-posting/oauth/${platform}/start?locationId=${gctx.locationId}&userId=${userId}`,
    { redirect: "manual" },
  );
  const url = res.headers.get("location");
  if (!url) {
    return Response.json({ error: "Could not start the connection. Try again." }, { status: 502 });
  }
  return Response.json({ url });
};
```

- [ ] **Step 6: Manual smoke against live GHL** (proven behavior; confirm shape unchanged)
Run: `npx vitest run functions/lib/connections.test.ts` (unit) then verify the live 302 with the curl already recorded in this session (Facebook start returns `Location: https://www.facebook.com/dialog/oauth?...`).
Expected: `{ url: "https://www.facebook.com/dialog/oauth?..." }`.

- [ ] **Step 7: Commit**
```bash
git add functions/lib/connections.ts functions/lib/connections.test.ts functions/api/connections/oauth
git commit -m "feat(connections): proxy GHL social OAuth start for FB/IG/Google"
```

---

## Task 2: Connection status aggregation

**Files:**
- Modify: `functions/lib/connections.ts` (add `readSocialAccounts`, `ConnectionStatus`)
- Create: `functions/api/connections/status.ts`
- Test: `functions/lib/connections.test.ts` (extend)

**Interfaces:**
- Produces: `type ConnectionStatus = { id: string; state: "connected" | "action_needed" | "pending" | "unknown"; detail?: string }`
- Produces: `GET /api/connections/status` returns `{ connections: ConnectionStatus[] }` covering `facebook`, `instagram`, `google`, `google_calendar`, `email_domain`, `a2p`.

- [ ] **Step 1: Write the failing test** for `readSocialAccounts` mapping.

```ts
it("maps connected social platforms to connected state", async () => {
  vi.spyOn(ghl, "ghlJson").mockResolvedValue({
    accounts: [{ platform: "facebook" }, { platform: "google" }],
  } as never);
  const s = await readSocialAccounts({ token: "t", locationId: "L1" });
  expect(s.facebook).toBe("connected");
  expect(s.instagram).toBe("action_needed");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run functions/lib/connections.test.ts`
Expected: FAIL ("readSocialAccounts is not a function").

- [ ] **Step 3: Implement `readSocialAccounts`** in `functions/lib/connections.ts`

```ts
export type ConnState = "connected" | "action_needed" | "pending" | "unknown";
export interface ConnectionStatus { id: string; state: ConnState; detail?: string }

interface SocialAccountsResponse { accounts?: Array<{ platform?: string }> }

export async function readSocialAccounts(
  ctx: GhlContext,
): Promise<Record<OAuthPlatform, ConnState>> {
  const data = await ghlJson<SocialAccountsResponse>(
    ctx, `/social-media-posting/${ctx.locationId}/accounts`,
  );
  const connected = new Set((data.accounts ?? []).map((a) => (a.platform ?? "").toLowerCase()));
  return {
    facebook: connected.has("facebook") ? "connected" : "action_needed",
    instagram: connected.has("instagram") ? "connected" : "action_needed",
    google: connected.has("google") ? "connected" : "action_needed",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run functions/lib/connections.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `functions/api/connections/status.ts`**

```ts
import type { Env, ApiData } from "../../lib/env";
import { readSocialAccounts, type ConnectionStatus } from "../../lib/connections";

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const social = await readSocialAccounts(gctx).catch(() => null);
  const connections: ConnectionStatus[] = [
    { id: "facebook", state: social?.facebook ?? "unknown" },
    { id: "instagram", state: social?.instagram ?? "unknown" },
    { id: "google", state: social?.google ?? "unknown" },
    // calendar / email_domain / a2p states are filled by their own tasks;
    // default to action_needed so the card shows a connect action.
    { id: "google_calendar", state: "action_needed" },
    { id: "email_domain", state: "action_needed" },
    { id: "a2p", state: "action_needed" },
  ];
  return Response.json({ connections });
};
```

- [ ] **Step 6: Run the suite**
Run: `npx vitest run functions/lib/connections.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add functions/lib/connections.ts functions/lib/connections.test.ts functions/api/connections/status.ts
git commit -m "feat(connections): live status aggregation endpoint"
```

---

## Task 3: Email domain flow (API-assisted, per Task 0 findings)

**Files:**
- Create: `functions/api/connections/email/domain.ts`
- Test: `functions/api/connections/email/domain.test.ts`

**Interfaces:**
- Produces: `POST /api/connections/email/domain` body `{ domain: string }` returns `{ records: Array<{ type: string; host: string; value: string }>, state }`.
- Produces: `GET /api/connections/email/domain` returns `{ state: "connected" | "pending" | "action_needed", records?: [...] }`.

**Precondition:** Task 0 confirmed the GHL domain endpoint. If the spike concluded `guided`, skip this task and render `EmailDomainFlow` as static instructions instead (note in the card model).

- [ ] **Step 1: Write the failing test** (mock `ghlJson` to return a domain with DNS records).

```ts
import { describe, it, expect, vi } from "vitest";
import * as ghl from "../../../lib/ghl";
import { onRequestPost } from "./domain";

it("returns DNS records for a created domain", async () => {
  vi.spyOn(ghl, "ghlJson").mockResolvedValue({
    domain: { dnsRecords: [{ type: "TXT", host: "@", value: "v=spf1 ..." }] },
  } as never);
  const ctx: any = {
    data: { tenant: { ghl_token: "t", ghl_location_id: "L1" } },
    request: new Request("http://x", { method: "POST", body: JSON.stringify({ domain: "mail.willis.com" }) }),
  };
  const res = await onRequestPost(ctx);
  const json = await res.json();
  expect(json.records[0].type).toBe("TXT");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run functions/api/connections/email/domain.test.ts`
Expected: FAIL ("Cannot find module ./domain").

- [ ] **Step 3: Implement `functions/api/connections/email/domain.ts`** (endpoint paths from Task 0 findings; the shape below assumes `POST /emails/domains`)

```ts
import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";
import { readBody } from "../../../lib/body";

interface DomainResponse { domain?: { dnsRecords?: Array<{ type: string; host: string; value: string }>; verified?: boolean } }

function shape(d: DomainResponse) {
  const records = d.domain?.dnsRecords ?? [];
  const state = d.domain?.verified ? "connected" : records.length ? "pending" : "action_needed";
  return { records, state };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const { domain } = await readBody<{ domain: string }>(ctx.request);
  if (!domain) return Response.json({ error: "Enter a domain." }, { status: 400 });
  const res = await ghlJson<DomainResponse>(gctx, `/emails/domains`, {
    method: "POST",
    body: JSON.stringify({ locationId: gctx.locationId, domain }),
  });
  return Response.json(shape(res));
};

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const res = await ghlJson<DomainResponse>(gctx, `/emails/domains?locationId=${gctx.locationId}`);
  return Response.json(shape(res));
};
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run functions/api/connections/email/domain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/api/connections/email
git commit -m "feat(connections): API-assisted email domain create + status"
```

---

## Task 4: A2P status (guided)

**Files:**
- Create: `functions/api/connections/a2p/status.ts`
- Test: `functions/api/connections/a2p/status.test.ts`

**Interfaces:**
- Produces: `GET /api/connections/a2p/status` returns `{ state, phone?: string }` where state derives from whether the location has a provisioned number (`connected`), or not (`action_needed`).

- [ ] **Step 1: Write the failing test** (mock location `get` returning a phone).

```ts
import { it, expect, vi } from "vitest";
import * as ghl from "../../../lib/ghl";
import { onRequestGet } from "./status";

it("reports connected when the location has a phone", async () => {
  vi.spyOn(ghl, "ghlJson").mockResolvedValue({ location: { phone: "+13134053227" } } as never);
  const ctx: any = { data: { tenant: { ghl_token: "t", ghl_location_id: "L1" } } };
  const res = await onRequestGet(ctx);
  expect((await res.json()).state).toBe("connected");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run functions/api/connections/a2p/status.test.ts`
Expected: FAIL ("Cannot find module ./status").

- [ ] **Step 3: Implement `functions/api/connections/a2p/status.ts`**

```ts
import type { Env, ApiData } from "../../../lib/env";
import { ghlJson } from "../../../lib/ghl";

interface LocResp { location?: { phone?: string } }

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };
  const data = await ghlJson<LocResp>(gctx, `/locations/${gctx.locationId}`);
  const phone = data.location?.phone ?? "";
  return Response.json({ state: phone ? "connected" : "action_needed", phone });
};
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run functions/api/connections/a2p/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/api/connections/a2p
git commit -m "feat(connections): A2P/phone provisioning status"
```

---

## Task 5: Client Connections hub (route, model, cards)

**Files:**
- Create: `src/lib/connectionsModel.ts`
- Create: `src/hooks/useConnections.ts`
- Create: `src/routes/connections/ConnectionsHub.tsx`
- Create: `src/routes/connections/ConnectionCard.tsx`
- Modify: `src/App.tsx` (register route), `src/lib/nav.ts` (add nav item)
- Test: `src/lib/connectionsModel.test.ts`

**Interfaces:**
- Consumes: `GET /api/connections/status` → `{ connections: ConnectionStatus[] }`.
- Produces: `CONNECTIONS: ConnectionMeta[]` where `ConnectionMeta = { id; label; unlocks: string; kind: "oauth" | "email" | "a2p" | "calendar" }`.

- [ ] **Step 1: Write the failing test** for the catalog (every status id has a meta entry, copy is white-label).

```ts
import { it, expect } from "vitest";
import { CONNECTIONS } from "./connectionsModel";

it("covers all six integrations and never names the backend", () => {
  const ids = CONNECTIONS.map((c) => c.id);
  for (const id of ["facebook", "instagram", "google", "google_calendar", "email_domain", "a2p"])
    expect(ids).toContain(id);
  const blob = JSON.stringify(CONNECTIONS).toLowerCase();
  expect(blob).not.toContain("gohighlevel");
  expect(blob).not.toContain("ghl");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/lib/connectionsModel.test.ts`
Expected: FAIL ("Cannot find module ./connectionsModel").

- [ ] **Step 3: Implement `src/lib/connectionsModel.ts`**

```ts
export type ConnectionKind = "oauth" | "email" | "a2p" | "calendar";
export interface ConnectionMeta {
  id: "facebook" | "instagram" | "google" | "google_calendar" | "email_domain" | "a2p";
  label: string;
  unlocks: string;
  kind: ConnectionKind;
}

export const CONNECTIONS: ConnectionMeta[] = [
  { id: "facebook", label: "Facebook", unlocks: "Capture leads from your ads and post to your page.", kind: "oauth" },
  { id: "instagram", label: "Instagram", unlocks: "Schedule and publish Instagram posts.", kind: "oauth" },
  { id: "google", label: "Google Business Profile", unlocks: "Collect and reply to Google reviews.", kind: "oauth" },
  { id: "google_calendar", label: "Google Calendar", unlocks: "Two-way sync so bookings show on your calendar.", kind: "calendar" },
  { id: "email_domain", label: "Email sending domain", unlocks: "Send email from your own domain.", kind: "email" },
  { id: "a2p", label: "Text messaging", unlocks: "Send and receive SMS with customers.", kind: "a2p" },
];
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/lib/connectionsModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `useConnections.ts`** (follow the fetch pattern of an existing hook, e.g. `src/hooks/usePaidAdsLeads.ts`): fetch `/api/connections/status`, expose `{ statusById, loading, refetch }`.

- [ ] **Step 6: Implement `ConnectionCard.tsx`** - props `{ meta: ConnectionMeta; state: ConnState; onConnect: () => void }`. Render label, `unlocks`, a status pill (Connected / Action needed / Pending), and a primary button. For `kind === "oauth"`, the button calls `GET /api/connections/oauth/:id/start`, then `window.open(json.url)` (provider consent). For `email`/`a2p`/`calendar`, the button routes to the sub-flow (Task 6/next). Match the existing card styling from `src/routes/reviews/shared.tsx` `NotConnectedNotice`.

- [ ] **Step 7: Implement `ConnectionsHub.tsx`** - map `CONNECTIONS` to `ConnectionCard`, feeding each the live state from `useConnections`. Use the standard page shell (`PageHeader` + `PAGE_CONTAINER` from `src/lib/layout.ts`, per `project_page_shell_standardization`).

- [ ] **Step 8: Register route + nav.** In `src/App.tsx` add `<Route path="/company/connections" element={<ConnectionsHub/>}/>` (guarded like the Assets route). In `src/lib/nav.ts` Company group add `{ to: "/company/connections", label: "Connections", icon: PlugZap }`.

- [ ] **Step 9: Run build + tests**
Run: `npx vitest run src/lib/connectionsModel.test.ts && pnpm build`
Expected: PASS + clean build.

- [ ] **Step 10: Commit**
```bash
git add src/lib/connectionsModel.ts src/lib/connectionsModel.test.ts src/hooks/useConnections.ts src/routes/connections src/App.tsx src/lib/nav.ts
git commit -m "feat(connections): client-facing Connections hub"
```

---

## Task 6: Email + A2P sub-flows (client UI)

**Files:**
- Create: `src/routes/connections/EmailDomainFlow.tsx`
- Create: `src/routes/connections/A2PFlow.tsx`
- Modify: `src/routes/connections/ConnectionsHub.tsx` (route the email/a2p cards to these)

- [ ] **Step 1: Implement `EmailDomainFlow.tsx`** - input for the domain, POST `/api/connections/email/domain`, render the returned DNS records in a copyable table, and a "Check verification" button that GETs the same endpoint and updates the pill. Copy stays white-label. If Task 0 concluded `guided`, render static instructions with the exact records to add instead.

- [ ] **Step 2: Implement `A2PFlow.tsx`** - guided steps (register your business, submit the campaign), each with the exact fields to enter and a link, plus a live status line from `GET /api/connections/a2p/status`. No token is ever shown.

- [ ] **Step 3: Wire the cards** - in `ConnectionsHub`, the `email_domain` and `a2p` cards open these flows (modal or sub-route `/company/connections/email`, `/company/connections/text`).

- [ ] **Step 4: Build**
Run: `pnpm build`
Expected: clean build.

- [ ] **Step 5: Commit**
```bash
git add src/routes/connections
git commit -m "feat(connections): email domain + A2P guided sub-flows"
```

---

## Task 7: Onboarding surface

**Files:**
- Modify: `src/lib/onboarding.ts` (add a step), possibly `src/lib/tourSteps.ts`

- [ ] **Step 1: Read `src/lib/onboarding.ts`** to learn the step shape (id, title, route, completion predicate).

- [ ] **Step 2: Add a "Connect your accounts" step** that links to `/company/connections` and marks complete when `GET /api/connections/status` shows at least the OAuth trio connected (reuse `useConnections`). Follow the existing step interface exactly; keep copy white-label.

- [ ] **Step 3: Build + run tour tests**
Run: `npx vitest run src/lib/tourSteps.test.ts && pnpm build`
Expected: PASS + clean build.

- [ ] **Step 4: Commit**
```bash
git add src/lib/onboarding.ts src/lib/tourSteps.ts
git commit -m "feat(connections): surface Connections as an onboarding step"
```

---

## Task 8: Admin status mirror

**Files:**
- Create: `functions/api/admin/connections/[tenantId].ts`
- Create: `src/routes/admin/AdminConnections.tsx`
- Modify: `src/App.tsx` (register `/admin/connections`)
- Test: `functions/api/admin/connections/tenantId.test.ts`

**Interfaces:**
- Consumes: the same `readSocialAccounts` helper, but per an admin-selected tenant. Admin auth via existing `functions/lib/adminAuth.ts`.
- Produces: `GET /api/admin/connections/:tenantId` returns `{ connections: ConnectionStatus[] }` for that tenant.

- [ ] **Step 1: Write the failing test** - admin endpoint requires admin session and resolves the target tenant's GHL context (mock `adminAuth` + `resolveTenantById`).

```ts
import { it, expect, vi } from "vitest";
import * as ghl from "../../../../lib/ghl";
import { onRequestGet } from "./[tenantId]";

it("returns status for the requested tenant", async () => {
  vi.spyOn(ghl, "ghlJson").mockResolvedValue({ accounts: [{ platform: "facebook" }] } as never);
  const ctx: any = {
    params: { tenantId: "willis-windows" },
    data: { admin: { id: "A1" }, resolveTenant: async () => ({ ghl_token: "t", ghl_location_id: "L1" }) },
  };
  const res = await onRequestGet(ctx);
  const json = await res.json();
  expect(json.connections.find((c: any) => c.id === "facebook").state).toBe("connected");
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run functions/api/admin/connections/tenantId.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the admin endpoint** - guard with admin auth (mirror an existing `functions/api/admin/*` handler), resolve the target tenant's GHL context via the existing admin tenant resolver, then reuse `readSocialAccounts` and return the same `ConnectionStatus[]` shape as `/api/connections/status`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run functions/api/admin/connections/tenantId.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `AdminConnections.tsx`** - list tenants (reuse the existing admin clients list), a red/amber/green dot per integration from the endpoint. Register `/admin/connections` in `src/App.tsx` behind the admin guard.

- [ ] **Step 6: Build**
Run: `pnpm build`
Expected: clean build.

- [ ] **Step 7: Commit**
```bash
git add functions/api/admin/connections src/routes/admin/AdminConnections.tsx src/App.tsx
git commit -m "feat(connections): admin status mirror across tenants"
```

---

## Task 9: Verify + ship

- [ ] **Step 1: Full test run**
Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 2: Build**
Run: `pnpm build`
Expected: clean.

- [ ] **Step 3: Live smoke (real session).** Deploy to a preview, open `/company/connections`: confirm the Facebook card opens Facebook's consent screen; confirm the status endpoint reads back a connected account; confirm the email domain flow returns DNS records; confirm no screen or string names the backend.

- [ ] **Step 4: Ship** per `finishing-a-development-branch` (push, watch deploy, smoke the live URL).

---

## Spike findings

_(Filled in by Task 0 before implementation. Records the calendar and email-domain connect mechanisms and exact endpoints.)_

---

## Self-review notes

- **Spec coverage:** OAuth (Task 1), status (Task 2), email domain (Task 3), A2P (Task 4), client hub (Task 5), email/A2P UI (Task 6), onboarding (Task 7), admin mirror (Task 8), verify/ship (Task 9). Google Calendar mechanism is resolved by the Task 0 spike and rendered by the `calendar` card in Task 5/6.
- **Known unknowns front-loaded:** Google Calendar OAuth and the email-domain API are both proven or degraded to guided in Task 0 before any dependent code is written. The Facebook/Google social OAuth start is already proven live this session (302 to the provider).
- **White-label guard** is enforced by a test in Task 5 and a manual check in Task 9.
