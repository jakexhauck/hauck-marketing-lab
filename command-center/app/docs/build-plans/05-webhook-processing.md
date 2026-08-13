# 05: Webhook Processing (Activity Feed + Cache Invalidation)

> **The "test account" in this document is a live client.** GHL location
> `r0WfsA12qpBv7M185V3v` became **Made Better Landscaping Co's** own
> sub-account on **2026-08-09**. It holds real client data and is not a
> scratch account. Wherever this document says test account, test
> sub-account or test template, read it as Made Better's live account. The
> `TEST_GHL_*` / `TEST_APP_PASSWORD` env vars keep their names but point at
> that client.

## Objective

Turn the GHL webhook receiver from a logging-only stub into something that (a) records events to
the `activity_log` table for an in-app feed, and (b) nudges connected clients to refresh so the
app updates in near real time instead of on a 30 to 60 second poll.

## Why it matters

The webhook endpoint already exists and validates signatures correctly, but it throws every
event away after logging it. That is a missed lever: GHL is already telling us the instant a
lead is created, a stage changes, or a message arrives. Capturing that gives the app a real
activity feed and lets it feel live (new lead pops in seconds, not on the next poll). It is also
the trigger mechanism doc 06 needs to fire a push notification.

## Dependencies

- 03 (Supabase wired, `activity_log` table, `getServiceClient`).
- Enables 06 (push notifications are sent from inside this handler).

## Current state

`functions/api/webhook.ts` (public, no-auth, listed in `_middleware.ts` `PUBLIC_PATHS`):

```ts
// validates HMAC-SHA-256 against WEBHOOK_SECRET, timing-safe, then:
console.log("webhook", { type: event.type, locationId: event.locationId });
return new Response("ok", { status: 200 });
```

The event interface (`functions/api/webhook.ts:25-33`):

```ts
interface GhlWebhookEvent {
  type?: string;            // "contact.added", "opportunity.updated", "InboundMessage", etc.
  locationId?: string;
  id?: string;
  contactId?: string;
  opportunityId?: string;
  pipelineStageId?: string;
  [k: string]: unknown;
}
```

Signature validation is already correct: HMAC-SHA-256, hex, timing-safe, header
`x-ghl-signature` or `x-webhook-signature`, secret `WEBHOOK_SECRET`. Keep all of it.

## Target state

The handler, after verifying the signature:

1. Maps the event to a normalized activity row and inserts it into `activity_log` scoped to the
   test tenant.
2. For message and lead events, signals doc 06 to send a push (a function call, see 06).
3. Still returns 200 quickly. Webhook handlers must be fast and forgiving; never block on slow
   work and never 500 back to GHL (it will retry and hammer you).

Cache invalidation note: Cloudflare Functions cannot push to browsers directly. "Near real time"
here means one of two pragmatic options, pick one:

- **Option A (simplest, recommended for test app):** keep React Query's existing
  `refetchInterval` (conversations already refetch every 30s, summary every 60s) and just
  shorten the most important one. The webhook's value is then the activity feed + push, not true
  server-push. Lowest effort, good enough.
- **Option B (real-time):** add a lightweight "last event" cursor in KV that the client polls
  cheaply (a tiny `/api/since?ts=...` returning just "something changed"), and have the client
  invalidate queries when it advances. More work; defer unless the poll feels laggy.

Start with Option A. The activity feed and push are where the real value is.

## Step-by-step

### 1. Normalize events into activity rows

Add a mapper in the webhook handler. Only handle the events worth surfacing; ignore the rest:

```ts
type Activity = {
  tenant_id: string;
  kind: "lead_created" | "stage_changed" | "message_in" | "message_out" | "lead_won";
  contact_id: string | null;
  opportunity_id: string | null;
  summary: string;
  raw: unknown;
};

function toActivity(tenantId: string, e: GhlWebhookEvent): Activity | null {
  switch (e.type) {
    case "OpportunityCreate":
      return mk("lead_created", `New lead`, tenantId, e);
    case "OpportunityStageUpdate":
      return mk("stage_changed", `Stage changed`, tenantId, e);
    case "InboundMessage":
      return mk("message_in", `Inbound message`, tenantId, e);
    case "OutboundMessage":
      return mk("message_out", `Outbound message`, tenantId, e);
    default:
      return null; // ignore everything else
  }
}
```

