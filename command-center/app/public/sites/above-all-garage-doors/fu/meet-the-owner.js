// ABOVE ALL GARAGE DOORS follow-up asset 2 of 3: OWNER STORY.
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
//   promised. So the first screen is Ryan, the start of his story, his video
//   and the 10% in plain sight. The lead already knows the company by name, so
//   nothing here introduces it, re-pitches it or repeats the text back at them.
//   It ends on the calendar, because a time is the only thing left to ask for.
//
// GoHighLevel holds a two-line stub:
//   <div id="aboveafu"></div>
//   <script src="https://app.hauckmarketing.com/sites/above-all-garage-doors/fu/meet-the-owner.js"></script>
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.
//
// The look is deliberately identical to recent-work.js. The pages arrive at
// the same lead in the same week, so they read as one company or the whole
// sequence reads as several different ones.
//
// THE TRAPS, every one of which has already cost a live debugging session:
//   1. STYLES below is a JS template literal. A backtick anywhere inside it,
//      including inside a CSS comment, silently ends the string and the whole
//      file stops parsing. There is not one in there. Do not add one.
//   2. GHL's theme CSS carries !important, so an unweighted reset loses. Once
//      the reset is !important it flattens our own p and button margins too,
//      so every element that wants spacing restates it at the same weight.
//   3. Media queries are written @media (...) { #aboveafu .x {...} }. The
//      inverse, #aboveafu @media(...), is dead CSS that fails silently.
//   4. The builder strips link elements, so the fonts load by @import.
//   5. No background shorthand with !important anywhere: it nukes
//      background-image and outranks the video poster. Surfaces use
//      background-color longhand.
//   6. No 100vw breakout. It counts the scrollbar and the measurement is
//      circular. Width 100% plus wrapper flattening instead.
//   7. min-height:100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar
//      slides away, and the first screen visibly resizing looks broken.
//   8. The calendar iframe carries a floor height of its own. GHL's
//      form_embed.js sizes it, and ad blockers eat that script on exactly the
//      traffic that arrives from an ad.

