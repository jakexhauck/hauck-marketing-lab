// MADE BETTER LC follow-up asset 2 of 3: OWNER STORY.
//
// WHERE IT SITS
//   New lead, text 2 goes out:
//
//     "Yo {{contact.first_name}}, I saw you came to us through facebook and
//      just wanted to send you over my personal story and how I started the
//      business. P.S there's also a small gift for you on the page:"
//
//   This page is what that colon points at. It has two jobs and only two: show
//   them who they are hiring, and hand over the gift they were already
//   promised. So the first screen is Seamus, the first line of the story, and
//   the 15% in plain sight. The lead already knows the company by name, so
//   nothing here introduces it, re-pitches it or repeats the text back at them.
//   It ends on the calendar, because a time is the only thing left to ask for.
//
// GoHighLevel holds a two-line stub:
//   <div id="madebefu"></div>
//   <script src="https://app.hauckmarketing.com/sites/made-better-landscaping-co/fu/meet-the-owner.js"></script>
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.
//
// The look is deliberately identical to recent-work.js and our-process.js. The
// three pages arrive at the same lead in the same week, so they read as one
// company or the whole sequence reads as three different ones.
//
// THE TRAPS, every one of which has already cost a live debugging session:
//   1. STYLES below is a JS template literal. A backtick anywhere inside it,
//      including inside a CSS comment, silently ends the string and the whole
//      file stops parsing. There is not one in there. Do not add one.
//   2. GHL's theme CSS carries !important, so an unweighted reset loses. Once
//      the reset is !important it flattens our own p and button margins too,
//      so every element that wants spacing restates it at the same weight.
//   3. Media queries are written @media (...) { #madebefu .x {...} }. The
//      inverse, #madebefu @media(...), is dead CSS that fails silently.
//   4. The builder strips link elements, so the fonts load by @import.
//   5. No background shorthand with !important anywhere: it nukes
//      background-image and outranks an inline poster. The photograph is an img
//      element and surfaces use background-color longhand.
//   6. No 100vw breakout. It counts the scrollbar and the measurement is
//      circular. Width 100% plus wrapper flattening instead.
//   7. min-height:100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar
//      slides away, and the first screen visibly resizing looks broken.
//   8. The calendar iframe carries a floor height of its own. GHL's
//      form_embed.js sizes it, and ad blockers eat that script on exactly the
//      traffic that arrives from an ad.

