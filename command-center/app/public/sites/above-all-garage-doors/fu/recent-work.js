// ABOVE ALL GARAGE DOORS follow-up asset 1 of 3: RECENT WORK.
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
//   It opens on the work, because the work is what was promised, and it ends
//   on the calendar, because the only thing left to ask for is a time.
//
// GoHighLevel holds a two-line stub:
//   <div id="aboveafu"></div>
//   <script src="https://app.hauckmarketing.com/sites/above-all-garage-doors/fu/recent-work.js"></script>
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
//   3. Media queries are written @media (...) { #aboveafu .x {...} }. The
//      inverse, #aboveafu @media(...), is dead CSS that fails silently.
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

(function () {
  "use strict";

  var ROOT_ID = "aboveafu";

  // Served from this app, not from the uploads. The uploaded originals are
  // 7 to 12 MB PNGs straight off a phone (33 MB for the four), which is a
  // minute of spinner on a cell signal, and Supabase image transforms are off
  // on this project. These are the same photographs, resized to 1600x1200
  // WebP at about 260 KB each. Originals, for a re-export:
  //   followup-assets/63c9dd32-3be2-4555-a043-a1d99a125ea3/
  //     before/3b134cd3-a44e-42ec-8876-ce811c3d266a.png  (job 1 before)
  //     after/9da50002-9586-4818-85af-de83a3358d98.png   (job 1 after)
  //     before/842e96f8-e838-442e-9c10-e9f4fb891460.png  (job 2 before)
  //     after/945e60ea-d60a-4c13-bde9-0c5eccccfab9.png   (job 2 after)
  //     logo/2ddde4a6-eff7-4dbd-9cab-814569b4df95.jpg    (logo, cropped)
  var IMG = "https://app.hauckmarketing.com/sites/above-all-garage-doors/fu/img/";

  var CONFIG = {
    // The logo is drawn on solid black with no transparency, so it lives on the
    // black top bar and the black footer and never on the white page.
    logo: IMG + "logo.webp",

    // Order matters and is not ours to change: first url is BEFORE, second is
    // AFTER. Swapping them turns the page into an advert for the competition.
    jobs: [
      {
        caption: "Full Garage Door Installation",
        before: IMG + "job1-before.webp",
        after: IMG + "job1-after.webp"
      },
      {
        caption: "Full Garage Door Installation",
        before: IMG + "job2-before.webp",
        after: IMG + "job2-after.webp"
      }
    ],

    // Quoted exactly as written. Not tidied, not shortened, not repunctuated.
    reviews: [
      {
        quote:
          "I got several quotes for three large overhead doors, he was the best price and still had great quality. Good communications and showed up on time.",
        name: "M. Ferguson"
      },
      {
        quote:
          "Ryan goes above and beyond with his customer service, he's upfront, honest, respectful, and very reasonable in his pricing. He takes pride in his work and is very thorough.",
        name: "Suzanne CarlinWeaver"
      },
      {
        quote:
          "Ryan was at my house within 3 hours the same day as my initial call. He was fast, friendly and professional. Best prices and customer service!",
        name: "Devin Robinson"
      }
    ],

    // Years in business was not given, so it is left off rather than guessed.
    trust: ["Licensed", "Insured", "500+ jobs completed", "Lifetime guarantee", "Serving Johnson County"],

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
#aboveafu blockquote, #aboveafu cite {
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
#aboveafu cite { font-style:normal !important; }

/* ===== TYPE ===== */
#aboveafu h1, #aboveafu h2, #aboveafu h3 {
  font-family:var(--display) !important;
  color:var(--head) !important;
  font-weight:800 !important;
  letter-spacing:-.025em !important;
  line-height:1.08 !important;
  text-transform:none !important;
}
#aboveafu h1 { font-size:clamp(32px,6vw,56px) !important; }
#aboveafu h2 { font-size:clamp(27px,4.2vw,42px) !important; }

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
#aboveafu .aafu-top {
  background-color:var(--ink) !important;
}
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
   headline and the whole slider at once and a short one simply scrolls. */
#aboveafu .aafu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:44px 0 36px !important;
  background-color:var(--paper) !important;
}
#aboveafu .aafu-hero h1 { max-width:15ch !important; }
/* Wide screens put the words beside the slider. Stacked, a 960px wide photo is
   720px tall and the doors, the whole point, land below the fold. */
