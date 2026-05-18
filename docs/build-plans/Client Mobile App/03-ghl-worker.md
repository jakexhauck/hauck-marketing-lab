# Section 03: GHL Worker API (Pages Functions)

## Goal

Stand up the API surface that proxies all GHL calls and serves as the webhook receiver. Lives at `https://dash.hauckmarketing.com/api/*` via Cloudflare Pages Functions. End state: from a signed-in browser session, calling `/api/leads` returns Willis Windows' real contacts/opportunities from GHL, with auth enforced via Supabase JWT.

Estimated time: ~3 hours.

## Depends on

Section 01 (Pages live, `/api/health` returns ok, `.env` populated). Can be built in parallel with section 02 if Supabase JWKS endpoint is reachable (it is — public per project).

## Files created / modified

```
client-dashboard/
  functions/
    api/
      _middleware.ts                        (modified: real JWT verification)
      leads/
        index.ts                            (GET — list contacts + opportunities for current tenant)
        [id].ts                             (GET single + PATCH stage/value, DELETE no — never)
        [id]/sms.ts                         (POST — send SMS via GHL conversations)
        [id]/messages.ts                    (GET — fetch conversation thread)
      pipeline.ts                           (GET — current tenant's GHL pipeline stages)
      webhook.ts                            (POST — GHL webhook receiver, fans out push)
    lib/
      jwt.ts                                (Supabase JWKS verification helper)
      tenant.ts                             (load tenant + ghl_token from Supabase via service_role)
      ghl.ts                                (GHL API v2 client: fetch wrapper with auth header)
      supabase-admin.ts                     (service-role client for Pages Functions)
      env.ts                                (typed env binding)
  wrangler.toml                             (NEW — declares KV namespace, vars, compatibility_date)
```

## Steps

1. **Env binding types (10 min)**
   - `functions/lib/env.ts` declares the shape of `ctx.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWKS_URL`, `WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, KV namespaces.
   - Pages dashboard → project → Settings → Environment variables → add all of the above. Jake will paste secrets one at a time.

2. **JWT verification (20 min)**
   - `functions/lib/jwt.ts` exports `verifyJwt(token, env)`. Fetches Supabase's JWKS once, caches the keys (5-min KV TTL), uses `jose` library for verification.
   - `_middleware.ts` rejects requests without a valid Bearer token. On success, attaches `userId` and `tenantId` to `ctx.data` (after the tenant lookup).

3. **Tenant resolution (15 min)**
   - `functions/lib/tenant.ts` exports `getTenantForUser(userId, env)` — queries Supabase (service-role) for the single tenant_users row, joins to tenants. Caches per-user in KV with 60-second TTL.
   - On 401 returns no tenant. On 403 (more than one tenant for Jake's dev user), uses the `x-tenant-slug` header to pick one. For Willis-only today, this is moot.

4. **GHL client (25 min)**
   - `functions/lib/ghl.ts` exports `ghl(tenant)` → returns a fetch wrapper that prepends `https://services.leadconnectorhq.com` and adds the `Authorization: Bearer <token>` and `Version: 2021-07-28` headers.
   - Single retry on 5xx with 1s backoff. 429 retry-after honored.

5. **GET /api/leads (20 min)**
   - List opportunities for the tenant's GHL location. Pull contacts in a second call to attach name/phone/email to each opp.
   - Shape the response into the existing `Lead[]` TypeScript type the frontend already consumes.
   - Sort by `lastStatusChangeAt` desc.
   - 60-second KV cache per tenant. Cache-buster query param for forced refresh.

6. **GET /api/leads/:id (15 min)**
   - Single opportunity by id, joined with the contact and last conversation summary.

7. **PATCH /api/leads/:id (20 min)**
   - Body shape: `{ stage?: string, value?: number | null, notes?: string | null }`.
   - Maps app stage → GHL pipeline stage id (lookup from KV-cached pipeline).
   - Calls GHL `PUT /opportunities/{id}` with mapped fields.
   - On `stage === 'won'` and `value` present, also POSTs an opportunity note: "Marked Won — $X — via Hauck Dashboard."
   - Writes an `activity_log` row in Supabase (service-role) regardless of GHL success.

8. **GET /api/pipeline (10 min)**
   - Returns the tenant's GHL pipeline stages, sorted by stageOrder.
   - Cached 5-min in KV. Reads frontend's `pipeline.stages` shape, plus the stage-id map for write-back use.

9. **GET /api/leads/:id/messages (15 min)**
   - Wraps GHL Conversations API `/conversations/search` then `/conversations/{convId}/messages`.
   - Returns sorted-by-time messages with `direction` (inbound/outbound) and `body`.

10. **POST /api/leads/:id/sms (15 min)**
    - Body: `{ body: string }`.
    - Calls GHL `POST /conversations/messages` with `type: 'SMS'`, contact id, body.
    - Logs to `activity_log` regardless.

11. **POST /api/webhook (30 min)**
    - HMAC verification against `WEBHOOK_SECRET` (GHL signs each webhook).
    - Switch on event type:
      - `ContactCreate` / `OpportunityCreate` → look up `push_subscriptions` for that tenant's users, send web push (logic lives in `lib/push.ts`, written in section 06).
      - `OpportunityStageUpdate` (when changed in GHL, not the app) → fire a push too: "Stage moved by [user]" — debounced 30s per opportunity to avoid noise.
    - 200 always (even on no-op); GHL retries on non-2xx.

12. **wrangler.toml (10 min)**
    - Declares the `KV` binding (`KV_CACHE`) for pipeline/tenant caching.
    - `compatibility_date = "2026-05-18"`.
    - Pages project config — bound from the Pages dashboard, this file is mostly for local `wrangler pages dev`.

13. **Local test (15 min)**
    - `wrangler pages dev dist --kv KV_CACHE` from `client-dashboard/`.
    - Hit `localhost:8788/api/health` → ok.
    - Manually craft a bearer with a real Supabase session token and curl `/api/leads`. Should return Willis Windows' actual leads.

## Acceptance criteria

- `/api/leads` returns Willis' real opportunities from GHL when called with a valid Supabase JWT.
- `/api/leads` returns 401 without a JWT.
- `/api/pipeline` returns the GHL pipeline structure.
- PATCH to `/api/leads/:id` with `stage: 'won', value: 350` updates the opportunity in GHL and writes an `activity_log` row.
- `/api/webhook` accepts a fake-signed GHL test payload and returns 200.
- All requests log to a structured `console.log` (visible in `wrangler tail` or Pages real-time logs).
- `pnpm typecheck` clean across `src` and `functions`.

## Stop condition

Commit when end-to-end works locally (curl real Willis lead → mark Won → verify in GHL UI).

**Commit message:** `client-dashboard: ghl pages functions api + jwt auth + activity log (section 03)`

## Notes

- GHL API v2 base URL: `https://services.leadconnectorhq.com`.
- Required header on every call: `Version: 2021-07-28` (yes, that date — it's GHL's API version pin, not today's date).
- GHL rate limit: 100 req per 10s per location. KV caching keeps us well under this.
- Webhook URL we'll register in section 06: `https://dash.hauckmarketing.com/api/webhook`.
- We use service-role key only inside Pages Functions, never in the browser bundle.
- If a GHL response contains PII we don't need (DOB, full address), strip it before returning to the browser. Future hardening; not blocking today.
