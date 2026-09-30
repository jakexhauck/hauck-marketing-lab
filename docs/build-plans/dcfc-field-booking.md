# DCFC Downriver: Heritage Park Field Booking (demo)

Spec and build plan in one doc. Status: **awaiting Jake's review**.

## 1. What and why

A single public web page where Detroit City FC Downriver coaches book a pitch at Heritage Park (12111 Pardee Rd, Taylor, MI) for a weekend game. Jake sends the link to the club as a working demo they can actually use.

**Done means:**
- A coach on a phone can pick a day, a game size, a pitch on an illustrated park map and a time block, enter their details and book.
- The booked block shows as taken for everyone else within seconds, and two coaches can never book the same block.
- A club admin can see every booking and cancel one, behind a passcode.
- Live on its own URL, DCFC crest and colours, works at 375px wide with no sideways scroll.

## 2. Decisions (Jake, 2026-09-30)

| Topic | Decision |
|---|---|
| Look | Mockup **C: Step by step**. White cards under a rouge header with the crest |
| Map | Illustrated (not satellite), traced from Jake's drawing |
| Branding | Full DCFC Downriver: crest, rouge `#431110`, gold `#C79C2C`, Barlow Condensed + Inter |
| Bookings | Live and shared, stored in Cloudflare D1, separate from all Hauck client data |
| Who books | Anyone with the link. Admin page behind a passcode can cancel |
| Days | Saturdays and Sundays only, rolling next 8 weekends, starts empty |
| Hours | 8:00am to 6:00pm, America/Detroit |
| Form | Team name, coach name, phone, opponent |
| Hosting | Cloudflare Pages, custom subdomain `dcfc-fields.hauckmarketing.com` |

## 3. Pitches (from Jake's drawing, treated as independent, no overlaps)

| id | Name | Size |
|---|---|---|
| `north-a` | North A | 7v7 |
| `north-b` | North B | 7v7 |
| `north-big` | North Big | 11v11 |
| `field-1` | Field 1 | 9v9 |
| `field-1-small` | Field 1 Small | 7v7 |
| `field-2-small` | Field 2 Small | 7v7 |
| `field-3` | Field 3 | 11v11 |
| `field-4` | Field 4 | 11v11 |

Names are placeholders until the club supplies real ones; they live in one data file.

## 4. Time blocks

Block = game + half-time + 30 min warm-up on the field, rounded to a clean start.

| Size | Game | Block | Starts (8am to 6pm) |
|---|---|---|---|
| 7v7 | 25 + 5 + 25 | 1h30 | 8:00, 9:30, 11:00, 12:30, 2:00, 3:30 |
| 9v9 | 35 + 5 + 35 | 2h00 | 8:00, 10:00, 12:00, 2:00, 4:00 |
| 11v11 | 45 + 10 + 45 | 2h30 | 8:00, 10:30, 1:00, 3:30 |

Blocks are fixed per size, so a booking is fully described by `(pitch, date, start)`. No overlap maths needed.

## 5. Page flow (mockup C)

1. **Game day**: chips for the next 8 weekends (Sat and Sun). Past days never shown. Today's already-started blocks are disabled.
2. **Game size**: 11v11 / 9v9 / 7v7 cards with field count and block length.
3. **Field**: illustrated map, pitches of other sizes dimmed. Each pitch shows free-block count for that day. On phones the map renders taller and pitch labels stay readable (fixes the tiny map seen in the mockup).
4. **Kick-off block**: grid of blocks. Taken ones show the team name and are disabled.
5. **Your team**: 4 fields, Book button enabled only when a block is chosen.
6. **Confirmation**: card showing pitch, date, time, team. "Book another" resets to step 2.

Live updates: the page refetches the day's bookings every 15 seconds and on tab focus. If the chosen block is taken before Book is pressed, the server returns 409 and the page shows "Just taken" and refreshes the grid.

## 6. Architecture

```
dcfc-fields/                     Cloudflare Pages project "dcfc-fields"
  public/
    index.html                   booking page (mockup C, finished)
    admin.html                   passcode + bookings list + cancel
    app.js  admin.js  styles.css
    crest.png                    512px copy of the club crest
  src/
    fields.ts                    pitches, sizes, block lengths (single source of truth)
    slots.ts                     blocksFor(size), weekends(from, n), isPast(date, start)
    validate.ts                  booking input checks
  functions/api/
    bookings.ts                  GET ?date=  -> public list (no phone/coach)
                                 POST        -> create, 409 on clash
    admin/bookings.ts            GET all, DELETE ?id=  (x-admin-code header)
  migrations/0001_bookings.sql
  tests/                         vitest for src/*
  wrangler.toml                  D1 binding DB, pages_build_output_dir = public
```

The front end is plain HTML/JS (no framework), the same as the mockup. `src/` is shared by the functions and bundled into `public/app.js` with esbuild, so block times can never differ between the page and the server.

