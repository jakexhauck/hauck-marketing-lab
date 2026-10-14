// CLEAR CHOICE WINDOWS follow-up asset 1 of 3: RECENT WORK.
//
// WHERE IT SITS
//   A new lead comes in. Text 1 goes out:
//
//     "Hey {{contact.first_name}}, a lot of companies talk about how great
//      their work is but never actually show customers REAL work lol. So
//      here's some of our recent work we've gotten done:"
//
//   This page is what that colon points at. The lead already knows the
//   company, so the page does not introduce it and does not restate the text.
//   It opens on the work, because the work is what was promised, hands over
//   the discount after the proof, and ends on the calendar.
//
// GoHighLevel holds a two-line stub:
//   <div id="clearcfu"></div>
//   <script src="https://app.hauckmarketing.com/sites/clear-choice-windows/fu/recent-work.js"></script>
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.
//
// THE TRAPS, every one of which has already cost a live debugging session:
//   1. STYLES below is a JS template literal. A backtick anywhere inside it,
//      including inside a CSS comment, silently ends the string and the whole
//      file stops parsing. There is not one in there. Do not add one.
//   2. GHL's theme CSS carries !important, so an unweighted reset loses. Once
//      the reset is !important it flattens our own p and button margins too,
//      so every element that wants spacing restates it at the same weight.
//   3. Media queries are written @media (...) { #clearcfu .x {...} }. The
//      inverse, #clearcfu @media(...), is dead CSS that fails silently.
//   4. The builder strips link elements, so the fonts load by @import.
//   5. No background shorthand with !important anywhere: it nukes
//      background-image. Photographs are img elements and surfaces use
//      background-color longhand.
//   6. No 100vw breakout. It counts the scrollbar and the measurement is
//      circular. Width 100% plus wrapper flattening instead.
//   7. min-height:100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar
//      slides away, and the first screen visibly resizing looks broken.
//   8. The calendar iframe carries a floor height of its own. GHL's
//      form_embed.js sizes it, and ad blockers eat that script on exactly the
//      traffic that arrives from an ad.
//   9. No phone number anywhere. Book or reply, nothing else.

