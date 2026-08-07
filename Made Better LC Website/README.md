# Made Better LC Website

Seven pages, built to live in GoHighLevel, but **not pasted into it**. Each GHL
step holds a two-line stub that loads the real site from the Command Center, so
a copy change, a new photo or a phone number ships by deploy and nobody reopens
the GHL builder.

> The pages used to be pasted in full: seven files, six of them carrying
> byte-identical CSS and JS. Changing the footer phone number meant seven edits,
> and GHL held seven snapshots that drifted apart the moment one was missed.
> They are now one file and seven pointers.

The real file: **`command-center/app/public/sites/made-better/site.js`**

| Page | Published at | Stub |
|---|---|---|
| Home | `/home` | `home.html` |
| Services | `/services` | `services.html` |
| About | `/about` | `about.html` |
| Contact | `/contact` | `contact.html` |
| Thank you | `/thank-you` | `thank-you.html` |
| Privacy Policy | `/privacy-policy` | `privacy-policy.html` |
| Terms | `/terms` | `terms.html` |

## The review funnel is a separate file

`/review` is **not** one of the seven. It is its own stub (`review.html`) loading
its own file, `command-center/app/public/sites/made-better/review.js`.

Five stars, one tap. 4 or 5 goes to the Google review page; 1 to 3 opens a
feedback box in place, below the stars. It asks for no name, phone or email:
the link is handed out by QR code and in person, so the feedback is anonymous
by design.

It is deliberately not an eighth page in `site.js`. A funnel wants no nav and
no footer, it should not pull 120KB of website to ask one question, and editing
it must not be able to break the seven live pages.

**Three things are unwired on purpose**, each one line in `review.js`:

| Setting | While empty | To connect |
|---|---|---|
| `CONFIG.googleReviewUrl` | 4 and 5 stars end on a thank-you card instead of redirecting | Paste the Google Business Profile "write a review" link |
| `CONFIG.webhookUrl` | The feedback form says plainly it could not send and shows the phone number | Paste a GHL inbound webhook URL |
| `CONFIG.positiveWebhookUrl` | 4 and 5 star taps fall back to `webhookUrl`, so nothing is lost | Paste a **second** GHL inbound webhook URL, from its own workflow |

### The two webhooks

Both fire form-encoded, and both carry `sentiment` so a workflow can branch on
one field rather than parsing a rating.

| | 1 to 3 stars | 4 or 5 stars |
|---|---|---|
| Sent | On form submit | On the star tap, by `sendBeacon`, just before the Google redirect |
| Goes to | `webhookUrl` | `positiveWebhookUrl` (falls back to `webhookUrl`) |
| Waits for a reply | Yes. A failed send shows the phone number, never a thank-you | No. The visitor is already leaving for Google |
| Payload | `rating`, `rating_label`, `sentiment=negative`, `feedback`, `first_name`, `last_name`, `full_name`, `phone`, `email`, `outcome=feedback`, `attributed`, `source` | `rating`, `rating_label`, `sentiment=positive`, `outcome`, `attributed`, `source`, plus `contact_id`/`email`/`phone` if the link carried them |

`outcome` on the positive side is `sent_to_google`, or `google_not_configured`
while `googleReviewUrl` is still empty. It means **the visitor was sent to
Google**, not that a review was posted: Google never tells us whether they
actually wrote one. Word the GHL notification that way or Seamus will sit
refreshing his Google page waiting for a review nobody submitted.

The 4/5 ping is anonymous unless the link carried GHL merge fields, so read
`attributed` before trying to tag a contact off it.

## How one file draws seven pages

The stub names its page and nothing else:

```html
<div id="mb" data-page="services"></div>
<script src="https://app.hauckmarketing.com/sites/made-better/site.js"></script>
```

`boot()` reads `data-page`, injects the stylesheet once, and renders the header,
that page's body, and the footer. A typo or a missing `data-page` falls back to
Home and logs a warning, because a blank page in front of a customer is the
worst outcome available.