(function () {
  "use strict";

  var ROOT_ID = "madebefu";

  var CONFIG = {
    // The website's logo, not the uploaded copy: one mark across the site, the
    // review card and all three follow-up pages. Transparent PNG, so it sits on
    // white without a box round it.
    logo: "https://app.hauckmarketing.com/sites/made-better/logo.png",

    owner: {
      name: "Seamus Geohagen",
      role: "Owner, Made Better Landscaping Co",
      photo:
        "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/5aa6666d-6d76-49f1-a3e1-06b0dcdedaed/owner/262d3496-4413-446b-ad10-09ee470e402c.jpg"
    },

    // The gift the text message already promised. It sits on the first screen,
    // not down by the calendar, because it was promised before they arrived and
    // a promise made in the text and kept halfway down the page reads as a
    // bait. Terms are exactly what was agreed and nothing more.
    gift: {
      label: "The gift I mentioned",
      headline: "15% off your project",
      terms: "It is yours on anything booked from this page."
    },

    trust: [
      "Licensed",
      "Insured",
      "Residential only",
      "Three full seasons",
      "Oakland, Macomb, Wayne and Washtenaw"
    ],

    // The booking widget, from the embed GHL generated. The iframe markup is
    // reproduced verbatim in view(); this is the script that sizes it.
    embedScript: "https://go.madebetterlc.com/js/form_embed.js",
    embedOrigin: "go.madebetterlc.com",

    // Below this, a height claimed for the calendar is not believed. See the
    // long note above watchHeight. The floor the calendar starts at lives in
    // the stylesheet, because that is the value that has to hold with no
    // JavaScript help at all.
    minTrustedHeight: 420
  };

  // NOTE: template literal. No backticks below this line until the closing one.
  var STYLES = `
/* @import rather than a link element: the GHL builder strips link tags out of
   custom code blocks, which silently drops the fonts on the pasted page. The
   faces are the ones the Made Better website already uses, so this page and
   madebetterlc.com read as the same company. */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');

/* ===== GHL WRAPPER FLATTENING =====
   Strip padding and width caps off every builder level. Done here for the
   levels GHL names, and again in JS for the ones it does not. */
.c-section, .c-wrapper, .c-row, .c-column, .c-element,
.hl_page-preview--content, .section-wrap, .row-wrap, .col-wrap,
.inner, .container, .fullSection, .fullRow {
  padding:0 !important;
  margin-top:0 !important; margin-bottom:0 !important;
  margin-left:0 !important; margin-right:0 !important;
  max-width:100% !important; width:100% !important;
  background-color:transparent !important;
}
.c-section > .inner, .c-row > .inner, .c-column > .inner {
  max-width:100% !important; padding:0 !important;
}
html, body { overflow-x:hidden !important; }
body { margin:0 !important; padding:0 !important; }

#madebefu *, #madebefu *::before, #madebefu *::after { box-sizing:border-box !important; }

#madebefu {
  /* Every colour here is sampled from the logo mark: the brown brick, the gold
     brick and the leaf. Gold is the one accent and it is a FILL colour at
     2.93:1 on white, so gold used as text takes the darker value instead. */
  --bark:#160E07;
  --gold:#C38D33;
  --gold-2:#A87729;
  --gold-text:#856022;
  --paper:#FFFFFF;
  --wash:#F7F4EE;
  --wash-2:#EFEAE0;
  --line:#E6DFD1;
  --head:#160E07;
  --body:#5F5548;
  --muted:#6B6153;
  --display:'Plus Jakarta Sans','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --text:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --radius:10px;
  --radius-lg:16px;

  display:block !important;
  width:100% !important; max-width:100% !important;
  margin:0 !important; padding:0 !important;
  position:relative !important;
  overflow-x:hidden !important;
  background-color:var(--paper) !important;
  font-family:var(--text) !important;
  font-size:17px !important;
  line-height:1.65 !important;
  color:var(--body) !important;
  text-align:left !important;
  -webkit-font-smoothing:antialiased;
}

/* The reset is !important because the theme is. Which means every rule that
   wants space back has to say so at the same weight, and they all do. */
#madebefu p, #madebefu h1, #madebefu h2, #madebefu h3, #madebefu h4,
#madebefu ul, #madebefu ol, #madebefu li, #madebefu figure, #madebefu figcaption,
#madebefu blockquote, #madebefu cite, #madebefu aside, #madebefu section, #madebefu div {
  margin:0 !important; padding:0 !important;
}
#madebefu ul, #madebefu li { list-style:none !important; }
#madebefu img { display:block !important; max-width:100% !important; border:0 !important; }
#madebefu button {
  margin:0 !important; text-transform:none !important; letter-spacing:normal !important;
  font-family:inherit !important; line-height:normal !important;
}
#madebefu input {
  margin:0 !important; max-width:none !important; box-shadow:none !important;
  font-family:inherit !important;
  /* 16px floor or iOS Safari zooms on focus and never zooms back out. */
  font-size:16px !important;
}
#madebefu cite { font-style:normal !important; }

/* ===== TYPE ===== */
#madebefu h1, #madebefu h2, #madebefu h3 {
  font-family:var(--display) !important;
  color:var(--head) !important;
  font-weight:800 !important;
  letter-spacing:-.02em !important;
  line-height:1.12 !important;
  text-transform:none !important;
}
#madebefu h1 { font-size:clamp(30px,5.6vw,50px) !important; }
#madebefu h2 { font-size:clamp(26px,4.2vw,40px) !important; }
#madebefu h3 { font-size:19px !important; font-weight:700 !important; letter-spacing:-.015em !important; }

#madebefu .mbfu-eyebrow {
  font-family:var(--display) !important;
  font-size:12.5px !important; font-weight:700 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:var(--gold-text) !important;
  margin:0 0 14px !important;
}

/* ===== LAYOUT ===== */
#madebefu .mbfu-wrap {
  width:100% !important; max-width:1000px !important;
  margin:0 auto !important;
  padding:0 20px !important;
}
#madebefu .mbfu-sec { padding:76px 0 !important; }

/* ===== TOP BAR =====
   The mark, small. They already know who this is, so it identifies the page
   rather than introducing the company. */
#madebefu .mbfu-top {
  border-bottom:1px solid var(--line) !important;
  background-color:var(--paper) !important;
}
#madebefu .mbfu-top-in {
  display:flex !important; align-items:center !important; gap:12px !important;
  height:72px !important;
}
/* Square and contained, not a round avatar. The logo is a diamond with MADE and
   BETTER along its top two edges, so a circular crop with object-fit:cover eats
   exactly the corners the words sit in. */
#madebefu .mbfu-mark {
  width:52px !important; height:52px !important; flex:none !important;
  border-radius:0 !important; object-fit:contain !important;
  border:0 !important;
}
#madebefu .mbfu-name {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:800 !important; letter-spacing:-.02em !important;
  color:var(--head) !important;
}

/* ===== FIRST SCREEN =====
   min-height on 100vh, never 100dvh: the backdrop must not resize under them as
   the Safari toolbar slides away. It is a floor, so a tall screen gets the face,
   the first line of the story, the gift and the button together, and a short one
   simply scrolls. */
#madebefu .mbfu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:44px 0 56px !important;
  background-color:var(--paper) !important;
  position:relative !important;
  overflow:hidden !important;
}
#madebefu .mbfu-hero-grid {
  display:grid !important;
  grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr) !important;
  gap:48px !important;
  align-items:center !important;
}
#madebefu .mbfu-hero h1 { max-width:15ch !important; }
#madebefu .mbfu-lede {
  font-size:17.5px !important; color:var(--muted) !important;
  max-width:50ch !important;
  margin:16px 0 0 !important;
}

/* The portrait. A photograph of a person, given a shape rather than a frame: no
   circular crop, because a head cropped to a circle at this size reads as a
   profile picture and this is meant to read as him. */
#madebefu .mbfu-portrait {
  position:relative !important;
  width:100% !important; max-width:100% !important; min-width:0 !important;
  aspect-ratio:4 / 5;
  overflow:hidden !important;
  border-radius:var(--radius-lg) !important;
  background-color:var(--wash-2) !important;
  box-shadow:0 2px 6px rgba(22,14,7,.06), 0 30px 60px -30px rgba(22,14,7,.42) !important;
}
#madebefu .mbfu-portrait img {
  width:100% !important; height:100% !important;
  /* Weighted high: a person standing in a yard puts the face in the top third
     of the frame, and the face is the part of this photograph doing the work. */
  object-fit:cover !important; object-position:50% 28% !important;
}
#madebefu .mbfu-plate { margin:16px 0 0 !important; }
#madebefu .mbfu-plate .mbfu-plate-name {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:800 !important; letter-spacing:-.02em !important;
  color:var(--head) !important;
  margin:0 !important;
}
#madebefu .mbfu-plate .mbfu-plate-role {
  font-size:14.5px !important; color:var(--muted) !important; margin:2px 0 0 !important;
}

/* ===== THE GIFT =====
   Solid gold, on the first screen, above the calendar. It is the one loud thing
   on the page and it is loud on purpose: it was promised in the text before
   they clicked, and a promise kept quietly halfway down reads as a bait. Ink is
   bark, never white: gold and white is about 2.9:1 and unreadable. */
#madebefu .mbfu-gift {
  background-color:var(--gold) !important;
  border-radius:var(--radius-lg) !important;
  padding:22px 24px !important;
  margin:28px 0 0 !important;
  max-width:34rem !important;
  box-shadow:0 14px 34px -18px rgba(195,141,51,.95) !important;
}
#madebefu .mbfu-gift .mbfu-gift-label {
  font-family:var(--display) !important;
  font-size:12px !important; font-weight:700 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:rgba(22,14,7,.68) !important;
  margin:0 0 8px !important;
}
#madebefu .mbfu-gift .mbfu-gift-head {
  font-family:var(--display) !important;
  font-size:clamp(25px,4.6vw,33px) !important; font-weight:800 !important;
  letter-spacing:-.025em !important; line-height:1.1 !important;
  color:var(--bark) !important;
  margin:0 !important;
}
#madebefu .mbfu-gift .mbfu-gift-terms {
  font-size:15px !important; line-height:1.5 !important;
  color:rgba(22,14,7,.78) !important;
  margin:8px 0 0 !important;
}

/* ===== BUTTON =====
   Dark ink on gold. The label names the appointment they are actually booking,
   which is somebody coming out to the house, not a phone quote. */
#madebefu .mbfu-btn {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  gap:8px !important;
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:#160E07 !important;
  background-color:var(--gold) !important;
  border:2px solid var(--gold) !important;
  border-radius:var(--radius) !important;
  padding:15px 28px !important;
  cursor:pointer !important;
  box-shadow:0 12px 26px -14px rgba(195,141,51,.9) !important;
  transition:background-color .18s, border-color .18s, transform .18s !important;
  max-width:100% !important;
}
#madebefu .mbfu-btn:hover { background-color:var(--gold-2) !important; border-color:var(--gold-2) !important; }
#madebefu .mbfu-btn:active { transform:translateY(1px) !important; }
/* The second button, under the story, where gold twice in a row would shout.
   Same size and same target, quieter surface. */
#madebefu .mbfu-btn-quiet {
  color:var(--head) !important;
  background-color:var(--paper) !important;
  border-color:var(--head) !important;
  box-shadow:none !important;
}
#madebefu .mbfu-btn-quiet:hover { background-color:var(--head) !important; border-color:var(--head) !important; color:#FFFFFF !important; }
#madebefu .mbfu-actions { margin:26px 0 0 !important; }

/* ===== THE STORY ===== */
#madebefu .mbfu-story {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
  border-bottom:1px solid var(--line) !important;
}
#madebefu .mbfu-story .mbfu-body {
  max-width:34rem !important;
  margin:22px 0 0 !important;
}
#madebefu .mbfu-story .mbfu-body p {
  font-size:18.5px !important; line-height:1.62 !important;
  color:var(--head) !important;
  margin:0 !important;
}
#madebefu .mbfu-story .mbfu-body p + p { margin-top:16px !important; }
/* The age line. It is the objection every homeowner is already holding, so it
   gets said out loud and given its own weight instead of being buried mid
   paragraph where it looks like it is hiding. */
#madebefu .mbfu-pull {
  border-left:3px solid var(--gold) !important;
  padding:2px 0 2px 20px !important;
  margin:26px 0 !important;
  max-width:34rem !important;
}
#madebefu .mbfu-pull p {
  font-family:var(--display) !important;
  font-size:clamp(20px,2.6vw,24px) !important; font-weight:700 !important;
  letter-spacing:-.02em !important; line-height:1.32 !important;
  color:var(--head) !important;
  margin:0 !important;
}
#madebefu .mbfu-sign {
  display:flex !important; align-items:center !important; gap:12px !important;
  border-left:3px solid var(--line) !important;
  padding:2px 0 2px 17px !important;
  margin:30px 0 0 !important;
}
#madebefu .mbfu-sign p { margin:0 !important; }
#madebefu .mbfu-sign .mbfu-sign-name {
  font-family:var(--display) !important;
  font-size:15.5px !important; font-weight:800 !important; letter-spacing:-.02em !important;
  color:var(--head) !important;
}
#madebefu .mbfu-sign .mbfu-sign-role { font-size:14px !important; color:var(--muted) !important; }

/* ===== WHAT THAT MEANS FOR YOU ===== */
#madebefu .mbfu-cards {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:36px 0 0 !important; padding:0 !important;
}
#madebefu .mbfu-card {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  padding:26px 24px !important;
  margin:0 !important;
  min-width:0 !important;
}
#madebefu .mbfu-card .mbfu-card-icon {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  width:36px !important; height:36px !important;
  border-radius:999px !important;
  background-color:var(--wash-2) !important;
  color:var(--gold-text) !important;
  margin:0 0 16px !important;
}
#madebefu .mbfu-card h3 { margin:0 0 8px !important; }
#madebefu .mbfu-card p { font-size:16px !important; line-height:1.6 !important; color:var(--body) !important; margin:0 !important; }

/* ===== TRUST ===== */
#madebefu .mbfu-trust {
  display:flex !important; flex-wrap:wrap !important; gap:10px !important;
  margin:26px 0 0 !important; padding:0 !important;
}
#madebefu .mbfu-trust li {
  display:inline-flex !important; align-items:center !important; gap:8px !important;
  font-size:14px !important; font-weight:600 !important;
  color:var(--head) !important;
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:999px !important;
  padding:8px 14px !important; margin:0 !important;
}
#madebefu .mbfu-trust svg { flex:0 0 14px !important; color:var(--gold-text) !important; }

/* ===== BOOKING =====
   The page ends here. The calendar is in the page, not behind a link. */
#madebefu .mbfu-book {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
}
#madebefu .mbfu-book .mbfu-lede { margin:16px 0 0 !important; }
/* The gift said once more, small, at the moment they are choosing a slot. Not a
   second offer and not a countdown, just the term restated where it applies. */
#madebefu .mbfu-gift-note {
  display:inline-flex !important; align-items:center !important; gap:9px !important;
  font-family:var(--display) !important;
  font-size:14.5px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:var(--head) !important;
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:999px !important;
  padding:9px 16px !important;
  margin:20px 0 32px !important;
}
#madebefu .mbfu-gift-note svg { flex:0 0 14px !important; color:var(--gold-text) !important; }
#madebefu .mbfu-cal {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  /* Tight padding on purpose: GHL's widget draws its own generous margins and
     doubling them wastes the fold on a phone. */
  padding:12px !important;
  overflow:hidden !important;
  box-shadow:0 2px 6px rgba(22,14,7,.06), 0 26px 56px -28px rgba(22,14,7,.30) !important;
}
/* A FLOOR, not a height. form_embed.js only ever grows it, and when an ad
   blocker eats that script the calendar is still usable at this size. */
#madebefu .mbfu-cal iframe {
  display:block !important;
  width:100% !important; max-width:100% !important;
  min-height:780px !important;
  border:0 !important; margin:0 !important; padding:0 !important;
  background-color:transparent !important;
}
#madebefu .mbfu-cal br { display:none !important; }
#madebefu .mbfu-fallback {
  font-size:14.5px !important; color:var(--muted) !important;
  margin:14px 0 0 !important;
}

/* ===== FOOT ===== */
#madebefu .mbfu-foot {
  border-top:1px solid var(--line) !important;
  background-color:var(--paper) !important;
  padding:30px 0 !important;
}
#madebefu .mbfu-foot-in {
  display:flex !important; align-items:center !important; gap:12px !important;
  flex-wrap:wrap !important;
}
#madebefu .mbfu-foot p {
  font-size:13.5px !important; color:var(--muted) !important; margin:0 !important;
}

#madebefu :focus-visible { outline:3px solid var(--gold) !important; outline-offset:3px !important; }

#madebefu .mbfu-in { animation:mbfuIn .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes mbfuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE =====
   Written @media (...) { #madebefu .x {...} }. The inverse nesting is dead CSS
   that fails without an error. */
@media (max-width: 900px) {
  #madebefu .mbfu-hero-grid {
    display:flex !important; flex-direction:column !important; gap:26px !important;
  }
  /* The face first on a phone. The text promised a person, so the person is the
     first thing on the screen, and the portrait gets a wider crop here so it
     does not eat the whole viewport before a word is read. */
  #madebefu .mbfu-hero-media { order:-1 !important; width:100% !important; }
  #madebefu .mbfu-portrait { aspect-ratio:4 / 3; }
  /* The plate under the photograph says his name, and stacked it lands directly
     above an eyebrow that says his name. Two lines of the same thing between the
     face and the gift, so the plate goes. */
  #madebefu .mbfu-plate { display:none !important; }
  #madebefu .mbfu-hero h1 { max-width:100% !important; }
  #madebefu .mbfu-cards { grid-template-columns:minmax(0,1fr) !important; }
  #madebefu .mbfu-sec { padding:60px 0 !important; }
}
@media (max-width: 600px) {
  #madebefu { font-size:16.5px !important; }
  #madebefu .mbfu-wrap { padding:0 16px !important; }
  #madebefu .mbfu-hero { padding:26px 0 44px !important; }
  #madebefu .mbfu-hero-grid { gap:22px !important; }
  /* Every pixel here pushes the gift down, and the gift is the half of the
     promise that is easiest to miss. */
  #madebefu .mbfu-lede { font-size:16.5px !important; margin-top:12px !important; }
  #madebefu .mbfu-gift { padding:18px 18px !important; margin-top:22px !important; }
  #madebefu .mbfu-btn { width:100% !important; padding:16px 20px !important; }
  #madebefu .mbfu-story .mbfu-body p { font-size:17.5px !important; }
  #madebefu .mbfu-pull { padding-left:16px !important; margin:22px 0 !important; }
  #madebefu .mbfu-gift-note { margin:18px 0 26px !important; }
  #madebefu .mbfu-cal { padding:8px !important; }
  /* A phone stacks the month grid above the times, so the floor has to be
     taller here than on a desktop or the calendar arrives clipped. */
  #madebefu .mbfu-cal iframe { min-height:900px !important; }
}
/* A 320px phone. GHL's widget lays out its own month grid inside the iframe and
   starts clipping the Saturday column around here, so the card gives back every
   pixel it can rather than spending them on padding. */
@media (max-width: 360px) {
  #madebefu .mbfu-wrap { padding:0 12px !important; }
  #madebefu .mbfu-cal { padding:4px !important; }
  #madebefu .mbfu-card { padding:22px 18px !important; }
  #madebefu .mbfu-gift-note { font-size:13.5px !important; padding:8px 13px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #madebefu .mbfu-in { animation:none !important; }
  #madebefu .mbfu-btn { transition:none !important; }
}
`;

  var TICK =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  function icon(path) {
    return (
      '<span class="mbfu-card-icon">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      path +
      "</svg></span>"
    );
  }

  // Four claims, and every one of them is something already true of the
  // business. Nothing here is a guarantee, a warranty or a number that was not
  // handed over.
  var POINTS = [
    {
      icon: '<path d="M12 3l8 4v5c0 4.4-3.2 7.9-8 9-4.8-1.1-8-4.6-8-9V7z"/>',
      title: "I am on your job",
      body:
        "I am not a salesman who books the work and hands it to somebody else. I am there while it is being built."
    },
    {
      icon: '<path d="M4 19h16M6 15l4-9 4 9M9 15h6"/>',
      title: "The estimate is free",
      body:
        "I come out, look at the space, and tell you what it would take. There is no charge for it and no obligation to book the work."
    },
    {
      icon: '<path d="M12 4v16M8.5 8.5h6M8.5 15h6"/>',
      title: "The price is the price",
      body:
        "You get the number before anything starts, and there are no costs added on later."
    },
    {
      icon: '<path d="M12 21s-7-4.6-7-10a7 7 0 0114 0c0 5.4-7 10-7 10z"/><circle cx="12" cy="11" r="2.4"/>',
      title: "Local, and licensed",
      body:
        "Licensed and insured, homes only, working across Oakland, Macomb, Wayne and Washtenaw counties."
    }
  ];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function point(p) {
    return (
      '<li class="mbfu-card">' +
      icon(p.icon) +
      "<h3>" + esc(p.title) + "</h3>" +
      "<p>" + esc(p.body) + "</p>" +
      "</li>"
    );
  }

  function trust() {
    var out = "";
    for (var i = 0; i < CONFIG.trust.length; i++) {
      out += "<li>" + TICK + esc(CONFIG.trust[i]) + "</li>";
    }
    return '<ul class="mbfu-trust">' + out + "</ul>";
  }

  function view() {
    var points = "";
    for (var i = 0; i < POINTS.length; i++) points += point(POINTS[i]);

    return (
      '<div class="mbfu-top">' +
        '<div class="mbfu-wrap mbfu-top-in">' +
          '<img class="mbfu-mark" src="' + esc(CONFIG.logo) + '" width="52" height="52" alt="Made Better Landscaping Co">' +
          '<span class="mbfu-name">Made Better Landscaping Co</span>' +
        "</div>" +
      "</div>" +

      // The first screen. It carries on from the text rather than answering a
      // different question: the promise was the owner and a gift, so the owner
      // and the gift are what is on it, and nothing introduces the company in
      // front of them.
      '<section class="mbfu-hero mbfu-in">' +
        '<div class="mbfu-wrap">' +
          '<div class="mbfu-hero-grid">' +
            '<div class="mbfu-hero-copy">' +
              '<p class="mbfu-eyebrow">' + esc(CONFIG.owner.name) + ", owner</p>" +
              "<h1>I started this company at 15.</h1>" +
              '<p class="mbfu-lede">I am 18 now, three seasons in, and I am still on site for every patio and every walkway we build. Here is the whole story, and the gift I mentioned is right below it.</p>' +

              '<aside class="mbfu-gift">' +
                '<p class="mbfu-gift-label">' + esc(CONFIG.gift.label) + "</p>" +
                '<p class="mbfu-gift-head">' + esc(CONFIG.gift.headline) + "</p>" +
                '<p class="mbfu-gift-terms">' + esc(CONFIG.gift.terms) + "</p>" +
              "</aside>" +

              '<div class="mbfu-actions">' +
                '<button class="mbfu-btn" type="button" data-goto="book">Book my home estimate</button>' +
              "</div>" +
            "</div>" +

            '<div class="mbfu-hero-media">' +
              '<div class="mbfu-portrait">' +
                '<img src="' + esc(CONFIG.owner.photo) + '" alt="' + esc(CONFIG.owner.name) + ', owner of Made Better Landscaping Co" decoding="async">' +
              "</div>" +
              '<div class="mbfu-plate">' +
                '<p class="mbfu-plate-name">' + esc(CONFIG.owner.name) + "</p>" +
                '<p class="mbfu-plate-role">' + esc(CONFIG.owner.role) + "</p>" +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</section>" +

      // The story itself. Short sentences, his words, and the age objection said
      // out loud in the middle of it rather than left for the homeowner to work
      // out on their own.
      '<section class="mbfu-sec mbfu-story">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">How it started</p>' +
          "<h2>Fifteen, a shovel and one yard.</h2>" +
          '<div class="mbfu-body">' +
            "<p>I was 15 when I took on my first paving job. No crew, no office, just me and a yard that needed doing.</p>" +
            "<p>I liked that the work was honest. You either set the base properly or the whole thing moves on you in a year, and everybody can see which one you did.</p>" +
            "<p>That was three full seasons ago. Made Better is a real company now, licensed and insured, doing hardscaping and brick paving for homes across Metro Detroit.</p>" +
          "</div>" +
          '<div class="mbfu-pull">' +
            "<p>I know what you are thinking. He is 18. Let me answer that instead of hoping you do not notice.</p>" +
          "</div>" +
          '<div class="mbfu-body">' +
            "<p>I do not have a big name to coast on, so I earn every job. I am on site for all of them, and if something is not right, you are talking to the person who built it, not a call center.</p>" +
            "<p>Almost all of our work comes from neighbors pointing us at other neighbors. That only keeps happening if I get it right the first time, so that is what I turn up to do.</p>" +
          "</div>" +
          // Name only, no thumbnail. The same photograph at 44px is a person
          // shaped speck on a mower, and his face is already the size of a hand
          // at the top of the page.
          '<div class="mbfu-sign">' +
            "<div>" +
              '<p class="mbfu-sign-name">' + esc(CONFIG.owner.name) + "</p>" +
              '<p class="mbfu-sign-role">' + esc(CONFIG.owner.role) + "</p>" +
            "</div>" +
          "</div>" +
          '<div class="mbfu-actions">' +
            '<button class="mbfu-btn mbfu-btn-quiet" type="button" data-goto="book">Book my home estimate</button>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="mbfu-sec">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">What that means for you</p>' +
          "<h2>What you get when you hire me.</h2>" +
          '<ul class="mbfu-cards">' + points + "</ul>" +
          trust() +
        "</div>" +
      "</section>" +

      '<section class="mbfu-sec mbfu-book" id="mbfu-book">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">Book a home estimate</p>' +
          "<h2>Pick a time and I will come out.</h2>" +
          '<p class="mbfu-lede">I walk the space with you, talk through what you want, and give you a price on the spot. Any open slot below is a time I am free.</p>' +
          '<p class="mbfu-gift-note">' + TICK + "Your 15% off comes with anything booked here.</p>" +
          '<div class="mbfu-cal">' +
            // Pasted exactly as GHL generated it. The script tag that came with
            // it is appended in JS instead, because a script inserted through
            // innerHTML never runs.
            '<iframe src="https://go.madebetterlc.com/widget/booking/0x75rqKB89fnlGKZuoEs" allow="payment" style="width: 100%;border:none;overflow: hidden;" scrolling="no" id="0x75rqKB89fnlGKZuoEs_1786485874592"></iframe><br>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<div class="mbfu-foot">' +
        '<div class="mbfu-wrap mbfu-foot-in">' +
          '<img class="mbfu-mark" src="' + esc(CONFIG.logo) + '" width="52" height="52" alt="">' +
          "<p>Made Better Landscaping Co. Licensed and insured. Metro Detroit.</p>" +
        "</div>" +
      "</div>"
    );
  }

  // Inline !important beats any theme rule without having to guess its
  // selector, and it reaches the wrapper levels the stylesheet cannot name.
  function flattenWrappers(root) {
    for (var n = root.parentElement; n && n !== document.body; n = n.parentElement) {
      n.style.setProperty("padding", "0", "important");
      n.style.setProperty("margin-top", "0", "important");
      n.style.setProperty("margin-bottom", "0", "important");
      n.style.setProperty("margin-left", "0", "important");
      n.style.setProperty("margin-right", "0", "important");
      n.style.setProperty("max-width", "none", "important");
      n.style.setProperty("width", "100%", "important");
      n.style.setProperty("overflow-x", "clip", "important");
    }
  }

  function wireScroll(root) {
    var btns = root.querySelectorAll("[data-goto]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var target = root.querySelector("#mbfu-book");
        if (!target) return;
        var reduce = false;
        try {
          reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch (e) {}
        target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    }
  }

  function loadEmbedScript(root) {
    if (document.querySelector("script[data-mbfu-embed]")) return;
    var s = document.createElement("script");
    s.setAttribute("data-mbfu-embed", "1");
    s.type = "text/javascript";
    s.src = CONFIG.embedScript;
    s.onerror = function () {
      // Not fatal, and it must not be treated as fatal: the iframe keeps its
      // floor height and the calendar still books. This is the ad blocker case,
      // which is common on exactly the traffic that arrives from an ad. The
      // only place a phone number is allowed on this page is a broken state,
      // and this state is not broken, so there is still no number.
      var cal = root.querySelector(".mbfu-cal");
      if (cal && !cal.querySelector(".mbfu-fallback")) {
        var p = document.createElement("p");
        p.className = "mbfu-fallback";
        p.textContent = "If the times do not load, reply to my text and I will book it for you.";
        cal.appendChild(p);
      }
    };
    document.body.appendChild(s);
  }

  // THE HEIGHT, and why it is not just the CSS floor.
  //
  // The floor in the stylesheet is what the calendar gets when form_embed.js
  // never runs, and it is deliberately generous, because a calendar with no
  // times visible is unusable and a page that is slightly too tall is not.
  // When the script DOES run it measures the widget honestly (about 612px on a
  // phone), and a 900px floor would then leave a third of the card empty under
  // the times. So a real measurement replaces the floor rather than fighting
  // it: the frame becomes exactly as tall as the widget says it is.
  //
  // Anything under 420px is ignored on purpose. That is the iframe's own
  // default height and a widget that has not drawn yet, and honouring it would
  // collapse the calendar to a sliver.
  var lastH = 0;
  function applyHeight(frame, h) {
    if (!h || h < CONFIG.minTrustedHeight || h > 6000 || h === lastH) return;
    lastH = h;
    frame.style.setProperty("height", h + "px", "important");
    frame.style.setProperty("min-height", h + "px", "important");
  }

  function watchHeight(frame) {
    // form_embed.js writes an inline height. Watching for it is what lets the
    // floor stand down once a real number exists.
    try {
      var obs = new MutationObserver(function () {
        applyHeight(frame, parseInt(frame.style.height, 10));
      });
      obs.observe(frame, { attributes: true, attributeFilter: ["style"] });
    } catch (e) {}

    // A backstop independent of form_embed.js: the widget posts its own height
    // out of the iframe, so an ad blocker eating the script still leaves this.
    window.addEventListener("message", function (e) {
      if (typeof e.origin !== "string" || e.origin.indexOf(CONFIG.embedOrigin) === -1) return;

      var d = e.data;
      var h = 0;
      if (d && typeof d === "object") h = parseInt(d.height || d.docHeight || 0, 10);
      else if (typeof d === "string" && d.indexOf("height") !== -1) {
        var m = d.match(/(\d{3,5})/);
        if (m) h = parseInt(m[1], 10);
      }
      applyHeight(frame, h);
    });
  }

  function mount(root) {
    if (!document.querySelector("style[data-mbfu-owner-story]")) {
      var style = document.createElement("style");
      style.setAttribute("data-mbfu-owner-story", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    flattenWrappers(root);
    root.innerHTML = view();

    wireScroll(root);

    var cal = root.querySelector(".mbfu-cal iframe");
    if (cal) watchHeight(cal);
    loadEmbedScript(root);
  }

  // The stub puts the div above the script tag, so the mount is normally there
  // already. The retries cover a builder that defers the block. After that the
  // file does nothing at all: no styles injected, no listeners, no markup.
  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 60) setTimeout(boot, 50);
      return;
    }
    if (root.getAttribute("data-mbfu-ready")) return;
    root.setAttribute("data-mbfu-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
