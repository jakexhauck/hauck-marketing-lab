# 02: Fix the 100-Record Pagination Cap

## Objective

Stop silently dropping records past the first 100 in the Leads and Conversations lists.
Contacts already paginates correctly and is the template to copy.

## Why it matters

This is the one outright correctness bug in the app, not a missing feature. If the test
account (or any client) has more than 100 opportunities in a pipeline or more than 100
conversations, everything past the first page simply does not exist as far as the app is
concerned. The list looks complete. It is not. That is the worst kind of bug: invisible, and
it makes the agency look like it loses leads.

## Dependencies

None. Can be done in parallel with everything except it should land before any client sees the
app (so before promotion, ideally right after 01).

## Current state

### Contacts: already correct (the template)

`functions/api/contacts.ts` loops GHL's `nextPageUrl` cursor up to 10 pages of 100, dedupes by
id, and returns the accumulated list:

```ts
// functions/api/contacts.ts (current, correct)
const all: GhlContact[] = [];
const seen = new Set<string>();
let url = `/contacts/?locationId=${encodeURIComponent(t.ghl_location_id)}&limit=100`;
let pageCount = 0;
const maxPages = 10;

while (url && pageCount < maxPages) {
  const data = await ghlJson<ContactsResponse>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    url,
  );
  const page = data.contacts ?? [];
  for (const c of page) {
    if (c.id && !seen.has(c.id)) { seen.add(c.id); all.push(c); }
  }
  const next = data.meta?.nextPageUrl;
  if (!next || page.length === 0) break;
  url = next;
  pageCount += 1;
}
```

### Leads: single request, hard-capped (the bug)

`functions/api/leads/index.ts:14` builds one URL with `limit=100` and makes exactly one call:

```ts
// functions/api/leads/index.ts (current, capped)
let path = `/opportunities/search?location_id=${encodeURIComponent(t.ghl_location_id)}&limit=100`;
if (pipelineId) path += `&pipeline_id=${encodeURIComponent(pipelineId)}`;

const data = await ghlJson<SearchResponse>(
  { token: t.ghl_token, locationId: t.ghl_location_id },
  path,
);
const leads = (data.opportunities ?? []).map(shapeOpportunity);
leads.sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt));
return Response.json({ leads, total: data.meta?.total ?? leads.length });
```

`SearchResponse` is `{ opportunities: GhlOpportunity[]; meta?: { total?: number } }`. Note GHL's
opportunities search returns `meta.startAfterId` / `meta.startAfter` for cursor paging (the
exact field names depend on the API version, confirm against a live response, see step 1).

### Conversations: single request, hard-capped (the bug)

`functions/api/conversations/index.ts:43` is the same shape: one `limit=100` call, no loop.
`SearchResp` is `{ conversations?: GhlConversation[]; total?: number }`.

### Client side

The hooks (`src/hooks/useApi.ts`) and routes (`src/routes/Leads.tsx`, `Conversations.tsx`) do a
single fetch and render the whole array. There is no "load more" UI anywhere. The simplest fix
keeps that contract: make the server return the full set (up to a sane cap) so the client does
not change at all.

## Target state