@media (min-width: 900px) {
  #aboveafu .aafu-hero-grid {
    display:grid !important;
    grid-template-columns:minmax(0,5fr) minmax(0,7fr) !important;
    gap:48px !important; align-items:center !important;
  }
  #aboveafu .aafu-hero .aafu-lede { margin-bottom:0 !important; }
  #aboveafu .aafu-hero h1 { font-size:clamp(34px,3.6vw,48px) !important; }
  #aboveafu .aafu-hero-grid .aafu-wrap { padding:0 !important; }
  #aboveafu .aafu-more .aafu-job { max-width:820px !important; }
}
#aboveafu .aafu-lede {
  font-size:17.5px !important; color:var(--muted) !important;
  max-width:54ch !important;
  margin:16px 0 28px !important;
}

/* ===== BEFORE AND AFTER SLIDER =====
   A wipe slider, because both jobs were shot from the same spot on the drive,
   so dragging the line really is the same garage changing and not one photo
   dissolving into another. The AFTER shot is the base layer and the BEFORE is
   clipped over it from the left: the start position shows half of each, and
   the tags ride with their own photo so a label is never on the wrong one.
   touch-action pan-y lets a thumb scroll the page straight up and down over
   the photo and only takes over when the drag is sideways. */
#aboveafu .aafu-job { margin:0 !important; }
#aboveafu .aafu-job + .aafu-job { margin-top:56px !important; }
#aboveafu .aafu-ba {
  position:relative !important;
  width:100% !important; max-width:100% !important;
  aspect-ratio:4 / 3;
  overflow:hidden !important;
  border-radius:var(--radius-lg) !important;
  background-color:var(--wash-2) !important;
  box-shadow:0 2px 6px rgba(0,0,0,.06), 0 30px 60px -30px rgba(0,0,0,.42) !important;
  touch-action:pan-y !important;
  user-select:none !important; -webkit-user-select:none !important;
  cursor:ew-resize !important;
  --pos:50%;
}
#aboveafu .aafu-layer {
  position:absolute !important; top:0 !important; left:0 !important;
  width:100% !important; height:100% !important;
  margin:0 !important; padding:0 !important;
}
#aboveafu .aafu-layer img {
  width:100% !important; height:100% !important; max-width:none !important;
  object-fit:cover !important; object-position:50% 50% !important;
  pointer-events:none !important;
  -webkit-user-drag:none !important;
}
/* A photo that fails to load leaves the grey panel, not a broken icon. */
#aboveafu .aafu-layer img.aafu-gone { visibility:hidden !important; }
#aboveafu .aafu-before {
  clip-path:inset(0 calc(100% - var(--pos)) 0 0) !important;
  -webkit-clip-path:inset(0 calc(100% - var(--pos)) 0 0) !important;
  z-index:1 !important;
}
#aboveafu .aafu-tag {
  position:absolute !important; top:14px !important;
  font-family:var(--display) !important;
  font-size:11.5px !important; font-weight:700 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  line-height:1 !important;
  padding:7px 11px !important;
  border-radius:999px !important;
  pointer-events:none !important;
}
#aboveafu .aafu-tag-b { left:14px !important; color:#FFFFFF !important; background-color:rgba(0,0,0,.72) !important; }
#aboveafu .aafu-tag-a { right:14px !important; color:#000000 !important; background-color:var(--cyan) !important; }

#aboveafu .aafu-line {
  position:absolute !important; top:0 !important; bottom:0 !important;
  left:var(--pos) !important;
  width:3px !important; margin-left:-1.5px !important;
  background-color:#FFFFFF !important;
  box-shadow:0 0 0 1px rgba(0,0,0,.12) !important;
  z-index:2 !important;
  pointer-events:none !important;
}
#aboveafu .aafu-handle {
  position:absolute !important; top:50% !important;
  left:var(--pos) !important;
  width:52px !important; height:52px !important;
  margin:-26px 0 0 -26px !important; padding:0 !important;
  border-radius:50% !important;
  border:3px solid #FFFFFF !important;
  background-color:var(--cyan) !important;
  color:#000000 !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  box-shadow:0 6px 18px rgba(0,0,0,.35) !important;
  z-index:3 !important;
  cursor:ew-resize !important;
}
#aboveafu .aafu-handle svg { display:block !important; }

