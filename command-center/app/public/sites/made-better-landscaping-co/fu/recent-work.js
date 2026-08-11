// MADE BETTER LC follow-up asset 1 of 3: RECENT WORK.
//
// WHERE IT SITS
//   A new lead comes in. Text 1 goes out:
//
//     "Hey {{contact.first_name}}, a lot of companies talk about how great
//      their work is but never actually show customers REAL work lol. So
//      here's some of our recent work we've gotten done:"
//
//   This page is what that colon points at. The lead has already met the
//   business by name, so the page does not introduce it, does not re-pitch and
//   does not restate the text. It opens on the work, because the work is the
//   thing that was promised, and it ends on the calendar, because the only
//   thing left to ask for is a time.
//
// GoHighLevel holds a two-line stub:
//   <div id="madebefu"></div>
//   <script src="https://app.hauckmarketing.com/sites/made-better-landscaping-co/fu/recent-work.js"></script>
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
//   3. Media queries are written @media (...) { #madebefu .x {...} }. The
//      inverse, #madebefu @media(...), is dead CSS that fails silently.
//   4. The builder strips link elements, so the fonts load by @import.
//   5. No background shorthand with !important anywhere: it nukes
//      background-image and outranks an inline poster. Photographs are img
//      elements and surfaces use background-color longhand.
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
    logo:
      "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/5aa6666d-6d76-49f1-a3e1-06b0dcdedaed/logo/81fcba12-9bb6-4571-b150-98992018f1e1.jpg",

    // Order matters and is not ours to change: first url is BEFORE, second is
    // AFTER. Swapping them turns the page into an advert for the competition.
    jobs: [
      {
        caption: "Full Walkway Transformation",
        before:
          "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/5aa6666d-6d76-49f1-a3e1-06b0dcdedaed/before/9d55d6d7-13cb-40ba-be26-22b2ac0fe8e1.png",
        after:
          "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/5aa6666d-6d76-49f1-a3e1-06b0dcdedaed/after/933746cf-2da3-4758-bb95-9b4635309c90.png"
      }
    ],

    // Quoted exactly as written. Not tidied, not shortened, not repunctuated.
    reviews: [
      {
        quote: "Great company to work with. Would recommend without any reservations.",
        name: "Michael G"
      },
      { quote: "5 - Star Service! This crew does great work!", name: "Frank Purrington" },
      {
        quote: "This company is one of the best!!! Always do a great job I highly recommend!!",
        name: "Ali Najdi"
      }
    ],

    trust: ["Licensed", "Insured", "3 years in business", "50+ jobs completed", "Serving Metro Detroit"],

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
#madebefu blockquote, #madebefu cite {
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
#madebefu h1 { font-size:clamp(31px,6vw,54px) !important; }
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
#madebefu .mbfu-mark {
  width:44px !important; height:44px !important; flex:none !important;
  border-radius:50% !important; object-fit:cover !important;
  border:1px solid var(--line) !important;
}
#madebefu .mbfu-name {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:800 !important; letter-spacing:-.02em !important;
  color:var(--head) !important;
}

/* ===== FIRST SCREEN =====
   min-height on 100vh, never 100dvh: the backdrop must not resize under them
   as the Safari toolbar slides away. It is a floor, so a tall phone gets the
   photograph and the button in one screen and a short one simply scrolls. */
#madebefu .mbfu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:40px 0 56px !important;
  background-color:var(--paper) !important;
}
#madebefu .mbfu-hero h1 { max-width:16ch !important; }
#madebefu .mbfu-lede {
  font-size:17.5px !important; color:var(--muted) !important;
  max-width:52ch !important;
  margin:16px 0 28px !important;
}

/* ===== BEFORE AND AFTER =====
   A labelled pair, not a wipe slider. The two photographs were taken from
   different distances, so a slider would have wiped one composition into
   another and read as a trick. Side by side, both are just photographs, and the
   label on each says which is which whether or not the second one has loaded.
   They stay side by side down to 600px so the payoff is one glance, and stack
   below that where two tiles would be too small to prove anything. */