The header and footer are built per page rather than stored seven times. On Home
the section links are same-page anchors (`#work`); everywhere else they have to
travel to Home first (`/home#work`). The current page is marked rather than
linked away from.

## Changing things

Almost everything worth changing sits in the `CONFIG` block at the top of
`site.js`: the phone number, the email, the logo, and the estimate webhook. Each
is written once and used on every page that needs it.

Page copy lives in the `PAGES` map, one entry per page, plain HTML.

## Putting them in GoHighLevel

For each page: **the step > Custom JS/HTML element**, delete what is there,
paste the whole stub file, then set the step to full width and clear GHL's own
padding.

The code is hardened for GHL's builder, which does four things that break
naively-written custom code:

| GHL behaviour | What the code does about it |
|---|---|
| Strips `<link>` tags out of custom blocks | Fonts load via `@import` inside the injected `<style>` |
| Wraps the block in its own narrow column | `width:100vw` plus negative margins break out, so the page runs edge to edge |
| Its theme CSS reaches into the block | Every rule is scoped to `#mb` |
| Can run the script before the markup lands, or render a block twice | `boot()` polls for the root, then marks it so it is never wired twice |

Nothing goes live until the Command Center is deployed. Until then the GHL step
renders an empty div.

## The estimate form is not connected

`CONFIG.webhookUrl` is empty. While it is, the form **refuses to pretend**: it
shows the phone number and leaves the button usable.

The pasted pages did the opposite. With no webhook they ran `done()`, which sent
the visitor to the thank-you page having posted nothing, so every estimate
request looked received and was silently lost. A form that plainly does nothing
is worse than nothing; a form that fakes success is worse than both.

**To connect it:** in Made Better's GHL sub-account create a Workflow whose
trigger is **Inbound Webhook**, copy the URL it hands back, paste it into
`CONFIG.webhookUrl`, deploy. Home answers in place (it has a success panel);
Contact sends the visitor to `/thank-you`.

### It posts form-encoded, and it does NOT use no-cors

The estimate posts a `URLSearchParams` body with an ordinary `fetch`, and reads
`res.ok`. Both halves were measured against the live hook, not assumed:

| Measured | Result |
|---|---|
| `OPTIONS` preflight to the hook | **204**, `access-control-allow-headers: *`, POST allowed |
| `POST` form-encoded from a browser on another origin | **200**, `{"status":"Success: ..."}`, readable |

So GHL **does** answer preflights: JSON would have worked too. Form-encoding is
a CORS-safelisted content type, which skips the preflight round trip, so this is
a latency saving rather than a correctness fix.

The half that *is* load-bearing: GHL replies with `access-control-allow-origin:
*`, so an ordinary cors fetch can read the response and tell a delivered
estimate from a rejected one. `mode:"no-cors"` would make the reply opaque and
throw that away, which is how a form ends up showing a thank-you over a lead
nobody received. Do not add it back.

The single `Name` box is split on the first space into `first_name` and
`last_name` (with the untouched value also sent as `full_name`). Sending one
whole name is what leaves business names sitting in the wrong contact fields.
The other keys are `phone`, `email`, `postal_code`, `service`, `notes` and
`source`, named to match GHL's standard contact fields so the workflow can map
them without hand-typing each one.

## Decisions worth remembering

- **One classic script, not ES modules.** A cross-origin module script requires
  CORS headers on the response; a classic script does not. The site is served
  from `app.hauckmarketing.com` and rendered on the GHL domain, so it is always
  cross-origin.
- **It ships from `public/`.** Cloudflare then serves it at a stable, unhashed
  URL. A bundled file gets a content hash that changes every deploy, which would
  break all seven stubs at once.
- **The fonts were almost certainly never loading.** The pasted pages declared
  Fraunces, Archivo and JetBrains Mono with a `<link>` tag, which GHL strips.
  They now load via `@import`, which survives it.
- **`#mb` is the mount point, not a wrapper inside it.** The stylesheet is 800
  lines keyed on `#mb`, and the full-bleed breakout is applied to that same
  element, so the stub div carries the id directly and the CSS needed no
  rewriting.
