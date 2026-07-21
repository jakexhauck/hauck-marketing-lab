### Task 5: Cockpit detail, dial logging, and tags

**Files:**
- Create: `functions/api/admin/setter/lead/[contactId].ts`
- Create: `functions/api/admin/setter/dials.ts` + `.test.ts`
- Create: `functions/api/admin/setter/tags.ts` + `.test.ts`

**Interfaces:**
- `GET /api/admin/setter/lead/:contactId?tenantId=` → contact detail plus `tags: string[]` plus `dials: DialRow[]` ordered newest first
- `POST /api/admin/setter/dials` body `{ tenantId, contactId, opportunityId?, pipelineName, stageName, spoke, outcome, note?, tagsApplied? }` → `{ dial }`
- `POST /api/admin/setter/tags` body `{ tenantId, contactId, add?: string[], remove?: string[] }` → `{ tags }`

- [ ] **Step 1: Write the failing validation tests for dials.ts**

```ts
import { describe, it, expect } from "vitest";
import { validateDialBody } from "./dials";

describe("validateDialBody", () => {
  it("rejects an outcome outside the five allowed values", () => {
    const r = validateDialBody({ tenantId: "t", contactId: "c", spoke: true, outcome: "maybe" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("bad_outcome");
  });
  it("accepts each of the five allowed outcomes", () => {
    for (const o of ["booked","not_interested","no_answer","reschedule","bad_lead"]) {
      expect(validateDialBody({ tenantId:"t", contactId:"c", spoke:false, outcome:o }).ok).toBe(true);
    }
  });
  it("requires tenantId and contactId", () => {
    expect(validateDialBody({ contactId: "c", spoke: true, outcome: "booked" }).ok).toBe(false);
    expect(validateDialBody({ tenantId: "t", spoke: true, outcome: "booked" }).ok).toBe(false);
  });
  it("rejects a no_answer that claims someone spoke", () => {
    const r = validateDialBody({ tenantId:"t", contactId:"c", spoke:true, outcome:"no_answer" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("contradictory");
  });
});
```

That last case matters: it is the one way the Contact rate can be silently corrupted.

- [ ] **Step 2: Run, watch fail**

Run: `npx vitest run functions/api/admin/setter/dials.test.ts`
Expected: FAIL, `validateDialBody` is not exported.

- [ ] **Step 3: Implement `validateDialBody` and the POST handler**

Export the validator separately from the handler so it is testable without a request. The handler resolves the admin via `getActiveAdmin`, writes the row with `created_by`, and calls `logAdminAction`.

- [ ] **Step 4: Run, watch pass**

Run: `npx vitest run functions/api/admin/setter/dials.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Implement tags.ts using the shape proven in Task 0**

```ts
// Add is proven live (functions/api/reviews/index.ts:170). Remove was proven
// in Task 0. Do not copy the CLI's remove: it omits the body entirely.
if (add?.length) {
  await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`,
    { method: "POST", body: JSON.stringify({ tags: add }) });
}
if (remove?.length) {
  await ghlFetch(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`,
    { method: "DELETE", body: JSON.stringify({ tags: remove }) });
}
```

Re-read the contact afterwards and return its actual tag list, rather than echoing what was asked for. The setter must see what GHL really holds, because those tags fire workflows.

- [ ] **Step 6: Full suite plus typecheck, then commit**

```bash
npm test && npm run typecheck
git add command-center/app/functions/api/admin/setter/
git commit -m "feat(setter): lead detail, dial logging, and tag add/remove"
```

---

