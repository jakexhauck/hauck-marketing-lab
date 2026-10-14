// ABOVE ALL GARAGE DOORS follow-up asset 3 of 3: UNIQUE MECHANISM.
//
// WHERE IT SITS
//   Inside the estimate reminders. The text that points here reads:
//
//     "also, since your booked in now. I wanted to send over a page that goes
//      over how our process actually works and how we ensure a 100%
//      satisfaction rate on ALL of our jobs:"
//
//   So the first screen is the process itself, by name, and the promise it
//   keeps. Everybody reading already has an appointment, so this page ASKS FOR
//   NOTHING: no calendar, no button, no phone number, no form. It ends on what
//   to expect at the estimate. Its only job is to make them want to keep it.
//   A call to action here is a regression, not an improvement.
//
//   It is positioning, not a record. Nothing on it is a checkable claim: no
//   statistics, certifications, awards or warranties. The one number is the
//   100% the text already promised, and the page shows which steps make it
//   true rather than repeating it louder.
//
// GoHighLevel holds a two-line stub:
//   <div id="aboveafu"></div>
//   <script src="https://app.hauckmarketing.com/sites/above-all-garage-doors/fu/our-process.js"></script>
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.
//
// The look is deliberately identical to recent-work.js and meet-the-owner.js.
// The three pages reach the same lead, so they read as one company or the
// whole sequence reads as several different ones.
//
// THE TRAPS, every one of which has already cost a live debugging session:
//   1. STYLES below is a JS template literal. A backtick anywhere inside it,
//      including inside a CSS comment, silently ends the string and the whole
//      file stops parsing. There is not one in there. Do not add one.
//   2. GHL's theme CSS carries !important, so an unweighted reset loses. Once
//      the reset is !important it flattens our own p margins too, so every
//      element that wants spacing restates it at the same weight.
//   3. Media queries are written @media (...) { #aboveafu .x {...} }. The
//      inverse, #aboveafu @media(...), is dead CSS that fails silently.
//   4. The builder strips link elements, so the fonts load by @import.
//   5. No background shorthand with !important anywhere: it nukes
//      background-image. Surfaces use background-color longhand.
//   6. No 100vw breakout. It counts the scrollbar and the measurement is
//      circular. Width 100% plus wrapper flattening instead.
//   7. min-height:100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar
//      slides away, and the first screen visibly resizing looks broken.

