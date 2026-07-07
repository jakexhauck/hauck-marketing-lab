# Call Console — Inbound Capture + Outcome Routing (spec + plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an inbound call hits the GHL number, the app pops a Call Console — capturing an unknown caller's real details into GHL and letting whoever answered log the outcome, which routes the lead to the right pipeline stage in one tap.

**Architecture:** Route 1 telephony (no softphone). Jake's existing GHL "inbound call" workflow gets a `Send Webhook` action that posts to the existing `/api/webhook`. The webhook records a `call_inbound` activity and fires a push. The client shows a top banner + Call Console. Unknown callers (bare GHL contact, no name, no opportunity) get a capture form that upserts the contact and, on a terminal outcome, creates the opportunity before routing. Known callers show context and route their existing opportunity. Every outcome tap resolves stages BY NAME per tenant and reuses the endpoints already built for the Leads surface.

**Tech Stack:** Cloudflare Pages Functions (TypeScript), React + TanStack Query, GoHighLevel REST API, Vitest.

## Global Constraints

- **Never use em dashes** in any UI text, copy, comments, or docs. Use commas, periods, parentheses, or colons.
- **Pipelines + stages resolve BY NAME per tenant** (exact match, then contains), never by hardcoded id. Mirror `functions/api/lib/writes.ts` and `functions/api/sales/leads/index.ts`.
- **Never name GoHighLevel/GHL in client-facing UI.**
- **Client app is one responsive app** (`command-center/app`, package client-dashboard): desktop + phone PWA share routes.
- **Real session shows honest empty/not-connected states**; demo session shows the hand-authored flow.
- Webhook events route by `event.locationId` only; never hardcode a tenant.

---

## Design / Spec

### Telephony (decided, Route 1)

The business number is the GHL number and forwards to the owner's cell. The team answers on their phone as normal. GHL fires a webhook the moment the inbound-call workflow trigger runs; the app turns that into a push (phone locked) and a top banner (app open). Tapping either opens the Call Console. True in-app audio (WebRTC softphone) is explicitly out of scope (Route 2, later).

**Jake's GHL setup (one action item, not code):** on the existing inbound-call workflow (trigger: Call Status, Call Direction = Inbound, action already adds tag `inbound call`), add a **Send Webhook** action:
- URL: `https://app.hauckmarketing.com/api/webhook?token=<WEBHOOK_SECRET>`
- Method: POST, custom JSON payload: `{ "type": "InboundCall", "locationId": "{{location.id}}", "contactId": "{{contact.id}}", "phone": "{{contact.phone}}", "firstName": "{{contact.first_name}}", "lastName": "{{contact.last_name}}" }`

### Known vs unknown caller

- **Unknown**: the GHL contact GHL auto-created for the call has no name (name is blank or equals the phone number) and no opportunity yet. Console opens in **capture mode**.
- **Known**: the contact already has a real name. Console opens in **context mode**, pre-filled with who they are and (if present) their opportunity's intent.

### Capture form fields (unknown caller)

First name, Last name, Email, ZIP, What they want (free text), How'd you hear about us (source). Save upserts the contact (name/email/ZIP/source) and writes the "what they want" text as a note. A note is auto-added the moment the call arrives ("New inbound caller, needs details") so nothing is lost if no one fills the form.

### Outcome taps -> stage + function map

Each tap logs the call and routes the lead. Stage names below are the real per-tenant names (see `functions/api/sales/leads/index.ts` `STAGE_STATUS` and `sales-call-system.md` §2). For a **known** caller the existing opportunity is moved; for an **unknown** caller the opportunity is created first (Task 3) then routed.

