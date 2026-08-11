// MADE BETTER LC follow-up asset 2 of 3: UNIQUE MECHANISM.
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
//   Seamus's differentiator is not the brick. It is the base underneath it, so
//   the page names that base as a method and walks it step by step. Every claim
//   on the page is about SEQUENCE and TECHNIQUE, which cannot be wrong. There
//   is no statistic, no certification, no award, no review count and no
//   warranty anywhere on it. The one number is the 100% the text already
//   promised, and the page speaks to it by showing what in the process makes it
//   true, not by adding a second guarantee beside it.
//
// GoHighLevel holds a two-line stub:
//   <div id="madebefu"></div>
//   <script src="https://app.hauckmarketing.com/sites/made-better-landscaping-co/fu/our-process.js"></script>
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
//      background-image and outranks an inline poster. Surfaces use
//      background-color longhand and the logo is an img element.
//   6. No 100vw breakout. It counts the scrollbar and the measurement is
//      circular. Width 100% plus wrapper flattening instead.
//   7. min-height:100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar
//      slides away, and the first screen visibly resizing looks broken.
//   8. This page shares the id and the mount with recent-work.js but never the
//      same GHL page, so the style tag carries its own data attribute.

(function () {
  "use strict";

  var ROOT_ID = "madebefu";

  var CONFIG = {
    logo:
      "https://aroapsjifblscheshmst.supabase.co/storage/v1/object/public/followup-assets/5aa6666d-6d76-49f1-a3e1-06b0dcdedaed/logo/81fcba12-9bb6-4571-b150-98992018f1e1.jpg",

    // The method. Named so it belongs to a paving crew in Michigan and not to
    // an agency: the enemy is in the name and so is the differentiator.
    method: "The Michigan Base Method",

    // Four steps. Each one is a sentence about what we do, then one line about
    // what the usual way gets wrong, because the contrast is the argument. The
    // specificity IS the proof, so none of it gets dumbed down.
    steps: [
      {
        n: "01",
        name: "The Full Dig",
        body:
          "We dig out to full depth, not the three or four inches that gets you level fastest. That depth is not wasted space. It is the room a real base has to sit in. Skip it and there is nowhere for the stone to go, so the soil ends up doing a job soil was never able to do.",
        usual: "Dig just deep enough to make the brick sit flat on day one."
      },
      {
        n: "02",
        name: "The Separation Layer",
        body:
          "Geotextile fabric goes down between the soil and the stone. Michigan clay is soft and it is hungry, and with nothing in the way the base stone slowly presses down into it and disappears. The fabric keeps the two apart, so the base you paid for is still a base in ten years.",
        usual: "Stone straight onto dirt. The fabric is cheap, the extra step is not."
      },
      {
        n: "03",
        name: "Lifts, Not Loads",
        body:
          "We build the base up in thin layers and compact each one before the next goes on. One big load in and a single pass over the top looks identical when it is finished, and it is not the same thing. The middle never gets compacted. That soft pocket is what turns up two winters later as a dip.",
        usual: "One load in, one pass over the top, on to the next job."
      },
      {
        n: "04",
        name: "Pitch And Lock",
        body:
          "The surface gets pitched away from the house so meltwater runs off instead of sitting underneath it. Edge restraint is spiked in around the whole perimeter so the outside course cannot spread and open gaps. Then polymeric sand goes into the joints and sets, so weeds stay down and the sand does not wash out in the first heavy rain.",
        usual: "Level it dead flat, sand it, leave. Flat looks right and drains nowhere."
      }
    ],

    // Given facts only. No review count, no years of experience, no warranty.
    trust: ["Licensed", "Insured", "Owner on site", "Residential only", "Metro Detroit"],

    // The page ends here. What happens, how long, what to have ready.
    expect: [
      {
        k: "Who turns up",
        v:
          "Me. I do my own estimates, so the person putting the price together is the person who will be building it."
      },
      {
        k: "How long it takes",
        v:
          "Thirty to forty five minutes. Longer if you want it. I would rather answer everything there than over text."
      },
      {
        k: "What we do",
        v:
          "Walk the space, measure it, and look at what is under it now and where the water goes when it rains. Then I go through the price with you line by line."
      },
      {
        k: "What to have ready",
        v:
          "A rough idea of the area you want done, and anyone else who is part of the decision. A photo of the yard after heavy rain is genuinely useful if you have one."
      }
    ]
  };

  // NOTE: template literal. No backticks below this line until the closing one.
  var STYLES = `
/* @import rather than a link element: the GHL builder strips link tags out of
   custom code blocks, which silently drops the fonts on the pasted page. Same
   two faces as recent-work.js and madebetterlc.com, so all three read as one
   company even though this page is dark and the others are not. */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');

/* ===== GHL WRAPPER FLATTENING =====
   Strip padding and width caps off every builder level. Done here for the
   levels GHL names, and again in JS for the ones it does not. Without this the
   dark ground stops short of the edges and the page looks like a card sitting
   on the theme's white rather than a page. */
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
body { margin:0 !important; padding:0 !important; background-color:#0C0805 !important; }

#madebefu *, #madebefu *::before, #madebefu *::after { box-sizing:border-box !important; }

#madebefu {
  /* Sampled from the logo mark: the brown brick, the gold brick and the leaf.
     Dark ground because the whole argument is about what is under the surface.
     Gold is the only accent and it clears 5.9:1 on this ground, so unlike the
     light page it can be used as text as well as a fill. */
  --ink:#0C0805;
  --ink-2:#150E09;
  --surface:#1A120C;
  --surface-2:#221810;
  --gold:#C38D33;
  --gold-2:#DDA850;
  --line:#31241A;
  --line-2:#3E2E20;
  --head:#F6F1E8;
  --body:#C8BCAC;
  --muted:#9A8D7C;
  --display:'Plus Jakarta Sans','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --text:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --radius:10px;
  --radius-lg:16px;

  display:block !important;
  width:100% !important; max-width:100% !important;
  margin:0 !important; padding:0 !important;
  position:relative !important;
  overflow-x:hidden !important;
  background-color:var(--ink) !important;
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
#madebefu ul, #madebefu ol, #madebefu li, #madebefu dl, #madebefu dt, #madebefu dd,
#madebefu figure, #madebefu figcaption, #madebefu blockquote {
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
  /* 16px floor or iOS Safari zooms on focus and never zooms back out. There is
     no input on this page, and the rule stays so that adding one cannot
     reintroduce the bug. */
  font-size:16px !important;
}

/* ===== TYPE ===== */
#madebefu h1, #madebefu h2, #madebefu h3 {
  font-family:var(--display) !important;
  color:var(--head) !important;
  font-weight:800 !important;
  letter-spacing:-.02em !important;
  line-height:1.12 !important;
  text-transform:none !important;
}
#madebefu h1 { font-size:clamp(31px,5.6vw,54px) !important; }
#madebefu h2 { font-size:clamp(25px,4vw,38px) !important; }
#madebefu h3 { font-size:20px !important; font-weight:700 !important; letter-spacing:-.015em !important; line-height:1.25 !important; }

#madebefu .mbfu-eyebrow {
  font-family:var(--display) !important;
  font-size:12.5px !important; font-weight:700 !important;
  letter-spacing:.16em !important; text-transform:uppercase !important;
  color:var(--gold) !important;
  margin:0 0 14px !important;
}

/* ===== LAYOUT ===== */
#madebefu .mbfu-wrap {
  width:100% !important; max-width:1000px !important;
  margin:0 auto !important;
  padding:0 20px !important;
}
#madebefu .mbfu-sec { padding:80px 0 !important; }
#madebefu .mbfu-rule { border-top:1px solid var(--line) !important; }

/* ===== TOP BAR =====
   The mark, small. They already know who this is, so it identifies the page
   rather than introducing the company. The asset is a jpg with a white ground,
   so the chip behind it is white too and the crop reads as deliberate. */
#madebefu .mbfu-top {
  border-bottom:1px solid var(--line) !important;
  background-color:var(--ink) !important;
}
#madebefu .mbfu-top-in {
  display:flex !important; align-items:center !important; gap:12px !important;
  height:72px !important;
}
#madebefu .mbfu-mark {
  width:44px !important; height:44px !important; flex:none !important;
  border-radius:50% !important; object-fit:cover !important;
  background-color:#FFFFFF !important;
  border:1px solid var(--line-2) !important;
}
#madebefu .mbfu-name {
  font-family:var(--display) !important;
  font-size:16px !important; font-weight:800 !important; letter-spacing:-.02em !important;
  color:var(--head) !important;
}

/* ===== FIRST SCREEN =====
   min-height on 100vh, never 100dvh: the ground must not resize under them as
   the Safari toolbar slides away. It is a floor, so a tall phone gets the
   headline and the method plate in one screen and a short one simply scrolls. */
#madebefu .mbfu-hero {
  min-height:100vh !important;
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  padding:56px 0 64px !important;
  background-color:var(--ink) !important;
  position:relative !important;
  overflow:hidden !important;
}
/* A single soft pool of warm light behind the headline. It is a radial gradient
   on a positioned layer rather than a background shorthand, so nothing here can
   outrank an image anywhere else on the page. */
#madebefu .mbfu-glow {
  position:absolute !important;
  top:-22% !important; left:50% !important;
  width:min(1100px, 150%) !important; height:760px !important;
  transform:translateX(-50%) !important;
  background-image:radial-gradient(ellipse at 50% 40%, rgba(195,141,51,.16), rgba(195,141,51,0) 62%) !important;
  pointer-events:none !important;
  z-index:0 !important;
}
#madebefu .mbfu-hero > .mbfu-wrap { position:relative !important; z-index:1 !important; }
#madebefu .mbfu-hero h1 { max-width:17ch !important; }
#madebefu .mbfu-lede {
  font-size:18px !important; color:var(--body) !important;
  max-width:54ch !important;
  margin:20px 0 0 !important;
}

/* The method plate. It is the one place the method is named as a name, so it
   gets a rule above it and nothing else competes for the eye down there. */
#madebefu .mbfu-plate {
  margin:44px 0 0 !important;
  padding:22px 0 0 !important;
  border-top:1px solid var(--line-2) !important;
  display:flex !important; align-items:baseline !important;
  flex-wrap:wrap !important; gap:6px 16px !important;
}
#madebefu .mbfu-plate strong {
  font-family:var(--display) !important;
  font-size:clamp(19px,2.6vw,24px) !important; font-weight:800 !important;
  letter-spacing:-.02em !important;
  color:var(--gold) !important;
}
#madebefu .mbfu-plate span {
  font-size:15.5px !important; color:var(--muted) !important;
}

/* ===== THE FAILURE =====
   Slightly lifted ground so the diagnosis reads as its own chapter. Measure is
   held short on purpose: this is the part that has to be read, not scanned. */
#madebefu .mbfu-why { background-color:var(--ink-2) !important; }
#madebefu .mbfu-prose p {
  font-size:18px !important; line-height:1.68 !important;
  max-width:60ch !important;
  margin:22px 0 0 !important;
  color:var(--body) !important;
}
#madebefu .mbfu-prose p.mbfu-lift {
  color:var(--head) !important;
  font-family:var(--display) !important;
  font-size:clamp(20px,2.6vw,25px) !important;
  font-weight:700 !important; letter-spacing:-.02em !important; line-height:1.35 !important;
  margin:30px 0 0 !important;
  padding:0 0 0 20px !important;
  border-left:3px solid var(--gold) !important;
  max-width:38ch !important;
}

/* ===== THE STEPS =====
   Two up on a desk, one up on a phone. min-width:0 on the cards because a long
   unbroken word in a grid child is the usual cause of a page that scrolls
   sideways at 320px. */
#madebefu .mbfu-steps {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:18px !important;
  margin:40px 0 0 !important; padding:0 !important;
}
#madebefu .mbfu-step {
  background-color:var(--surface) !important;
  border:1px solid var(--line) !important;
  border-radius:var(--radius-lg) !important;
  padding:30px 28px !important;
  margin:0 !important;
  min-width:0 !important;
  display:flex !important; flex-direction:column !important;
}
#madebefu .mbfu-n {
  font-family:var(--display) !important;
  font-size:13px !important; font-weight:800 !important;
  letter-spacing:.14em !important;
  color:var(--gold) !important;
  margin:0 0 12px !important;
}
#madebefu .mbfu-step h3 { margin:0 0 12px !important; }
#madebefu .mbfu-step p {
  font-size:16.5px !important; line-height:1.62 !important;
  color:var(--body) !important;
  margin:0 !important;
}
/* The contrast line. Muted and set apart, because it is the setup and the
   paragraph above it is the payoff.
   margin-top:auto pins it to the bottom of the card, so the rules line up
   across a row even though the four paragraphs above them are different
   lengths. The padding is what keeps a minimum gap once auto has eaten the
   margin. On one column it does nothing, which is correct. */
#madebefu .mbfu-vs {
  margin:0 !important;
  margin-top:auto !important;
  padding:20px 0 0 !important;
  border-top:1px solid var(--line) !important;
}
#madebefu .mbfu-vs span {
  display:block !important;
  font-family:var(--display) !important;
  font-size:11.5px !important; font-weight:700 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  color:var(--muted) !important;
  margin:0 0 6px !important;
}
#madebefu .mbfu-vs p {
  font-size:15.5px !important; line-height:1.55 !important;
  color:var(--muted) !important;
  margin:0 !important;
}

/* ===== THE HUNDRED =====
   The one number the text already promised. It is answered with process, and
   there is deliberately no warranty, refund or second guarantee beside it. */
#madebefu .mbfu-hundred { background-color:var(--ink-2) !important; }
#madebefu .mbfu-sign {
  display:flex !important; align-items:center !important; gap:12px !important;
  margin:36px 0 0 !important;
  padding:20px 0 0 !important;
  border-top:1px solid var(--line) !important;
}
#madebefu .mbfu-sign p {
  font-family:var(--display) !important;
  font-size:15px !important; font-weight:700 !important; letter-spacing:-.01em !important;
  color:var(--head) !important;
  margin:0 !important; max-width:none !important;
}
#madebefu .mbfu-sign p em {
  display:block !important;
  font-style:normal !important; font-weight:500 !important;
  font-family:var(--text) !important;
  font-size:14px !important; color:var(--muted) !important;
}

/* ===== TRUST ===== */
#madebefu .mbfu-trust {
  display:flex !important; flex-wrap:wrap !important; gap:10px !important;
  margin:34px 0 0 !important; padding:0 !important;
}
#madebefu .mbfu-trust li {
  display:inline-flex !important; align-items:center !important; gap:8px !important;
  font-size:14px !important; font-weight:600 !important;
  color:var(--head) !important;
  background-color:var(--surface) !important;
  border:1px solid var(--line-2) !important;
  border-radius:999px !important;
  padding:8px 14px !important; margin:0 !important;
}
#madebefu .mbfu-trust svg { flex:0 0 14px !important; color:var(--gold) !important; }

/* ===== WHAT TO EXPECT =====
   The page ends here. Nothing is asked for: they are already booked, so the
   last thing they read is what the appointment will actually be like. */
#madebefu .mbfu-expect {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:0 !important;
  margin:40px 0 0 !important; padding:0 !important;
  border-top:1px solid var(--line) !important;
}
#madebefu .mbfu-expect > div {
  padding:26px 26px 26px 0 !important;
  border-bottom:1px solid var(--line) !important;
  min-width:0 !important;
}
#madebefu .mbfu-expect > div:nth-child(2n) { padding-left:26px !important; border-left:1px solid var(--line) !important; }
#madebefu .mbfu-expect dt {
  font-family:var(--display) !important;
  font-size:12.5px !important; font-weight:700 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  color:var(--gold) !important;
  margin:0 0 10px !important;
}
#madebefu .mbfu-expect dd {
  font-size:16.5px !important; line-height:1.6 !important;
  color:var(--body) !important;
  margin:0 !important;
}
#madebefu .mbfu-close {
  font-size:17px !important; line-height:1.65 !important;
  color:var(--head) !important;
  max-width:56ch !important;
  margin:32px 0 0 !important;
}

/* ===== FOOT ===== */
#madebefu .mbfu-foot {
  border-top:1px solid var(--line) !important;
  background-color:var(--ink) !important;
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

#madebefu .mbfu-in { animation:mbfuIn .34s cubic-bezier(.22,1,.36,1) both; }
@keyframes mbfuIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

/* ===== RESPONSIVE =====
   Written @media (...) { #madebefu .x {...} }. The inverse nesting is dead CSS
   that fails without an error. */
@media (max-width: 860px) {
  #madebefu .mbfu-sec { padding:64px 0 !important; }
  #madebefu .mbfu-steps { grid-template-columns:minmax(0,1fr) !important; }
}
@media (max-width: 600px) {
  #madebefu { font-size:16.5px !important; }
  #madebefu .mbfu-wrap { padding:0 16px !important; }
  #madebefu .mbfu-sec { padding:54px 0 !important; }
  #madebefu .mbfu-hero { padding:36px 0 48px !important; }
  #madebefu .mbfu-hero h1 { max-width:100% !important; }
  #madebefu .mbfu-lede { font-size:17px !important; margin-top:16px !important; }
  #madebefu .mbfu-plate { margin-top:34px !important; }
  #madebefu .mbfu-prose p { font-size:17px !important; }
  #madebefu .mbfu-step { padding:26px 22px !important; }
  /* One column, and the vertical rule between the pairs goes with it or it
     draws down the middle of nothing. */
  #madebefu .mbfu-expect { grid-template-columns:minmax(0,1fr) !important; }
  #madebefu .mbfu-expect > div { padding:22px 0 !important; }
  #madebefu .mbfu-expect > div:nth-child(2n) { padding-left:0 !important; border-left:0 !important; }
}
/* A 320px phone. Give the padding back to the words rather than the edges. */
@media (max-width: 360px) {
  #madebefu .mbfu-wrap { padding:0 13px !important; }
  #madebefu .mbfu-step { padding:22px 18px !important; }
  #madebefu .mbfu-prose p.mbfu-lift { padding-left:14px !important; }
}
@media (prefers-reduced-motion: reduce) {
  #madebefu .mbfu-in { animation:none !important; }
}
`;

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

  function step(s) {
    return (
      '<li class="mbfu-step">' +
        '<p class="mbfu-n">' + esc(s.n) + "</p>" +
        "<h3>" + esc(s.name) + "</h3>" +
        "<p>" + esc(s.body) + "</p>" +
        '<div class="mbfu-vs">' +
          "<span>The usual way</span>" +
          "<p>" + esc(s.usual) + "</p>" +
        "</div>" +
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

  function expect() {
    var out = "";
    for (var i = 0; i < CONFIG.expect.length; i++) {
      out +=
        "<div><dt>" + esc(CONFIG.expect[i].k) + "</dt><dd>" + esc(CONFIG.expect[i].v) + "</dd></div>";
    }
    return '<dl class="mbfu-expect">' + out + "</dl>";
  }

  function view() {
    var steps = "";
    for (var i = 0; i < CONFIG.steps.length; i++) steps += step(CONFIG.steps[i]);

    return (
      '<div class="mbfu-top">' +
        '<div class="mbfu-wrap mbfu-top-in">' +
          '<img class="mbfu-mark" src="' + esc(CONFIG.logo) + '" width="44" height="44" alt="Made Better Landscaping Co">' +
          '<span class="mbfu-name">Made Better Landscaping Co</span>' +
        "</div>" +
      "</div>" +

      // The first screen. The text promised how the process actually works, so
      // the page opens on the mechanism itself. No introduction in front of it,
      // no restating of the message, and nothing asked for.
      '<section class="mbfu-hero mbfu-in">' +
        '<div class="mbfu-glow" aria-hidden="true"></div>' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">How we build</p>' +
          "<h1>Brick does not sink. The ground under it does.</h1>" +
          '<p class="mbfu-lede">That is why so many patios around here crack, dip and lift by spring. Most of our work happens before a single brick goes down, and it is the part nobody ever shows you. So here it is.</p>' +
          '<div class="mbfu-plate">' +
            "<strong>" + esc(CONFIG.method) + "</strong>" +
            "<span>Four steps. You only ever see the last one.</span>" +
          "</div>" +
        "</div>" +
      "</section>" +

      // The diagnosis. It has to land before the method, because the method is
      // only impressive if you know what it is defending against.
      '<section class="mbfu-sec mbfu-why">' +
        '<div class="mbfu-wrap mbfu-prose">' +
          '<p class="mbfu-eyebrow">Why they fail</p>' +
          "<h2>Every sunken patio I get called out to failed the same way.</h2>" +
          "<p>Water gets into the ground under the stone. In November it is water. In January it is ice, and ice takes up more room than water did, so it lifts everything sitting on top of it. Then it thaws and sets it back down, not quite where it started. Do that a few dozen times over one winter and you get the lip by the back door, the dip that holds a puddle, the crack running through the middle.</p>" +
          '<p class="mbfu-lift">The brick is almost always fine. What moved was the ground.</p>' +
          "<p>So a patio in Michigan is really a drainage problem with stone on top of it. Most crews spend their time on the part you can see and rush the part you cannot, because the part you cannot see is the part nobody checks. We do it the other way round. Most of the job, most of the material and most of the hours go in below the surface, so the surface stays flat.</p>" +
        "</div>" +
      "</section>" +

      '<section class="mbfu-sec">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">' + esc(CONFIG.method) + "</p>" +
          "<h2>What actually happens under your patio.</h2>" +
          '<ul class="mbfu-steps">' + steps + "</ul>" +
        "</div>" +
      "</section>" +

      // The 100% the text message promised, answered with process. No warranty,
      // no refund policy and no second guarantee is allowed next to this.
      '<section class="mbfu-sec mbfu-hundred">' +
        '<div class="mbfu-wrap mbfu-prose">' +
          '<p class="mbfu-eyebrow">About that 100 percent</p>' +
          "<h2>It is not a policy. It is the order we do things in.</h2>" +
          "<p>Almost nothing that makes somebody unhappy with a patio happens on the day it gets built. It happens the following spring, and by then it is buried under four hundred bricks and there is nothing anybody can do about it that does not involve pulling the whole thing up. That is why the money and the hours go down at the bottom of the hole where nobody is watching. Whether you are happy with this in three years is decided down there, before the first brick is even on site.</p>" +
          "<p>The other half is simpler. I am on the job myself, not a salesman who takes the deposit and hands you to a crew you have never met. If something is not sitting right you say it to the person who is going to fix it, that day, while the tools are still out.</p>" +
          "<p>And nothing gets packed up until you have walked the finished job with me and told me you are happy with it.</p>" +
          '<div class="mbfu-sign">' +
            '<img class="mbfu-mark" src="' + esc(CONFIG.logo) + '" width="44" height="44" alt="">' +
            "<p>Seamus<em>Owner, Made Better Landscaping Co</em></p>" +
          "</div>" +
          trust() +
        "</div>" +
      "</section>" +

      // The end of the page. They already have the appointment, so this asks
      // for nothing: no calendar, no form, no button, no phone number.
      '<section class="mbfu-sec mbfu-rule">' +
        '<div class="mbfu-wrap">' +
          '<p class="mbfu-eyebrow">Your estimate</p>' +
          "<h2>What happens when I come out.</h2>" +
          expect() +
          '<p class="mbfu-close">No pressure, and no price that only stands until midnight. The estimate is free, the number I give you is the number, and you can sit on it for as long as you want.</p>' +
        "</div>" +
      "</section>" +

      '<div class="mbfu-foot">' +
        '<div class="mbfu-wrap mbfu-foot-in">' +
          '<img class="mbfu-mark" src="' + esc(CONFIG.logo) + '" width="44" height="44" alt="">' +
          "<p>Made Better Landscaping Co. Residential brick paving and hardscaping, Metro Detroit.</p>" +
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
    if (!document.querySelector("style[data-mbfu-our-process]")) {
      var style = document.createElement("style");
      style.setAttribute("data-mbfu-our-process", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    flattenWrappers(root);
    root.innerHTML = view();
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