#madebefu .mbfu-job { margin:0 !important; }
#madebefu .mbfu-job + .mbfu-job { margin-top:44px !important; }
#madebefu .mbfu-pair {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:12px !important;
  margin:0 !important; padding:0 !important;
}
#madebefu .mbfu-shot {
  position:relative !important;
  width:100% !important; max-width:100% !important;
  min-width:0 !important;
  aspect-ratio:4 / 3;
  overflow:hidden !important;
  border-radius:var(--radius-lg) !important;
  background-color:var(--wash-2) !important;
  box-shadow:0 2px 6px rgba(22,14,7,.06), 0 26px 56px -28px rgba(22,14,7,.38) !important;
}
#madebefu .mbfu-shot img {
  width:100% !important; height:100% !important;
  /* Weighted low: the sky at the top of a square photograph is not the job, and
     the ground at the bottom of it is. */
  object-fit:cover !important; object-position:50% 66% !important;
}
#madebefu .mbfu-tag {
  position:absolute !important; top:12px !important; left:12px !important;
  font-family:var(--display) !important;
  font-size:11.5px !important; font-weight:700 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  color:#FFFFFF !important;
  background-color:rgba(22,14,7,.78) !important;
  padding:6px 11px !important;
  border-radius:999px !important;
  z-index:2 !important;
}
#madebefu .mbfu-tag-a { background-color:var(--gold) !important; color:#160E07 !important; }
#madebefu .mbfu-cap {
  display:block !important;
  margin:16px 0 0 !important;
  font-family:var(--display) !important;
  font-size:15.5px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:var(--head) !important;
}

/* ===== BUTTON =====
   Dark ink on gold. Gold and white is about 2.9:1 and unreadable at button
   size. The label names the appointment they are actually booking. */
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
#madebefu .mbfu-actions { margin:28px 0 0 !important; }

/* ===== OWNER NOTE ===== */
#madebefu .mbfu-note {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
  border-bottom:1px solid var(--line) !important;
}
#madebefu .mbfu-note p {
  font-size:19px !important; line-height:1.6 !important;
  color:var(--head) !important;
  max-width:46ch !important;
  margin:0 !important;
}
#madebefu .mbfu-note p + p { margin-top:14px !important; }

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

/* ===== REVIEWS ===== */
#madebefu .mbfu-cards {
  display:grid !important;
  grid-template-columns:repeat(3,minmax(0,1fr)) !important;
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
#madebefu .mbfu-stars {
  display:flex !important; gap:3px !important;
  color:var(--gold) !important;
  margin:0 0 14px !important;
}
#madebefu .mbfu-card blockquote {
  font-size:16.5px !important; line-height:1.6 !important;
  color:var(--head) !important;
  margin:0 0 16px !important;
}
#madebefu .mbfu-card cite {
  font-family:var(--display) !important;
  font-size:14px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:var(--muted) !important;
}

/* ===== BOOKING =====
   The page ends here. The calendar is in the page, not behind a link. */
#madebefu .mbfu-book {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
}
#madebefu .mbfu-book .mbfu-lede { margin-bottom:32px !important; }
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
@media (max-width: 860px) {
  #madebefu .mbfu-cards { grid-template-columns:minmax(0,1fr) !important; }
  #madebefu .mbfu-sec { padding:60px 0 !important; }
}
@media (max-width: 600px) {
  #madebefu { font-size:16.5px !important; }
  #madebefu .mbfu-wrap { padding:0 16px !important; }
  #madebefu .mbfu-hero { padding:24px 0 44px !important; }
  #madebefu .mbfu-hero h1 { max-width:100% !important; }
  /* Every pixel above the photographs pushes the AFTER shot off the first
     screen, and the after shot is the entire promise the text message made. */
  #madebefu .mbfu-lede { font-size:16.5px !important; margin:12px 0 20px !important; }
  #madebefu .mbfu-btn { width:100% !important; padding:16px 20px !important; }
  #madebefu .mbfu-note p { font-size:17.5px !important; }
  #madebefu .mbfu-cal { padding:8px !important; }
  /* A phone stacks the month grid above the times, so the floor has to be
     taller here than on a desktop or the calendar arrives clipped. */
  #madebefu .mbfu-cal iframe { min-height:900px !important; }
  #madebefu .mbfu-pair { grid-template-columns:minmax(0,1fr) !important; gap:10px !important; }
  #madebefu .mbfu-tag { top:10px !important; left:10px !important; font-size:10.5px !important; padding:5px 9px !important; }
}
/* A 320px phone. GHL's widget lays out its own month grid inside the iframe and
   starts clipping the Saturday column around here, so the card gives back every
   pixel it can rather than spending them on padding. */
