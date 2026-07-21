### Task 7: The board

**Files:**
- Create: `src/lib/setterModel.ts` + `.test.ts`
- Create: `src/components/admin/setter/SetterCard.tsx`
- Create: `src/components/admin/setter/SetterBoard.tsx`
- Create: `src/routes/admin/SetterSuite.tsx`
- Modify: `src/App.tsx`, `src/routes/admin/AdminLayout.tsx`

- [ ] **Step 1: Write the failing test for `needsDialing`**

```ts
import { describe, it, expect } from "vitest";
import { needsDialing } from "./setterModel";

describe("needsDialing", () => {
  it("matches the live stage names case-insensitively", () => {
    expect(needsDialing("Opted In (needs dialing)")).toBe(true);
    expect(needsDialing("No Answer Day 4 (Needs Dialing)")).toBe(true);
  });
  it("does not match stages without the marker", () => {
    expect(needsDialing("Long Term Nurture")).toBe(false);
    expect(needsDialing("Estimate Booked")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, fail, implement, run, pass**

Run: `npx vitest run src/lib/setterModel.test.ts`

```ts
export const needsDialing = (stageName: string): boolean => /needs dialing/i.test(stageName);
```

- [ ] **Step 3: Build the board to match the approved mockup**

Column header is the stage dot in the live GHL hex plus the verbatim stage name plus a count, exactly the pattern in `src/components/Board.tsx`. The stage hex is a dot only, never a background or text colour. Add the "needs dialing" chip under the header for flagged stages.

Card shows name, city, time in, a source chip, and an attempts badge. **No tags on the card.** Cards with `attempts === 0` get the danger inset rail; cards untouched for over 24 hours in a needs-dialing stage get the warning rail.

- [ ] **Step 4: Show truncation honestly**

When the leads endpoint returns `truncated: true`, render a visible banner saying the list is capped at 1000. Never silently drop leads.

- [ ] **Step 5: Register the route and point the Sales spine slot at it**

- [ ] **Step 6: Full suite, typecheck, commit**

```bash
npm test && npm run typecheck
git add command-center/app/src/
git commit -m "feat(setter): pipeline board across all 8 pipelines"
```

---

