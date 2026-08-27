---
name: ads-funnel
description: Use when building a paid-traffic lead funnel for a client — triggers like "build a funnel for <client>", "new ads landing page", "survey funnel", "quote funnel", "landing page for the Facebook ads", "same funnel we did for Willis". Builds the three-page survey → booking → thank-you funnel: served JS files in the Command Center, two-line pointer stubs in GHL, real webhook wiring, and a verified browser walk-through before it ships.
---

# Ads funnel (survey → booking → thank-you)

The repeatable three-page funnel that cold Facebook traffic lands on. Willis
Windows is the reference build: `command-center/app/public/sites/willis/`.

## When to Use This Skill

Use this skill when Jake asks for:

- A new landing page or funnel for paid traffic, for any client.
- "The same funnel we built for Willis" for someone else.
- Changes to an existing funnel built this way.

Do **not** use it for the client-facing Command Center app (that is
`finish-client-page`) or for a brochure website (that is `web-designer`).

## The Architecture, In One Breath

```
Facebook ad
  → /quote              quote.js    the survey. POSTs the lead to GHL here.
  → /book               booking.js  the calendar, prefilled
  → /thank-you-quote    thanks.js   confirmation. The Meta pixel fires HERE.
```

Three served files in `command-center/app/public/sites/<client>/`. GHL holds a
**two-line pointer stub** per step and nothing else, so every question, price
and redirect ships by deploy instead of by reopening a page builder.

**The lead POSTs at the end of the survey, BEFORE the calendar.** Somebody who
opens the booking page, sees no time they like and closes the tab is still a
lead the client can ring. Never move the POST to after the booking.

## Step 1: Ask Jake These, Before Writing Anything

Ask all of them at once. Anything he does not have, note as a blocker and build
around it rather than inventing a value.

**Brand and assets**
1. The client's **live website URL**. Read it and lift the palette, fonts and
   radii off it. Do not invent a look. A page that does not resemble the site
   the ad claims to represent converts worse.
2. **Logo** file (a `.webp` and a `.png` fallback).
3. **Background photo** for behind the survey. Real crew or real work, not
   stock. Check the client's brand notes: several rule stock out by name.

