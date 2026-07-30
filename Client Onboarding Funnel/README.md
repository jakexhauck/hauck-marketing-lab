# Client Onboarding Funnel

The three pages a newly signed client walks through, built to paste into
GoHighLevel. One visual language across all three, so it never feels like they
have been handed off to a different company halfway along.

| Order | File | Published at | What it does |
|---|---|---|---|
| 1 | `01-intake-form.html` | `/onboarding-form` | Seven-step intake form. Everything we need to stand the account up. |
| 2 | `02-book-your-call.html` | `/onboarding-calendar` | The onboarding calendar, wrapped in the same card. |
| 3 | `03-thank-you.html` | `/onboarding-thank-you` | Confirmation, what happens next, and one thing they can do now. |

All three on `www.hauckmarketing.com`. Note that the APEX (`hauckmarketing.com`)
is the Vercel marketing site and `www` is the GHL funnel: different hosts, same
brand, so always write the `www.` in these links.

## How one page reaches the next

The two hand-offs work differently, which is the thing to remember when one of
them breaks.

| Hop | Mechanism | Where to change it |
|---|---|---|
| 1 to 2 | `window.location` on submit | `HM_CONFIG.nextUrl` in `01-intake-form.html` |
| 2 to 3 | The calendar's confirmation redirect | GHL calendar `NK53JD0np0dfOaRpmUWh` settings |

Page 2 contains no link to page 3 and never will: the client must actually book
before they are sent on, and only the calendar knows whether they did. Skip that
GHL setting and they land on GoHighLevel's own generic confirmation, finishing
the flow on someone else's page.

If the redirect out of page 1 is ever blocked by the browser, its confirmation
screen carries a "Book your call" link to the same address, so the funnel has no
dead end.

Each file is entirely self-contained: markup, styles and behaviour in one block,
no framework and no build step. They repeat their CSS on purpose, because each
is pasted into a separate GHL page and cannot share a stylesheet.

## Putting them in GoHighLevel

For each page: **Funnel > add a step > Custom JS/HTML element**, paste the whole
file, then set the step to full width and clear GHL's own padding.

The pages are already hardened for GHL's builder, which does four things that
break naively-written custom code:

| GHL behaviour | What the code does about it |
|---|---|
| Strips `<link>` tags out of custom blocks | Fonts load via `@import` inside the `<style>` block instead |
| Wraps the block in its own narrow column | `width:100vw; margin-left:calc(50% - 50vw)` breaks out, so the background runs edge to edge |
| Its theme CSS reaches into the block | Targeted resets on `button`, `input`, `label`, `ol`, `dl` inside `.hm-funnel` only |
| Can run the script before the markup lands, or render a block twice | `boot()` waits for the markup, then marks the node so it is never wired twice |

Everything is namespaced under `.hm-` and scoped to `.hm-funnel`, so it cannot
leak out into the rest of the GHL page either.

Then, in the **calendar settings** for `NK53JD0np0dfOaRpmUWh`, set the booking
confirmation to redirect to the URL of page 3. Skip that and GHL shows its own
generic confirmation, and the client finishes the flow on someone else's page.

## Before the form can save anything

Page 1 posts to the Command Center API at `app.hauckmarketing.com/api/intake`.
That API is live and tested. Two things must be true before a GHL-hosted page
can reach it:

1. `HM_CONFIG.apiBase` at the top of the script points at the deployed app.
2. **`FUNNEL_URL` is set to page 1's published address**, the whole link and no
   trailing slash (`https://www.hauckmarketing.com/onboarding-form`). The API
   derives the allowed CORS origin from it, so a browser on any other domain is
   blocked and every save fails. One setting, read two ways, because two settings
   could disagree and the failure that causes is a form that looks live and
   silently cannot save. It goes in Doppler (`hauck-command-center`/`prd`) and in
   the Cloudflare Pages project. It is configuration, not a deploy: there is no
   origin list in `functions/api/_middleware.ts` to edit.

Until item 2 is done, `01-intake-form.html` ships with:

```js
dryRun: true
```

The form then works end to end, keeps progress in the browser, and hands off to
the calendar, but posts nothing. A form that looks like it saved and did not is
worse than one that plainly does nothing.

**To go live:** publish the funnel, set `FUNNEL_URL` to page 1's address, then
flip `dryRun` to `false` in page 1. That order matters: flipping `dryRun` first
makes every save die on CORS.

## Where submissions land

Once live, a completed form appears in the admin board at `/admin/onboarding`,
in the **Waiting on you** column. Nothing becomes a client until it is approved
there. Approving creates the tenant, the owner login, their setup record and
their Google Drive folder, and holds the client behind a "still being set up"
screen until Go Live is pressed on their record.

Full detail: `command-center/app/docs/build-plans/onboarding-funnel-board.md`.

## Keeping the form and the server in step

`01-intake-form.html` carries its own copy of the field schema. The server
**silently drops any key it does not recognise**, so a typo here does not error,
it just quietly bins that client's answer.

The two must stay identical. To check:

```bash
node -e '
const fs=require("fs");
const html=fs.readFileSync("Client Onboarding Funnel/01-intake-form.html","utf8");
const ts=fs.readFileSync("command-center/app/src/lib/intake.ts","utf8");
const b=ts.slice(ts.indexOf("export const INTAKE_FIELDS"));
const tsKeys=[...b.slice(0,b.indexOf("\n];")).matchAll(/key: "([a-zA-Z]+)"/g)].map(m=>m[1]);
const h=html.slice(html.indexOf("var FIELDS = ["));
const hKeys=[...h.slice(0,h.indexOf("\n  ];")).matchAll(/key: "([a-zA-Z]+)"/g)].map(m=>m[1]);
const missing=tsKeys.filter(k=>!hKeys.includes(k)), extra=hKeys.filter(k=>!tsKeys.includes(k));
console.log(missing.length||extra.length ? "MISMATCH "+[...missing,...extra].join(", ") : "schemas match ("+tsKeys.length+" fields)");
'
```

## Decisions worth remembering

- **Assets are links, not uploads.** A public unauthenticated upload endpoint is
  a storage-bombing target and the app has no storage bucket. Clients paste a
  Drive or Dropbox link instead.
- **The A2P block is back, and it is optional.** Step 2 asks for legal business
  name, EIN, business structure and job title. These were cut once, on the
  reasoning that a brand-new client should not be asked for legal details, and
  chasing them by email afterwards is what held texting up. A carrier will not
  register a business texting number without all four. They are optional, so a
  client who does not know their EIN off-hand still reaches the end of the form
  and the gap is caught by the A2P item on their setup checklist instead.
- **The EIN says why it is being asked.** Its help text names the sensitivity
  out loud, explains that the carriers check a business is real before letting
  it text, and links to an explainer. An unexplained request for a tax ID on a
  web form reads as a scam, and a client who thinks that abandons the form.
- **The login email follows the contact email** until the client edits it, so
  step 3 is usually two keystrokes and a password.
- **Progress saves after every step.** The resume token goes into the URL so a
  bookmarked or forwarded link works, and into `localStorage` as a second copy,
  because some funnel builders sandbox `history.replaceState`. The stored copy
  is cleared on submit, so the next person on a shared machine gets a fresh form
  rather than someone else's thank-you screen.