(function () {
  "use strict";

  var ROOT_ID = "aboveafu";

  var IMG = "https://app.hauckmarketing.com/sites/above-all-garage-doors/fu/img/";

  var CONFIG = {
    // The logo is drawn on solid black with no transparency, so it lives on the
    // black top bar and the black footer and never on the white page.
    logo: IMG + "logo.webp",

    owner: {
      name: "Ryan Michael",
      role: "Owner, Above All Garage Doors",
      // 720x1280 portrait, 35 seconds, shot on a phone in front of a garage.
      video:
        "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/63c9dd32-3be2-4555-a043-a1d99a125ea3/owner/6fe46759-ed06-4b2e-a910-e3dc0e49b13b.mp4",
      // No photo was uploaded, so the poster is the video's own frame at 0.5s.
      // Without one, iOS Safari shows a black box until play is pressed.
      poster: IMG + "owner-poster.webp"
    },

    // The gift the text message already promised. It sits on the first screen,
    // not down by the calendar, because it was promised before they arrived and
    // a promise kept halfway down the page reads as a bait. Terms are exactly
    // what was agreed and nothing more.
    gift: {
      label: "Your gift",
      headline: "10% off",
      terms: "When you book your at-home estimate on this page."
    },

    // The booking widget, from the embed GHL generated. The iframe markup is
    // reproduced verbatim in view(); this is the script that sizes it.
    embedScript: "https://link.hauckmarketing.com/js/form_embed.js",
    embedOrigin: "link.hauckmarketing.com",

    // Below this, a height claimed for the calendar is not believed. See the
    // note above watchHeight.
    minTrustedHeight: 420
  };

  // NOTE: template literal. No backticks below this line until the closing one.
  var STYLES = `
/* @import rather than a link element: the GHL builder strips link tags out of
   custom code blocks, which silently drops the fonts on the pasted page.
   Archivo is heavy and square like the lettering in the logo. */
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');

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

#aboveafu *, #aboveafu *::before, #aboveafu *::after { box-sizing:border-box !important; }

#aboveafu {
  /* The logo is black and chrome with one electric cyan. Cyan is the only
     accent and it is a FILL colour: on white it is about 1.6:1 and unreadable
     as text, so cyan-as-text takes the deep value and cyan fills carry black
     ink, which reads at about 13:1. */
  --ink:#000000;
  --cyan:#51DBFE;
  --cyan-deep:#006F8A;
  --paper:#FFFFFF;
  --wash:#F4F6F7;
  --wash-2:#E7ECEE;
  --line:#E1E6E8;
  --head:#0B0D0E;
  --body:#4A5256;
  --muted:#5E676B;
  --display:'Archivo','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
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
#aboveafu p, #aboveafu h1, #aboveafu h2, #aboveafu h3, #aboveafu h4,
#aboveafu ul, #aboveafu ol, #aboveafu li, #aboveafu figure, #aboveafu figcaption,
#aboveafu blockquote, #aboveafu cite, #aboveafu aside {
  margin:0 !important; padding:0 !important;
}
#aboveafu ul, #aboveafu li { list-style:none !important; }
#aboveafu img { display:block !important; max-width:100% !important; border:0 !important; }
#aboveafu button {
  margin:0 !important; text-transform:none !important; letter-spacing:normal !important;
  font-family:inherit !important; line-height:normal !important;
}
#aboveafu input {
  margin:0 !important; max-width:none !important; box-shadow:none !important;
  font-family:inherit !important;
  /* 16px floor or iOS Safari zooms on focus and never zooms back out. */
  font-size:16px !important;
}

/* ===== TYPE ===== */
#aboveafu h1, #aboveafu h2, #aboveafu h3 {
  font-family:var(--display) !important;
  color:var(--head) !important;
  font-weight:800 !important;
  letter-spacing:-.025em !important;
  line-height:1.08 !important;
  text-transform:none !important;
}
#aboveafu h1 { font-size:clamp(32px,5.4vw,52px) !important; }
#aboveafu h2 { font-size:clamp(27px,4.2vw,42px) !important; }
#aboveafu h3 { font-size:19px !important; font-weight:700 !important; letter-spacing:-.015em !important; line-height:1.25 !important; }

#aboveafu .aafu-eyebrow {
  display:inline-flex !important; align-items:center !important; gap:10px !important;
  font-family:var(--display) !important;
  font-size:12.5px !important; font-weight:700 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:var(--cyan-deep) !important;
  margin:0 0 14px !important;
}
/* A short cyan rule in front of the eyebrow: the accent as a fill, where it
   can be seen, rather than as text, where it cannot. */
#aboveafu .aafu-eyebrow::before {
  content:"" !important;
  display:block !important;
  width:22px !important; height:3px !important;
  border-radius:2px !important;
  background-color:var(--cyan) !important;
}

/* ===== LAYOUT ===== */
#aboveafu .aafu-wrap {
  width:100% !important; max-width:1000px !important;
  margin:0 auto !important;
  padding:0 20px !important;
}
#aboveafu .aafu-sec { padding:80px 0 !important; }

/* ===== TOP BAR =====
   Black, because the logo is a black JPG with no transparency and a black box
   floating on white would look pasted in. It identifies the page rather than
   introducing the company. */
#aboveafu .aafu-top { background-color:var(--ink) !important; }
#aboveafu .aafu-top-in {
  display:flex !important; align-items:center !important;
  height:76px !important;
}
#aboveafu .aafu-logo {
  height:54px !important; width:auto !important;
  object-fit:contain !important;
}

/* ===== FIRST SCREEN =====
   min-height on 100vh, never 100dvh: the page must not resize under them as
   the Safari toolbar slides away. It is a floor, so a tall screen gets the
   words, the gift and the video together and a short one simply scrolls.

   Four children in DOM order: head, gift, video, button. A phone reads them in
   that order, so the gift lands on the first screen above a video that is
   taller than the screen is wide. A desktop puts the video in a column of its
   own beside the other three. */
#aboveafu .aafu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:48px 0 56px !important;
  background-color:var(--paper) !important;
}
#aboveafu .aafu-hero-grid {
  display:grid !important;
  grid-template-columns:minmax(0,1fr) minmax(0,360px) !important;
  grid-template-areas:"head media" "gift media" "act media" !important;
  grid-template-rows:auto auto 1fr !important;
  column-gap:64px !important;
  align-items:start !important;
}
#aboveafu .aafu-hero-head { grid-area:head !important; align-self:end !important; }
#aboveafu .aafu-gift { grid-area:gift !important; }
#aboveafu .aafu-hero-media { grid-area:media !important; align-self:center !important; min-width:0 !important; }
#aboveafu .aafu-hero .aafu-actions { grid-area:act !important; }
#aboveafu .aafu-hero h1 { max-width:14ch !important; }
#aboveafu .aafu-lede {
  font-size:17.5px !important; color:var(--muted) !important;
  max-width:46ch !important;
  margin:16px 0 0 !important;
}

/* ===== THE VIDEO =====
   Native controls, playsinline, metadata only, never autoplay. Portrait,
   because it was shot on a phone, and the box matches so there are no black
   bars down the sides. */
#aboveafu .aafu-video {
  position:relative !important;
  width:100% !important; max-width:100% !important;
  aspect-ratio:9 / 16;
  overflow:hidden !important;
  border-radius:var(--radius-lg) !important;
  background-color:var(--ink) !important;
  box-shadow:0 2px 6px rgba(0,0,0,.06), 0 30px 60px -30px rgba(0,0,0,.5) !important;
}
#aboveafu .aafu-video video {
  display:block !important;
  width:100% !important; height:100% !important; max-width:none !important;
  object-fit:cover !important;
  margin:0 !important; padding:0 !important; border:0 !important;
  background-color:var(--ink) !important;
}
#aboveafu .aafu-plate { margin:14px 0 0 !important; }
#aboveafu .aafu-plate-name {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:800 !important; letter-spacing:-.02em !important;
  color:var(--head) !important;
  margin:0 !important;
}
#aboveafu .aafu-plate-role { font-size:14.5px !important; color:var(--muted) !important; margin:2px 0 0 !important; }

/* ===== THE GIFT =====
   Solid cyan, on the first screen, above everything else they could touch. It
   is the one loud thing on the page and it is loud on purpose: it was promised
   in the text before they clicked. Ink is black, never white: cyan and white is
   about 1.6:1. */
#aboveafu .aafu-gift {
  display:flex !important; align-items:center !important; gap:20px !important;
  background-color:var(--cyan) !important;
  border-radius:var(--radius-lg) !important;
  padding:22px 24px !important;
  margin:28px 0 0 !important;
  max-width:32rem !important;
  box-shadow:0 16px 34px -20px rgba(0,111,138,.9) !important;
}
#aboveafu .aafu-gift-icon {
  flex:none !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  width:52px !important; height:52px !important;
  border-radius:12px !important;
  background-color:var(--ink) !important;
  color:var(--cyan) !important;
}
#aboveafu .aafu-gift-label {
  font-family:var(--display) !important;
  font-size:12px !important; font-weight:700 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:rgba(0,0,0,.66) !important;
  margin:0 0 4px !important;
}
#aboveafu .aafu-gift-head {
  font-family:var(--display) !important;
  font-size:clamp(28px,4.6vw,36px) !important; font-weight:800 !important;
  letter-spacing:-.03em !important; line-height:1.05 !important;
  color:var(--ink) !important;
  margin:0 !important;
}
#aboveafu .aafu-gift-terms {
  font-size:15px !important; line-height:1.45 !important;
  color:rgba(0,0,0,.8) !important;
  margin:6px 0 0 !important;
}

/* ===== BUTTON =====
   Black with white ink, the logo's own ground. The label names the appointment
   they are booking, which is somebody coming out to the house. */
#aboveafu .aafu-btn {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  gap:10px !important;
  font-family:var(--display) !important;
  font-size:16.5px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:#FFFFFF !important;
  background-color:var(--ink) !important;
  border:2px solid var(--ink) !important;
  border-radius:var(--radius) !important;
  padding:16px 28px !important;
  cursor:pointer !important;
  box-shadow:0 14px 28px -16px rgba(0,0,0,.7) !important;
  transition:background-color .18s, transform .18s !important;
  max-width:100% !important;
}
#aboveafu .aafu-btn svg { color:var(--cyan) !important; flex:none !important; }
#aboveafu .aafu-btn:hover { background-color:#1D2224 !important; border-color:#1D2224 !important; }
#aboveafu .aafu-btn:active { transform:translateY(1px) !important; }
#aboveafu .aafu-actions { margin:26px 0 0 !important; }

/* ===== THE STORY ===== */
#aboveafu .aafu-story {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
  border-bottom:1px solid var(--line) !important;
}
#aboveafu .aafu-body { max-width:34rem !important; margin:24px 0 0 !important; }
#aboveafu .aafu-body p {
  font-size:18.5px !important; line-height:1.62 !important;
  color:var(--head) !important;
  margin:0 !important;
}
#aboveafu .aafu-body p + p { margin-top:16px !important; }
#aboveafu .aafu-pull {
  border-left:3px solid var(--cyan) !important;
  padding:2px 0 2px 20px !important;
  margin:28px 0 !important;
  max-width:34rem !important;
}
#aboveafu .aafu-pull p {
  font-family:var(--display) !important;
  font-size:clamp(21px,2.6vw,25px) !important; font-weight:700 !important;
  letter-spacing:-.02em !important; line-height:1.3 !important;
  color:var(--head) !important;
  margin:0 !important;
}
#aboveafu .aafu-sign {
  border-left:3px solid var(--line) !important;
  padding:2px 0 2px 17px !important;
  margin:30px 0 0 !important;
}
#aboveafu .aafu-sign p { margin:0 !important; }
#aboveafu .aafu-sign .aafu-plate-name { font-size:15.5px !important; }
#aboveafu .aafu-sign .aafu-plate-role { font-size:14px !important; }

/* ===== WHAT THAT MEANS FOR YOU ===== */
#aboveafu .aafu-cards {
  display:grid !important;
  grid-template-columns:repeat(3,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:36px 0 0 !important; padding:0 !important;
}
#aboveafu .aafu-card {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-top:3px solid var(--cyan) !important;
  border-radius:var(--radius-lg) !important;
  padding:26px 24px !important;
  margin:0 !important;
  min-width:0 !important;
}
#aboveafu .aafu-card-icon {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  width:36px !important; height:36px !important;
  border-radius:999px !important;
  background-color:var(--wash-2) !important;
  color:var(--cyan-deep) !important;
  margin:0 0 16px !important;
}
#aboveafu .aafu-card h3 { margin:0 0 8px !important; }
#aboveafu .aafu-card p { font-size:16px !important; line-height:1.6 !important; color:var(--body) !important; margin:0 !important; }

/* ===== BOOKING =====
   The page ends here. The calendar is in the page, not behind a link. */
#aboveafu .aafu-book {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
}
/* The gift said once more, small, at the moment they are choosing a slot. Not a
   second offer and not a countdown, just the term restated where it applies. */
#aboveafu .aafu-gift-note {
  display:inline-flex !important; align-items:center !important; gap:9px !important;
  font-family:var(--display) !important;
  font-size:14.5px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  line-height:1.35 !important;
  color:var(--ink) !important;
  background-color:var(--cyan) !important;
  border-radius:999px !important;
  padding:9px 16px !important;
  margin:20px 0 32px !important;
  max-width:100% !important;
}
#aboveafu .aafu-gift-note svg { flex:0 0 14px !important; }
#aboveafu .aafu-cal {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  /* Tight padding on purpose: GHL's widget draws its own generous margins and
     doubling them wastes the fold on a phone. */
  padding:12px !important;
  overflow:hidden !important;
  box-shadow:0 2px 6px rgba(0,0,0,.05), 0 26px 56px -28px rgba(0,0,0,.30) !important;
}
/* A FLOOR, not a height. form_embed.js only ever grows it, and when an ad
   blocker eats that script the calendar is still usable at this size. */
#aboveafu .aafu-cal iframe {
  display:block !important;
  width:100% !important; max-width:100% !important;
  min-height:780px !important;
  border:0 !important; margin:0 !important; padding:0 !important;
  background-color:transparent !important;
}
#aboveafu .aafu-cal br { display:none !important; }
#aboveafu .aafu-fallback {
  font-size:14.5px !important; color:var(--muted) !important;
  margin:14px 0 0 !important;
}

/* ===== FOOT ===== */
#aboveafu .aafu-foot {
  background-color:var(--ink) !important;
  padding:28px 0 !important;
}
#aboveafu .aafu-foot-in {
  display:flex !important; align-items:center !important; justify-content:space-between !important;
  gap:14px 20px !important; flex-wrap:wrap !important;
}
#aboveafu .aafu-foot .aafu-logo { height:40px !important; }
#aboveafu .aafu-foot p {
  font-size:13.5px !important; color:#A9B2B6 !important; margin:0 !important;
}

#aboveafu :focus-visible { outline:3px solid var(--cyan-deep) !important; outline-offset:3px !important; }

#aboveafu .aafu-in { animation:aafuIn .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes aafuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE =====
   Written @media (...) { #aboveafu .x {...} }. The inverse nesting is dead CSS
   that fails without an error. */
@media (max-width: 860px) {
  #aboveafu .aafu-hero { min-height:0 !important; justify-content:flex-start !important; }
  #aboveafu .aafu-hero-grid { display:flex !important; flex-direction:column !important; align-items:stretch !important; }
  #aboveafu .aafu-hero h1 { max-width:100% !important; }
  /* Capped so a portrait video on a tablet is not a screen and a half tall. */
  #aboveafu .aafu-hero-media { width:100% !important; max-width:380px !important; margin:28px 0 0 !important; }
  #aboveafu .aafu-cards { grid-template-columns:minmax(0,1fr) !important; }
  #aboveafu .aafu-sec { padding:64px 0 !important; }
}
@media (max-width: 600px) {
  #aboveafu { font-size:16.5px !important; }
  #aboveafu .aafu-wrap { padding:0 16px !important; }
  #aboveafu .aafu-top-in { height:64px !important; }
  #aboveafu .aafu-top .aafu-logo { height:42px !important; }
  #aboveafu .aafu-hero { padding:28px 0 48px !important; }
  /* Every pixel above the gift pushes it down, and the gift is the half of the
     promise that is easiest to miss. */
  #aboveafu .aafu-lede { font-size:16.5px !important; margin-top:12px !important; }
  #aboveafu .aafu-gift { padding:18px !important; gap:16px !important; margin-top:22px !important; }
  #aboveafu .aafu-gift-icon { width:44px !important; height:44px !important; }
  #aboveafu .aafu-hero-media { max-width:100% !important; margin-top:24px !important; }
  #aboveafu .aafu-btn { width:100% !important; padding:17px 20px !important; }
  #aboveafu .aafu-body p { font-size:17.5px !important; }
  #aboveafu .aafu-pull { padding-left:16px !important; margin:22px 0 !important; }
  #aboveafu .aafu-gift-note { margin:18px 0 26px !important; border-radius:14px !important; }
  #aboveafu .aafu-cal { padding:8px !important; }
  /* A phone stacks the month grid above the times, so the floor has to be
     taller here than on a desktop or the calendar arrives clipped. */
  #aboveafu .aafu-cal iframe { min-height:900px !important; }
}
/* A 320px phone. GHL's widget lays out its own month grid inside the iframe and
   starts clipping the Saturday column around here, so the card gives back every
   pixel it can rather than spending them on padding. */
@media (max-width: 360px) {
  #aboveafu .aafu-wrap { padding:0 12px !important; }
  #aboveafu .aafu-cal { padding:4px !important; }
  #aboveafu .aafu-card { padding:22px 18px !important; }
  #aboveafu .aafu-gift { padding:16px !important; gap:12px !important; }
  #aboveafu .aafu-gift-icon { display:none !important; }
  #aboveafu .aafu-gift-note { font-size:13.5px !important; padding:8px 13px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #aboveafu .aafu-in { animation:none !important; }
  #aboveafu .aafu-btn { transition:none !important; }
}
`;

  var TICK =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  var DOWN =
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 3.5v13M4.5 11l5.5 5.5 5.5-5.5"/></svg>';

  var GIFT =
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1.2C7 7 9.5 7 12 7zM12 7c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7z"/></svg>';

  function icon(path) {
    return (
      '<span class="aafu-card-icon">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      path +
      "</svg></span>"
    );
  }

  // Three points, and every one of them comes straight from Ryan's own notes:
  // speed, quality, and customers being happy with the job. Nothing here is a
  // guarantee, a warranty or a number that was not handed over.
  var POINTS = [
    {
      icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>',
      title: "Fast",
      body: "A broken garage door is a problem today, not next week. I get the job done as quickly as it can be done."
    },
    {
      icon: '<path d="M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6"/>',
      title: "Done right",
      body: "Quick never means cutting corners. It is your home, so the work gets done properly the first time."
    },
    {
      icon: '<path d="M20.8 5.6a5 5 0 00-7.1 0L12 7.3l-1.7-1.7a5 5 0 10-7.1 7.1L12 21.5l8.8-8.8a5 5 0 000-7.1z"/>',
      title: "You are happy with it",
      body: "That is the part I care about most. The job is not finished until you are happy with what we did."
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
      '<li class="aafu-card">' +
      icon(p.icon) +
      "<h3>" + esc(p.title) + "</h3>" +
      "<p>" + esc(p.body) + "</p>" +
      "</li>"
    );
  }

  function view() {
    var points = "";
    for (var i = 0; i < POINTS.length; i++) points += point(POINTS[i]);

    return (
      '<div class="aafu-top">' +
        '<div class="aafu-wrap aafu-top-in">' +
          '<img class="aafu-logo" src="' + esc(CONFIG.logo) + '" width="115" height="54" alt="Above All Garage Doors">' +
        "</div>" +
      "</div>" +

      // The first screen. It carries on from the text rather than answering a
      // different question: the text promised his story and a gift, so Ryan,
      // his video and the gift are what is on it, and nothing introduces the
      // company in front of them.
      '<section class="aafu-hero aafu-in">' +
        '<div class="aafu-wrap aafu-hero-grid">' +
          '<div class="aafu-hero-head">' +
            '<p class="aafu-eyebrow">' + esc(CONFIG.owner.name) + ", owner</p>" +
            "<h1>Hey, I'm Ryan. Here's how Above All started.</h1>" +
            '<p class="aafu-lede">Press play and I will tell you myself. And here is the gift I mentioned, so you do not have to go looking for it.</p>' +
          "</div>" +

          '<aside class="aafu-gift" aria-label="Your gift">' +
            '<span class="aafu-gift-icon">' + GIFT + "</span>" +
            "<div>" +
              '<p class="aafu-gift-label">' + esc(CONFIG.gift.label) + "</p>" +
              '<p class="aafu-gift-head">' + esc(CONFIG.gift.headline) + "</p>" +
              '<p class="aafu-gift-terms">' + esc(CONFIG.gift.terms) + "</p>" +
            "</div>" +
          "</aside>" +

          // The top of the story. Native controls, playsinline so iOS does not
          // throw it fullscreen, metadata only so 8 MB is not pulled on arrival,
          // and never autoplay.
          '<figure class="aafu-hero-media">' +
            '<div class="aafu-video">' +
              '<video controls playsinline preload="metadata" poster="' + esc(CONFIG.owner.poster) + '" ' +
                'aria-label="' + esc(CONFIG.owner.name) + ' on how he started Above All Garage Doors">' +
                '<source src="' + esc(CONFIG.owner.video) + '" type="video/mp4">' +
              "</video>" +
            "</div>" +
            '<figcaption class="aafu-plate">' +
              '<p class="aafu-plate-name">' + esc(CONFIG.owner.name) + "</p>" +
              '<p class="aafu-plate-role">' + esc(CONFIG.owner.role) + "</p>" +
            "</figcaption>" +
          "</figure>" +

          '<div class="aafu-actions">' +
            '<button class="aafu-btn" type="button" data-goto="book">Book my at-home estimate' + DOWN + "</button>" +
          "</div>" +
        "</div>" +
      "</section>" +

      // The story in writing, for the lead reading this with the sound off.
      // Built only from what Ryan gave us: local, Kansas City, Kansas, fast,
      // quality work, customers happy. Nothing invented to fill it out.
      '<section class="aafu-sec aafu-story">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">My story</p>' +
          "<h2>Why I do it this way.</h2>" +
          '<div class="aafu-body">' +
            "<p>I own Above All Garage Doors. We are a local garage door company out of Kansas City, Kansas.</p>" +
            "<p>I started it to be the company I would want to call myself. When your door stops working, you should not be stuck waiting around for somebody to show up. So we move fast and get the job done as quickly as we can.</p>" +
          "</div>" +
          '<div class="aafu-pull">' +
            "<p>Fast only counts if the work is right. I will not trade one for the other.</p>" +
          "</div>" +
          '<div class="aafu-body">' +
            "<p>It is your home, and you are the one living with the work after I leave. So it gets done properly, every time.</p>" +
            "<p>The part I care about most is how you feel when the job is finished. I want you happy with it, and I want you to tell me if something is not right.</p>" +
          "</div>" +
          '<div class="aafu-sign">' +
            '<p class="aafu-plate-name">' + esc(CONFIG.owner.name) + "</p>" +
            '<p class="aafu-plate-role">' + esc(CONFIG.owner.role) + "</p>" +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="aafu-sec">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">What that means for you</p>' +
          "<h2>What you get when you hire me.</h2>" +
          '<ul class="aafu-cards">' + points + "</ul>" +
        "</div>" +
      "</section>" +

      '<section class="aafu-sec aafu-book" id="aafu-book">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">At-home estimate</p>' +
          "<h2>Pick a time and I'll come out.</h2>" +
          '<p class="aafu-lede">I will look at your door, talk through what you need, and give you a price. Any open slot below is a time I can be there.</p>' +
          '<p class="aafu-gift-note">' + TICK + "Your 10% off comes with the estimate you book here.</p>" +
          '<div class="aafu-cal">' +
            // Pasted exactly as GHL generated it. The script tag that came with
            // it is appended in JS instead, because a script inserted through
            // innerHTML never runs.
            '<iframe src="https://link.hauckmarketing.com/widget/booking/hkjjkLgjYeDJeBonSWDy" allow="payment" style="width: 100%;border:none;overflow: hidden;" scrolling="no" id="hkjjkLgjYeDJeBonSWDy_1790281781566"></iframe><br>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<div class="aafu-foot">' +
        '<div class="aafu-wrap aafu-foot-in">' +
          '<img class="aafu-logo" src="' + esc(CONFIG.logo) + '" width="85" height="40" alt="">' +
          "<p>Above All Garage Doors. Kansas City, Kansas.</p>" +
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
        var target = root.querySelector("#aafu-book");
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
    if (document.querySelector("script[data-aafu-embed]")) return;
    var s = document.createElement("script");
    s.setAttribute("data-aafu-embed", "1");
    s.type = "text/javascript";
    s.src = CONFIG.embedScript;
    s.onerror = function () {
      // Not fatal, and it must not be treated as fatal: the iframe keeps its
      // floor height and the calendar still books. This is the ad blocker case,
      // which is common on exactly the traffic that arrives from an ad. Book or
      // reply, nothing else, so there is still no phone number.
      var cal = root.querySelector(".aafu-cal");
      if (cal && !cal.querySelector(".aafu-fallback")) {
        var p = document.createElement("p");
        p.className = "aafu-fallback";
        p.textContent = "If the times do not load, reply to my text and I'll get you booked.";
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
  // When the script DOES run it measures the widget honestly, and a 900px
  // floor would then leave a third of the card empty under the times. So a
  // real measurement replaces the floor rather than fighting it.
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
    if (!document.querySelector("style[data-aafu-owner-story]")) {
      var style = document.createElement("style");
      style.setAttribute("data-aafu-owner-story", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    flattenWrappers(root);
    root.innerHTML = view();

    wireScroll(root);

    var cal = root.querySelector(".aafu-cal iframe");
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
    if (root.getAttribute("data-aafu-ready")) return;
    root.setAttribute("data-aafu-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
