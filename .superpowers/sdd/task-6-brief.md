### Task 6: Booking, on top of the existing appointments lib

**Files:**
- Create: `functions/api/admin/setter/slots.ts`
- Create: `functions/api/admin/setter/book.ts`

- [ ] **Step 1: Read the existing lib first**

Read `functions/api/lib/appointments.ts` in full, and `functions/api/appointments/slots.ts` as the closest existing caller. Reuse `resolveCalendarByName`, `getFreeSlots` and `createAppointment` unchanged. Do not re-implement the calendars `Version: 2021-04-15` handling.

- [ ] **Step 2: Implement slots.ts**

`GET ?tenantId=&calendarName=&days=` proxying `getFreeSlots`. Surface `needsStaff: true` straight through: a round-robin calendar with no team members returns a 422 and the setter needs to see that plainly, not an empty grid.

- [ ] **Step 3: Implement book.ts**

`POST { tenantId, calendarName, contactId, startTime, endTime, title? }`. Do not retry on failure. The lib deliberately avoids retrying POSTs to prevent double-booking and this endpoint must honour that.

- [ ] **Step 4: Verify against the test account**

Book a real slot on a test calendar, confirm in GHL, then cancel it there.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/api/admin/setter/
git commit -m "feat(setter): live slot lookup and booking via the existing appointments lib"
```

---

