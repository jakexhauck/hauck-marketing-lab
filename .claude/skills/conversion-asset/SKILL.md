---
name: conversion-asset
description: Use when building one of a client's three conversion assets, the pages the universal follow-up texts send leads to - triggers like "build the recent work page", "owner story page", "unique mechanism page", "conversion asset for <client>", "build the follow up page", "nurture page", "another one like the Willis phone-estimate page". Builds one asset at a time from the brief the Conversion Assets screen produces, and verifies it in a real browser before it ships.
---

# Conversion asset

The page a follow-up text sends a lead to. Every client gets the same three.

| Kind | Path | Sent when | Job | Ends with |
|---|---|---|---|---|
| `recent-work` | `/recent-work` | New lead, text 1 | Proof, before they have met anybody | Book |
| `owner-story` | `/meet-the-owner` | New lead, text 2 | Who they are hiring, plus the gift | Book |
| `unique-mechanism` | `/our-process` | Estimate reminder | Their process, named | Nothing |

The funnel (`ads-funnel`) converts cold traffic. This works a lead who is
already in the CRM. Different job, different rules.

## The texts are not yours to write

The follow-up SMS is universal: written once, living in GHL, sent to every
client's leads. **Never draft one, never ask for one, never put one in a
brief.** If somebody asks for the message, the answer is that it already exists
in GHL and the page is what is being built.

What this means for the page: the promise the universal text makes is fixed, so
the page's first screen has to pay off that fixed promise. Read the live message
in GHL before writing a headline.

## The intake

**There is a screen for this.** Fulfillment > GHL > Conversion Assets collects
everything below and hands over a finished prompt on its last step.

**If you have been handed that prompt, it is self-contained: build from it and
ask nothing.** It already carries the file path, the mount id, the design, the
content, the calendar embed and every rule below. This skill is for the case
where the screen was not used, or where an existing asset is being changed.

Per kind, what the page needs:

- **recent-work** up to five before/after pairs, the reviews as typed, and the
  six trust facts (licensed, insured, years, jobs completed, warranty, service
  area). An empty trust field means leave it off, not "find out".
- **owner-story** owner's name, a photo of them, bullet notes, and **the
  gift**. **You write the story from the notes;** they are raw material, never
  copy to paste.
- **unique-mechanism** a method name and steering notes, both optional. See
  below: this one is built out of positioning, not assets.

## The owner story owes them a gift

The universal text tells the lead there is something for them on the website.
It is a discount, 10% by default, and the brief carries the exact offer, the
code and any terms.

**Build the page so the gift is impossible to miss and needs no hunting.** It
sits above the calendar, not in a footer. A lead who clicked for a discount and
had to scroll for it has been told the message was not quite true.

## unique-mechanism is positioning, not a record

Its job is to make their process feel like a named, deliberate method that
nobody else runs. Not to document what they do.

Assume there is almost nothing to work with: no photos, no written process,
maybe not even the notes field filled in. Build it from the niche and the method
name. If the brief gives no name, invent one that fits the trade and sounds like
theirs rather than like ours.

**Nothing on that page may be a checkable claim.** No statistics, no percentages,
no certifications, no awards, no named guarantee, no "voted best". Describe how
they work and why the usual way falls short. Frame, sequence and language are
what make it land, and none of those can be wrong.

Three or four named steps is the shape. Give each step a name and a sentence.

Shared: the look (their website, a design kit, or the default, and always which
colours), the logo, and for the two booking kinds the appointment type plus the
GHL calendar embed.

**Always ask which colours to use, even on the default.** The default is a
starting point, not a decision already made.

## unique-mechanism asks for nothing

It goes out **inside the estimate reminders**, so everybody reading it already
has an appointment. That page carries **no calendar, no button, no phone
number**. It ends on what to expect at the estimate: what happens, how long it
takes, what to have ready.

Its job is to make somebody who has an appointment want to keep it. A CTA on
that page is a regression, not an improvement, and it is the single easiest
mistake to make here.

## The architecture

```
command-center/app/public/sites/<client>/fu/<slug>.js    mounts #<prefix>fu
```

GHL holds a two-line pointer stub at the path. Copy and design edits ship by
deploy, in git, with no page builder.

**The booking kinds carry the GHL calendar EMBED, not a link to a booking
page.** The lead reads the page and books on it. One page, one click, done. The
calendar collects their name, email and phone fresh, so there is no PII in any
URL and no prefill to break.

## Build

Copy the Willis `fu/` files and rework them. They are the template, so there is
nothing separate to drift.

```
command-center/app/public/sites/<client>/fu/<slug>.js
```

Mount ids get a client-specific prefix. Two clients sharing `#wwfu` on one GHL
account will fight.

Stub, pasted into the GHL page:

```html
<div id="wwfu"></div>
<script src="https://app.hauckmarketing.com/sites/<client>/fu/<slug>.js"></script>
```

Blocks: hero, photo, before/after slider, gallery, copy block, review card,
trust strip, calendar embed. The kind picks the blocks.

## Verify before shipping

Playwright, real browser, never "should work".

- 320, 390 and 1440. No horizontal overflow at any of them.
- Every image loads. A missing asset shows as a gap, not a broken icon.
- The before/after slider drags on touch and mouse.
- The calendar embed renders and resizes inside the card, on the two kinds that
  have one.
- **our-work has no calendar, no CTA button and no phone number anywhere on
  it.** Check this by searching the built file, not by looking at the page.
- The page reads grammatically for this client's appointment type.

## Ship

Commit, push, then poll the live file **by CONTENT and twice**.
`app.hauckmarketing.com` answers 200 with a 1447-byte SPA shell for any path
that does not exist, and the edge serves that stale shell for about a minute
after the real file lands. A status code proves nothing.

Then hand Jake a numbered checklist: create the GHL page at the fixed path,
paste the stub. The message is already in the workflow, so there is nothing to
paste into a step.

## Gotchas

Every one of these has already cost a real debugging session.

- **The CSS is a JS template literal.** A backtick anywhere inside it, even in
  a CSS comment, silently ends the string and the file stops parsing.
- **GHL theme CSS carries `!important`,** so an unweighted reset loses. But
  once your reset is `!important` it flattens your own `<p>` and `<button>`
  margins, so every element that wants spacing must restate it at the same
  weight.
- **`#id @media(...)` is dead CSS.** Write `@media (...) { #id .x {...} }`.
- **GHL builders strip `<link>` tags.** Load fonts with `@import` inside the
  stylesheet.
- **A `background` shorthand with `!important` nukes `background-image`** and
  outranks an inline poster, so every video thumbnail vanishes silently.
- **Inputs need `font-size:16px` minimum** or iOS Safari zooms on focus and
  never zooms back out.
- **Never use the `100vw` breakout.** It counts the scrollbar and the
  measurement is circular. Use `width:100%` plus ancestor flattening.
- **`min-height:100vh`, not `100dvh`.** dvh shrinks as mobile Safari's toolbar
  slides away and the backdrop visibly resizing looks broken.
- **The calendar embed needs a floor height.** GHL's `form_embed.js` sizes it,
  and ad blockers eat that script on exactly the traffic that arrives from an
  ad. Set a `min-height` that is usable on its own.
- **A GHL soft 404 answers 200 with an empty body,** so a wrong path looks like
  a blank page rather than an error and nobody reports it.
- **No phone number on any of them.** Book or reply, nothing else. The number
  belongs in error states only.

## Willis Windows

Willis keeps `/phone-estimate` and `/recent-cleaning`, which predate the three
and match none of them. Both are live and both work. Anomaly client, not the
ICP. Do not "migrate" them without being asked.