**The offer and the copy**
4. The **headline / offer** exactly as it should read ("$100 Off Residential
   Window Cleaning!"). It appears on the survey, the submit button and the
   thank-you page.
5. **Three trust proofs** for the chips ("Fully insured", "60+ five-star
   reviews", "The owners do every job"). Real ones. Do not write these yourself.
6. **The three "what happens next" steps** on the thank-you page: what the
   client actually does after a booking.

**The survey**
7. **The questions**, in order, with their answer options.
8. **Is there a disqualifier?** Willis's step 1 is "Do you live in Metro
   Detroit?" and "No" ends the funnel dead, posting nothing. Ask which question
   DQs, and what the sorry-card should say.
9. **The service area**, for that card ("about 30 miles of Metro Detroit").
10. **Do we need the address?** Default is the ZIP alone (Jake, 2026-08-27):
    it answers the only question the survey has to ask, can the client drive
    there, and the street is asked on the call. Ask for the street and city
    only if the client genuinely quotes off the property before ringing, and
    then it is three fields, never one box.

**The appointment**
11. **The calendar embed code** from GHL.
12. **What the appointment actually IS**: a phone call or an on-site visit, and
    how long. Every line of the thank-you pre-frame depends on this. Then open
    the calendar in a browser and confirm the answer matches what the widget
    itself says.

**Plumbing**
13. **GHL sub-account / location ID.**
14. **The inbound webhook URL** — a NEW one for this funnel. Never share a
    webhook with an existing landing page or the leads cannot be told apart
    afterwards.
15. **The domain and the three step paths.**
16. **Is a phone number allowed on the page?** Default is no: a call off a paid
    click is a conversion Meta cannot count. Willis keeps its number in the two
    error states only.

## Step 2: Build

Copy the three Willis files and rework them. They are the template; there is no
separate scaffold to drift out of date.

```
command-center/app/public/sites/<client>/
  quote.js      mounts #<x>q
  booking.js    mounts #<x>b
  thanks.js     mounts #<x>t
  logo.webp  logo.png  <photo>.webp
```

Then the pointer stubs, one per step, in `<client>-landing/`:

```html
<div id="wwq"></div>
<script src="https://app.hauckmarketing.com/sites/<client>/quote.js"></script>
```

Give every mount id a client-specific prefix. Two funnels sharing `#wwq` on one
GHL account will fight.

## Step 3: Verify In A Real Browser, Before Shipping

Serve the files locally, drive them with Playwright, and prove all of it. Never
ship on "should work".

- The survey at **320, 390 and 1440**. No horizontal overflow at any of them.
- Every validation path rejects the right field.
- **Back restores what they typed.**
- The disqualifier stops dead and posts nothing.
- The posted payload carries every field (stub `window.fetch` and read it).
- The handoff writes, the redirect fires, and the calendar arrives **prefilled**.
- The real GHL calendar renders and resizes inside the card.
- Every copy variant of the thank-you page reads grammatically.

## Step 4: Ship And Confirm Live

Commit, push, then poll the live file. **Check file CONTENT, never the status
code:** `app.hauckmarketing.com` answers 200 with a 1447-byte SPA shell for any
path that does not exist, and the edge serves that stale shell for about a
minute after the real file lands. Check twice.

Then hand Jake a numbered checklist: the stubs to paste, the calendar redirect
to set, the webhook fields to map. The GHL-side tables are in
[the wiring reference](reference.md).

## Gotchas

Every one of these has already cost a real debugging session.

- **The CSS is a JS template literal.** A backtick anywhere inside it, even in
  a CSS comment, silently ends the string and the file stops parsing.
- **GHL theme CSS carries `!important`,** so an unweighted reset LOSES and the
  submit button renders as tracked-out capitals. But once your reset is
  `!important` it also flattens your own margins, so every element that wants
  spacing must restate it at the same weight.
- **`#id @media(...)` is dead CSS.** Write `@media (...) { #id .x {...} }`.
- **GHL builders strip `<link>` tags** out of custom code blocks. Load fonts
  with `@import` inside the stylesheet.
- **Never use the `100vw` breakout.** It counts the scrollbar, so it needs a
  measured width, and the measurement is circular: the card growing summons the
  scrollbar, which changes the width, which resizes the card. Use `width:100%`
  plus `flattenWrappers()` walking the ancestors with inline `!important`.
- **`min-height:100vh`, not `100dvh`.** dvh shrinks as mobile Safari's toolbar
  slides away and the backdrop visibly resizing under a fixed card looks broken.
- **Inputs need `font-size:16px` minimum** or iOS Safari zooms in on focus and
  never zooms back out. They also need an explicit `max-width:100%`: GHL themes
  clamp inputs (one ships `max-width:300px !important`) and it only shows on
  desktop.
- **Do not map `full_name` or `name` into a single GHL name field.** GHL
  re-splits it and empties first/last. Split on the last space and send
  `first_name` / `last_name`.
- **The `facebook ads` tag is not cosmetic.** `functions/lib/adsRevenue.ts`
  joins completed jobs to contacts by it. No tag means ROAS reads zero while
  the ads are working.
- **A GHL soft 404 answers 200 with an empty body,** so a renamed step looks
  like a blank page rather than an error and nobody reports it. Verify the
  redirect targets by title, not status.
- **The booking iframe needs a floor height.** GHL's `form_embed.js` sizes it
  and ad blockers eat that script on exactly the traffic that arrives from an
  ad. Set a `min-height` that is usable on its own and only grow from there.
- **The calendar's after-booking redirect is set in GHL, not in code.** The
  booking happens in a cross-origin iframe. Left empty, the appointment is
  real but the pixel never fires and every booked job reads as zero
  conversions.
- **Hand the lead to the booking page in `sessionStorage`, not the query
  string,** so no real person's phone number lands in browser history, a
  referrer header or GHL's analytics. Same origin, so it just works.
- **Never invent the booked-time parameter.** GHL's post-booking redirect
  passes something, but the name is not stable. Check known names, then scan
  for a value that parses as a plausible appointment, then fall back to copy
  that reads correctly with no time at all. A wrong time is worse than none.
- **Never post test data to a live client webhook casually.** If you must
  populate a GHL trigger's sample, use obviously fake values (`ZZTEST
  DeleteMe`) and tell Jake exactly what to delete.