#aboveafu .aafu-cap {
  display:flex !important; align-items:baseline !important; justify-content:space-between !important;
  gap:12px !important; flex-wrap:wrap !important;
  margin:16px 0 0 !important;
}
#aboveafu .aafu-cap strong {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:var(--head) !important;
}
#aboveafu .aafu-cap span {
  font-size:14px !important; color:var(--muted) !important;
}

/* ===== BUTTON =====
   Black with white ink, the logo's own ground. The cyan is kept for the
   slider handle so the one accent on the first screen is the thing to touch. */
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
#aboveafu .aafu-actions { margin:40px 0 0 !important; }

/* ===== THE WORK, CONTINUED ===== */
#aboveafu .aafu-more { padding:8px 0 80px !important; }

/* ===== OWNER NOTE ===== */
#aboveafu .aafu-note {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
  border-bottom:1px solid var(--line) !important;
}
#aboveafu .aafu-note p {
  font-size:19.5px !important; line-height:1.6 !important;
  color:var(--head) !important;
  max-width:46ch !important;
  margin:0 !important;
}
#aboveafu .aafu-note p + p { margin-top:14px !important; }

/* ===== TRUST ===== */
#aboveafu .aafu-trust {
  display:flex !important; flex-wrap:wrap !important; gap:10px !important;
  margin:30px 0 0 !important; padding:0 !important;
}
#aboveafu .aafu-trust li {
  display:inline-flex !important; align-items:center !important; gap:8px !important;
  font-size:14px !important; font-weight:600 !important;
  color:var(--head) !important;
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:999px !important;
  padding:8px 14px !important; margin:0 !important;
}
#aboveafu .aafu-trust svg { flex:0 0 14px !important; color:var(--cyan-deep) !important; }

/* ===== REVIEWS ===== */
#aboveafu .aafu-cards {
  display:grid !important;
  grid-template-columns:repeat(3,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:36px 0 0 !important; padding:0 !important;
}
#aboveafu .aafu-card {
  display:flex !important; flex-direction:column !important;
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-top:3px solid var(--cyan) !important;
  border-radius:var(--radius-lg) !important;
  padding:26px 24px !important;
  margin:0 !important;
  min-width:0 !important;
}
#aboveafu .aafu-stars {
  display:flex !important; gap:3px !important;
  color:var(--ink) !important;
  margin:0 0 14px !important;
}
#aboveafu .aafu-card blockquote {
  font-size:16.5px !important; line-height:1.6 !important;
  color:var(--head) !important;
  margin:0 0 18px !important;
  flex:1 1 auto !important;
}
#aboveafu .aafu-card cite {
  font-family:var(--display) !important;
  font-size:14px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:var(--muted) !important;
}

/* ===== BOOKING =====
   The page ends here. The calendar is in the page, not behind a link. */
#aboveafu .aafu-book {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
}
#aboveafu .aafu-book .aafu-lede { margin-bottom:32px !important; }
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
#aboveafu .aafu-handle:focus-visible { outline:3px solid #FFFFFF !important; outline-offset:3px !important; }