(function () {
  "use strict";

  var ROOT_ID = "aboveafu";

  var IMG = "https://app.hauckmarketing.com/sites/above-all-garage-doors/fu/img/";

  var CONFIG = {
    // The logo is drawn on solid black with no transparency, so it lives on the
    // black top bar and the black footer and never on the white page.
    logo: IMG + "logo.webp",
    method: "The Above All Precision Process",
    owner: {
      name: "Ryan Michael",
      role: "Owner, Above All Garage Doors"
    }
  };

  // NOTE: template literal. No backticks below this line until the closing one.
  var STYLES = `
/* @import rather than a link element: the GHL builder strips link tags out of
   custom code blocks, which silently drops the fonts on the pasted page. */
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');

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

#aboveafu *, #aboveafu *::before, #aboveafu *::after { box-sizing:border-box !important; }

#aboveafu {
  /* Cyan is the only accent and it is a FILL colour: on white it is about
     1.6:1 and unreadable as text, so cyan-as-text takes the deep value and
     cyan fills carry black ink. */
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

#aboveafu p, #aboveafu h1, #aboveafu h2, #aboveafu h3, #aboveafu h4,
#aboveafu ul, #aboveafu ol, #aboveafu li, #aboveafu figure,
#aboveafu blockquote, #aboveafu aside {
  margin:0 !important; padding:0 !important;
}
/* The theme colours p too, so every p gets ours by default. Class rules below
   outrank this and set their own. */
#aboveafu p { color:var(--body) !important; }
#aboveafu ul, #aboveafu ol, #aboveafu li { list-style:none !important; }
#aboveafu img { display:block !important; max-width:100% !important; border:0 !important; }

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
#aboveafu h3 { font-size:20px !important; font-weight:700 !important; letter-spacing:-.015em !important; line-height:1.25 !important; }

#aboveafu .aafu-eyebrow {
  display:inline-flex !important; align-items:center !important; gap:10px !important;
  font-family:var(--display) !important;
  font-size:12.5px !important; font-weight:700 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:var(--cyan-deep) !important;
  margin:0 0 14px !important;
}
#aboveafu .aafu-eyebrow::before {
  content:"" !important;
  display:block !important;
  width:22px !important; height:3px !important;
  border-radius:2px !important;
  background-color:var(--cyan) !important;
}
#aboveafu .aafu-lede {
  font-size:17.5px !important; color:var(--muted) !important;
  max-width:46ch !important;
  margin:16px 0 0 !important;
}

/* ===== LAYOUT ===== */
#aboveafu .aafu-wrap {
  width:100% !important; max-width:1000px !important;
  margin:0 auto !important;
  padding:0 20px !important;
}
#aboveafu .aafu-sec { padding:80px 0 !important; }
#aboveafu .aafu-wash {
  background-color:var(--wash) !important;
  border-top:1px solid var(--line) !important;
  border-bottom:1px solid var(--line) !important;
}

/* ===== TOP BAR ===== */
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
   A floor of 100vh, never 100dvh. Words on the left, the four step names on
   the right as an index of what the page is about to walk through. No photos
   exist, so the method itself is the picture. */
#aboveafu .aafu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:48px 0 56px !important;
  background-color:var(--paper) !important;
}
#aboveafu .aafu-hero-grid {
  display:grid !important;
  grid-template-columns:minmax(0,1fr) minmax(0,380px) !important;
  column-gap:64px !important;
  align-items:center !important;
}
#aboveafu .aafu-hero h1 { max-width:15ch !important; }
#aboveafu .aafu-promise {
  display:flex !important; align-items:center !important; gap:14px !important;
  margin:30px 0 0 !important;
  max-width:30rem !important;
}
#aboveafu .aafu-promise-mark {
  flex:none !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  width:46px !important; height:46px !important;
  border-radius:12px !important;
  background-color:var(--cyan) !important;
  color:var(--ink) !important;
}
#aboveafu .aafu-promise p {
  font-family:var(--display) !important;
  font-size:16.5px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  line-height:1.35 !important;
  color:var(--head) !important;
  margin:0 !important;
}

#aboveafu .aafu-index {
  background-color:var(--ink) !important;
  border-radius:var(--radius-lg) !important;
  padding:26px 26px 12px !important;
  box-shadow:0 2px 6px rgba(0,0,0,.06), 0 30px 60px -30px rgba(0,0,0,.55) !important;
  min-width:0 !important;
}
#aboveafu .aafu-index-title {
  font-family:var(--display) !important;
  font-size:12px !important; font-weight:700 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:var(--cyan) !important;
  margin:0 0 8px !important;
}
#aboveafu .aafu-index li {
  display:flex !important; align-items:baseline !important; gap:16px !important;
  padding:15px 0 !important;
  border-top:1px solid rgba(255,255,255,.12) !important;
}
#aboveafu .aafu-index li:first-child { border-top:0 !important; }
#aboveafu .aafu-index-num {
  flex:none !important;
  font-family:var(--display) !important;
  font-size:13px !important; font-weight:700 !important;
  color:var(--cyan) !important;
  margin:0 !important;
}
#aboveafu .aafu-index-name {
  font-family:var(--display) !important;
  font-size:19px !important; font-weight:700 !important; letter-spacing:-.015em !important;
  line-height:1.25 !important;
  color:#FFFFFF !important;
  margin:0 !important;
}

/* ===== THE USUAL WAY vs OURS ===== */
#aboveafu .aafu-compare {
  margin:36px 0 0 !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  background-color:var(--paper) !important;
  overflow:hidden !important;
}
#aboveafu .aafu-compare-head,
#aboveafu .aafu-compare-row {
  display:grid !important;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;
}
#aboveafu .aafu-compare-head p {
  font-family:var(--display) !important;
  font-size:12.5px !important; font-weight:700 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  color:var(--muted) !important;
  padding:16px 24px !important;
  margin:0 !important;
  background-color:var(--wash-2) !important;
}
#aboveafu .aafu-compare-head p + p { color:var(--ink) !important; background-color:var(--cyan) !important; }
#aboveafu .aafu-compare-row { border-top:1px solid var(--line) !important; }
#aboveafu .aafu-compare-row p {
  font-size:16px !important; line-height:1.55 !important;
  padding:20px 24px !important;
  margin:0 !important;
}
#aboveafu .aafu-compare-row p:first-child { color:var(--muted) !important; }
#aboveafu .aafu-compare-row p + p {
  color:var(--head) !important; font-weight:600 !important;
  border-left:1px solid var(--line) !important;
}
/* Only shown when the columns stack, so each line still says which side it
   is on without the header row. */
#aboveafu .aafu-tag {
  display:none !important;
  font-family:var(--display) !important;
  font-size:11.5px !important; font-weight:700 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  margin:0 0 4px !important;
}

/* ===== THE STEPS ===== */
#aboveafu .aafu-steps {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:36px 0 0 !important; padding:0 !important;
}
#aboveafu .aafu-step {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-top:3px solid var(--cyan) !important;
  border-radius:var(--radius-lg) !important;
  padding:28px 26px !important;
  margin:0 !important;
  min-width:0 !important;
}
#aboveafu .aafu-step-num {
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  width:38px !important; height:38px !important;
  border-radius:999px !important;
  background-color:var(--ink) !important;
  color:var(--cyan) !important;
  font-family:var(--display) !important;
  font-size:14px !important; font-weight:800 !important;
  margin:0 0 16px !important;
}
#aboveafu .aafu-step h3 { margin:0 0 8px !important; }
#aboveafu .aafu-step p { font-size:16px !important; line-height:1.6 !important; color:var(--body) !important; margin:0 !important; }
#aboveafu .aafu-step .aafu-step-fix {
  font-size:14.5px !important; color:var(--cyan-deep) !important; font-weight:600 !important;
  margin:14px 0 0 !important;
}

/* ===== WHERE THE 100% COMES FROM =====
   The one black band on the page, because it is the one promise on the page. */
#aboveafu .aafu-proof { background-color:var(--ink) !important; }
#aboveafu .aafu-proof h2 { color:#FFFFFF !important; max-width:18ch !important; }
#aboveafu .aafu-proof .aafu-eyebrow { color:var(--cyan) !important; }
#aboveafu .aafu-proof .aafu-lede { color:#B7C0C4 !important; }
#aboveafu .aafu-chain { margin:36px 0 0 !important; max-width:40rem !important; }
#aboveafu .aafu-chain li {
  display:flex !important; gap:16px !important; align-items:flex-start !important;
  padding:18px 0 !important;
  border-top:1px solid rgba(255,255,255,.12) !important;
}
#aboveafu .aafu-chain li:first-child { border-top:0 !important; padding-top:0 !important; }
#aboveafu .aafu-chain svg { flex:none !important; color:var(--cyan) !important; margin-top:4px !important; }
#aboveafu .aafu-chain p {
  font-size:17px !important; line-height:1.55 !important;
  color:#E4E9EB !important;
  margin:0 !important;
}
#aboveafu .aafu-chain strong { color:#FFFFFF !important; font-weight:700 !important; }

/* ===== WHAT TO EXPECT ===== */
#aboveafu .aafu-expect {
  display:grid !important;
  grid-template-columns:repeat(3,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:36px 0 0 !important;
}
#aboveafu .aafu-expect-card {
  background-color:var(--paper) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  padding:26px 24px !important;
  margin:0 !important;
  min-width:0 !important;
}
#aboveafu .aafu-expect-card h3 { font-size:18px !important; margin:0 0 12px !important; }
#aboveafu .aafu-expect-card > p { font-size:16px !important; line-height:1.6 !important; margin:0 !important; }
#aboveafu .aafu-list li {
  display:flex !important; gap:10px !important; align-items:flex-start !important;
  font-size:16px !important; line-height:1.5 !important;
  color:var(--body) !important;
  margin:0 0 10px !important;
}
#aboveafu .aafu-list li:last-child { margin-bottom:0 !important; }
#aboveafu .aafu-list svg { flex:none !important; color:var(--cyan-deep) !important; margin-top:4px !important; }

#aboveafu .aafu-close {
  border-left:3px solid var(--cyan) !important;
  padding:2px 0 2px 20px !important;
  margin:44px 0 0 !important;
  max-width:36rem !important;
}
#aboveafu .aafu-close-line {
  font-family:var(--display) !important;
  font-size:clamp(21px,2.6vw,25px) !important; font-weight:700 !important;
  letter-spacing:-.02em !important; line-height:1.3 !important;
  color:var(--head) !important;
  margin:0 !important;
}
#aboveafu .aafu-sign-name {
  font-family:var(--display) !important;
  font-size:15.5px !important; font-weight:800 !important; letter-spacing:-.02em !important;
  color:var(--head) !important;
  margin:14px 0 0 !important;
}
#aboveafu .aafu-sign-role { font-size:14px !important; color:var(--muted) !important; margin:2px 0 0 !important; }

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
#aboveafu .aafu-foot p { font-size:13.5px !important; color:#A9B2B6 !important; margin:0 !important; }

#aboveafu .aafu-in { animation:aafuIn .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes aafuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE ===== */
@media (max-width: 860px) {
  #aboveafu .aafu-hero { min-height:0 !important; justify-content:flex-start !important; }
  #aboveafu .aafu-hero-grid { display:flex !important; flex-direction:column !important; align-items:stretch !important; }
  #aboveafu .aafu-hero h1 { max-width:100% !important; }
  #aboveafu .aafu-index { margin:32px 0 0 !important; max-width:460px !important; }
  #aboveafu .aafu-expect { grid-template-columns:minmax(0,1fr) !important; }
  #aboveafu .aafu-sec { padding:64px 0 !important; }
}
@media (max-width: 680px) {
  #aboveafu .aafu-steps { grid-template-columns:minmax(0,1fr) !important; }
  #aboveafu .aafu-compare-head { display:none !important; }
  #aboveafu .aafu-compare-row { grid-template-columns:minmax(0,1fr) !important; }
  #aboveafu .aafu-compare-row p { padding:16px 20px !important; }
  #aboveafu .aafu-compare-row p + p {
    border-left:0 !important; border-top:1px dashed var(--line) !important;
    background-color:#F2FCFF !important;
  }
  #aboveafu .aafu-tag { display:block !important; }
  #aboveafu .aafu-compare-row p:first-child .aafu-tag { color:var(--muted) !important; }
  #aboveafu .aafu-compare-row p + p .aafu-tag { color:var(--cyan-deep) !important; }
}
@media (max-width: 600px) {
  #aboveafu { font-size:16.5px !important; }
  #aboveafu .aafu-wrap { padding:0 16px !important; }
  #aboveafu .aafu-top-in { height:64px !important; }
  #aboveafu .aafu-top .aafu-logo { height:42px !important; }
  #aboveafu .aafu-hero { padding:32px 0 48px !important; }
  #aboveafu .aafu-lede { font-size:16.5px !important; margin-top:12px !important; }
  #aboveafu .aafu-promise { margin-top:22px !important; }
  #aboveafu .aafu-index { max-width:100% !important; padding:22px 20px 8px !important; }
  #aboveafu .aafu-index-name { font-size:17.5px !important; }
  #aboveafu .aafu-step { padding:24px 20px !important; }
  #aboveafu .aafu-close { padding-left:16px !important; }
}
@media (max-width: 360px) {
  #aboveafu .aafu-wrap { padding:0 12px !important; }
  #aboveafu .aafu-promise-mark { width:40px !important; height:40px !important; }
  #aboveafu .aafu-expect-card { padding:22px 18px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #aboveafu .aafu-in { animation:none !important; }
}
`;

  var TICK =
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  var SHIELD =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3 4.5 6v6c0 4.4 3.2 7.9 7.5 9 4.3-1.1 7.5-4.6 7.5-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';

  // The four steps. Each is built from the owner's notes: the right next step
  // first, same-day estimates, precision at speed, and a customer who is happy
  // at the end. The "fix" line is what the usual way gets wrong at that step.
  var STEPS = [
    {
      name: "The Right Next Step",
      body: "Before anything else, I work out the one step that is best for you and your door. Not the biggest job, not the easiest one for me. The right one.",
      fix: "Instead of selling you whatever is on the truck."
    },
    {
      name: "The Same-Day Estimate",
      body: "You get a clear price the same day I look at the door, so you know exactly where you stand before I leave.",
      fix: "Instead of a quote that turns up days later, if it turns up."
    },
    {
      name: "Precision at Speed",
      body: "Every part fitted, set and checked properly, whatever the size of the job. Doing it right once is what makes it quick.",
      fix: "Instead of choosing between fast and done right."
    },
    {
      name: "The Sign-Off",
      body: "The job is not finished when the tools go back in the truck. It is finished when you have tried the door and you are happy with it.",
      fix: "Instead of leaving and hoping it holds."
    }
  ];

  var COMPARE = [
    ["You wait days to find out what it will cost.", "You get your price the same day I see the door."],
    ["You get sold the biggest fix on the list.", "You get told the step that is actually right for your door."],
    ["Fast means rushed. Careful means slow.", "Precise and quick, because the work is done right the first time."],
    ["The job is over when the truck pulls away.", "The job is over when you say you are happy with it."]
  ];

  // What in the process makes the 100% true, one link per step. This is the
  // only place the promise is spoken to, and it adds nothing beside it.
  var CHAIN = [
    ["The right next step", "means you never pay for work your door did not need."],
    ["The same-day estimate", "means no surprises. You know the price before anything is touched."],
    ["Precision at speed", "means the door works properly when I leave, not just for now."],
    ["The sign-off", "means you are the one who decides the job is done. That is how every job ends at 100%."]
  ];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function view() {
    var index = "";
    var steps = "";
    var compare = "";
    var chain = "";
    var i;

    for (i = 0; i < STEPS.length; i++) {
      index +=
        "<li>" +
        '<p class="aafu-index-num">' + pad(i + 1) + "</p>" +
        '<p class="aafu-index-name">' + esc(STEPS[i].name) + "</p>" +
        "</li>";
      steps +=
        '<li class="aafu-step">' +
        '<span class="aafu-step-num">' + (i + 1) + "</span>" +
        "<h3>" + esc(STEPS[i].name) + "</h3>" +
        "<p>" + esc(STEPS[i].body) + "</p>" +
        '<p class="aafu-step-fix">' + esc(STEPS[i].fix) + "</p>" +
        "</li>";
    }

    for (i = 0; i < COMPARE.length; i++) {
      compare +=
        '<div class="aafu-compare-row">' +
        '<p><span class="aafu-tag">The usual way</span>' + esc(COMPARE[i][0]) + "</p>" +
        '<p><span class="aafu-tag">Our way</span>' + esc(COMPARE[i][1]) + "</p>" +
        "</div>";
    }

    for (i = 0; i < CHAIN.length; i++) {
      chain +=
        "<li>" + TICK +
        "<p><strong>" + esc(CHAIN[i][0]) + "</strong> " + esc(CHAIN[i][1]) + "</p>" +
        "</li>";
    }

    return (
      '<div class="aafu-top">' +
        '<div class="aafu-wrap aafu-top-in">' +
          '<img class="aafu-logo" src="' + esc(CONFIG.logo) + '" width="115" height="54" alt="Above All Garage Doors">' +
        "</div>" +
      "</div>" +

      // The first screen carries on from the text: it asked "how does your
      // process work, and how do you make sure every job ends happy". So the
      // process is named, the four steps are listed, and the 100% is tied to
      // them. Nothing introduces the company; they booked with it already.
      '<section class="aafu-hero aafu-in">' +
        '<div class="aafu-wrap aafu-hero-grid">' +
          "<div>" +
            '<p class="aafu-eyebrow">How we work</p>' +
            "<h1>" + esc(CONFIG.method) + ".</h1>" +
            '<p class="aafu-lede">Four steps, run the same way on every job, big or small. Each one is there for the same reason: so that when I leave, you are completely happy with the work.</p>' +
            '<div class="aafu-promise">' +
              '<span class="aafu-promise-mark">' + SHIELD + "</span>" +
              "<p>This is how we make sure every single job ends with a 100% satisfied customer.</p>" +
            "</div>" +
          "</div>" +
          '<aside class="aafu-index" aria-label="The four steps">' +
            '<p class="aafu-index-title">The four steps</p>' +
            "<ol>" + index + "</ol>" +
          "</aside>" +
        "</div>" +
      "</section>" +

      '<section class="aafu-sec aafu-wash">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">Why it exists</p>' +
          "<h2>Most garage door jobs go wrong before anyone picks up a tool.</h2>" +
          '<p class="aafu-lede">You have probably had a contractor do it the usual way. This is what I do instead.</p>' +
          '<div class="aafu-compare">' +
            '<div class="aafu-compare-head"><p>The usual way</p><p>Our way</p></div>' +
            compare +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="aafu-sec">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">The process</p>' +
          "<h2>Four steps, in this order, every time.</h2>" +
          '<ol class="aafu-steps">' + steps + "</ol>" +
        "</div>" +
      "</section>" +

      '<section class="aafu-sec aafu-proof">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">Where the 100% comes from</p>' +
          "<h2>It is not a promise I make at the end. It is built into every step.</h2>" +
          '<ul class="aafu-chain">' + chain + "</ul>" +
        "</div>" +
      "</section>" +

      // The ending. No calendar, no button, no number: they are already
      // booked. This only makes the appointment feel easy and worth keeping.
      '<section class="aafu-sec aafu-wash">' +
        '<div class="aafu-wrap">' +
          '<p class="aafu-eyebrow">Your estimate</p>' +
          "<h2>What to expect when I come out.</h2>" +
          '<div class="aafu-expect">' +
            '<div class="aafu-expect-card">' +
              "<h3>What happens</h3>" +
              '<ul class="aafu-list">' +
                "<li>" + TICK + "<span>I look over the door, the springs, the cables and the opener, and run it a few times.</span></li>" +
                "<li>" + TICK + "<span>I tell you what I found and the step I think is right for it.</span></li>" +
                "<li>" + TICK + "<span>You get your price before I leave.</span></li>" +
              "</ul>" +
            "</div>" +
            '<div class="aafu-expect-card">' +
              "<h3>How long it takes</h3>" +
              "<p>Not long. It is one short visit, and the price comes the same day, so there is no waiting on a quote afterwards.</p>" +
            "</div>" +
            '<div class="aafu-expect-card">' +
              "<h3>What to have ready</h3>" +
              '<ul class="aafu-list">' +
                "<li>" + TICK + "<span>A clear path to the door, and the car out of the way if you can.</span></li>" +
                "<li>" + TICK + "<span>Your remote or keypad.</span></li>" +
                "<li>" + TICK + "<span>Anything you have noticed: noises, sticking, when it started.</span></li>" +
                "<li>" + TICK + "<span>Anyone else who has a say in the decision, if they can be there.</span></li>" +
              "</ul>" +
            "</div>" +
          "</div>" +
          '<div class="aafu-close">' +
            '<p class="aafu-close-line">That is the whole process. See you at your appointment.</p>' +
            '<p class="aafu-sign-name">' + esc(CONFIG.owner.name) + "</p>" +
            '<p class="aafu-sign-role">' + esc(CONFIG.owner.role) + "</p>" +
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

  function mount(root) {
    if (!document.querySelector("style[data-aafu-our-process]")) {
      var style = document.createElement("style");
      style.setAttribute("data-aafu-our-process", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    flattenWrappers(root);
    root.innerHTML = view();
  }

  // The stub puts the div above the script tag, so the mount is normally there
  // already. The retries cover a builder that defers the block. After that the
  // file does nothing at all: no styles injected, no markup.
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