**D1 table**
```sql
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  pitch_id TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD, America/Detroit
  start_min INTEGER NOT NULL,  -- minutes after midnight
  team TEXT NOT NULL, opponent TEXT, coach TEXT NOT NULL, phone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pitch_id, date, start_min)
);
```
The UNIQUE constraint is what makes double booking impossible, even when two taps land in the same millisecond.

**Server checks on POST:** pitch exists; date is a Sat/Sun within the 8-weekend window; start is a valid block for that pitch's size; block not already started; team/coach 1-60 chars, phone 7-20 digits, opponent 0-60. Anything else returns 400.

**Privacy:** the public GET returns team and opponent only. Coach name and phone are only in the admin API.

**Admin auth:** `ADMIN_CODE` is a Pages secret (also stored in Doppler `hauck-command-center/prd` as `DCFC_FIELDS_ADMIN_CODE`). Admin page stores the code in sessionStorage and sends it as a header.

## 6a. Admin view (`/admin`)

A spreadsheet of every booking, built for scanning, not decoration. Same crest header and colours as the booking page.

**Table columns:** Date · Time · Field · Size · Team · Opponent · Coach · Phone · Booked · (Cancel)

- One row per booking, sorted by date, then time, then field. Click any column header to sort by it.
- Sticky header row; zebra rows; times shown as "10:30am to 1:00pm"; phone is a tap-to-call link.
- **Filters bar:** day (All upcoming / each weekend day), size (All / 11v11 / 9v9 / 7v7), field, and a search box that matches team, opponent or coach.
- **Counts strip** above the table for the filtered day: bookings made, blocks still open (e.g. "14 booked · 26 open").
- **Download CSV** of whatever is currently filtered, for the club's own spreadsheet.
- **Cancel:** button on each row turns into "Confirm cancel" for 4 seconds (no browser pop-ups), then the row disappears.
- **Past bookings:** hidden by default, "Show past" toggle.
- Refreshes every 30 seconds so a new booking appears without reloading.
- **Phone:** the table scrolls sideways inside its own box with the Date/Time/Field columns pinned, so the page itself never scrolls sideways.
- A link to the admin page is not shown anywhere on the public page.

**Spam guard (demo level):** max 20 bookings per IP per hour, counted in D1. Enough to stop a prank; not a real auth system.

## 7. Out of scope (YAGNI for the demo)

Accounts/logins, editing a booking (cancel and rebook), emails/texts, overlapping pitch logic, rainouts, referee assignment, payments. Each is a sensible phase 2 if the club bites.

## 8. Build plan (ordered)

1. **Scaffold** `dcfc-fields/` with package.json (wrangler, esbuild, vitest, typescript), wrangler.toml, tsconfig.
2. **TDD `src/slots.ts` + `src/fields.ts`**: block starts per size match section 4; `weekends()` returns 16 dates, Sat/Sun only, Detroit time; `isPast()`.
3. **TDD `src/validate.ts`**: every rule in section 6, one test per rejection.
4. **D1**: create database `dcfc-fields`, apply `migrations/0001_bookings.sql` (local and remote).
5. **Functions**: `api/bookings.ts` (GET, POST with 409 on UNIQUE failure, IP rate limit), `api/admin/bookings.ts` (GET, DELETE, header check).
6. **Front end**: port mockup C to `public/`, wire to API, polling, 409 handling, confirmation card, taller mobile map, crest + favicon, page title "Heritage Park Field Booking".
7. **Admin page** (section 6a): passcode gate, sortable/filterable bookings table, counts strip, CSV download, inline two-tap cancel, show-past toggle, 30s refresh, pinned columns on phone.
8. **Local verify**: `wrangler pages dev` with local D1; book, clash (two tabs same block -> one 409), cancel, phone width 375 with no sideways scroll. Playwright screenshots desktop + phone.
9. **Review**: code-review + simplify pass; security-review (public write endpoint, admin secret).
10. **Deploy**: `wrangler pages deploy` to project `dcfc-fields`; set `ADMIN_CODE` secret; smoke test on the `*.pages.dev` URL.
11. **Custom domain**: add `dcfc-fields.hauckmarketing.com` in Pages; Jake adds the CNAME at Namecheap (checklist below); smoke test live.
12. **Ship**: commit, update memory, `git rm` this plan, Jake's action items appended.

## 9. Jake's steps (after deploy)

1. Log in to Namecheap, open hauckmarketing.com, Advanced DNS.
2. Add a CNAME record: host `dcfc-fields`, value is the `*.pages.dev` address I give you after deploy (normally `dcfc-fields.pages.dev`), TTL automatic.
3. Tell me when it's saved; I verify the live URL.
4. Before sending to the club, open the link on your phone and book one test game, then cancel it in the admin page.