| Tap | App function (exists unless noted) | Target stage / write |
|---|---|---|
| Booked the job | `useMoveSalesLeadStage` + `monetaryValue` (stage endpoint extended, Task 4) | Sales Pipeline -> **Job Booked** (cross-pipeline) |
| Book in-person visit | `useFreeSlots` + `useCreateAppointment` + `useMoveSalesLeadStage` | **Estimate Scheduled** |
| Follow up later | `useCreateTask` (callback due date) + `useMoveSalesLeadStage` | **Follow Up** off-ramp |
| No answer / voicemail | `useMoveSalesLeadStage` | **No Answer** |
| Not qualified | `useMoveSalesLeadStage` `{status:"lost"}` | off-ramp (lost) |
| (auto on ring) | `useCreateNote` (exists) | note on contact |

### What is genuinely new vs reused

**Reused as-is:** `useMoveSalesLeadStage`, `useCreateAppointment`, `useFreeSlots`, `useCreateTask`, `useCreateNote`, `useNotificationsQuery`, `SlotPickerModal`, `putOpportunity`, `resolveStageByName`, `resolveStageInPipeline`, `sendPushForActivity`.

**New:**
1. `InboundCall` handling in `functions/api/webhook.ts` (+ `call_inbound` kind, push).
2. Contact upsert endpoint `functions/api/contacts/[contactId]/index.ts` (PUT) + `useUpsertContact`.
3. Create-opportunity endpoint `functions/api/sales/leads/index.ts` (add POST) + `useCreateSalesLead`.
4. Stage endpoint cross-pipeline extension (`pipelineName` + `monetaryValue`).
5. Frontend: `callConsole.ts` (pure helpers), `useIncomingCall.ts`, `IncomingCallBanner.tsx`, `CallConsole.tsx`, shell mount, demo data.

---

## File Structure

- `functions/api/webhook.ts` (modify) — add `InboundCall` -> `call_inbound` activity + push.
- `functions/api/contacts/[contactId]/index.ts` (create) — `PUT` contact upsert (firstName/lastName/email/postalCode/source).
- `functions/api/sales/leads/index.ts` (modify) — add `onRequestPost` to create an opportunity for a contact by pipeline+stage name.
- `functions/api/sales/leads/[id]/stage.ts` (modify) — accept `pipelineName` (cross-pipeline move) and `monetaryValue`.
- `functions/api/lib/writes.ts` (modify) — `putOpportunity` already supports `monetaryValue`; add `createOpportunity` helper.
- `src/lib/callConsole.ts` (create) — pure helpers: `isUnknownCaller`, `OUTCOMES` table, `outcomeToStage`.
- `src/lib/callConsole.test.ts` (create) — unit tests for the helpers.
- `src/hooks/useApi.ts` (modify) — `useUpsertContact`, `useCreateSalesLead`.
- `src/hooks/useIncomingCall.ts` (create) — surface the freshest `call_inbound` activity as an active call.
- `src/components/call/IncomingCallBanner.tsx` (create) — top banner.
- `src/components/call/CallConsole.tsx` (create) — capture/context panel + outcome taps.
- `src/App.tsx` or the client shell (modify) — mount banner + console.
- `functions/lib/webhookActivity.test.ts` (create) — unit test the `InboundCall` mapping.

---

### Task 1: Webhook handles InboundCall

**Files:**
- Modify: `command-center/app/functions/api/webhook.ts`
- Test: `command-center/app/functions/lib/webhookActivity.test.ts` (create)

**Interfaces:**
- Produces: `toActivity(tenantId, {type:"InboundCall", contactId, phone})` returns an `Activity` with `kind:"call_inbound"`, and `shouldPush` returns `true` for it.

- [ ] **Step 1: Extract `toActivity` + `shouldPush` for testability.** They are module-local in `webhook.ts`. Export them (add `export` to `function toActivity` and `function shouldPush`). No behavior change.

- [ ] **Step 2: Write the failing test**