Confirm the exact `type` strings against real GHL webhook payloads in your test sub-account
(GHL's event names vary by version, e.g. `InboundMessage` vs `message.inbound`). Log unknown
types once so you can discover them:

```ts
if (!activity) console.log("webhook: unhandled type", e.type);
```

### 2. Insert into activity_log

```ts
import { getServiceClient, resolveTenantId } from "../lib/supabase";

const client = getServiceClient(ctx.env);
if (client) {
  const tenantId = await resolveTenantId(client, "test-account");
  const activity = tenantId ? toActivity(tenantId, event) : null;
  if (activity) {
    await client.from("activity_log").insert(activity);
  }
}
```

Wrap the Supabase work in a try/catch that swallows errors and still returns 200. A failed
insert must never cause GHL to retry the webhook.

```ts
try { /* supabase insert + push */ }
catch (err) { console.error("webhook side-effect failed", err); }
return new Response("ok", { status: 200 });
```

### 3. Build the in-app activity feed

Add `functions/api/activity.ts` (authed, reads recent rows):

```ts
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ activity: [] });
  const tenantId = await resolveTenantId(client, "test-account");
  const { data } = await client
    .from("activity_log")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  return Response.json({ activity: data ?? [] });
};
```

Add a `useActivityQuery` hook mirroring the others in `src/hooks/useApi.ts` (30s stale, 30s
refetch), and render it wherever you want the feed (Home is the natural spot, alongside the
pipeline cards).

### 4. Register the webhook in GHL

In the test GHL sub-account, point a webhook at
`https://YOUR-APP.pages.dev/api/webhook` for the event types you handle. Set the signing secret
and put the same value in `WEBHOOK_SECRET` on Cloudflare. Without `WEBHOOK_SECRET` set, the
handler currently skips verification (`functions/api/webhook.ts:42`); set it so verification is
actually enforced.

### 5. Hook point for push (doc 06)

Inside the try block, after a successful insert, call the push sender for message and lead
events. Doc 06 defines `sendPushForActivity`. Leave a clearly marked call site:

```ts
if (activity && (activity.kind === "message_in" || activity.kind === "lead_created")) {
  await sendPushForActivity(ctx.env, activity); // implemented in doc 06
}
```

## Testing

- [ ] Trigger a test event in GHL (create an opportunity, send yourself an SMS). Confirm a row
      appears in `activity_log` in the Supabase dashboard within seconds.
- [ ] `GET /api/activity` returns the recent events.
- [ ] An invalid signature is rejected (send a curl POST with a bad signature, expect non-200 or
      a logged rejection, depending on how strict you make it).
- [ ] A malformed body still returns 200 (GHL must never see a 500).
- [ ] Unknown event types are logged once and ignored, not inserted.
- [ ] With `WEBHOOK_SECRET` unset, the app does not crash (it skips verification, as today).

## Acceptance criteria

- [ ] Real GHL events land in `activity_log` scoped to the test tenant.
- [ ] An in-app activity feed renders the recent events.
- [ ] The handler always returns 200 fast, even when Supabase or push fails.
- [ ] Signature verification is enforced when `WEBHOOK_SECRET` is set.
- [ ] A clearly marked call site exists for doc 06's push send.

## Rollback

The webhook change is isolated to `functions/api/webhook.ts` plus the additive `/api/activity`
endpoint and hook. Revert the webhook handler to its logging-only form and remove the activity
endpoint. GHL can keep pointing at the URL harmlessly (it just logs again).

## Future client promotion

Each client's GHL sub-account gets its own webhook pointing at its deploy (or, under future
multi-tenant routing, the shared deploy keyed by `locationId`). The `toActivity` mapper and feed
are tenant-agnostic; only `resolveTenantId` changes from the hardcoded `test-account` slug to a
lookup by `event.locationId`.
