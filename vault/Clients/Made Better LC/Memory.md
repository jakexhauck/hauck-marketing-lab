# Made Better LC — Memory

Append-only facts about the client. Newest at the bottom.

---

## People

- **Seamus Geohagen** — owner-operator. **He is 18** (confirmed by Jake, 2026-08-04).
  He runs the estimates, writes the number, and is on site while the work happens.

  **Fixed 2026-08-04 (`ba957554`):** the About page used to say he "started Made
  Better LC two years ago, **in his twenties**", which was simply false. Jake
  chose to keep the young-crew framing without naming a number, so it now reads
  "straight out of school". **Do not put a specific age back on the page**
  without asking. Source: `apps/command-center/public/sites/made-better/site.js`.

  **Open loop:** "two years ago" still puts him at 16 at founding, which sits
  awkwardly with "straight out of school". Confirm the founding year with Jake
  and adjust one side or the other.

## Systems

- **GHL sub-account: `r0WfsA12qpBv7M185V3v`** (confirmed by Jake, 2026-08-09).
  This was the shared Hauck Marketing **test account** until that date, which is
  why older code comments, runbooks and plans still call it one. It is Made
  Better's own sub-account now and holds real customer data, so **it is not a
  scratch account and nothing should be test-driven inside it**.

  Their app tenant (`made-better-landscaping-co`) points at it, and the live
  website + review funnels have posted there since 2026-08-04. The Cloudflare
  `TEST_GHL_LOCATION_ID` / `TEST_GHL_TOKEN` env vars still name this location.

## Positioning

- The site leans on "a young crew that has to earn it" as a deliberate angle:
  low overhead, owner on site, honest itemized pricing, and a lot of work that
  is fixing what an established crew rushed. Seamus's age is on-message for that
  framing rather than something to hide, but the exact wording is Jake's call.

## 2026-10-26: v13 client snapshot loaded

- The snapshot's 7 workflows are in GHL as DRAFTS. LF, LP and Long Term Nurture carry new landscaping texts (the old ones were AAG garage door and Willis window copies). Jake reads them before anything is published.
- The "recent work" text offers photos rather than attaching one, since no Made Better job photo was on hand.
- Facebook Access Token / Dataset ID custom values are still "[REPLACE HERE]", so CAPI will fail until filled.
- Custom values filled: Business Name (Made Better LC), Owner First/Full Name (Seamus Geohagen), Business Phone (313) 506-9238.