(function () {
  "use strict";

  var ROOT_ID = "clearcfu";

  // Served from this app, not from the uploads. The originals are a 6.5 MB
  // square PNG and a 10 MB portrait PNG straight off two different phones,
  // which is a minute of spinner on a cell signal. They were also shot from
  // different distances, so both are cropped here to the same 4:5 frame
  // around the window and resized to 960x1200 WebP (about 70 to 120 KB).
  // Originals, for a re-export:
  //   followup-assets/78859584-aabc-4235-b7fd-ee4342f5f144/
  //     before/f33c2e1e-b321-448d-af15-aa9355e026c4.png  (job 1 before)
  //     after/13f5a30b-a92c-4352-81fb-21192d420511.png   (job 1 after)
  //     logo/6a8fc061-300c-4b1a-ad05-3a02a647c352.png    (logo)
  var IMG = "https://app.hauckmarketing.com/sites/clear-choice-windows/fu/img/";

  var CONFIG = {
    // The logo's lettering is WHITE on a transparent ground, so on the white
    // page it would read as a green roof and nothing else. It only ever sits
    // on the dark top bar and the dark footer.
    logo: IMG + "logo.webp",

    // Order matters and is not ours to change: first url is BEFORE, second is
    // AFTER. Swapping them turns the page into an advert for the competition.
    //
    // A labelled pair rather than a wipe slider: the two photos were taken
    // from different spots, so a wipe would slide one window frame across a
    // different-sized one and look like a glitch rather than a change.
    jobs: [
      {
        caption: "Full Window Replacement",
        before: IMG + "job1-before.webp",
        after: IMG + "job1-after.webp"
      }
    ],

    // Quoted exactly as written. Not tidied, not shortened, not repunctuated,
    // typos and all. The exclamation marks are theirs, not ours.
    reviews: [
      {
        quote:
          "Yet again. We had excellent service from Clear Choice Windows in Owensboro. Beautiful windows, with quick, clean installation. Great customer experience. Highly recommended!",
        name: "Olga Payne"
      },
      {
        quote:
          "Positive: Professionalism , Punctuality , Quality , Responsiveness , Value Bill and his crew do excellent work! I would highly recommend them to anyone!Services: Window installation , Custom windows",
        name: "Karen Onstott"
      },
      {
        quote:
          "Bill, Tony and Brian all did an amazing job installing our new windows! Our neighbors are d family members are all talking about what a great job they did. They showed up as scheduled and we barely had any cleanup from having every window in our home replaced! If you want an excellent product for a great price, call Clear Choice Windows ASAP!",
        name: "Cathy Weaver"
      }
    ],

    // Licensed, insured and warranty were not given, so they are left off
    // rather than guessed.
    trust: ["30+ years in business", "300+ jobs completed", "Serving Owensboro"],

    offer: {
      title: "Free triple pane upgrade on every window",
      terms: "New installs only"
    },

    // The booking widget, from the embed GHL generated. The iframe markup is
    // reproduced verbatim in view(); this is the script that came with it.
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
   IBM Plex Sans and Open Sans are the two faces their own site runs. */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@500;600;700&family=Open+Sans:wght@400;600;700&display=swap');

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

#clearcfu *, #clearcfu *::before, #clearcfu *::after { box-sizing:border-box !important; }

#clearcfu {
  /* Their site runs one green, #1B8352, on the menu bar and every button,
     with black borders. That green is the one accent here, used for the
     button, the AFTER tag, the offer and the eyebrow rule, and nothing else.
     The deep green-black is the ground the white logo needs. */
  --green:#1B8352;
  --green-hover:#156B43;
  --green-tint:#EAF4EE;
  --night:#0F2219;
  --paper:#FFFFFF;
  --wash:#F5F7F6;
  --line:#E2E8E4;
  --head:#111A15;
  --body:#3F4A44;
  --muted:#5A665F;
  --display:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --text:'Open Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --radius:6px;
  --radius-lg:14px;

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
#clearcfu p, #clearcfu h1, #clearcfu h2, #clearcfu h3, #clearcfu h4,
#clearcfu ul, #clearcfu ol, #clearcfu li, #clearcfu figure, #clearcfu figcaption,
#clearcfu blockquote, #clearcfu cite {
  margin:0 !important; padding:0 !important;
}
/* Inheritance loses to a theme rule that names p directly, so the face and
   colour are restated on the text elements. Class rules below outrank this. */
#clearcfu p, #clearcfu li, #clearcfu blockquote, #clearcfu cite, #clearcfu span, #clearcfu strong {
  font-family:var(--text) !important;
  color:var(--body) !important;
}
#clearcfu ul, #clearcfu li { list-style:none !important; }
#clearcfu img { display:block !important; max-width:100% !important; border:0 !important; }
#clearcfu button {
  margin:0 !important; text-transform:none !important; letter-spacing:normal !important;
  font-family:inherit !important; line-height:normal !important;
}
#clearcfu input {
  margin:0 !important; max-width:none !important; box-shadow:none !important;
  font-family:inherit !important;
  /* 16px floor or iOS Safari zooms on focus and never zooms back out. */
  font-size:16px !important;
}
#clearcfu cite { font-style:normal !important; }

/* ===== TYPE ===== */
#clearcfu h1, #clearcfu h2, #clearcfu h3 {
  font-family:var(--display) !important;
  color:var(--head) !important;
  font-weight:700 !important;
  letter-spacing:-.02em !important;
  line-height:1.1 !important;
  text-transform:none !important;
}
#clearcfu h1 { font-size:clamp(31px,5.6vw,52px) !important; }
#clearcfu h2 { font-size:clamp(26px,4vw,40px) !important; }

#clearcfu .ccfu-eyebrow {
  display:inline-flex !important; align-items:center !important; gap:10px !important;
  font-family:var(--display) !important;
  font-size:12.5px !important; font-weight:600 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:var(--green) !important;
  margin:0 0 14px !important;
}
#clearcfu .ccfu-eyebrow::before {
  content:"" !important;
  display:block !important;
  width:22px !important; height:3px !important;
  border-radius:2px !important;
  background-color:var(--green) !important;
}

/* ===== LAYOUT ===== */
#clearcfu .ccfu-wrap {
  width:100% !important; max-width:1040px !important;
  margin:0 auto !important;
  padding:0 20px !important;
}
#clearcfu .ccfu-sec { padding:80px 0 !important; }