@media (max-width: 360px) {
  #madebefu .mbfu-wrap { padding:0 12px !important; }
  #madebefu .mbfu-cal { padding:4px !important; }
  #madebefu .mbfu-card { padding:22px 18px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #madebefu .mbfu-in { animation:none !important; }
  #madebefu .mbfu-btn { transition:none !important; }
}
`;

  var STAR =
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">' +
    '<path d="M10 1.6l2.5 5.1 5.6.8-4.05 3.95.96 5.55L10 14.4l-5.01 2.6.96-5.55L1.9 7.5l5.6-.8z"/></svg>';

  var TICK =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stars() {
    return (
      '<div class="mbfu-stars" role="img" aria-label="5 stars">' + STAR + STAR + STAR + STAR + STAR + "</div>"
    );
  }

  // The first url is BEFORE and it is drawn first, left to right, because that
  // is the order the eye reads and the order the job happened in.
  function job(j) {
    return (
      '<figure class="mbfu-job">' +
      '<div class="mbfu-pair">' +
        '<div class="mbfu-shot">' +
          '<span class="mbfu-tag mbfu-tag-b">Before</span>' +
          '<img src="' + esc(j.before) + '" alt="' + esc(j.caption) + ', before we started" decoding="async">' +
        "</div>" +
        '<div class="mbfu-shot">' +
          '<span class="mbfu-tag mbfu-tag-a">After</span>' +
          '<img src="' + esc(j.after) + '" alt="' + esc(j.caption) + ', after we finished" decoding="async">' +
        "</div>" +
      "</div>" +
      '<figcaption class="mbfu-cap">' + esc(j.caption) + "</figcaption>" +
      "</figure>"
    );
  }

  function review(r) {
    return (
      '<li class="mbfu-card">' +
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
    return '<ul class="mbfu-trust">' + out + "</ul>";
  }

  function view() {
    var jobs = "";
    for (var i = 0; i < CONFIG.jobs.length; i++) jobs += job(CONFIG.jobs[i]);

    var reviews = "";
    for (var r = 0; r < CONFIG.reviews.length; r++) reviews += review(CONFIG.reviews[r]);

    return (
      '<div class="mbfu-top">' +
        '<div class="mbfu-wrap mbfu-top-in">' +
          '<img class="mbfu-mark" src="' + esc(CONFIG.logo) + '" width="44" height="44" alt="Made Better Landscaping Co">' +
          '<span class="mbfu-name">Made Better Landscaping Co</span>' +
        "</div>" +
      "</div>" +

      // The first screen. It carries on from the text rather than answering a
      // different question: the promise was real work, so the work is the first
      // thing on it and there is no introduction in front of it.
      '<section class="mbfu-hero mbfu-in">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">Recent work</p>' +
          "<h1>Here is a walkway we finished.</h1>" +
          // Ordinals rather than left and right: the pair stacks on a narrow
          // phone, and a caption that says "on the left" is then wrong.
          '<p class="mbfu-lede">Same house, same front path. The first photo is the day we turned up. The second is how we left it.</p>' +
          jobs +
          '<div class="mbfu-actions">' +
            '<button class="mbfu-btn" type="button" data-goto="book">Book a home estimate</button>' +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="mbfu-sec mbfu-note">' +
        '<div class="mbfu-wrap">' +
          "<p>That is our crew and our work, not a stock photo and not somebody else's job.</p>" +
          "<p>If you want something like it done at your place, book a time and I will come out, look at the space with you, and give you a price.</p>" +
          trust() +
        "</div>" +
      "</section>" +

      '<section class="mbfu-sec">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">What people say</p>' +
          "<h2>In their own words.</h2>" +
          '<ul class="mbfu-cards">' + reviews + "</ul>" +
        "</div>" +
      "</section>" +

      '<section class="mbfu-sec mbfu-book" id="mbfu-book">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">Book a home estimate</p>' +
          "<h2>Pick a time that works for you.</h2>" +
          '<p class="mbfu-lede">I come out, walk the space with you and give you a price. Pick any open slot below and it is booked.</p>' +
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
          '<img class="mbfu-mark" src="' + esc(CONFIG.logo) + '" width="44" height="44" alt="">' +
          "<p>Made Better Landscaping Co. Metro Detroit.</p>" +
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
    if (!document.querySelector("style[data-mbfu-recent-work]")) {
      var style = document.createElement("style");
      style.setAttribute("data-mbfu-recent-work", "1");
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
