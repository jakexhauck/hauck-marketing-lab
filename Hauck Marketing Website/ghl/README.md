# Hauck Marketing website (GoHighLevel)

Six pages, built to live in GoHighLevel, but **not pasted into it**. Each GHL
step holds a two-line stub that loads the real site from the Command Center, so
a copy change, a stat or a phone number ships by deploy and nobody reopens the
GHL builder.

The real file: **`command-center/app/public/sites/hauck/site.js`**

This is the same pattern as the Made Better LC site. It exists because the
previous approach (a page pasted in full, per step) means GHL owns a snapshot:
editing the repo changes nothing until somebody re-pastes, and the two drift
apart every single time.

## The mechanism

**The Contractor Growth Engine**, for high ticket contractors. Three pillars in
a loop:

| | Pillar | Argument |
|---|---|---|
| 01 | Traffic | Motivated homeowners, not everybody within 25 miles. Custom branded creative, optimised to booked estimates rather than form fills. |
| 02 | Conversion | Contact inside one to five minutes, then relentless multi-channel follow up until they book. Backed by the HBR lead-response research. |
| 03 | Reporting | Your own software. Every ad, lead and estimate visible, and one click to log the outcome. |

Reporting feeds back into Traffic. That loop is the argument the whole site
makes, and it is why the homepage draws a return rail under the three nodes
rather than three cards in a row.

## Pages

| Page | Published at | Stub | `data-page` |
|---|---|---|---|
| Home | `/` | `home.html` | `home` |
| Traffic | `/traffic` | `traffic.html` | `traffic` |
| Conversion | `/conversion` | `conversion.html` | `conversion` |
| Reporting | `/reporting` | `reporting.html` | `reporting` |
| Founder | `/founder` | `founder.html` | `founder` |
| Book a call | `/book` | `book.html` | `book` |

## How one file draws six pages

The stub names its page and nothing else:

```html
<div id="hm" data-page="traffic"></div>
<script src="https://app.hauckmarketing.com/sites/hauck/site.js"></script>
```

`boot()` reads `data-page`, injects the stylesheet once, then renders the
header, that page's body, and the footer. A typo or a missing `data-page` falls
back to Home and logs a warning, because a blank page in front of a prospect is
the worst outcome available.

The header and footer are built per page rather than stored six times, so the
current page is marked rather than linked away from.

## Changing things

Almost everything worth changing sits in the `CONFIG` block at the top of
`site.js`: the phone number, the email, the logo, the booking widget, and
**`CONFIG.paths`**.

`CONFIG.paths` is the published GHL slug of each page. If a slug in the funnel
differs from what is in there, change it **once** in `CONFIG.paths` and every
link across all six pages follows. Never edit links by hand.

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
| Wraps the block in its own narrow, padded column | `width:100vw` plus negative margins break out, and every known wrapper class is stripped, so the page runs edge to edge |
| Its theme CSS reaches into the block | Every rule is scoped to `#hm` |
| Can run the script before the markup lands, or render a block twice | `boot()` polls for the root, then marks it so it is never wired twice |

Nothing goes live until the Command Center is deployed. Until then the GHL step
renders an empty div.

## The booking calendar did not move

`/book` frames the same GoHighLevel widget the old site used
(`link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp`) and loads GHL's
own `form_embed.js`, which is what sizes the iframe to its content. That script
is injected only on the Book page and only once.

## Rules baked into this site

- **No em dashes anywhere.** Not in copy, not in comments. House rule.
- **Every stat on Conversion is sourced** to HBR March 2011, "The Short Life of
  Online Sales Leads" (Oldroyd, McElheran, Elkington), 1.25 million leads across
  42 companies, plus the associated Lead Response Management research for the
  five-versus-thirty-minute figure. The commonly repeated "99% of leads drop off
  after 5 minutes" line is **not** in that study and is deliberately not used.
- **Reporting carries no figures at all.** The dashboard mockups draw redaction
  bars where values would sit. Putting one client's numbers on the agency site
  and implying they are the visitor's is the exact behaviour that page argues
  against.
- **No pricing on the site.** Quoting a number without knowing job value, area
  or capacity would be made up. The FAQ says so out loud.

## Traps this site was built to avoid

Learned the hard way on the Made Better LC build:

- **The whole stylesheet is a JS template literal.** A backtick anywhere inside
  it, including inside a CSS comment, silently ends the string and the file
  stops parsing. Use plain quotes. `node --check site.js` catches it.
- **At-rules must be written bare.** `#hm @media(...)` is invalid CSS and the
  browser drops the entire block. On the Made Better site that meant the hero
  never collapsed and a form sat off the right edge of every phone, for months,
  unnoticed.
- **`--brand` (#1B7A4B) is a fill colour, not a text colour.** It carries white
  text at 4.9:1 on a button, and is far too dark as small green text on the
  near-black canvas. Green text uses `--brand-txt` (#4DBB83, the logo green),
  which clears 8:1 on `--bg`. Never swap the two.
- **Put the reading measure on the text, not on the container.** Anything
  carrying both `.wrap` and a narrower `max-width` gets centred by the auto
  margins and silently falls out of alignment with the rest of the page.

## The old Vercel site

The previous site (the Revenue Recovery System: `index.html`, `capture-c.html`,
`convert-c.html`, `compound-c.html`, `command-center.html`, `founder.html`,
`book.html` in the parent folder) is still deployed to Vercel and still serving
hauckmarketing.com. It is **deliberately left in place** so the live domain does
not go dark before the GHL pages are published and DNS is moved. Delete it after
the cutover, not before.