/* ===== TOP BAR =====
   Dark, because the logo's lettering is white. It identifies the page rather
   than introducing the company. */
#clearcfu .ccfu-top { background-color:var(--night) !important; }
#clearcfu .ccfu-top-in {
  display:flex !important; align-items:center !important;
  height:80px !important;
}
#clearcfu .ccfu-logo {
  height:58px !important; width:auto !important;
  object-fit:contain !important;
}

/* ===== FIRST SCREEN =====
   min-height on 100vh, never 100dvh: the page must not resize under them as
   the Safari toolbar slides away. It is a floor, so a tall screen gets the
   headline and both photos at once and a short one simply scrolls. */
#clearcfu .ccfu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:48px 0 56px !important;
  background-color:var(--paper) !important;
}
#clearcfu .ccfu-hero h1 { max-width:16ch !important; }
#clearcfu .ccfu-lede {
  font-size:17.5px !important; color:var(--muted) !important;
  max-width:46ch !important;
  margin:16px 0 28px !important;
}
@media (min-width: 900px) {
  #clearcfu .ccfu-hero-grid {
    display:grid !important;
    grid-template-columns:minmax(0,5fr) minmax(0,7fr) !important;
    grid-template-areas:"copy work" "act work" !important;
    grid-template-rows:auto auto !important;
    column-gap:52px !important; row-gap:0 !important;
  }
  #clearcfu .ccfu-copy { grid-area:copy !important; align-self:end !important; }
  #clearcfu .ccfu-hero-grid > .ccfu-job { grid-area:work !important; align-self:center !important; }
  #clearcfu .ccfu-hero-grid > .ccfu-actions { grid-area:act !important; align-self:start !important; margin-top:0 !important; }
  #clearcfu .ccfu-hero h1 { font-size:clamp(34px,3.6vw,48px) !important; }
}

/* ===== BEFORE AND AFTER PAIR =====
   Side by side at every width, phones included, because the whole point is
   that the eye can go from one window to the other without scrolling. Both
   photos are pre-cropped to the same 4:5 frame, so the windows line up. */
#clearcfu .ccfu-job { margin:0 !important; min-width:0 !important; }
#clearcfu .ccfu-pair {
  display:grid !important;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;
  gap:8px !important;
  margin:0 !important;
}
#clearcfu .ccfu-shot {
  position:relative !important;
  aspect-ratio:4 / 5;
  overflow:hidden !important;
  border-radius:var(--radius-lg) !important;
  background-color:var(--wash) !important;
  margin:0 !important;
}
#clearcfu .ccfu-shot:first-child { border-top-right-radius:4px !important; border-bottom-right-radius:4px !important; }
#clearcfu .ccfu-shot:last-child { border-top-left-radius:4px !important; border-bottom-left-radius:4px !important; }
#clearcfu .ccfu-shot img {
  width:100% !important; height:100% !important; max-width:none !important;
  object-fit:cover !important; object-position:50% 50% !important;
}
/* A photo that fails to load leaves the grey panel, not a broken icon. */
#clearcfu .ccfu-shot img.ccfu-gone { visibility:hidden !important; }
#clearcfu .ccfu-tag {
  position:absolute !important; top:12px !important; left:12px !important;
  font-family:var(--display) !important;
  font-size:11.5px !important; font-weight:600 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  line-height:1 !important;
  padding:7px 11px !important;
  border-radius:999px !important;
  color:#FFFFFF !important;
}
#clearcfu .ccfu-tag-b { background-color:rgba(17,26,21,.74) !important; }
#clearcfu .ccfu-tag-a { background-color:var(--green) !important; }

#clearcfu .ccfu-cap {
  display:flex !important; align-items:baseline !important; justify-content:space-between !important;
  gap:12px !important; flex-wrap:wrap !important;
  margin:14px 0 0 !important;
}
#clearcfu .ccfu-cap strong {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:600 !important;
  color:var(--head) !important;
}
#clearcfu .ccfu-cap span { font-size:14px !important; color:var(--muted) !important; }
#clearcfu .ccfu-job + .ccfu-job { margin-top:56px !important; }

/* ===== BUTTON =====
   Their site's button: green fill, black border, white text. */
