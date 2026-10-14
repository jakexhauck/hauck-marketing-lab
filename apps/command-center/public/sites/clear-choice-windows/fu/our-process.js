// CLEAR CHOICE WINDOWS follow-up asset: UNIQUE MECHANISM.
//
// WHERE IT SITS
//   The lead is already booked. This goes out inside the estimate reminders:
//
//     "also, since your booked in now. I wanted to send over a page that goes
//      over how our process actually works and how we ensure a 100%
//      satisfaction rate on ALL of our jobs:"
//
//   So the page carries on from that colon. It does not introduce the company,
//   because they have already met it, and it does not restate the text. It
//   opens on the process, because the process is what was promised.
//
//   IT ASKS FOR NOTHING. No calendar, no form, no button, no phone number.
//   Everybody reading it has an appointment. The only job is to make them keep
//   it, so it ends on what happens at the estimate rather than on a request.
//
// THE POSITIONING
//   Steering notes: they care deeply about the install, and their estimates are
//   clear. So the enemy is twofold: the confusing price, and the rushed install
//   that ruins a good window. Every claim on the page is about SEQUENCE and
//   TECHNIQUE, which cannot be wrong. No statistic, no certification, no award,
//   no warranty, no brand name. The one number is the 100% the text already
//   promised, answered by showing what in the process makes it true.
//
// LOOK
//   Pulled from replacementwindowsowensboro.com: their green #1b8352 (menu bar
//   and buttons) as the one accent, black, and IBM Plex Sans, the face their
//   headings use. The logo has white lettering, so it only ever sits on the
//   dark header and footer bands, never on the light page.
//
// GoHighLevel holds a two-line stub:
//   <div id="clearcfu"></div>
//   <script src="https://app.hauckmarketing.com/sites/clear-choice-windows/fu/our-process.js"></script>
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
//      background-image. Surfaces use background-color longhand and the logo
//      is an img element.
//   6. No 100vw breakout. Width 100% plus wrapper flattening instead.
//   7. min-height:100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar
//      slides away, and the first screen visibly resizing looks broken.

