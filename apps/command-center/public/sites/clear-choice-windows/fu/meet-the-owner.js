// CLEAR CHOICE WINDOWS follow-up asset 2 of 3: OWNER STORY.
//
// WHERE IT SITS
//   New lead, text 2 goes out:
//
//     "Yo {{contact.first_name}}, I saw you came to us through facebook and
//      just wanted to send you over my personal story and how I started the
//      business. P.S there's also a small gift for you on the page:"
//
//   This page is what that colon points at. Two jobs only: show them who they
//   are hiring, and hand over the gift they were already promised. So the first
//   screen is Bill, the start of his story and the free triple pane upgrade in
//   plain sight. The lead already knows the company by name, so nothing here
//   introduces it or repeats the text back at them. It ends on the calendar.
//
// GoHighLevel holds a two-line stub:
//   <div id="clearcfu"></div>
//   <script src="https://app.hauckmarketing.com/sites/clear-choice-windows/fu/meet-the-owner.js"></script>
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.
//
// The look comes from replacementwindowsowensboro.com: their green (#1b8352,
// the menu bar and every button on the site), IBM Plex Sans, and Alegreya Sans
// SC for the small labels.
//
// THE PHOTO. Bill is standing beside the shop sign, and the sign carries the
// shop phone number. No number goes on this page, so the photograph is cropped
// to Bill alone (see .ccfu-portrait). Change the crop and recheck that the
// number is still out of frame.
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
//      background-image. Surfaces use background-color longhand.
//   6. No 100vw breakout. It counts the scrollbar and the measurement is
//      circular. Width 100% plus wrapper flattening instead.
//   7. min-height:100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar
//      slides away, and the first screen visibly resizing looks broken.
//   8. The calendar iframe carries a floor height of its own. GHL's
//      form_embed.js sizes it, and ad blockers eat that script on exactly the
//      traffic that arrives from an ad.