#clearcfu .ccfu-btn {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  gap:10px !important;
  font-family:var(--display) !important;
  font-size:17px !important; font-weight:600 !important;
  color:#FFFFFF !important;
  background-color:var(--green) !important;
  border:2px solid #000000 !important;
  border-radius:var(--radius) !important;
  padding:15px 26px !important;
  cursor:pointer !important;
  transition:background-color .18s, transform .18s !important;
  max-width:100% !important;
}
#clearcfu .ccfu-btn:hover { background-color:var(--green-hover) !important; }
#clearcfu .ccfu-btn:active { transform:translateY(1px) !important; }
#clearcfu .ccfu-btn svg { flex:none !important; }
#clearcfu .ccfu-actions { margin:28px 0 0 !important; }

/* ===== OWNER NOTE ===== */
#clearcfu .ccfu-note {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
  border-bottom:1px solid var(--line) !important;
}
#clearcfu .ccfu-note p {
  font-size:19.5px !important; line-height:1.6 !important;
  color:var(--head) !important;
  max-width:46ch !important;
  margin:0 !important;
}
#clearcfu .ccfu-note p + p { margin-top:14px !important; }

/* ===== TRUST ===== */
#clearcfu .ccfu-trust {
  display:flex !important; flex-wrap:wrap !important; gap:10px !important;
  margin:30px 0 0 !important; padding:0 !important;
}
#clearcfu .ccfu-trust li {
  display:inline-flex !important; align-items:center !important; gap:8px !important;
  font-size:14px !important; font-weight:600 !important;
  color:var(--head) !important;
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:999px !important;
  padding:8px 14px !important; margin:0 !important;
}
#clearcfu .ccfu-trust svg { flex:0 0 14px !important; color:var(--green) !important; }

/* ===== REVIEWS ===== */
#clearcfu .ccfu-cards {
  display:grid !important;
  grid-template-columns:repeat(3,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:36px 0 0 !important; padding:0 !important;
}
#clearcfu .ccfu-card {
  display:flex !important; flex-direction:column !important;
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  padding:26px 24px !important;
  margin:0 !important;
  min-width:0 !important;
}
#clearcfu .ccfu-stars {
  display:flex !important; gap:3px !important;
  color:var(--head) !important;
  margin:0 0 14px !important;
}
#clearcfu .ccfu-card blockquote {
  font-size:16px !important; line-height:1.62 !important;
  color:var(--head) !important;
  margin:0 0 18px !important;
  flex:1 1 auto !important;
  overflow-wrap:anywhere !important;
}
#clearcfu .ccfu-card cite {
  font-family:var(--display) !important;
  font-size:14px !important; font-weight:600 !important;
  color:var(--muted) !important;
}

/* ===== OFFER =====
   After the proof, above the calendar, impossible to miss. The one place the
   green gets to be a surface rather than a line. */
#clearcfu .ccfu-offer-sec { padding:0 0 8px !important; background-color:var(--paper) !important; }
#clearcfu .ccfu-offer {
  display:grid !important;
  grid-template-columns:minmax(0,1fr) auto !important;
  gap:20px 32px !important; align-items:center !important;
  background-color:var(--green-tint) !important;
  border:2px solid var(--green) !important;
  border-radius:var(--radius-lg) !important;
  padding:32px 36px !important;
  margin:0 !important;
}
#clearcfu .ccfu-offer h2 { font-size:clamp(25px,3.4vw,34px) !important; max-width:20ch !important; }
#clearcfu .ccfu-offer p {
  font-size:16.5px !important; color:var(--body) !important;
  margin:12px 0 0 !important; max-width:50ch !important;
}
#clearcfu .ccfu-value {
  font-family:var(--display) !important;
  text-align:center !important;
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius) !important;
  padding:16px 22px !important;
  margin:0 !important;
}
#clearcfu .ccfu-value strong {
  display:block !important;
  font-size:34px !important; font-weight:700 !important; line-height:1 !important;
  color:var(--green) !important;
}
#clearcfu .ccfu-value span {
  display:block !important;
  font-size:13px !important; font-weight:600 !important; color:var(--muted) !important;
  margin:6px 0 0 !important;
}
#clearcfu .ccfu-terms {
  font-size:13.5px !important; font-weight:600 !important;
  color:var(--muted) !important;
  margin:14px 0 0 !important;
}