(function () {
  "use strict";

  var ROOT_ID = "clearcfu";

  var CONFIG = {
    logo:
      "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/78859584-aabc-4235-b7fd-ee4342f5f144/logo/6a8fc061-300c-4b1a-ad05-3a02a647c352.png",

    name: "Clear Choice Windows",

    method: "The Clear Choice Promise",

    // Four steps, price to final walk-through. Each one is what we do, then one
    // line on what the usual way gets wrong, because the contrast is the
    // argument.
    steps: [
      {
        n: "01",
        name: "The Straight Price",
        body:
          "You get one price, written down, with every window and every part of the job on its own line. You can see exactly what you are paying for and you can take as long as you like to think about it.",
        usual: "A big number, a discount that ends tonight, and a call to a manager to make it go away."
      },
      {
        n: "02",
        name: "Every Opening Measured",
        body:
          "We measure each opening on its own, because no two in an older house are the same size, even when they look it. The window gets ordered to fit the hole it is going into, not the other way round.",
        usual: "A quick tape across the front, a standard size, and the gap filled in on the day."
      },
      {
        n: "03",
        name: "Fix What Is Behind It",
        body:
          "When the old window comes out, we stop and look at what was behind it. Soft wood, old gaps and missing insulation get dealt with first, then the new window goes in square and gets sealed all the way round.",
        usual: "New window into an old problem, trim nailed over the top, caulk over the gaps."
      },
      {
        n: "04",
        name: "The Final Walk-Through",
        body:
          "Before we pack up, we walk the house with you. Every window gets opened, closed and locked in front of you, and the mess goes with us. The job is not done until you say it is.",
        usual: "The crew leaves at five, and the first you hear from them again is the invoice."
      }
    ],

    // The page ends here. What happens, how long, what to have ready.
    expect: [
      {
        k: "What happens",
        v:
          "We walk the house together and look at each window you want done. I measure, ask what is bothering you about them, and go through the options that fit your home and your budget."
      },
      {
        k: "How long it takes",
        v:
          "Usually about an hour, depending on how many windows we are looking at. Longer if you have questions. I would rather answer them in person than over text."
      },
      {
        k: "What to have ready",
        v:
          "A rough list of the windows that bother you most and why: drafty, foggy, hard to open. A clear path to them inside, and anyone else who is part of the decision."
      },
      {
        k: "What you leave with",
        v:
          "A written price, line by line, that is yours to keep. No deadline on it. Take it, compare it, and decide in your own time."
      }
    ]
  };

  // NOTE: template literal. No backticks below this line until the closing one.
  var STYLES = `
/* @import rather than a link element: the GHL builder strips link tags out of
   custom code blocks, which silently drops the fonts on the pasted page.
   IBM Plex Sans is the face replacementwindowsowensboro.com sets its headings in. */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

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
body { margin:0 !important; padding:0 !important; background-color:#FFFFFF !important; }

#clearcfu *, #clearcfu *::before, #clearcfu *::after { box-sizing:border-box !important; }

#clearcfu {
  /* Green #1b8352 is their menu bar and button colour. It is the only accent
     and it clears 4.8:1 on white, so it can carry small labels as well. */
  --paper:#FFFFFF;
  --paper-2:#F5F8F6;
  --band:#0E1411;
  --green:#1B8352;
  --green-soft:#E8F3ED;
  --line:#E2E8E4;
  --line-2:#D3DCD6;
  --head:#111A15;
  --body:#3E4B44;
  --muted:#6B7871;
  --on-band:#C9D3CD;
  --font:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
  --radius:12px;

  display:block !important;
  width:100% !important; max-width:100% !important;
  margin:0 !important; padding:0 !important;
  position:relative !important;
  overflow-x:hidden !important;
  background-color:var(--paper) !important;
  font-family:var(--font) !important;
  font-size:17px !important;
  line-height:1.65 !important;
  color:var(--body) !important;
  text-align:left !important;
  -webkit-font-smoothing:antialiased;
}

/* The reset is !important because the theme is. Every rule that wants space
   back says so at the same weight. */
#clearcfu p, #clearcfu h1, #clearcfu h2, #clearcfu h3, #clearcfu h4,
#clearcfu ul, #clearcfu ol, #clearcfu li, #clearcfu dl, #clearcfu dt, #clearcfu dd,
#clearcfu figure, #clearcfu figcaption, #clearcfu blockquote {
  margin:0 !important; padding:0 !important;
}
#clearcfu ul, #clearcfu ol, #clearcfu li { list-style:none !important; }
#clearcfu img { display:block !important; max-width:100% !important; border:0 !important; }
#clearcfu button {
  margin:0 !important; text-transform:none !important; letter-spacing:normal !important;
  font-family:inherit !important; line-height:normal !important;
}
#clearcfu input {
  margin:0 !important; max-width:none !important; box-shadow:none !important;
  font-family:inherit !important;
  /* 16px floor or iOS Safari zooms on focus. No input here; the rule stays so
     adding one cannot bring the bug back. */
  font-size:16px !important;
}

/* ===== TYPE ===== */
#clearcfu h1, #clearcfu h2, #clearcfu h3 {
  font-family:var(--font) !important;
  color:var(--head) !important;
  font-weight:600 !important;
  letter-spacing:-.02em !important;
  line-height:1.14 !important;
  text-transform:none !important;
}
#clearcfu h1 { font-size:clamp(31px,5.4vw,54px) !important; }
#clearcfu h2 { font-size:clamp(25px,3.8vw,38px) !important; }
#clearcfu h3 { font-size:20px !important; letter-spacing:-.01em !important; line-height:1.25 !important; }

#clearcfu .ccfu-eyebrow {
  font-size:12.5px !important; font-weight:600 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:var(--green) !important;
  margin:0 0 14px !important;
}

/* ===== LAYOUT ===== */
#clearcfu .ccfu-wrap {
  width:100% !important; max-width:1000px !important;
  margin:0 auto !important;
  padding:0 24px !important;
}
#clearcfu .ccfu-sec { padding:88px 0 !important; }
#clearcfu .ccfu-tint { background-color:var(--paper-2) !important; }

/* ===== TOP BAR =====
   Dark because the logo lettering is white. They already know who this is,
   so the mark identifies the page and nothing more. */
#clearcfu .ccfu-top { background-color:var(--band) !important; }
#clearcfu .ccfu-top-in {
  display:flex !important; align-items:center !important;
  height:76px !important;
}
#clearcfu .ccfu-logo {
  height:48px !important; width:auto !important; max-width:180px !important;
  object-fit:contain !important;
}
#clearcfu .ccfu-stripe { height:4px !important; background-color:var(--green) !important; }

/* ===== FIRST SCREEN =====
   min-height on 100vh, never 100dvh. A floor, so a short phone just scrolls. */
#clearcfu .ccfu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:64px 0 72px !important;
  background-color:var(--paper) !important;
}
#clearcfu .ccfu-hero h1 { max-width:18ch !important; }
#clearcfu .ccfu-lede {
  font-size:19px !important; color:var(--body) !important;
  max-width:54ch !important;
  margin:24px 0 0 !important;
}

/* The method plate: the one place the method is named as a name. */
#clearcfu .ccfu-plate {
  margin:48px 0 0 !important;
  padding:24px 0 0 !important;
  border-top:1px solid var(--line-2) !important;
  display:flex !important; align-items:baseline !important;
  flex-wrap:wrap !important; gap:6px 18px !important;
}
#clearcfu .ccfu-plate strong {
  font-size:clamp(20px,2.6vw,25px) !important; font-weight:600 !important;
  letter-spacing:-.015em !important;
  color:var(--head) !important;
}
#clearcfu .ccfu-plate strong::before {
  content:"" !important;
  display:inline-block !important;
  width:10px !important; height:10px !important;
  margin:0 12px 2px 0 !important;
  border-radius:2px !important;
  background-color:var(--green) !important;
  vertical-align:middle !important;
}
#clearcfu .ccfu-plate span { font-size:16px !important; color:var(--muted) !important; }

/* ===== THE DIAGNOSIS ===== */
#clearcfu .ccfu-prose p {
  font-size:18px !important; line-height:1.7 !important;
  max-width:60ch !important;
  margin:22px 0 0 !important;
  color:var(--body) !important;
}
#clearcfu .ccfu-prose p.ccfu-lift {
  color:var(--head) !important;
  font-size:clamp(20px,2.6vw,25px) !important;
  font-weight:600 !important; letter-spacing:-.015em !important; line-height:1.38 !important;
  margin:32px 0 0 !important;
  padding:0 0 0 20px !important;
  border-left:3px solid var(--green) !important;
  max-width:38ch !important;
}

/* ===== THE STEPS =====
   A numbered list down a rail. min-width:0 so a long word never pushes the
   page sideways at 320px. */
#clearcfu .ccfu-steps { margin:44px 0 0 !important; padding:0 !important; }
#clearcfu .ccfu-step {
  display:grid !important;
  grid-template-columns:64px minmax(0,1fr) minmax(0,.8fr) !important;
  gap:0 32px !important;
  padding:34px 0 !important;
  margin:0 !important;
  border-top:1px solid var(--line) !important;
  min-width:0 !important;
}
#clearcfu .ccfu-step:last-child { border-bottom:1px solid var(--line) !important; }
#clearcfu .ccfu-n {
  font-size:15px !important; font-weight:600 !important;
  letter-spacing:.08em !important;
  color:var(--green) !important;
  margin:4px 0 0 !important;
}
#clearcfu .ccfu-step h3 { margin:0 0 10px !important; }
#clearcfu .ccfu-step .ccfu-body p {
  font-size:17px !important; line-height:1.65 !important;
  color:var(--body) !important;
  margin:0 !important;
}
#clearcfu .ccfu-vs {
  margin:0 !important;
  padding:16px 18px !important;
  background-color:var(--paper-2) !important;
  border-radius:var(--radius) !important;
  align-self:start !important;
}
#clearcfu .ccfu-vs span {
  display:block !important;
  font-size:11.5px !important; font-weight:600 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  color:var(--muted) !important;
  margin:0 0 6px !important;
}
#clearcfu .ccfu-vs p {
  font-size:15.5px !important; line-height:1.55 !important;
  color:var(--muted) !important;
  margin:0 !important;
}

/* ===== THE HUNDRED =====
   The one number the text already promised, answered with process. No
   warranty, refund or second guarantee beside it. */
#clearcfu .ccfu-links { margin:36px 0 0 !important; padding:0 !important; }
#clearcfu .ccfu-links li {
  display:grid !important;
  grid-template-columns:24px minmax(0,1fr) !important;
  gap:14px !important;
  padding:16px 0 !important;
  margin:0 !important;
  border-top:1px solid var(--line-2) !important;
  font-size:17px !important; line-height:1.6 !important;
  color:var(--body) !important;
  max-width:62ch !important;
}
#clearcfu .ccfu-links li:last-child { border-bottom:1px solid var(--line-2) !important; }
#clearcfu .ccfu-links b { color:var(--head) !important; font-weight:600 !important; }
#clearcfu .ccfu-links svg { margin:4px 0 0 !important; color:var(--green) !important; }
#clearcfu .ccfu-sign {
  margin:32px 0 0 !important;
  font-size:16px !important; font-weight:600 !important;
  color:var(--head) !important;
}
#clearcfu .ccfu-sign em {
  display:block !important;
  font-style:normal !important; font-weight:400 !important;
  font-size:14.5px !important; color:var(--muted) !important;
}

/* ===== WHAT TO EXPECT =====
   The page ends here. Nothing is asked for. */
#clearcfu .ccfu-expect {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:16px !important;
  margin:40px 0 0 !important; padding:0 !important;
}
#clearcfu .ccfu-expect > div {
  padding:26px 26px 28px !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius) !important;
  background-color:var(--paper) !important;
  min-width:0 !important;
}
#clearcfu .ccfu-expect dt {
  font-size:16px !important; font-weight:600 !important;
  color:var(--head) !important;
  margin:0 0 8px !important;
}
#clearcfu .ccfu-expect dd {
  font-size:16.5px !important; line-height:1.6 !important;
  color:var(--body) !important;
  margin:0 !important;
}
#clearcfu .ccfu-close {
  font-size:18px !important; line-height:1.65 !important;
  color:var(--head) !important;
  max-width:56ch !important;
  margin:36px 0 0 !important;
}

/* ===== FOOT ===== */
#clearcfu .ccfu-foot { background-color:var(--band) !important; padding:32px 0 !important; }
#clearcfu .ccfu-foot-in {
  display:flex !important; align-items:center !important; gap:18px !important;
  flex-wrap:wrap !important;
}
#clearcfu .ccfu-foot .ccfu-logo { height:40px !important; }
#clearcfu .ccfu-foot p { font-size:14px !important; color:var(--on-band) !important; margin:0 !important; }

#clearcfu .ccfu-in { animation:ccfuIn .36s cubic-bezier(.22,1,.36,1) both; }
@keyframes ccfuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE =====
   Written @media (...) { #clearcfu .x {...} }. The inverse is dead CSS. */
@media (max-width: 860px) {
  #clearcfu .ccfu-sec { padding:68px 0 !important; }
  #clearcfu .ccfu-step { grid-template-columns:48px minmax(0,1fr) !important; gap:0 20px !important; }
  #clearcfu .ccfu-vs { grid-column:2 !important; margin:18px 0 0 !important; }
}
@media (max-width: 600px) {
  #clearcfu { font-size:16.5px !important; }
  #clearcfu .ccfu-wrap { padding:0 16px !important; }
  #clearcfu .ccfu-sec { padding:56px 0 !important; }
  #clearcfu .ccfu-top-in { height:68px !important; }
  #clearcfu .ccfu-logo { height:42px !important; }
  #clearcfu .ccfu-hero { padding:40px 0 52px !important; }
  #clearcfu .ccfu-hero h1 { max-width:100% !important; }
  #clearcfu .ccfu-lede { font-size:17.5px !important; margin-top:18px !important; }
  #clearcfu .ccfu-plate { margin-top:36px !important; }
  #clearcfu .ccfu-prose p { font-size:17px !important; }
  #clearcfu .ccfu-step { grid-template-columns:minmax(0,1fr) !important; padding:28px 0 !important; }
  #clearcfu .ccfu-n { margin:0 0 8px !important; }
  #clearcfu .ccfu-vs { grid-column:1 !important; }
  #clearcfu .ccfu-expect { grid-template-columns:minmax(0,1fr) !important; gap:12px !important; }
  #clearcfu .ccfu-expect > div { padding:22px 20px !important; }
}
@media (max-width: 360px) {
  #clearcfu .ccfu-wrap { padding:0 14px !important; }
  #clearcfu .ccfu-prose p.ccfu-lift { padding-left:14px !important; }
  #clearcfu .ccfu-expect > div { padding:20px 16px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #clearcfu .ccfu-in { animation:none !important; }
}
`;

  var TICK =
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function logo(alt) {
    return '<img class="ccfu-logo" src="' + esc(CONFIG.logo) + '" alt="' + esc(alt) + '">';
  }

  function step(s) {
    return (
      '<li class="ccfu-step">' +
        '<p class="ccfu-n">' + esc(s.n) + "</p>" +
        '<div class="ccfu-body">' +
          "<h3>" + esc(s.name) + "</h3>" +
          "<p>" + esc(s.body) + "</p>" +
        "</div>" +
        '<div class="ccfu-vs">' +
          "<span>The usual way</span>" +
          "<p>" + esc(s.usual) + "</p>" +
        "</div>" +
      "</li>"
    );
  }

  function expect() {
    var out = "";
    for (var i = 0; i < CONFIG.expect.length; i++) {
      out += "<div><dt>" + esc(CONFIG.expect[i].k) + "</dt><dd>" + esc(CONFIG.expect[i].v) + "</dd></div>";
    }
    return '<dl class="ccfu-expect">' + out + "</dl>";
  }

  function view() {
    var steps = "";
    for (var i = 0; i < CONFIG.steps.length; i++) steps += step(CONFIG.steps[i]);

    return (
      '<div class="ccfu-top">' +
        '<div class="ccfu-wrap ccfu-top-in">' + logo(CONFIG.name) + "</div>" +
      "</div>" +
      '<div class="ccfu-stripe" aria-hidden="true"></div>' +

      // The first screen. The text promised how the process works and what
      // makes every job come out right, so it opens on exactly that.
      '<section class="ccfu-hero ccfu-in">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">How we work</p>' +
          "<h1>A good window can still be a bad job.</h1>" +
          '<p class="ccfu-lede">Most of what goes wrong with new windows has nothing to do with the window. It goes wrong in the price you were given and in the day it went in. So those are the two places we put the care. Here is how a job runs with us, start to finish.</p>' +
          '<div class="ccfu-plate">' +
            "<strong>" + esc(CONFIG.method) + "</strong>" +
            "<span>Four steps, from the price to the last window.</span>" +
          "</div>" +
        "</div>" +
      "</section>" +

      // The diagnosis lands before the method, because the method is only
      // worth something once you know what it is defending against.
      '<section class="ccfu-sec ccfu-tint">' +
        '<div class="ccfu-wrap ccfu-prose">' +
          '<p class="ccfu-eyebrow">Where it goes wrong</p>' +
          "<h2>Drafts, sticking sashes, water stains. They are almost always install problems.</h2>" +
          "<p>A window sits in a hole in your wall. If that hole is out of square, or the wood around it has gone soft, or the gap gets stuffed with foam and covered over with trim, it does not matter what you paid for the glass. Air gets round it, water gets behind it, and a year later the sash starts to bind.</p>" +
          '<p class="ccfu-lift">The window is the easy part. How it goes in is where the job is won or lost.</p>' +
          "<p>The other place it goes wrong is before anyone picks up a tool. A price you cannot read, a discount that only lasts until tonight, extras that turn up on the invoice. We do not work like that. You should know what you are getting and what it costs before you agree to anything.</p>" +
        "</div>" +
      "</section>" +

      '<section class="ccfu-sec">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">' + esc(CONFIG.method) + "</p>" +
          "<h2>Four steps, every job, in this order.</h2>" +
          '<ol class="ccfu-steps">' + steps + "</ol>" +
        "</div>" +
      "</section>" +

      // The 100% the text promised, answered with process. No warranty, no
      // refund policy and no second guarantee is allowed next to this.
      '<section class="ccfu-sec ccfu-tint">' +
        '<div class="ccfu-wrap ccfu-prose">' +
          '<p class="ccfu-eyebrow">About that 100 percent</p>' +
          "<h2>It is not a slogan. It is built into the order we do things in.</h2>" +
          "<p>People are unhappy with a window job for a handful of reasons, and every one of them is something we deal with on purpose.</p>" +
          '<ul class="ccfu-links">' +
            "<li>" + TICK + "<span><b>A surprise on the bill.</b> The price is written down line by line before you agree, so there is nothing to find later.</span></li>" +
            "<li>" + TICK + "<span><b>A window that does not fit.</b> Every opening is measured on its own, and the window is ordered for that opening.</span></li>" +
            "<li>" + TICK + "<span><b>A problem hidden behind new trim.</b> We look at what is behind the old window and fix it before the new one goes in.</span></li>" +
            "<li>" + TICK + "<span><b>Being left with something you are not happy about.</b> We walk every window with you before we leave, and the job is not finished until you say so.</span></li>" +
          "</ul>" +
          '<p class="ccfu-sign">Bill<em>Clear Choice Windows</em></p>' +
        "</div>" +
      "</section>" +

      // The end of the page. They already have the appointment, so this asks
      // for nothing: no calendar, no form, no button, no phone number.
      '<section class="ccfu-sec">' +
        '<div class="ccfu-wrap">' +
          '<p class="ccfu-eyebrow">Your estimate</p>' +
          "<h2>What happens when we come out.</h2>" +
          expect() +
          '<p class="ccfu-close">No pressure and no price that disappears at midnight. If the windows you have are fine for a few more years, I will tell you that too.</p>' +
        "</div>" +
      "</section>" +

      '<div class="ccfu-foot">' +
        '<div class="ccfu-wrap ccfu-foot-in">' +
          logo("") +
          "<p>Clear Choice Windows. Replacement windows and doors, Owensboro and the surrounding area.</p>" +
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
    if (!document.querySelector("style[data-ccfu-our-process]")) {
      var style = document.createElement("style");
      style.setAttribute("data-ccfu-our-process", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    flattenWrappers(root);
    root.innerHTML = view();
  }

  // The stub puts the div above the script tag, so the mount is normally there
  // already. The retries cover a builder that defers the block. Without the
  // mount the file does nothing at all: no styles, no listeners, no markup.
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