```ts
// command-center/app/functions/lib/webhookActivity.test.ts
import { describe, it, expect } from "vitest";
import { toActivity, shouldPush } from "../api/webhook";

describe("InboundCall webhook mapping", () => {
  it("maps InboundCall to a call_inbound activity", () => {
    const a = toActivity("t1", {
      type: "InboundCall",
      contactId: "c1",
      phone: "(248) 555-0188",
    } as any);
    expect(a?.kind).toBe("call_inbound");
    expect(a?.contact_id).toBe("c1");
  });
  it("pushes on inbound calls", () => {
    const a = toActivity("t1", { type: "InboundCall", contactId: "c1" } as any)!;
    expect(shouldPush(a)).toBe(true);
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd command-center/app && npx vitest run functions/lib/webhookActivity.test.ts`
Expected: FAIL (`call_inbound` not a valid kind / no case for `InboundCall`).

- [ ] **Step 4: Add the kind + case + push.** In `webhook.ts`:
  - Add `"call_inbound"` to the `ActivityKind` union.
  - Add a case to `toActivity`: `case "InboundCall": return mk("call_inbound", "Incoming call", tenantId, e);`
  - In `shouldPush`, add: `if (activity.kind === "call_inbound") return true;`
  - Carry the phone into the activity summary for the push: in the `InboundCall` case, build the summary from the phone when present, for example `mk("call_inbound", e.phone ? \`Incoming call ${e.phone}\` : "Incoming call", tenantId, e)`.

- [ ] **Step 5: Run tests, verify pass**

Run: `cd command-center/app && npx vitest run functions/lib/webhookActivity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add command-center/app/functions/api/webhook.ts command-center/app/functions/lib/webhookActivity.test.ts
git commit -m "feat(call): webhook maps InboundCall to a pushable call_inbound activity"
```

---

### Task 2: Contact upsert endpoint + hook

**Files:**
- Create: `command-center/app/functions/api/contacts/[contactId]/index.ts`
- Modify: `command-center/app/src/hooks/useApi.ts`

**Interfaces:**
- Produces: `PUT /api/contacts/:contactId` body `{ firstName?, lastName?, email?, postalCode?, source? }` -> `{ ok: true }`. Hook `useUpsertContact()` returns a mutation taking `{ contactId, firstName?, lastName?, email?, postalCode?, source? }`.

- [ ] **Step 1: Create the endpoint.**

```ts
// command-center/app/functions/api/contacts/[contactId]/index.ts
import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlFetch, type GhlContext } from "../../../lib/ghl";

interface UpsertBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  postalCode?: string;
  source?: string;
}

// PUT /api/contacts/:contactId — update the caller's real details on the GHL
// contact GHL auto-created for the inbound call. Only writes fields that are
// present so a partial capture never blanks existing data.
export const onRequestPut: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const input = await readJsonBody<UpsertBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (input.firstName?.trim()) fields.firstName = input.firstName.trim();
  if (input.lastName?.trim()) fields.lastName = input.lastName.trim();
  if (input.email?.trim()) fields.email = input.email.trim();
  if (input.postalCode?.trim()) fields.postalCode = input.postalCode.trim();
  if (input.source?.trim()) fields.source = input.source.trim();

  if (Object.keys(fields).length === 0) {
    return Response.json({ error: "nothing_to_write" }, { status: 400 });
  }

  const res = await ghlFetch(
    gctx,
    `/contacts/${encodeURIComponent(contactId)}`,
    { method: "PUT", body: JSON.stringify(fields) },
  );
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    return Response.json({ error: "ghl_error", status: res.status, body }, { status: 502 });
  }
  return Response.json({ ok: true });
};
```

- [ ] **Step 2: Add the hook** in `src/hooks/useApi.ts` (near `useCreateNote`):

```ts
export function useUpsertContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      postalCode?: string;
      source?: string;
    }) =>
      api<{ ok: true }>(`/api/contacts/${input.contactId}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