/* ===== BOOKING =====
   The page ends here. The calendar is in the page, not behind a link. */
#clearcfu .ccfu-book { padding:72px 0 80px !important; background-color:var(--paper) !important; }
#clearcfu .ccfu-book .ccfu-lede { margin-bottom:28px !important; }
#clearcfu .ccfu-cal {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  /* Tight padding on purpose: GHL's widget draws its own generous margins and
     doubling them wastes the fold on a phone. */
  padding:12px !important;
  overflow:hidden !important;
  box-shadow:0 2px 6px rgba(0,0,0,.05), 0 26px 56px -28px rgba(0,0,0,.28) !important;
}
/* A FLOOR, not a height. form_embed.js only ever grows it, and when an ad
   blocker eats that script the calendar is still usable at this size. */
#clearcfu .ccfu-cal iframe {
  display:block !important;
  width:100% !important; max-width:100% !important;
  min-height:780px !important;
  border:0 !important; margin:0 !important; padding:0 !important;
  background-color:transparent !important;
}
#clearcfu .ccfu-cal br { display:none !important; }
#clearcfu .ccfu-fallback {
  font-size:14.5px !important; color:var(--muted) !important;
  margin:14px 0 0 !important;
}

/* ===== FOOT ===== */
#clearcfu .ccfu-foot { background-color:var(--night) !important; padding:28px 0 !important; }
#clearcfu .ccfu-foot-in {
  display:flex !important; align-items:center !important; justify-content:space-between !important;
  gap:14px 20px !important; flex-wrap:wrap !important;
}
#clearcfu .ccfu-foot .ccfu-logo { height:44px !important; }
#clearcfu .ccfu-foot p { font-size:13.5px !important; color:#A7B5AD !important; margin:0 !important; }

#clearcfu :focus-visible { outline:3px solid var(--green) !important; outline-offset:3px !important; }

