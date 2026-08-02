# Sales Funnel

The pages a **prospect** walks through, built to paste into GoHighLevel. Not to
be confused with `Client Onboarding Funnel/`, which is where an **already-signed
client** goes. Same brand, opposite reader.

| Order | File | Published at | What it does |
|---|---|---|---|
| 1 | `01-pre-call.html` (stub) | (set when the funnel step is created) | Where the demo calendar sends a prospect after they book. Three things to do before the call. |

The booking page itself is not in here: it is `Hauck Marketing Website/book.html`
on the Vercel apex. Remember the split, because it decides which host you are
editing. The APEX (`hauckmarketing.com`) is the Vercel marketing site, `www` is
the GHL funnel.

## GHL holds a pointer, not a copy

`01-pre-call.html` is a two-line stub. It is pasted into the GHL step **once**
and never touched again. Everything the page IS lives in the Command Center:

```
command-center/app/public/funnel/precall.js       <- the page
command-center/app/public/funnel/precall/*.png    <- the result screenshots
```

Change a word, a screenshot, the video or the phone number, deploy the Command
Center, and the live GHL page updates. Nobody reopens the builder.

This is the same pattern the intake form uses, and it exists because the
alternative failed: when a page is pasted in full, GHL owns a snapshot, editing
the repo changes nothing until somebody re-pastes, and the two drift apart every
single time. **There is deliberately no second copy of this markup anywhere.**

The screenshots live next to the script rather than in this folder for the same
reason. One copy, one place.

## Why this page exists

A booked call is not a held call. This page exists to cut no-shows, and it does
it by asking for three small commitments instead of one large one:

1. **Watch the video.** Who I am, what I do, how the call runs.
2. **Reply to my text.** The strongest of the three. Someone who replies once
   has started a conversation, and people who have started a conversation turn
   up. It also proves the number is real before the hour is spent.
3. **Look through the results.** They arrive having already judged the proof, so
   the call is about their business rather than about whether this works.

It was modelled on a competitor's page that also carried a call agenda, an
"about me" block and a reschedule link. Those were cut on purpose: three steps
that get done beat six that get skimmed.

## Putting it in GoHighLevel

1. **Funnel > add a step after the booking page > Custom JS/HTML element.**
2. Paste the whole of `01-pre-call.html`. It is two lines.
3. Set the step to full width and clear GHL's own padding.
4. **Calendar settings > on booking, redirect to this step's URL.** Skip this
   and GHL shows its own generic confirmation, and the prospect finishes on
   someone else's page.

**Nothing renders until the Command Center is deployed.** The stub loads
`precall.js` from `app.hauckmarketing.com`; until that deploy runs, the GHL step
is an empty div.

The script is hardened for GHL's builder, which does five things that break
naively-written custom code.

| GHL behaviour | What the code does about it |
|---|---|
| Strips `<link>` tags out of custom blocks | Fonts load via `@import` inside an injected `<style>` block |
| Wraps the block in its own narrow column | `width:100vw; margin-left:calc(50% - 50vw)` breaks out |
| Its theme CSS reaches into the block | Targeted resets scoped to `.hm-funnel` only |
| Can run the script before the markup lands, or render a block twice | `boot()` polls for the root, then stamps it so it never mounts twice |
| Mangles non-ASCII bytes | The thumbs-up is `&#128077;`, not a raw emoji |

Everything is namespaced under `.hm-` and scoped to `.hm-funnel`, so it cannot
leak into the rest of the GHL page.

## Everything you edit is in one block

Open `command-center/app/public/funnel/precall.js` and look at `CONFIG` at the
top. Nothing else needs touching for routine changes.

| Field | What it does |
|---|---|
| `smsNumber` | The number the confirmation text is sent FROM, full international form (`+13135550142`). While empty, the "Open my messages" button is not rendered at all. |
| `videoEmbedUrl` | The **embed** url, not the watch url. YouTube `/embed/ID`, Vimeo `player.vimeo.com/video/ID`, Loom `/embed/ID`. While empty, a placeholder frame shows. |
| `results` | The screenshots, in order. Drop a line to remove one. Add one by putting the PNG in `public/funnel/precall/` and adding a line. |

