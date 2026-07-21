### Task 9: The metric strip, honestly

**Files:**
- Modify: `src/routes/admin/SetterSuite.tsx`

- [ ] **Step 1: Render the five tiles**

Total leads in, Contact rate, Booking rate, Show rate, Close rate, each with its formula as a mono sub-label so nobody has to guess what it means.

- [ ] **Step 2: Render the unavailable ones as pending, not as zero**

Show rate and Close rate use the existing `.pk-report-tile.pk-pending` treatment and read "Needs close-out flow". A zero would be a lie: the data does not exist, it is not that the number is zero.

- [ ] **Step 3: Commit**

```bash
git add command-center/app/src/routes/admin/SetterSuite.tsx
git commit -m "feat(setter): rate strip, with unavailable rates marked pending"
```

---