#clearcfu .ccfu-in { animation:ccfuIn .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes ccfuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE =====
   Written @media (...) { #clearcfu .x {...} }. The inverse nesting is dead CSS
   that fails without an error. */
@media (max-width: 860px) {
  #clearcfu .ccfu-cards { grid-template-columns:minmax(0,1fr) !important; }
  #clearcfu .ccfu-sec { padding:64px 0 !important; }
  #clearcfu .ccfu-offer { grid-template-columns:minmax(0,1fr) !important; padding:28px 24px !important; }
  #clearcfu .ccfu-value { justify-self:start !important; text-align:left !important; }
  #clearcfu .ccfu-book { padding:56px 0 64px !important; }
}
@media (max-width: 600px) {
  #clearcfu { font-size:16.5px !important; }
  #clearcfu .ccfu-wrap { padding:0 16px !important; }
  #clearcfu .ccfu-top-in { height:66px !important; }
  #clearcfu .ccfu-top .ccfu-logo { height:46px !important; }
  /* No full-screen floor on a phone: the headline and the pair already fill
     it, and the leftover floor only opens a hole under the photos. */
  #clearcfu .ccfu-hero { min-height:0 !important; padding:28px 0 48px !important; justify-content:flex-start !important; }
  #clearcfu .ccfu-hero h1 { max-width:100% !important; }
  #clearcfu .ccfu-lede { font-size:16.5px !important; margin:12px 0 20px !important; }
  #clearcfu .ccfu-btn { width:100% !important; padding:16px 20px !important; }
  #clearcfu .ccfu-pair { gap:6px !important; }
  #clearcfu .ccfu-tag { top:8px !important; left:8px !important; font-size:10px !important; padding:6px 8px !important; letter-spacing:.1em !important; }
  #clearcfu .ccfu-note p { font-size:17.5px !important; }
  #clearcfu .ccfu-cal { padding:8px !important; }
  /* A phone stacks the month grid above the times, so the floor has to be
     taller here than on a desktop or the calendar arrives clipped. */
  #clearcfu .ccfu-cal iframe { min-height:900px !important; }
}
/* A 320px phone. GHL's widget lays out its own month grid inside the iframe and
   starts clipping the Saturday column around here, so the card gives back every
   pixel it can rather than spending them on padding. */
@media (max-width: 360px) {
  #clearcfu .ccfu-wrap { padding:0 12px !important; }
  #clearcfu .ccfu-cal { padding:4px !important; }
  #clearcfu .ccfu-card { padding:22px 18px !important; }
  #clearcfu .ccfu-offer { padding:24px 18px !important; }
  #clearcfu .ccfu-trust li { font-size:13px !important; padding:7px 12px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #clearcfu .ccfu-in { animation:none !important; }
  #clearcfu .ccfu-btn { transition:none !important; }
}
`;

  var STAR =
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">' +
    '<path d="M10 1.6l2.5 5.1 5.6.8-4.05 3.95.96 5.55L10 14.4l-5.01 2.6.96-5.55L1.9 7.5l5.6-.8z"/></svg>';

  var TICK =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  var DOWN =
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 3.5v13M4.5 11l5.5 5.5 5.5-5.5"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stars() {
    return '<div class="ccfu-stars" role="img" aria-label="5 stars">' + STAR + STAR + STAR + STAR + STAR + "</div>";
  }

  // BEFORE on the left, AFTER on the right, always. The first job loads
  // eagerly because it is the first screen; any others lazily.
  function job(j, n, total) {
    var load = n === 0 ? "eager" : "lazy";
    return (
      '<figure class="ccfu-job">' +
      '<div class="ccfu-pair">' +
        '<div class="ccfu-shot">' +
          '<img src="' + esc(j.before) + '" alt="' + esc(j.caption) + ', before" width="960" height="1200" loading="' + load + '" decoding="async">' +
          '<span class="ccfu-tag ccfu-tag-b">Before</span>' +
        "</div>" +
        '<div class="ccfu-shot">' +
          '<img src="' + esc(j.after) + '" alt="' + esc(j.caption) + ', after" width="960" height="1200" loading="' + load + '" decoding="async">' +
          '<span class="ccfu-tag ccfu-tag-a">After</span>' +
        "</div>" +
      "</div>" +
      '<figcaption class="ccfu-cap"><strong>' + esc(j.caption) + "</strong>" +
        (total > 1 ? "<span>Job " + (n + 1) + " of " + total + "</span>" : "") +
      "</figcaption>" +
      "</figure>"
    );
  }

  function review(r) {
    return (
      '<li class="ccfu-card">' +
      stars() +
      "<blockquote>" + esc(r.quote) + "</blockquote>" +
      "<cite>" + esc(r.name) + "</cite>" +
      "</li>"
    );
  }

  function trust() {
    var out = "";
    for (var i = 0; i < CONFIG.trust.length; i++) out += "<li>" + TICK + esc(CONFIG.trust[i]) + "</li>";
    return '<ul class="ccfu-trust">' + out + "</ul>";
  }

  function view() {
    var total = CONFIG.jobs.length;
    var first = total ? job(CONFIG.jobs[0], 0, total) : "";
    var rest = "";
    for (var i = 1; i < total; i++) rest += job(CONFIG.jobs[i], i, total);

    var reviews = "";
    for (var r = 0; r < CONFIG.reviews.length; r++) reviews += review(CONFIG.reviews[r]);

    var o = CONFIG.offer;

    return (
      '<div class="ccfu-top">' +
        '<div class="ccfu-wrap ccfu-top-in">' +
          '<img class="ccfu-logo" src="' + esc(CONFIG.logo) + '" width="105" height="58" alt="Clear Choice Windows">' +
        "</div>" +
      "</div>" +

      // The first screen. The text ended on a colon and "here's some of our
      // recent work", so the work comes straight after it with no introduction
      // in front and no pitch on top.
      '<section class="ccfu-hero ccfu-in">' +
        '<div class="ccfu-wrap ccfu-hero-grid">' +
          // Source order is copy, photos, button, so a phone reaches the AFTER
          // shot before anything asks it for something. The desktop grid puts
          // the button back under the copy, beside the photos.
          '<div class="ccfu-copy">' +
            '<p class="ccfu-eyebrow">Recent work</p>' +
            "<h1>Same window. Before we took it out, and after we put the new one in.</h1>" +
            '<p class="ccfu-lede">Our photos, from our job. Old window on the left, ours on the right.</p>' +
          "</div>" +
          first +
          '<div class="ccfu-actions">' +
            '<button class="ccfu-btn" type="button" data-goto="book">Book your home estimate' + DOWN + "</button>" +
          "</div>" +
        "</div>" +
      "</section>" +

      (rest
        ? '<section class="ccfu-sec" style="padding-top:0 !important">' +
            '<div class="ccfu-wrap">' + rest + "</div>" +
          "</section>"
        : "") +

      '<section class="ccfu-sec ccfu-note">' +
        '<div class="ccfu-wrap">' +
          "<p>No stock photos, and nobody else's jobs. That is a window we pulled and a window we put in.</p>" +
          "<p>If your windows look like the one on the left, book a time below. We'll come out to the house, look at what you've got and give you a price.</p>" +
          trust() +
        "</div>" +
      "</section>" +

      '<section class="ccfu-sec">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">Reviews</p>' +
          "<h2>What customers said after.</h2>" +
          '<ul class="ccfu-cards">' + reviews + "</ul>" +
        "</div>" +
      "</section>" +

      // The discount, handed over plainly, after the proof and above the
      // calendar. No code to remember and nothing to hunt for.
      '<section class="ccfu-offer-sec">' +
        '<div class="ccfu-wrap">' +
          '<div class="ccfu-offer">' +
            "<div>" +
              '<p class="ccfu-eyebrow">Yours when you book</p>' +
              "<h2>" + esc(o.title) + ".</h2>" +
              "<p>Book your home estimate below and the triple pane upgrade comes with every window you replace.</p>" +
              '<p class="ccfu-terms">' + esc(o.terms) + ".</p>" +
            "</div>" +
            '<div class="ccfu-value"><strong>$300</strong><span>value per window</span></div>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="ccfu-book" id="ccfu-book">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">Home estimate</p>' +
          "<h2>Pick a time for your home estimate.</h2>" +
          '<p class="ccfu-lede">Choose any open slot below and it is booked.</p>' +
          '<div class="ccfu-cal">' +
            // Pasted exactly as GHL generated it. This is the client's
            // Conversion Asset Calendar; never swap in another calendar. The
            // script tag that came with it is appended in JS instead, because
            // a script inserted through innerHTML never runs.
            '<iframe src="https://link.hauckmarketing.com/widget/booking/KB1DJe4a8M07s4UmSphw" allow="payment" style="width: 100%;border:none;overflow: hidden;" scrolling="no" id="KB1DJe4a8M07s4UmSphw_1791999237506"></iframe><br>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<div class="ccfu-foot">' +
        '<div class="ccfu-wrap ccfu-foot-in">' +
          '<img class="ccfu-logo" src="' + esc(CONFIG.logo) + '" width="80" height="44" alt="">' +
          "<p>Clear Choice Windows. Serving Owensboro.</p>" +
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

  // A photo that 404s hides itself so the grey panel shows, not a broken icon.
  function wireImages(root) {
    var imgs = root.querySelectorAll(".ccfu-shot img");
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener("error", function () {
        this.className += " ccfu-gone";
      });
    }
  }

  function wireScroll(root) {
    var btns = root.querySelectorAll("[data-goto]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var target = root.querySelector("#ccfu-book");
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
    if (document.querySelector('script[src="' + CONFIG.embedScript + '"]')) return;
    var s = document.createElement("script");
    s.type = "text/javascript";
    s.src = CONFIG.embedScript;
    s.onerror = function () {
      // Not fatal, and it must not be treated as fatal: the iframe keeps its
      // floor height and the calendar still books. This is the ad blocker case,
      // which is common on exactly the traffic that arrives from an ad. Book or
      // reply, nothing else, so there is still no phone number.
      var cal = root.querySelector(".ccfu-cal");
      if (cal && !cal.querySelector(".ccfu-fallback")) {
        var p = document.createElement("p");
        p.className = "ccfu-fallback";
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
    if (!document.querySelector("style[data-ccfu-recent-work]")) {
      var style = document.createElement("style");
      style.setAttribute("data-ccfu-recent-work", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    flattenWrappers(root);
    root.innerHTML = view();

    wireImages(root);
    wireScroll(root);

    var cal = root.querySelector(".ccfu-cal iframe");
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
    if (root.getAttribute("data-ccfu-ready")) return;
    root.setAttribute("data-ccfu-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
