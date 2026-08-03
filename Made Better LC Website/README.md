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

**To connect it:** create the inbound webhook in GHL, paste its URL into
`CONFIG.webhookUrl`, deploy. Home answers in place (it has a success panel);
Contact sends the visitor to `/thank-you`.

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