```

- [ ] **Step 3: Typecheck.**

Run: `cd command-center/app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/functions/api/contacts command-center/app/src/hooks/useApi.ts
git commit -m "feat(call): add contact upsert endpoint + useUpsertContact"
```

---

### Task 3: Create-opportunity endpoint + hook (unknown callers)

**Files:**
- Modify: `command-center/app/functions/api/sales/leads/index.ts`
- Modify: `command-center/app/functions/api/lib/writes.ts`
- Modify: `command-center/app/src/hooks/useApi.ts`

**Interfaces:**
- Produces: `createOpportunity(gctx, {pipelineId, pipelineStageId, contactId, name, monetaryValue?})` -> `{ ok:true, id } | { ok:false, status, body }`. `POST /api/sales/leads` body `{ contactId, pipelineName, stageName, name, monetaryValue? }` -> `{ ok:true, id }`. Hook `useCreateSalesLead()`.

- [ ] **Step 1: Add `createOpportunity` to `writes.ts`:**

```ts
// Append to functions/api/lib/writes.ts
export async function createOpportunity(
  gctx: GhlContext,
  input: {
    pipelineId: string;
    pipelineStageId: string;
    contactId: string;
    name: string;
    monetaryValue?: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; status: number; body: string }> {
  const body: Record<string, unknown> = {
    pipelineId: input.pipelineId,
    locationId: gctx.locationId,
    pipelineStageId: input.pipelineStageId,
    contactId: input.contactId,
    name: input.name,
    status: "open",
  };
  if (typeof input.monetaryValue === "number") body.monetaryValue = input.monetaryValue;
  const res = await ghlFetch(gctx, `/opportunities/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 500) };
  }
  const data = (await res.json()) as { opportunity?: { id?: string }; id?: string };
  const id = data.opportunity?.id ?? data.id ?? "";
  return { ok: true, id };
}
```

- [ ] **Step 2: Add `onRequestPost` to `functions/api/sales/leads/index.ts`** (keep the existing `onRequestGet`):

```ts
import { resolveStageByName, createOpportunity } from "../../lib/writes";
import { readJsonBody } from "../../../lib/body";

interface CreateLeadBody {
  contactId: string;
  pipelineName: string;
  stageName: string;
  name: string;
  monetaryValue?: number;
}

// POST /api/sales/leads — create a new opportunity for an existing contact,
// used when a terminal call outcome lands on an unknown inbound caller who has
// no opportunity yet. Pipeline + stage resolve BY NAME per tenant.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const body = await readJsonBody<CreateLeadBody>(ctx.request);
  if (!body?.contactId || !body.pipelineName || !body.stageName) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }
  const { pipelineId, stageId } = await resolveStageByName(
    gctx,
    body.pipelineName,
    body.stageName,
  );
  if (!pipelineId || !stageId) {
    return Response.json({ error: "stage_not_found" }, { status: 404 });
  }
  const result = await createOpportunity(gctx, {
    pipelineId,
    pipelineStageId: stageId,
    contactId: body.contactId,
    name: body.name || "Inbound call",
    monetaryValue: body.monetaryValue,
  });
  if (!result.ok) {
    return Response.json({ error: "ghl_error", status: result.status, body: result.body }, { status: 502 });
  }
  return Response.json({ ok: true, id: result.id });
};
```

Note: `GhlContext` and `ghlFetch` imports already resolve in these files; add `GhlContext` to the existing `ghl` import in `index.ts` if not present.

- [ ] **Step 3: Add the hook** in `src/hooks/useApi.ts`:

```ts
export function useCreateSalesLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      pipelineName: string;
      stageName: string;
      name: string;
      monetaryValue?: number;
    }) =>
      api<{ ok: true; id: string }>(`/api/sales/leads`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
    },
  });
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd command-center/app && npx tsc --noEmit` (expect no errors)

```bash
git add command-center/app/functions/api/sales/leads/index.ts command-center/app/functions/api/lib/writes.ts command-center/app/src/hooks/useApi.ts
git commit -m "feat(call): create-opportunity endpoint for unknown inbound callers"
```

---

### Task 4: Stage endpoint cross-pipeline move + price

**Files:**
- Modify: `command-center/app/functions/api/sales/leads/[id]/stage.ts`

**Interfaces:**
- Produces: `POST /api/sales/leads/:id/stage` now also accepts `{ pipelineName?, monetaryValue? }`. When `pipelineName` is present, resolve the stage in THAT pipeline (cross-pipeline move to Job Booked) and set both `pipelineId` and `pipelineStageId`.

- [ ] **Step 1: Extend `StageBody` and the write.** Replace the body handling in `stage.ts`:

```ts
import { resolveStageInPipeline, resolveStageByName, putOpportunity } from "../../../lib/writes";

interface StageBody {
  status?: "open" | "won" | "lost" | "abandoned";
  stageName?: string;
  pipelineName?: string;   // cross-pipeline move (e.g. Sales Pipeline "Job Booked")
  monetaryValue?: number;  // captured on "Booked the job"
}
```

Then in the handler, after reading `body`, build fields:

```ts
const fields: { pipelineStageId?: string; pipelineId?: string; status?: string; monetaryValue?: number } = {};
if (body.status) fields.status = body.status;
if (typeof body.monetaryValue === "number") fields.monetaryValue = body.monetaryValue;

if (body.stageName && body.pipelineName) {
  // Cross-pipeline: resolve the stage inside the named target pipeline.
  const { pipelineId, stageId } = await resolveStageByName(gctx, body.pipelineName, body.stageName);
  if (pipelineId) fields.pipelineId = pipelineId;
  if (stageId) fields.pipelineStageId = stageId;
} else if (body.stageName) {
  // Same-pipeline: translate within the opportunity's own pipeline (unchanged).
  const data = await ghlJson<{ opportunity: GhlOpportunity }>(
    gctx,
    `/opportunities/${encodeURIComponent(id)}`,
  );
  const pipelineId = data.opportunity?.pipelineId ?? "";
  if (pipelineId) {
    const stageId = await resolveStageInPipeline(gctx, pipelineId, body.stageName);
    if (stageId) fields.pipelineStageId = stageId;
  }
}

if (!fields.status && !fields.pipelineStageId && fields.monetaryValue === undefined) {
  return Response.json({ error: "nothing_to_write" }, { status: 400 });
}
```

`putOpportunity` already accepts `pipelineStageId`, `status`, and `monetaryValue`; confirm it also passes `pipelineId` — if not, add `pipelineId?: string` to its `fields` param in `writes.ts` (the PUT body is passed straight through, so it is a one-line type addition).

- [ ] **Step 2: Typecheck + commit**

Run: `cd command-center/app && npx tsc --noEmit` (expect no errors)

```bash
git add command-center/app/functions/api/sales/leads/[id]/stage.ts command-center/app/functions/api/lib/writes.ts
git commit -m "feat(call): stage endpoint supports cross-pipeline move + captured price"
```

---

### Task 5: Call console pure helpers (TDD)

**Files:**
- Create: `command-center/app/src/lib/callConsole.ts`
- Create: `command-center/app/src/lib/callConsole.test.ts`

**Interfaces:**
- Produces:
  - `isUnknownCaller(name: string | undefined, phone: string): boolean`
  - `OUTCOMES: OutcomeDef[]` where `OutcomeDef = { key, label, stageName, pipelineName?, status?, needsPrice?, needsTime?, needsCallback? }`
  - `outcomeToStage(key: string): OutcomeDef | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// command-center/app/src/lib/callConsole.test.ts
import { describe, it, expect } from "vitest";
import { isUnknownCaller, OUTCOMES, outcomeToStage } from "./callConsole";

describe("isUnknownCaller", () => {
  it("is unknown when name is blank", () => {
    expect(isUnknownCaller("", "(248) 555-0188")).toBe(true);
  });
  it("is unknown when name is just the phone number", () => {
    expect(isUnknownCaller("(248) 555-0188", "(248) 555-0188")).toBe(true);
  });
  it("is known when a real name is present", () => {
    expect(isUnknownCaller("Marcus Bell", "(248) 555-0188")).toBe(false);
  });
});

describe("outcome routing table", () => {
  it("routes Booked the job to Sales Pipeline Job Booked with price", () => {
    const o = outcomeToStage("booked")!;
    expect(o.stageName.toLowerCase()).toContain("job booked");
    expect(o.pipelineName?.toLowerCase()).toContain("sales");
    expect(o.needsPrice).toBe(true);
  });
  it("routes Not qualified to a lost status", () => {
    expect(outcomeToStage("not_qualified")?.status).toBe("lost");
  });
  it("exposes all five outcomes", () => {
    expect(OUTCOMES.map((o) => o.key).sort()).toEqual(
      ["booked", "followup", "no_answer", "not_qualified", "visit"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd command-center/app && npx vitest run src/lib/callConsole.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `callConsole.ts`**

```ts
// command-center/app/src/lib/callConsole.ts
// Pure helpers for the Call Console: caller classification + the outcome->stage
// routing table. Stage/pipeline names match the live GHL template (see
// functions/api/sales/leads/index.ts STAGE_STATUS and sales-call-system.md).

export interface OutcomeDef {
  key: string;
  label: string;
  stageName: string;
  pipelineName?: string; // set when the move crosses into another pipeline
  status?: "open" | "won" | "lost" | "abandoned";
  needsPrice?: boolean;
  needsTime?: boolean;
  needsCallback?: boolean;
}

// Unknown when there is no real name: blank, or the "name" is just the phone
// number GHL falls back to for an unrecognised inbound caller.
export function isUnknownCaller(name: string | undefined, phone: string): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  const digits = (s: string) => s.replace(/\D/g, "");
  return digits(n).length > 0 && digits(n) === digits(phone);
}

export const OUTCOMES: OutcomeDef[] = [
  { key: "booked", label: "Booked the job", stageName: "Job Booked", pipelineName: "Sales Pipeline", needsPrice: true },
  { key: "visit", label: "Book in-person visit", stageName: "Estimate Scheduled", needsTime: true },
  { key: "followup", label: "Follow up later", stageName: "Follow Up", needsCallback: true },
  { key: "no_answer", label: "No answer / voicemail", stageName: "No Answer" },
  { key: "not_qualified", label: "Not qualified", stageName: "", status: "lost" },
];

export function outcomeToStage(key: string): OutcomeDef | undefined {
  return OUTCOMES.find((o) => o.key === key);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd command-center/app && npx vitest run src/lib/callConsole.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/src/lib/callConsole.ts command-center/app/src/lib/callConsole.test.ts
git commit -m "feat(call): call console helpers + outcome routing table"
```

---

### Task 6: useIncomingCall hook

**Files:**
- Create: `command-center/app/src/hooks/useIncomingCall.ts`

**Interfaces:**
- Consumes: `useNotificationsQuery(enabled)` from `useApi.ts` (already returns recent activity/notifications).
- Produces: `useIncomingCall()` -> `{ call: IncomingCall | null, dismiss: () => void }` where `IncomingCall = { contactId: string; phone: string; name?: string; at: string }`. It surfaces the newest unacknowledged `call_inbound` activity and dedupes by contactId + timestamp; `dismiss()` clears the current one.

- [ ] **Step 1: Implement the hook.**

```ts
// command-center/app/src/hooks/useIncomingCall.ts
import { useMemo, useState } from "react";
import { useNotificationsQuery } from "./useApi";

export interface IncomingCall {
  contactId: string;
  phone: string;
  name?: string;
  at: string;
}

// Surface the freshest inbound call from the notifications/activity feed the
// webhook writes (kind "call_inbound"). The feed is polled by TanStack Query
// (existing refetch interval); when app is closed the push covers it. Dismissed
// calls are remembered by id so they do not re-pop on the next poll.
export function useIncomingCall() {
  const q = useNotificationsQuery(true);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const call = useMemo<IncomingCall | null>(() => {
    const items = (q.data?.notifications ?? []) as Array<{
      id?: string;
      action?: string;
      kind?: string;
      payload?: { contact_id?: string; summary?: string; raw?: Record<string, unknown> };
      created_at?: string;
    }>;
    const hit = items.find((n) => (n.action ?? n.kind) === "call_inbound");
    if (!hit) return null;
    const key = hit.id ?? `${hit.payload?.contact_id}-${hit.created_at}`;
    if (key === dismissedId) return null;
    const raw = hit.payload?.raw ?? {};
    return {
      contactId: hit.payload?.contact_id ?? String(raw.contactId ?? ""),
      phone: String(raw.phone ?? ""),
      name: [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim() || undefined,
      at: hit.created_at ?? "",
    };
  }, [q.data, dismissedId]);

  const dismiss = () => {
    if (!call) return;
    setDismissedId(call.contactId ? `${call.contactId}` : call.at);
  };

  return { call, dismiss };
}
```

Note: match the real notifications payload shape — inspect `useNotificationsQuery`'s return type in `useApi.ts` and adjust the field reads (`action` vs `kind`, `payload.raw`) to the actual columns before finalizing. The activity row written in Task 1 stores `action: "call_inbound"`, `payload.contact_id`, and `payload.raw` (the full event incl. `phone`).

- [ ] **Step 2: Typecheck + commit**

Run: `cd command-center/app && npx tsc --noEmit` (expect no errors)

```bash
git add command-center/app/src/hooks/useIncomingCall.ts
git commit -m "feat(call): useIncomingCall surfaces the freshest inbound call"
```

---

### Task 7: IncomingCallBanner + CallConsole UI

**Files:**
- Create: `command-center/app/src/components/call/IncomingCallBanner.tsx`
- Create: `command-center/app/src/components/call/CallConsole.tsx`

**Interfaces:**
- Consumes: `useIncomingCall`, `isUnknownCaller`, `OUTCOMES`, `outcomeToStage`, `useUpsertContact`, `useCreateNote`, `useCreateSalesLead`, `useMoveSalesLeadStage`, `useCreateTask`, `useFreeSlots`, `useCreateAppointment`, `SlotPickerModal`.
- Produces: `<IncomingCallBanner />` (self-contained, reads `useIncomingCall`, opens `<CallConsole call={...} onClose={...} />`).

- [ ] **Step 1: Build `CallConsole.tsx`.** A slide-over/panel. Header shows caller phone + name. If `isUnknownCaller(name, phone)` -> capture form (firstName, lastName, email, postalCode, whatTheyWant, source). Right column -> the `OUTCOMES` buttons. Behavior:
  - On mount for an unknown caller, fire `useCreateNote({ contactId, body: "New inbound caller, needs details" })` once.
  - **Save details** (capture form): `useUpsertContact({ contactId, firstName, lastName, email, postalCode, source })`; if `whatTheyWant` present, `useCreateNote({ contactId, body: whatTheyWant })`.
  - **Outcome tap** handler `runOutcome(def: OutcomeDef)`:
    - Resolve the opportunity id: for a known caller use its existing opportunity id (from the call context / leads feed); for an unknown caller, first `useCreateSalesLead({ contactId, pipelineName: def.pipelineName ?? "Organic Pipeline", stageName: def.status === "lost" ? "Not Qualified" : def.stageName, name })` to get an `id`.
    - `needsPrice` -> prompt for a number, then `useMoveSalesLeadStage({ id, stageName: def.stageName, pipelineName: def.pipelineName, monetaryValue })`.
    - `needsTime` -> open `SlotPickerModal` (Home Estimate calendar) -> `useCreateAppointment(...)` then `useMoveSalesLeadStage({ id, stageName: "Estimate Scheduled" })`.
    - `needsCallback` -> pick date -> `useCreateTask({ contactId, title: "Call back", dueDate })` then `useMoveSalesLeadStage({ id, stageName: "Follow Up" })`.
    - `status: "lost"` -> `useMoveSalesLeadStage({ id, status: "lost" })`.
    - else -> `useMoveSalesLeadStage({ id, stageName: def.stageName })`.
    - On success, toast the outcome + close.
  - Follow existing component patterns: reuse the toast + gating helpers used by the Leads surface (`useMoveSalesLeadStage` is already wired there). Match `PAGE_CONTAINER` / dark "call mode" styling from `mockups/call-console/call-console.html`.

- [ ] **Step 2: Build `IncomingCallBanner.tsx`.** Reads `useIncomingCall()`. When `call` is set, render a fixed top banner ("Incoming call · {phone} · {name || 'Unknown caller'}") with an "Open call console" button and a dismiss X. Opening sets local state that renders `<CallConsole call={call} onClose={() => { dismiss(); setOpen(false); }} />`.

- [ ] **Step 3: Typecheck + build**

Run: `cd command-center/app && npx tsc --noEmit && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/components/call
git commit -m "feat(call): incoming call banner + Call Console (capture + outcome taps)"
```

---

### Task 8: Mount in the app shell + demo

**Files:**
- Modify: the client shell (`command-center/app/src/App.tsx` or the responsive layout wrapper that renders on every route).
- Modify: `command-center/app/src/demo/data.ts` (or the demo handlers) to seed one unknown inbound call so the banner is demoable.

**Interfaces:**
- Consumes: `<IncomingCallBanner />`.

- [ ] **Step 1: Mount the banner** once, high in the tree so it shows on every route (next to the existing topbar/notification bell). Import and render `<IncomingCallBanner />`.

- [ ] **Step 2: Seed a demo inbound call.** In the demo notifications/activity source, add one `call_inbound` entry (contactId of a demo contact with no name, phone set) so a demo session shows the banner -> console -> capture flow. Real session shows nothing until a real call lands.

- [ ] **Step 3: Verify in the running app.**

Run: `cd command-center/app && npm run build` then launch the app (see `/run`).
Expected: demo session shows the incoming-call banner; opening it shows the capture form for the unknown caller and the five outcome taps; typing a name + Save does not error.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/src/App.tsx command-center/app/src/demo/data.ts
git commit -m "feat(call): mount incoming call banner in the shell + demo seed"
```

---

### Task 9: Connections doc + verification

**Files:**
- Create/Modify: `command-center/app/docs/connections/call-console.md`

- [ ] **Step 1: Write the connections backlog** documenting: the GHL `Send Webhook` action Jake must add (payload above), the `WEBHOOK_SECRET` requirement, the endpoints (`PUT /api/contacts/:id`, `POST /api/sales/leads`, extended `stage`), and the per-outcome gating. Note the open verification: does the GHL call trigger fire on ring or on hang-up (live vs instant-after pop).

- [ ] **Step 2: Full typecheck + tests + build.**

Run: `cd command-center/app && npx tsc --noEmit && npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit.**

```bash
git add command-center/app/docs/connections/call-console.md
git commit -m "docs(call): connections backlog for the Call Console inbound capture"
```

---

## Post-build (Jake action items)

1. Add the `Send Webhook` action to the inbound-call workflow in GHL (payload above).
2. Place a live test call into the GHL number; confirm the banner pops (note whether mid-ring or post-hangup).
3. Confirm the captured name/ZIP land on the real contact and each outcome moves the opportunity to the expected stage.
4. Assign staff to the Intro Call calendars if intro-call booking is wanted from the console (existing caveat, `connections/leads.md`).

## Self-review notes

- Spec coverage: signal (T1), capture/upsert (T2), unknown-caller opportunity (T3), cross-pipeline Booked + price (T4), helpers/routing (T5), live surfacing (T6), UI (T7), mount/demo (T8), docs/verify (T9). All outcome taps map to real stage names + existing hooks.
- Reuse verified against `useApi.ts` (`useMoveSalesLeadStage`, `useCreateAppointment`, `useFreeSlots`, `useCreateTask`, `useCreateNote`, `useNotificationsQuery`) and `writes.ts` (`resolveStageByName`, `putOpportunity`).
- Open verification (not a blocker): GHL call-trigger timing (ring vs hangup); exact notifications payload shape read in T6.