#aboveafu .aafu-in { animation:aafuIn .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes aafuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE =====
   Written @media (...) { #aboveafu .x {...} }. The inverse nesting is dead CSS
   that fails without an error. */
@media (max-width: 860px) {
  #aboveafu .aafu-cards { grid-template-columns:minmax(0,1fr) !important; }
  #aboveafu .aafu-sec { padding:64px 0 !important; }
  #aboveafu .aafu-more { padding:4px 0 64px !important; }
}
@media (max-width: 600px) {
  #aboveafu { font-size:16.5px !important; }
  #aboveafu .aafu-wrap { padding:0 16px !important; }
  #aboveafu .aafu-top-in { height:64px !important; }
  #aboveafu .aafu-top .aafu-logo { height:42px !important; }
  /* No full-screen floor on a phone: the headline and the slider already fill
     it, and the leftover floor only opens a hole before the second job. */
  #aboveafu .aafu-hero { min-height:0 !important; padding:28px 0 44px !important; justify-content:flex-start !important; }
  #aboveafu .aafu-hero h1 { max-width:100% !important; }
  /* Every pixel above the slider pushes the AFTER half off the first screen,
     and the after is the entire promise the text message made. */
  #aboveafu .aafu-lede { font-size:16.5px !important; margin:12px 0 20px !important; }
  #aboveafu .aafu-btn { width:100% !important; padding:17px 20px !important; }
  #aboveafu .aafu-actions { margin:32px 0 0 !important; }
  #aboveafu .aafu-job + .aafu-job { margin-top:44px !important; }
  #aboveafu .aafu-note p { font-size:17.5px !important; }
  #aboveafu .aafu-cal { padding:8px !important; }
  /* A phone stacks the month grid above the times, so the floor has to be
     taller here than on a desktop or the calendar arrives clipped. */
  #aboveafu .aafu-cal iframe { min-height:900px !important; }
  #aboveafu .aafu-tag { top:10px !important; font-size:10.5px !important; padding:6px 9px !important; }
  #aboveafu .aafu-tag-b { left:10px !important; }
  #aboveafu .aafu-tag-a { right:10px !important; }
  #aboveafu .aafu-handle { width:46px !important; height:46px !important; margin:-23px 0 0 -23px !important; }
}
/* A 320px phone. GHL's widget lays out its own month grid inside the iframe and
   starts clipping the Saturday column around here, so the card gives back every
   pixel it can rather than spending them on padding. */
@media (max-width: 360px) {
  #aboveafu .aafu-wrap { padding:0 12px !important; }
  #aboveafu .aafu-cal { padding:4px !important; }
  #aboveafu .aafu-card { padding:22px 18px !important; }
  #aboveafu .aafu-trust li { font-size:13px !important; padding:7px 12px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #aboveafu .aafu-in { animation:none !important; }
  #aboveafu .aafu-btn { transition:none !important; }
}
`;

  var STAR =
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">' +
    '<path d="M10 1.6l2.5 5.1 5.6.8-4.05 3.95.96 5.55L10 14.4l-5.01 2.6.96-5.55L1.9 7.5l5.6-.8z"/></svg>';

  var TICK =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  var ARROWS =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 6l-6 6 6 6M15 6l6 6-6 6"/></svg>';

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
    return (
      '<div class="aafu-stars" role="img" aria-label="5 stars">' + STAR + STAR + STAR + STAR + STAR + "</div>"
    );
  }

  // The first url is BEFORE. It sits on top, clipped from the left, so the
  // left of the slider is always before and the right is always after.
  // The first job loads eagerly because it is the first screen; the rest lazy.
  function job(j, n, total) {
    var load = n === 0 ? "eager" : "lazy";
    return (
      '<figure class="aafu-job">' +
      '<div class="aafu-ba" data-ba>' +
        '<div class="aafu-layer aafu-after">' +
          '<img src="' + esc(j.after) + '" alt="' + esc(j.caption) + ', after" loading="' + load + '" decoding="async" draggable="false">' +
          '<span class="aafu-tag aafu-tag-a">After</span>' +
        "</div>" +
        '<div class="aafu-layer aafu-before">' +
          '<img src="' + esc(j.before) + '" alt="' + esc(j.caption) + ', before" loading="' + load + '" decoding="async" draggable="false">' +
          '<span class="aafu-tag aafu-tag-b">Before</span>' +
        "</div>" +
        '<span class="aafu-line" aria-hidden="true"></span>' +
        '<button class="aafu-handle" type="button" role="slider" aria-label="Before and after, ' +
          esc(j.caption) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">' + ARROWS + "</button>" +
      "</div>" +
      '<figcaption class="aafu-cap"><strong>' + esc(j.caption) + "</strong>" +
        "<span>Job " + (n + 1) + " of " + total + "</span></figcaption>" +
      "</figure>"
    );
  }

  function review(r) {
    return (
      '<li class="aafu-card">' +
      stars() +
      "<blockquote>" + esc(r.quote) + "</blockquote>" +
      "<cite>" + esc(r.name) + "</cite>" +
      "</li>"
    );
  }

  function trust() {
    var out = "";
    for (var i = 0; i < CONFIG.trust.length; i++) {
      out += "<li>" + TICK + esc(CONFIG.trust[i]) + "</li>";
    }
    return '<ul class="aafu-trust">' + out + "</ul>";
  }

  function view() {
    var total = CONFIG.jobs.length;
    var first = total ? job(CONFIG.jobs[0], 0, total) : "";
    var rest = "";
    for (var i = 1; i < total; i++) rest += job(CONFIG.jobs[i], i, total);

    var reviews = "";
    for (var r = 0; r < CONFIG.reviews.length; r++) reviews += review(CONFIG.reviews[r]);

    return (
      '<div class="aafu-top">' +
        '<div class="aafu-wrap aafu-top-in">' +
          '<img class="aafu-logo" src="' + esc(CONFIG.logo) + '" width="115" height="54" alt="Above All Garage Doors">' +
        "</div>" +
      "</div>" +

      // The first screen. The text ended on a colon and "here's some of our
      // recent work", so the work comes straight after it with no introduction
      // in front and no pitch on top.
      '<section class="aafu-hero aafu-in">' +
        '<div class="aafu-wrap aafu-hero-grid">' +
          "<div>" +
            '<p class="aafu-eyebrow">Recent work</p>' +
            "<h1>Same garage. Before we showed up, and after we left.</h1>" +
            '<p class="aafu-lede">Our photos, from our jobs. Drag the line across to see both.</p>' +
          "</div>" +
          first +
        "</div>" +
      "</section>" +

      (rest
        ? '<section class="aafu-more">' +
            '<div class="aafu-wrap">' +
              rest +
              '<div class="aafu-actions">' +
                '<button class="aafu-btn" type="button" data-goto="book">Book your at-home estimate' + DOWN + "</button>" +
              "</div>" +
            "</div>" +
          "</section>"
        : "") +

      '<section class="aafu-sec aafu-note">' +
        '<div class="aafu-wrap">' +
          "<p>No stock photos, and nobody else's jobs. That is our work on real houses.</p>" +
          "<p>If your door needs the same, book a time below. I'll come out to your place, look at what you've got and give you a price.</p>" +
          trust() +
        "</div>" +
      "</section>" +

      '<section class="aafu-sec">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">Reviews</p>' +
          "<h2>What customers said after.</h2>" +
          '<ul class="aafu-cards">' + reviews + "</ul>" +
        "</div>" +
      "</section>" +

      '<section class="aafu-sec aafu-book" id="aafu-book">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">At-home estimate</p>' +
          "<h2>Pick a time and I'll come out.</h2>" +
          '<p class="aafu-lede">Choose any open slot below and it is booked.</p>' +
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
          "<p>Above All Garage Doors. Serving Johnson County.</p>" +
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
    var imgs = root.querySelectorAll(".aafu-layer img");
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener("error", function () {
        this.className += " aafu-gone";
      });
    }
  }

  // THE SLIDER. Pointer events cover mouse, pen and touch in one path. The
  // frame is touch-action:pan-y, so a vertical swipe is still a page scroll
  // (the browser cancels the pointer) and only a sideways drag moves the line.
  // A tap anywhere on the photo jumps the line there. The handle is a real
  // button with role slider, so arrow keys, Home and End work too.
  function wireSliders(root) {
    var frames = root.querySelectorAll("[data-ba]");
    for (var i = 0; i < frames.length; i++) slider(frames[i]);
  }

  function slider(frame) {
    var handle = frame.querySelector(".aafu-handle");
    var pos = 50;
    var dragging = false;

    function set(p) {
      pos = Math.max(0, Math.min(100, p));
      frame.style.setProperty("--pos", pos + "%");
      if (handle) handle.setAttribute("aria-valuenow", String(Math.round(pos)));
    }

    function fromEvent(e) {
      var r = frame.getBoundingClientRect();
      if (!r.width) return;
      set(((e.clientX - r.left) / r.width) * 100);
    }

    frame.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button > 0) return;
      dragging = true;
      try {
        frame.setPointerCapture(e.pointerId);
      } catch (err) {}
      fromEvent(e);
    });
    frame.addEventListener("pointermove", function (e) {
      if (dragging) fromEvent(e);
    });
    function stop() {
      dragging = false;
    }
    frame.addEventListener("pointerup", stop);
    frame.addEventListener("pointercancel", stop);
    frame.addEventListener("lostpointercapture", stop);

    if (handle) {
      handle.addEventListener("keydown", function (e) {
        var k = e.key;
        if (k === "ArrowLeft" || k === "ArrowDown") set(pos - 5);
        else if (k === "ArrowRight" || k === "ArrowUp") set(pos + 5);
        else if (k === "Home") set(0);
        else if (k === "End") set(100);
        else return;
        e.preventDefault();
      });
    }

    set(50);
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
    if (!document.querySelector("style[data-aafu-recent-work]")) {
      var style = document.createElement("style");
      style.setAttribute("data-aafu-recent-work", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    flattenWrappers(root);
    root.innerHTML = view();

    wireImages(root);
    wireSliders(root);
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
