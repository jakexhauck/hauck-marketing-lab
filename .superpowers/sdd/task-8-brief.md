### Task 8: The cockpit

**Files:**
- Create: `src/components/admin/setter/SetterCockpit.tsx`
- Create: `src/components/admin/setter/DialLogger.tsx`
- Create: `src/components/admin/setter/TagField.tsx`
- Create: `src/components/admin/setter/SlotPicker.tsx`

- [ ] **Step 1: Cockpit shell, docked right, own scroll container**

Sections in the order a real call happens: identity and dial, outcome, tags, booking, history, notes. The board keeps its own scroll position while the cockpit scrolls independently.

- [ ] **Step 2: DialLogger**

Five outcome buttons matching Jake's set exactly: Booked, Not interested, No answer, Reschedule, Bad lead. Picking one sets `spoke` automatically (No answer sets false, the rest set true) with a visible override, because the API rejects the contradictory combination.

- [ ] **Step 3: TagField**

Current tags as removable chips, a free input over the location's live tag list, and a short suggestion row. Under it, one line of honest warning copy: applying a tag fires the workflows.

- [ ] **Step 4: SlotPicker**

Day selector plus a grid of live slots. Render the `needsStaff` case as explicit copy: "This calendar has no team members assigned, so it cannot return availability."

- [ ] **Step 5: Optimistic update, with rollback**

A logged dial appears in the timeline immediately and increments the card's attempt badge. On failure it rolls back and a toast explains why. Never leave a phantom dial on screen: the attempt count is a metric.

- [ ] **Step 6: Full suite, typecheck, commit**

```bash
npm test && npm run typecheck
git add command-center/app/src/components/admin/setter/
git commit -m "feat(setter): lead cockpit with dial logging, tags, and booking"
```

---

