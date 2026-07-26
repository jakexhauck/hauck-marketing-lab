# Client Onboarding Funnel

The three pages a newly signed client walks through, built to paste into
GoHighLevel. One visual language across all three, so it never feels like they
have been handed off to a different company halfway along.

| Order | File | What it does |
|---|---|---|
| 1 | `01-intake-form.html` | Seven-step intake form. Everything we need to stand the account up. |
| 2 | `02-book-your-call.html` | The onboarding calendar, wrapped in the same card. |
| 3 | `03-thank-you.html` | Confirmation, what happens next, and one thing they can do now. |

Each file is entirely self-contained: markup, styles and behaviour in one block,
no framework and no build step. They repeat their CSS on purpose, because each
is pasted into a separate GHL page and cannot share a stylesheet.

## Putting them in GoHighLevel

For each page: **Funnel > add a step > Custom JS/HTML element**, paste the whole
file, then set the step to full width and clear GHL's own padding. The cards
carry their own max-width and centring; a GHL column wrapped around them makes
everything narrower than designed.

Then, in the **calendar settings** for `NK53JD0np0dfOaRpmUWh`, set the booking
confirmation to redirect to the URL of page 3. Skip that and GHL shows its own
generic confirmation, and the client finishes the flow on someone else's page.

## Before the form can save anything

Page 1 posts to the Command Center API at `app.hauckmarketing.com/api/intake`.
That API is live and tested. Two things must be true before a GHL-hosted page
can reach it:

1. `HM_CONFIG.apiBase` at the top of the script points at the deployed app.
2. **The funnel's origin is on the allowed-origins list** in
   `command-center/app/functions/api/_middleware.ts`. That list is currently
   `app.hauckmarketing.com` only, so a browser on any other domain is blocked by
   CORS and every save fails.

Until item 2 is done, `01-intake-form.html` ships with:

```js
dryRun: true
```

The form then works end to end, keeps progress in the browser, and shows the
thank-you screen, but posts nothing. A form that looks like it saved and did not
is worse than one that plainly does nothing.

**To go live:** send the published funnel domain, get it added to the
allowed-origins list, deploy that change, then flip `dryRun` to `false`.

## Where submissions land

Once live, a completed form appears in the admin board at `/admin/onboarding`,
in the **Waiting on you** column. Nothing becomes a client until it is approved
there. Approving creates the tenant and the owner login, and holds the client
behind a "still being set up" screen until Go Live is pressed.

Full detail: `docs/build-plans/client-onboarding-full.md`.

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
- **No Tax ID / EIN.** Cut deliberately: we do not ask a brand-new client for
  legal business details. A2P phone registration still needs one, so it has to
  be collected by email or on the kickoff call before texting can go live.
- **The login email follows the contact email** until the client edits it, so
  step 3 is usually two keystrokes and a password.
- **Progress saves after every step**, with a resume token in the URL. Closing
  the tab loses nothing.