(function () {
  "use strict";

  var ROOT_ID = "clearcfu";

  var ASSETS = "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/78859584-aabc-4235-b7fd-ee4342f5f144/";

  var CONFIG = {
    // White lettering on transparent, so it only ever sits on the dark bars.
    logo: ASSETS + "logo/6a8fc061-300c-4b1a-ad05-3a02a647c352.png",

    owner: {
      name: "Bill Maday",
      role: "Owner, Clear Choice Windows",
      photo: ASSETS + "owner/71784ecf-84bb-4e31-b986-9998d55e84cf.jpg"
    },

    // The gift the text message already promised. First screen, not down by
    // the calendar: a promise kept halfway down the page reads as bait. Worded
    // exactly as agreed and nothing more.
    gift: {
      label: "Your gift",
      headline: "Free triple pane upgrade",
      terms: "On every window. That is a $300 value per window."
    },

    embedScript: "https://link.hauckmarketing.com/js/form_embed.js",
    embedOrigin: "link.hauckmarketing.com",

    // Below this, a height claimed for the calendar is not believed. See the
    // note above watchHeight.
    minTrustedHeight: 420
  };

  // NOTE: template literal. No backticks below this line until the closing one.
  var STYLES = `
/* @import rather than a link element: the GHL builder strips link tags out of
   custom code blocks, which silently drops the fonts on the pasted page. */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Alegreya+Sans+SC:wght@500;700&display=swap');

/* ===== GHL WRAPPER FLATTENING ===== */
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
  /* Their green is the one accent. It reads at about 4.6:1 on white, so it
     works as text and as a fill with white ink. The dark bars are a green-black
     rather than plain black so the green house in the logo still shows. */
  --ink:#0E2219;
  --green:#1B8352;
  --green-deep:#146640;
  --green-tint:#E8F3ED;
  --paper:#FFFFFF;
  --wash:#F5F7F6;
  --line:#E2E8E5;
  --head:#111A16;
  --body:#46524C;
  --muted:#5B6862;
  --display:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --label:'Alegreya Sans SC','IBM Plex Sans',system-ui,sans-serif;
  --text:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --radius:8px;
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

#clearcfu p, #clearcfu h1, #clearcfu h2, #clearcfu h3, #clearcfu h4,
#clearcfu ul, #clearcfu ol, #clearcfu li, #clearcfu figure, #clearcfu figcaption,
#clearcfu blockquote, #clearcfu cite, #clearcfu aside {
  margin:0 !important; padding:0 !important;
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
  font-size:16px !important;
}

/* ===== TYPE ===== */
#clearcfu h1, #clearcfu h2, #clearcfu h3 {
  font-family:var(--display) !important;
  color:var(--head) !important;
  font-weight:700 !important;
  letter-spacing:-.022em !important;
  line-height:1.1 !important;
  text-transform:none !important;
}
#clearcfu h1 { font-size:clamp(32px,5.2vw,50px) !important; }
#clearcfu h2 { font-size:clamp(27px,4vw,40px) !important; }
#clearcfu h3 { font-size:19px !important; font-weight:600 !important; letter-spacing:-.012em !important; line-height:1.25 !important; }

#clearcfu .ccfu-eyebrow {
  display:inline-flex !important; align-items:center !important; gap:10px !important;
  font-family:var(--label) !important;
  font-size:16px !important; font-weight:700 !important;
  letter-spacing:.08em !important; text-transform:lowercase !important;
  line-height:1.2 !important;
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
  width:100% !important; max-width:1000px !important;
  margin:0 auto !important;
  padding:0 20px !important;
}
#clearcfu .ccfu-sec { padding:80px 0 !important; }

/* ===== TOP BAR ===== */
#clearcfu .ccfu-top { background-color:var(--ink) !important; }
#clearcfu .ccfu-top-in {
  display:flex !important; align-items:center !important;
  height:78px !important;
}
#clearcfu .ccfu-logo {
  height:56px !important; width:auto !important;
  object-fit:contain !important;
}

/* ===== FIRST SCREEN =====
   Four children in DOM order: head, gift, photo, button. A phone reads them
   in that order, so the gift lands on the first screen above the photograph.
   A desktop puts the photograph in a column of its own. */
#clearcfu .ccfu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:48px 0 56px !important;
  background-color:var(--paper) !important;
}
#clearcfu .ccfu-hero-grid {
  display:grid !important;
  grid-template-columns:minmax(0,1fr) minmax(0,360px) !important;
  grid-template-areas:"head media" "gift media" "act media" !important;
  grid-template-rows:auto auto 1fr !important;
  column-gap:64px !important;
  align-items:start !important;
}
#clearcfu .ccfu-hero-head { grid-area:head !important; align-self:end !important; }
#clearcfu .ccfu-gift { grid-area:gift !important; }
#clearcfu .ccfu-hero-media { grid-area:media !important; align-self:center !important; min-width:0 !important; }
#clearcfu .ccfu-hero .ccfu-actions { grid-area:act !important; }
#clearcfu .ccfu-hero h1 { max-width:15ch !important; }
#clearcfu .ccfu-lede {
  font-size:17.5px !important; color:var(--muted) !important;
  max-width:46ch !important;
  margin:16px 0 0 !important;
}

/* ===== THE PORTRAIT =====
   The source is a 3:4 photo of Bill beside the shop sign, and the sign shows
   the phone number. The frame is 4:5 and the image inside it is scaled so the
   frame covers 4 to 28 percent across the photo and 32 to 54 percent down,
   which is Bill from head to belt. The number starts around 31 percent
   across, so it never enters the frame. width 416.67% is 1 / 0.24, left
   -16.67% is 0.04 times that, top -142.2% is 0.32 of the scaled height over
   the frame height. The img is positioned inside a sized box rather than set as a
   background, so no background shorthand is involved. */
#clearcfu .ccfu-portrait {
  position:relative !important;
  width:100% !important;
  aspect-ratio:4 / 5;
  overflow:hidden !important;
  border-radius:var(--radius-lg) !important;
  background-color:var(--green-tint) !important;
  box-shadow:0 2px 6px rgba(0,0,0,.05), 0 30px 60px -32px rgba(14,34,25,.55) !important;
}
#clearcfu .ccfu-portrait img {
  position:absolute !important;
  left:-16.67% !important; top:-142.2% !important;
  width:416.67% !important; max-width:none !important; height:auto !important;
  margin:0 !important; padding:0 !important;
  image-orientation:from-image;
}
#clearcfu .ccfu-plate { margin:14px 0 0 !important; }
#clearcfu .ccfu-plate-name {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:var(--head) !important;
  margin:0 !important;
}
#clearcfu .ccfu-plate-role { font-size:14.5px !important; color:var(--muted) !important; margin:2px 0 0 !important; }

/* ===== THE GIFT =====
   Solid green on the first screen, the one loud thing on the page. It was
   promised in the text before they clicked. */
#clearcfu .ccfu-gift {
  display:flex !important; align-items:center !important; gap:20px !important;
  background-color:var(--green) !important;
  border-radius:var(--radius-lg) !important;
  padding:22px 24px !important;
  margin:28px 0 0 !important;
  max-width:32rem !important;
  box-shadow:0 16px 34px -20px rgba(20,102,64,.9) !important;
}
#clearcfu .ccfu-gift-icon {
  flex:none !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  width:52px !important; height:52px !important;
  border-radius:12px !important;
  background-color:#FFFFFF !important;
  color:var(--green) !important;
}
#clearcfu .ccfu-gift-label {
  font-family:var(--label) !important;
  font-size:15px !important; font-weight:700 !important;
  letter-spacing:.08em !important; text-transform:lowercase !important;
  line-height:1.2 !important;
  color:rgba(255,255,255,.85) !important;
  margin:0 0 4px !important;
}
#clearcfu .ccfu-gift-head {
  font-family:var(--display) !important;
  font-size:clamp(24px,3.6vw,30px) !important; font-weight:700 !important;
  letter-spacing:-.022em !important; line-height:1.1 !important;
  color:#FFFFFF !important;
  margin:0 !important;
}
#clearcfu .ccfu-gift-terms {
  font-size:15.5px !important; line-height:1.45 !important;
  color:rgba(255,255,255,.92) !important;
  margin:6px 0 0 !important;
}

/* ===== BUTTON ===== */
#clearcfu .ccfu-btn {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  gap:10px !important;
  font-family:var(--display) !important;
  font-size:16.5px !important; font-weight:600 !important; letter-spacing:-.005em !important;
  color:#FFFFFF !important;
  background-color:var(--ink) !important;
  border:2px solid var(--ink) !important;
  border-radius:var(--radius) !important;
  padding:16px 28px !important;
  cursor:pointer !important;
  box-shadow:0 14px 28px -16px rgba(14,34,25,.7) !important;
  transition:background-color .18s, transform .18s !important;
  max-width:100% !important;
}
#clearcfu .ccfu-btn svg { color:#7FD3A8 !important; flex:none !important; }
#clearcfu .ccfu-btn:hover { background-color:#1C3529 !important; border-color:#1C3529 !important; }
#clearcfu .ccfu-btn:active { transform:translateY(1px) !important; }
#clearcfu .ccfu-actions { margin:26px 0 0 !important; }

/* ===== THE STORY ===== */
#clearcfu .ccfu-story {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
  border-bottom:1px solid var(--line) !important;
}
#clearcfu .ccfu-body { max-width:34rem !important; margin:24px 0 0 !important; }
#clearcfu .ccfu-body p {
  font-size:18.5px !important; line-height:1.62 !important;
  color:var(--head) !important;
  margin:0 !important;
}
#clearcfu .ccfu-body p + p { margin-top:16px !important; }
#clearcfu .ccfu-pull {
  border-left:3px solid var(--green) !important;
  padding:2px 0 2px 20px !important;
  margin:28px 0 !important;
  max-width:34rem !important;
}
#clearcfu .ccfu-pull p {
  font-family:var(--display) !important;
  font-size:clamp(21px,2.6vw,25px) !important; font-weight:600 !important;
  letter-spacing:-.015em !important; line-height:1.3 !important;
  color:var(--head) !important;
  margin:0 !important;
}
#clearcfu .ccfu-sign {
  border-left:3px solid var(--line) !important;
  padding:2px 0 2px 17px !important;
  margin:30px 0 0 !important;
}
#clearcfu .ccfu-sign p { margin:0 !important; }
#clearcfu .ccfu-sign .ccfu-plate-name { font-size:15.5px !important; }
#clearcfu .ccfu-sign .ccfu-plate-role { font-size:14px !important; }

/* ===== WHAT THAT MEANS FOR YOU ===== */
#clearcfu .ccfu-cards {
  display:grid !important;
  grid-template-columns:repeat(3,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:36px 0 0 !important; padding:0 !important;
}
#clearcfu .ccfu-card {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-top:3px solid var(--green) !important;
  border-radius:var(--radius-lg) !important;
  padding:26px 24px !important;
  margin:0 !important;
  min-width:0 !important;
}
#clearcfu .ccfu-card-icon {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  width:36px !important; height:36px !important;
  border-radius:999px !important;
  background-color:var(--green-tint) !important;
  color:var(--green-deep) !important;
  margin:0 0 16px !important;
}
#clearcfu .ccfu-card h3 { margin:0 0 8px !important; }
#clearcfu .ccfu-card p { font-size:16px !important; line-height:1.6 !important; color:var(--body) !important; margin:0 !important; }

/* ===== BOOKING ===== */
#clearcfu .ccfu-book {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
}
#clearcfu .ccfu-gift-note {
  display:inline-flex !important; align-items:center !important; gap:9px !important;
  font-family:var(--display) !important;
  font-size:14.5px !important; font-weight:600 !important;
  line-height:1.35 !important;
  color:#FFFFFF !important;
  background-color:var(--green) !important;
  border-radius:999px !important;
  padding:9px 16px !important;
  margin:20px 0 32px !important;
  max-width:100% !important;
}
#clearcfu .ccfu-gift-note svg { flex:0 0 14px !important; }
#clearcfu .ccfu-cal {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  padding:12px !important;
  overflow:hidden !important;
  box-shadow:0 2px 6px rgba(0,0,0,.05), 0 26px 56px -28px rgba(14,34,25,.30) !important;
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
#clearcfu .ccfu-foot {
  background-color:var(--ink) !important;
  padding:28px 0 !important;
}
#clearcfu .ccfu-foot-in {
  display:flex !important; align-items:center !important; justify-content:space-between !important;
  gap:14px 20px !important; flex-wrap:wrap !important;
}
#clearcfu .ccfu-foot .ccfu-logo { height:44px !important; }
#clearcfu .ccfu-foot p {
  font-size:13.5px !important; color:#A7B5AE !important; margin:0 !important;
}

#clearcfu :focus-visible { outline:3px solid var(--green) !important; outline-offset:3px !important; }

#clearcfu .ccfu-in { animation:ccfuIn .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes ccfuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE ===== */
@media (max-width: 860px) {
  #clearcfu .ccfu-hero { min-height:0 !important; justify-content:flex-start !important; }
  #clearcfu .ccfu-hero-grid { display:flex !important; flex-direction:column !important; align-items:stretch !important; }
  #clearcfu .ccfu-hero h1 { max-width:100% !important; }
  #clearcfu .ccfu-hero-media { width:100% !important; max-width:360px !important; margin:28px 0 0 !important; }
  #clearcfu .ccfu-cards { grid-template-columns:minmax(0,1fr) !important; }
  #clearcfu .ccfu-sec { padding:64px 0 !important; }
}
@media (max-width: 600px) {
  #clearcfu { font-size:16.5px !important; }
  #clearcfu .ccfu-wrap { padding:0 16px !important; }
  #clearcfu .ccfu-top-in { height:66px !important; }
  #clearcfu .ccfu-top .ccfu-logo { height:46px !important; }
  #clearcfu .ccfu-hero { padding:28px 0 48px !important; }
  #clearcfu .ccfu-lede { font-size:16.5px !important; margin-top:12px !important; }
  #clearcfu .ccfu-gift { padding:18px !important; gap:16px !important; margin-top:22px !important; }
  #clearcfu .ccfu-gift-icon { width:44px !important; height:44px !important; }
  #clearcfu .ccfu-hero-media { margin-top:24px !important; }
  #clearcfu .ccfu-btn { width:100% !important; padding:17px 20px !important; }
  #clearcfu .ccfu-body p { font-size:17.5px !important; }
  #clearcfu .ccfu-pull { padding-left:16px !important; margin:22px 0 !important; }
  #clearcfu .ccfu-gift-note { margin:18px 0 26px !important; border-radius:14px !important; }
  #clearcfu .ccfu-cal { padding:8px !important; }
  #clearcfu .ccfu-cal iframe { min-height:900px !important; }
}
@media (max-width: 360px) {
  #clearcfu .ccfu-wrap { padding:0 12px !important; }
  #clearcfu .ccfu-cal { padding:4px !important; }
  #clearcfu .ccfu-card { padding:22px 18px !important; }
  #clearcfu .ccfu-gift { padding:16px !important; gap:12px !important; }
  #clearcfu .ccfu-gift-icon { display:none !important; }
  #clearcfu .ccfu-gift-note { font-size:13.5px !important; padding:8px 13px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #clearcfu .ccfu-in { animation:none !important; }
  #clearcfu .ccfu-btn { transition:none !important; }
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
      '<span class="ccfu-card-icon">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      path +
      "</svg></span>"
    );
  }

  // Bill's notes are two facts: he started the company many years ago, and he
  // cares deeply about the customer's experience. Every point below is that
  // second fact said plainly. No guarantee, warranty or number.
  var POINTS = [
    {
      icon: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-5A8 8 0 1121 12z"/>',
      title: "Straight answers",
      body: "Ask me anything about your windows. You will get an honest answer, even when it is not the one that sells you more."
    },
    {
      icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>',
      title: "Your time respected",
      body: "We show up when we said we would. If something changes, you hear it from us first."
    },
    {
      icon: '<path d="M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6"/>',
      title: "Your home, treated right",
      body: "You are letting us into your house. We treat it that way, and we are not done until you are happy with how it went."
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
      '<li class="ccfu-card">' +
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
      '<div class="ccfu-top">' +
        '<div class="ccfu-wrap ccfu-top-in">' +
          '<img class="ccfu-logo" src="' + esc(CONFIG.logo) + '" width="102" height="56" alt="Clear Choice Windows">' +
        "</div>" +
      "</div>" +

      // The first screen carries on from the text: it promised his story and a
      // gift, so Bill, the start of his story and the gift are what is on it.
      '<section class="ccfu-hero ccfu-in">' +
        '<div class="ccfu-wrap ccfu-hero-grid">' +
          '<div class="ccfu-hero-head">' +
            '<p class="ccfu-eyebrow">' + esc(CONFIG.owner.name) + ", owner</p>" +
            "<h1>Hey, I'm Bill. Here's how Clear Choice started.</h1>" +
            "<p class=\"ccfu-lede\">It's a short story. And here's the gift I mentioned, right up top so you don't have to go looking for it.</p>" +
          "</div>" +

          '<aside class="ccfu-gift" aria-label="Your gift">' +
            '<span class="ccfu-gift-icon">' + GIFT + "</span>" +
            "<div>" +
              '<p class="ccfu-gift-label">' + esc(CONFIG.gift.label) + "</p>" +
              '<p class="ccfu-gift-head">' + esc(CONFIG.gift.headline) + "</p>" +
              '<p class="ccfu-gift-terms">' + esc(CONFIG.gift.terms) + "</p>" +
            "</div>" +
          "</aside>" +

          '<figure class="ccfu-hero-media">' +
            '<div class="ccfu-portrait">' +
              '<img src="' + esc(CONFIG.owner.photo) + '" alt="' + esc(CONFIG.owner.name) + ', owner of Clear Choice Windows" decoding="async" onerror="this.style.display=\'none\'">' +
            "</div>" +
            '<figcaption class="ccfu-plate">' +
              '<p class="ccfu-plate-name">' + esc(CONFIG.owner.name) + "</p>" +
              '<p class="ccfu-plate-role">' + esc(CONFIG.owner.role) + "</p>" +
            "</figcaption>" +
          "</figure>" +

          '<div class="ccfu-actions">' +
            '<button class="ccfu-btn" type="button" data-goto="book">Book my home estimate' + DOWN + "</button>" +
          "</div>" +
        "</div>" +
      "</section>" +

      // Built only from Bill's notes: he started it many years ago, and he
      // cares about how customers are treated. Nothing invented to fill it out.
      '<section class="ccfu-sec ccfu-story">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">My story</p>' +
          "<h2>Why I started it, and why I still care.</h2>" +
          '<div class="ccfu-body">' +
            "<p>I started Clear Choice Windows many years ago. I've been at it a long time now.</p>" +
            "<p>I didn't start it to be the biggest window company around. I started it because I wanted people to feel good about the company they let into their home.</p>" +
          "</div>" +
          '<div class="ccfu-pull">' +
            "<p>Windows last a long time. So does how you were treated when you bought them.</p>" +
          "</div>" +
          '<div class="ccfu-body">' +
            "<p>That's the part I've cared about from day one. How you're treated from the first conversation to the last window going in.</p>" +
            "<p>You're not just buying windows. You're trusting somebody with your home. I take that seriously, and I want you to tell me if anything isn't right.</p>" +
          "</div>" +
          '<div class="ccfu-sign">' +
            '<p class="ccfu-plate-name">' + esc(CONFIG.owner.name) + "</p>" +
            '<p class="ccfu-plate-role">' + esc(CONFIG.owner.role) + "</p>" +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="ccfu-sec">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">What that means for you</p>' +
          "<h2>What you get when you work with us.</h2>" +
          '<ul class="ccfu-cards">' + points + "</ul>" +
        "</div>" +
      "</section>" +

      '<section class="ccfu-sec ccfu-book" id="ccfu-book">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">Home estimate</p>' +
          "<h2>Pick a time for your home estimate.</h2>" +
          "<p class=\"ccfu-lede\">We'll look at your windows, answer your questions and give you a price. Every open time below is one we can make.</p>" +
          '<p class="ccfu-gift-note">' + TICK + "Your free triple pane upgrade comes with the estimate you book here.</p>" +
          '<div class="ccfu-cal">' +
            // Pasted exactly as GHL generated it. The script tag that came with
            // it is appended in JS instead, because a script inserted through
            // innerHTML never runs.
            '<iframe src="https://link.hauckmarketing.com/widget/booking/KB1DJe4a8M07s4UmSphw" allow="payment" style="width: 100%;border:none;overflow: hidden;" scrolling="no" id="KB1DJe4a8M07s4UmSphw_1791999237506"></iframe><br>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<div class="ccfu-foot">' +
        '<div class="ccfu-wrap ccfu-foot-in">' +
          '<img class="ccfu-logo" src="' + esc(CONFIG.logo) + '" width="80" height="44" alt="">' +
          "<p>Clear Choice Windows. Owensboro, Kentucky.</p>" +
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
    if (document.querySelector("script[data-ccfu-embed]")) return;
    var s = document.createElement("script");
    s.setAttribute("data-ccfu-embed", "1");
    s.type = "text/javascript";
    s.src = CONFIG.embedScript;
    s.onerror = function () {
      // Not fatal: the iframe keeps its floor height and the calendar still
      // books. This is the ad blocker case. Book or reply, so no phone number.
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

  // THE HEIGHT. The CSS floor is what the calendar gets when form_embed.js
  // never runs. When it does run it measures the widget honestly, so a real
  // measurement replaces the floor. Anything under 420px is the iframe's own
  // default before the widget draws, and is ignored.
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
    if (!document.querySelector("style[data-ccfu-owner-story]")) {
      var style = document.createElement("style");
      style.setAttribute("data-ccfu-owner-story", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    flattenWrappers(root);
    root.innerHTML = view();

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
