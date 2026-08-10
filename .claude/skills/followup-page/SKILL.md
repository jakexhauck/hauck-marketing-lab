---
name: followup-page
description: Use when building an SMS follow-up asset page for a client's paid-ads leads — triggers like "build a follow up page", "new asset page for the follow ups", "nurture page", "SMS follow up page", "another one like the Willis phone-estimate page", "recent job page". Builds one page at a time: the SMS that sells the click, the served JS page it lands on, the calendar embed that books the appointment, and a verified browser walk-through before it ships.
---

# Follow-up asset page

The page an SMS sends a lead to when they came in from a Facebook ad and did
**not** book. Willis Windows is the reference build.

The funnel converts cold traffic. This works a lead who is already in the CRM.
Different job, different rules.

## When to Use This Skill

- "Build a follow up page for `<client>`."
- "Another one like the Willis phone-estimate page."
- Changing an existing follow-up page.

Not for the ads funnel (`ads-funnel`), the client app (`finish-client-page`),
or a brochure site (`web-designer`).

## The Architecture

```
command-center/app/public/sites/<client>/fu/<slug>.js    mounts #<prefix>fu
```

GHL holds a two-line pointer stub at the slug. Copy and design edits ship by
deploy, in git, with no page builder.

**The page carries the GHL calendar EMBED, not a link to a booking page.** The
lead reads the page and books on it. One page, one click, done. The calendar
collects their name, email and phone fresh, so there is no PII in any URL and
no prefill to break.

## The Intake, In Order

Purpose gets locked before a single asset is requested. Ask 1 to 3 first, on
their own. Nothing else is asked until the SMS is approved.

**1. Which client?**

**2. Which follow-up is this?** New leads coming in, or estimate assets.

**3. Write the SMS.** Draft it, show it, let Jake approve or revise. Use the
copywriter skill. The two live Willis messages are the pattern:

> Hey {{contact.first_name}}! Did you know that we give home estimates over the
> phone? If you are interested in finding out how exactly we quote houses (and
> apply the $100 discount), Click here to give this a read 👉
> https://williswindows.com/phone-estimate

> {{contact.first_name}}, this one's one of my favorites! A recent full window
> cleaning near you. Check it out and when you are ready send us a reply and we
> can get started!
>
> 👉 https://williswindows.com/recent-cleaning

What makes them work, and what to keep:

- First person, owner's voice. "This one's one of my favourites" is a person
  talking, not a business broadcasting.
- Opens on `{{contact.first_name}}`.
- One idea only. A question or a claim, never both.
- The link is the last thing, on its own, behind 👉.
- Casual punctuation and lower stakes. No offer stack, no urgency, no caps.

**The approved SMS decides the page type. Do not ask for it separately.** The
page exists to pay off exactly what the message promised.

**4. Design.** Their main website to lift palette, fonts and radii from. No
site, ask Jake for a design kit. Neither, default to the Willis Windows look
and font. **Always ask which colours to use, even on the default.** The default
is a starting point, not a decision already made.

**5. Logo.** A `.webp` and a `.png` fallback.

**6. Assets for this exact page.** Now that the purpose is known, ask for the
specific photos, video or before/after pair this page needs. Never a pile.

**7. What is the appointment?** Phone estimate, in-person visit, something
else. Every CTA line depends on it. Willis quotes over the phone; the next
client may not.

**8. The GHL calendar embed code.**

**9. The slug.** Clean and readable: `/phone-estimate`, `/recent-cleaning`. No
reference number. The domain is not needed, the page is hosted on GHL.

## Page Types

The approved SMS picks one. The library grows as new ones get invented.

| Type | Job |
|---|---|
| `objection-killer` | Names the friction and dissolves it |
| `recent-job` | Proof, near them, recent |
| `how-it-works` | The process in three steps |
| `pricing-transparency` | What it costs and why |
| `owner-story` | Who they are actually hiring |
| `guarantee` | Risk reversal |
| `seasonal-urgency` | Why now |

Blocks any type can use: hero, photo, before/after slider, video, gallery,
copy block, proof chips, calendar embed. The purpose picks the blocks, and the
SMS pre-frame decides how heavy the page can be.

**Hard rule: the SMS promise and the page's first screen must say the same
thing.** "Did you know we quote over the phone" has to land on a page whose
headline is about quoting over the phone. A mismatch bounces the click.

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

## Verify Before Shipping

Playwright, real browser, never "should work".

- 320, 390 and 1440. No horizontal overflow at any of them.
- Every image loads. A missing asset shows as a gap, not a broken icon.
- The before/after slider drags on touch and mouse.
- A video block with no URL draws a "coming soon" tile, never a broken iframe.
- The calendar embed renders and resizes inside the card.
- The page reads grammatically for this client's appointment type.

## Ship

Commit, push, then poll the live file **by CONTENT and twice**.
`app.hauckmarketing.com` answers 200 with a 1447-byte SPA shell for any path
that does not exist, and the edge serves that stale shell for about a minute
after the real file lands. A status code proves nothing.

Then hand Jake a numbered checklist: create the GHL page at the slug, paste the
stub, paste the SMS into the step.

## Then Page Two

New-lead follow ups only ever get **two** asset sends. Once page one ships, go
straight into page two for the same client without re-asking client, design,
colours, logo, appointment type or calendar embed. Only the purpose, the SMS
and the assets change.

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
- **A GHL soft 404 answers 200 with an empty body,** so a wrong slug looks like
  a blank page rather than an error and nobody reports it.
- **No phone number on the page.** Book or reply, nothing else. The number
  belongs in error states only.