Leads and Conversations paginate server-side exactly like Contacts: loop the cursor up to a
`maxPages` cap, dedupe, return the accumulated list with an accurate `total`. The client stays
unchanged. No "load more" button needed for the volumes these accounts have (a 10-page cap is
1000 records, comfortably above any single client's active pipeline).

> Decision: server-side accumulation over client-side infinite scroll. Rationale: the client
> already filters and searches over the full in-memory list, mobile users expect a single
> scrollable list not pagination controls, and it is a 15-line server change versus a hook +
> UI rewrite. If a client ever exceeds 1000 active opportunities, revisit with a real
> `useInfiniteQuery`.

## Step-by-step

### 1. Confirm GHL's opportunities-search cursor field

Before writing the loop, look at a real response. Using the cookie from doc 01:

```
curl -s 'https://YOUR-APP.pages.dev/api/leads?pipelineId=PIPELINE_ID' \
  -H 'cookie: hml_session=...' | head -c 400
```

That hits our wrapper. To see GHL's raw `meta`, temporarily log `data.meta` in the handler, or
call GHL directly with the token. You are looking for the next-page indicator. On the
LeadConnector `/opportunities/search` endpoint it is typically `meta.startAfterId` plus
`meta.startAfter` (a timestamp), passed back as `&startAfterId=...&startAfter=...`. Some
versions return `meta.nextPageUrl` like contacts does. Use whichever the live response shows.

### 2. Add pagination to `functions/api/leads/index.ts`

Mirror the contacts loop. Two cases depending on what step 1 found:

**If GHL returns `meta.nextPageUrl`** (same as contacts), copy the contacts loop verbatim,
swapping `contacts` for `opportunities` and the base path.

**If GHL returns `startAfterId` / `startAfter`** (common for opportunities search):

```ts
const t = ctx.data.tenant;
const url = new URL(ctx.request.url);
const pipelineId = url.searchParams.get("pipelineId");

const base = `/opportunities/search?location_id=${encodeURIComponent(t.ghl_location_id)}&limit=100${
  pipelineId ? `&pipeline_id=${encodeURIComponent(pipelineId)}` : ""
}`;

const all: GhlOpportunity[] = [];
const seen = new Set<string>();
let startAfterId: string | undefined;
let startAfter: string | undefined;
let pageCount = 0;
const maxPages = 10;

while (pageCount < maxPages) {
  let path = base;
  if (startAfterId) path += `&startAfterId=${encodeURIComponent(startAfterId)}`;
  if (startAfter) path += `&startAfter=${encodeURIComponent(startAfter)}`;

  const data = await ghlJson<SearchResponse>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    path,
  );
  const page = data.opportunities ?? [];
  for (const o of page) {
    if (o.id && !seen.has(o.id)) { seen.add(o.id); all.push(o); }
  }
  // Stop when the page is short (last page) or the cursor does not advance.
  if (page.length < 100) break;
  const nextId = data.meta?.startAfterId;
  const nextTs = data.meta?.startAfter;
  if (!nextId || nextId === startAfterId) break;
  startAfterId = nextId;
  startAfter = nextTs;
  pageCount += 1;
}

const leads = all.map(shapeOpportunity);
leads.sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt));
return Response.json({ leads, total: leads.length });
```

Update the `SearchResponse` interface to include the cursor fields you observed:

```ts
interface SearchResponse {
  opportunities: GhlOpportunity[];
  meta?: { total?: number; startAfterId?: string; startAfter?: string; nextPageUrl?: string };
}
```

### 3. Add the same loop to `functions/api/conversations/index.ts`

Conversations search uses `/conversations/search` with `sort=desc&sortBy=last_message_date`.
Apply the identical cursor loop. Keep the existing post-filter that drops system activity
conversations (the `.filter((c) => Boolean(c.contactId))` plus activity-type filtering). Dedupe
by conversation id.

### 4. Guard against runaway loops

The `maxPages` cap and the "cursor did not advance" check are both required. Without the second
guard, a GHL response that echoes the same cursor would spin until `maxPages`. With a short-page
check (`page.length < 100`) you usually stop on the natural last page well before the cap.

### 5. Log when you hit the cap

If `pageCount` reaches `maxPages`, the list may be truncated. Log it so it is not silent:

```ts
if (pageCount >= maxPages) {
  console.warn(`leads pagination hit maxPages cap for location ${t.ghl_location_id}`);
}
```

Silent truncation is the bug we are fixing. Do not reintroduce it at a higher number.

## Testing

In the test account, you need more than 100 records to actually exercise this. Options:

1. Bulk-create test opportunities in the test GHL sub-account (fastest if GHL has an import).
2. Temporarily set `limit=5` and `maxPages=3` in the handler and confirm you get 15 records
   across 3 pages, then a clean stop. This proves the loop without needing 100+ real records.
   Revert to `limit=100`, `maxPages=10` after.

Verify:

```
curl -s 'https://YOUR-APP.pages.dev/api/leads?pipelineId=PIPELINE_ID' \
  -H 'cookie: hml_session=...' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["total"], len(d["leads"]))'
```

`total` and `len(leads)` should match and exceed 100 if the account has more than 100.

## Acceptance criteria

- [ ] Leads list returns all opportunities in a pipeline, not just the first 100 (verified with
      a >100 account or the temporary low-limit test).
- [ ] Conversations list returns all conversations, not just the first 100.
- [ ] `total` in each response equals the number of records actually returned.
- [ ] No infinite loop: a same-cursor or short page stops the loop.
- [ ] A `console.warn` fires if the `maxPages` cap is ever hit.
- [ ] Contacts behaviour is unchanged (it was already correct).
- [ ] The client (`Leads.tsx`, `Conversations.tsx`) was not modified and still renders fine.

## Rollback

Revert the two handler files. The change is server-only and isolated to those two endpoints, so
rollback is a clean `git checkout` of `functions/api/leads/index.ts` and
`functions/api/conversations/index.ts`.
