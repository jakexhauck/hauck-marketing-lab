# Willis Windows website, served rather than pasted

**Date:** 2026-08-12
**Status:** in progress

## Why

williswindows.com is seven GoHighLevel pages, each one a single Custom
HTML/Javascript block holding the whole page: styles, markup, the inline script,
and every photo as a base64 `data:` URI. Two problems follow from that.

1. **Nobody can change it.** The only way in is the GHL code editor, which
   refuses to open (tried repeatedly on 2026-08-12, on both the 635 KB Services
   page and the 51 KB Privacy Policy page, so it is the editor and not the
   size). A one-photo swap becomes a manual paste of 600 KB of code.
2. **It already drifts.** `public/sites/willis/quote.js` carries a written
   warning that the site's look was copied off the live block by hand, that the
   block "is NOT in this repo", and that the two will separate if anyone edits
   it in GHL. They have separated: nothing in this repo describes the site.

The funnel pages solved this a month ago. GHL holds a two-line pointer stub, the
page itself is a served file in the Command Center, and it ships by deploy. This
plan puts the website on the same footing.

## Definition of done

- Seven served page files under `public/sites/willis/site/`.
- The ten photos extracted to real files, served, cached, no longer base64.
- The gutter cleaning photo replaced with Jake's new one **on both pages that
  use it** (the Home services card and the Services feature block).
- Every page verified in a real browser at 390 / 768 / 1440 against the live
  page it replaces: same look, working nav, working contact form.
- Deployed, and seven stubs handed to Jake to paste once each.

## Architecture

```
GHL page "Services"        →  <div id="wws"></div>
                              <script src="…/sites/willis/site/services.js"></script>

command-center/app/public/sites/willis/site/
  home.js  services.js  about.js  contact.js
  thank-you.js  privacy-policy.js  terms.js
  img/…                      the ten photos, shared across pages
```

Each page file is a classic script (not a module: cross-origin modules need CORS
headers, classic scripts do not) that waits for `#wws`, refuses to mount twice,
injects the page's CSS and markup, then runs that page's own behaviour as real
code rather than as an inert `<script>` string.

## Port rules

The live block is the source. Nothing is redesigned in this pass.

- **CSS** — lifted verbatim into a `CSS` template literal.
- **Markup** — lifted verbatim into an `HTML` template literal, with `src="data:…"`
  rewritten to the hosted image path. Nothing else changes.
- **Script** — the inline `<script>` body becomes a real `enhance()` function in
  the file. `innerHTML` never executes script tags, so a lifted string would
  silently kill the burger menu and the contact form.

The per-page scripts are: the burger nav (all seven), a link handler
(services, privacy-policy), and the estimate form that POSTs to the GHL inbound
webhook and redirects to /thank-you (contact only).

## Steps

1. Fetch all seven live pages, extract the block from each. **Done.**
2. Extract the ten unique images, dedupe by content hash, write to `img/`.
3. Re-encode Jake's gutter photo to match the slots it lands in (4:3 on
   Services, 16:10 on Home) and point both at it. **Done 2026-08-24** (IMG_1539
   at 1000x750, same `img/gutters.webp` filename so both slots pick it up).
4. Generate the seven page files.
5. Serve locally, walk every page in a browser at three widths, diff against the
   live page. Prove the nav opens, the form validates, and the links go
   somewhere.
6. Deploy to Cloudflare Pages, confirm each file is reachable.
7. Hand Jake the seven stubs. **Only `terms` is pasted as of 2026-08-24**, so
   the other six pages, Home and Services among them, still render the old
   inlined blocks and do not show anything changed in this repo.

## Known trade-off

The page body arrives by JavaScript instead of in the served HTML. Google
renders JavaScript and indexes this kind of page routinely, and the title,
description and social preview tags are GHL page settings that this change does
not touch. But it is a real difference for a site that is meant to rank
locally, unlike the paid-traffic funnel where it costs nothing. Flagged for Jake
rather than decided here. If it ever matters, the fix is to move the domain off
GHL onto Cloudflare Pages and serve real HTML.
