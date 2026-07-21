### Task 1: Shared tenant-to-GHL helper

**Files:**
- Create: `command-center/app/functions/lib/tenantGhl.ts`
- Test: `command-center/app/functions/lib/tenantGhl.test.ts`
- Modify: `functions/api/admin/onboarding/[tenantId]/readiness.ts:12-22`
- Modify: `functions/api/admin/clients/[tenantId]/import-staff.ts:21-43`

**Interfaces:**
- Consumes: `getServiceClient` from `functions/lib/supabase.ts`, `GhlContext` from `functions/lib/ghl.ts`
- Produces: `getGhlContextForTenant(env, tenantId): Promise<GhlContext>`, throws `TenantGhlError` with `.status` and `.code`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { isPlaceholder } from "./tenantGhl";

describe("isPlaceholder", () => {
  it("rejects the three known placeholder values", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("pending")).toBe(true);
    expect(isPlaceholder("env")).toBe(true);
  });
  it("accepts a real value", () => {
    expect(isPlaceholder("r0WfsA12qpBv7M185V3v")).toBe(false);
  });
  it("treats null and undefined as placeholder", () => {
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd command-center/app && npx vitest run functions/lib/tenantGhl.test.ts`
Expected: FAIL, cannot resolve `./tenantGhl`.

- [ ] **Step 3: Implement**

```ts
import { getServiceClient } from "./supabase";
import type { GhlContext } from "./ghl";

const PLACEHOLDERS = new Set(["", "pending", "env"]);

export function isPlaceholder(v: string | null | undefined): boolean {
  return v == null || PLACEHOLDERS.has(v.trim().toLowerCase());
}

export class TenantGhlError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

// Admin routes run above tenant resolution (functions/api/_middleware.ts:87-100),
// so ctx.data.tenant is never populated. This is the one place that turns a
// tenantId into a usable GHL context. Note getTenantById in adminAuth.ts
// deliberately omits ghl_token, so it cannot be used here.
export async function getGhlContextForTenant(env: any, tenantId: string): Promise<GhlContext> {
  const client = getServiceClient(env);
  const { data, error } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) throw new TenantGhlError(500, "tenant_lookup_failed", error.message);
  if (!data) throw new TenantGhlError(404, "tenant_not_found", "No such client.");
  if (isPlaceholder(data.ghl_location_id) || isPlaceholder(data.ghl_token)) {
    throw new TenantGhlError(400, "ghl_not_connected", "Connect this client to the booking system first.");
  }
  return { token: data.ghl_token, locationId: data.ghl_location_id };
}
```

- [ ] **Step 4: Run the test, watch it pass**

Run: `npx vitest run functions/lib/tenantGhl.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Refactor the two existing call sites onto it**

Replace the hand-rolled select in `readiness.ts:12-22` and `import-staff.ts:21-43` with `getGhlContextForTenant`, catching `TenantGhlError` and returning `{ error: e.code }` at `e.status`. Preserve each route's existing response shape exactly.

- [ ] **Step 6: Full suite plus typecheck**

Run: `npm test && npm run typecheck`
Expected: all green, no new failures.

- [ ] **Step 7: Commit**

```bash
git add command-center/app/functions/lib/tenantGhl.ts command-center/app/functions/lib/tenantGhl.test.ts command-center/app/functions/api/admin/onboarding/ command-center/app/functions/api/admin/clients/
git commit -m "refactor(admin): extract getGhlContextForTenant, the missing shared helper"
```

---