Both empty states and both filled states have been checked in a browser.

### Two of the screenshots need checking first

`result-1-campaigns-overview.png` and `result-2-campaigns-december.png` both show
a Meta Ads Manager column preset named **"Peak Presence | Ad Set View"** in the
toolbar. Peak Presence is the agency whose page this one was modelled on.

If that is not our ad account, those two cannot go on this page. The name is
legible at full size and the section header claims the numbers are ours. Delete
their two lines from `CONFIG.results`. The other three are cropped column views
with nothing identifying in them, so they cannot be judged from the pixels alone.

Separately, those same two are 1440px wide and scale down to about 914px in the
card, which makes their table text the smallest on the page. If they survive the
check, consider re-cropping them tighter.

The screenshots carry **no captions**, by request. They are shown whole and left
to speak for themselves. Their `alt` text stays, because it never renders on
screen and it is all a screen reader has to go on.

## Decisions worth remembering

- **Any rule targeting a `<p>` must be written `.hm-funnel .hm-thing`, not
  `.hm-thing`.** The reset block includes `.hm-funnel p{margin:0}`, which scores
  (0,1,1). A bare single-class selector scores (0,1,0) and loses, no matter how
  far down the file it sits, so its margins vanish without any warning. This bit
  twice: `.hm-sub` rendered 125px left of centre under a perfectly centred
  headline, and `.hm-fine` lost its top gap in a block that only appears once
  the SMS number is filled in. Worth knowing that measuring the containers
  proved nothing: every wrapper measured 0.0px off centre while the paragraph
  inside one of them was visibly adrift. Measure the text, not the box round it.
- **The page defaults to VISIBLE and opts in to hiding.** Sections fade up on
  scroll, but the hidden state lives behind a `.hm-js` class the script adds
  only once it is demonstrably running. The first build had the hidden state in
  plain CSS, and a full-page screenshot caught steps 2 and 3 rendering as a
  blank void. Anything that hides content by default fails silently and totally
  when the script does not run, and on this page the part below the fold is the
  part carrying the proof.
- **There is a 2.5 second failsafe** that reveals everything regardless of the
  scroll observer. A builder preview that renders the block inside a zero-height
  or transformed container will never fire the observer. Forgetting to animate
  is a much smaller failure than never appearing.
- **The results stack full width and are never cropped.** They started as a
  three-across grid of 4:3 frames using `object-fit:cover`. The real screenshots
  turned out to be wide strips of table data, between 3:1 and 5:1, which that
  grid would have cropped: it would have cut off the figures, the only reason
  the screenshot is on the page at all.
- **Screenshots render at native width, never stretched.** `width:auto` with a
  `max-width:100%` ceiling, so a screenshot narrower than the card sits centred
  and crisp rather than being blown up into fuzzy text.
- **Image URLs are derived, never hardcoded.** The script reads its own
  `document.currentScript.src` to work out the origin, so the same file serves a
  local preview and production without one absolute URL in the markup.
- **Centred type uses `text-wrap:balance`.** Without it, step 2's intro ended on
  a line containing the single word "up." and step 3's on "speak." Browsers
  without support just wrap normally, so it degrades rather than breaking. The
  hero sub also needed a narrower measure (42ch): at 50ch it balanced into three
  lines that got progressively longer, an upside-down pyramid.
- **This page is indigo, the onboarding pages are green.** Deliberate: this one
  follows the Command Center software, which is what a prospect is being sold.
  To move it onto the brand green instead, change the three `--hm-brand*` values
  at the top of the style block and nothing else.

## Checking it before deploying

There is no build step. Serve the Command Center's public folder and point a
harness page at it, exactly as the GHL step will:

```bash
cd command-center/app/public && python -m http.server 8793
```

Then any HTML file containing these two lines will render the real page:

```html
<div id="hm-precall-root"></div>
<script src="http://localhost:8793/funnel/precall.js"></script>
```

Two things a bare harness does that GHL will not: the browser adds an 8px body
margin, and there is no outer container, so expect about 33px of horizontal
overflow from the `100vw` breakout. `Client Onboarding Funnel/03-thank-you.html`
measures identically, so it is a property of the test, not a defect.
