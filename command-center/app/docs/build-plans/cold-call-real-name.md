# Cold call: the person's name, not the business's

## Why

A scraped prospect is a business. In the book, `first_name` and `last_name` end up
holding the company, so the GoHighLevel contact a booking creates is called
"BM Heating & Cooling" rather than the person who agreed to the meeting. Every
reminder, every automation and the calendar event title all read `{{contact.name}}`,
so one wrong name on the contact is wrong in five places the prospect actually sees.

The booking panel already asks for the first name (commit a6021ab). Two things stop
it from finishing the job:

1. There is no **Last name** field, so the surname half of the company survives the
   correction. Typing "Mohamad" over the first name produces "Mohamad Heating & Cooling".
2. A blank field means "leave the stored value alone". That rule protects the phone
   number from an accidental select-all mid-call, but it also means a last name that
   holds a company can never be emptied, which is the exact thing that needs doing.

## Definition of done

On the call, in the booking panel, the caller types who they actually spoke to. On
confirm, that name is the name on the GoHighLevel contact, so the calendar event and
every automation that follows say the person. The company is not lost: it moves to the
contact's Business Name.

## The rules

- **Names are clearable.** `firstName` and `lastName` are always sent by the panel and
  are prefilled, so an empty one is a deliberate erase, not an omission. Empty clears.
- **Phone, email and business are not.** Empty still means "leave it alone". A reminder
  needs somewhere to go, and blanking a company name already corrected in GHL by hand
  is worse than leaving a stale one.
- **A field omitted entirely** (an older client, a script) still means "leave it alone".
  The distinction is `undefined` vs `""`, not truthiness.
- **The business is typed, not guessed.** The panel shows a Business field prefilled
  with what the book holds, falling back to the stored first + last when the book has
  no business name (the CSV-import case, where the company IS the name columns). The
  caller sees what the company will be rather than the app inferring it after the fact.

## Files

1. `functions/lib/bookingContact.ts`
   - `ContactEdits` / `CleanContact` gain `businessName`.
   - Names: `typeof edits.firstName === "string"` is enough to accept it, including `""`.
     Drop the `.trim()` truthiness gate for the two name fields only.
   - `resolveBookingContact` reads `stored.business_name` and merges an edited business
     name over it, blank-means-leave-alone.

2. `functions/lib/bookingContact.test.ts`
   - Blank last name clears a stored one; blank phone still does not clear a stored one.
   - An omitted name field still leaves the stored value alone.
   - Business name merges, and blank leaves it.
   - The phone-or-email rule is unchanged by any of it.

3. `functions/api/admin/cold-call/book.ts`
   - `Body` gains `businessName`.
   - `upsertContact` takes the company off the resolved contact rather than off the raw
     lead row, and still only sends `companyName` when there is one.
   - Write-back includes `business_name` when it changed.
   - `sales_calls.business_name` uses the resolved company, not the stale row.

4. `src/lib/api.ts`
   - `bookColdCall` input gains `lastName` and `businessName`.

5. `src/components/admin/acquisition/BookingPanel.tsx`
   - First name, Last name, Business on one row; Phone, Email on the next.
   - Business prefills from `lead.businessName`, falling back to the stored first + last.
   - All five sent on confirm.

## Order

Contract and tests first (1, 2), then the route (3), then the client (4, 5). The panel is
the last thing changed because it is the only caller, so nothing is half-wired in between.

## Verify

- `pnpm vitest run bookingContact` green.
- Localhost: open a prospect whose name is the company, book a slot, confirm the GHL
  contact reads the person with the company in Business Name, and the calendar event
  title is the person.

## Not in scope

Renaming a contact after the meeting is already booked. The calendar renders the title
at creation time, so a later rename does not retitle an existing event. Say so rather
than half-fix it.
