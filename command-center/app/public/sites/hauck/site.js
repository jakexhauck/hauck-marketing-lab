// HAUCK MARKETING: the whole website, served rather than pasted.
//
// GoHighLevel holds a two-line stub per page (see the stubs in
// "Hauck Marketing Website/ghl/"). Everything the site IS lives here, so a copy
// change, a stat, a phone number or a colour ships by deploy and nobody reopens
// the GHL builder.
//
// THIS FILE IS THE SOURCE. There is no second copy of the site anywhere.
//
// It ships from public/, so Cloudflare serves it unhashed at a stable URL and
// the stubs in GHL never change again. A bundled file would get a content hash
// that changes every deploy and would break all six stubs at once.
//
// WHICH PAGE IT DRAWS is read from the mount div:
//   <div id="hm" data-page="traffic"></div>
// An unknown or missing data-page falls back to "home".
//
// One classic script rather than an ES module on purpose: a cross-origin module
// script requires CORS headers on the response, a classic script does not. The
// site is served from app.hauckmarketing.com and rendered on the GHL domain, so
// it is always cross-origin.
//
// THE MECHANISM: the Contractor Growth Engine. Traffic, Conversion, Reporting.
// Three parts, one loop. Reporting feeds back into Traffic, and that loop is
// the argument the whole site makes.
//
// HOUSE RULES BAKED IN HERE
//  - No em dashes anywhere in any copy on this site.
//  - No numbers on the Reporting page. It sells the mechanism, not results.
//  - Every statistic on the Conversion page is sourced and survives a Google.

(function () {
  "use strict";

  // Read at top level, while the browser still knows which script is running.
  // The site is served from the Command Center but rendered on the GHL domain,
  // so anything resolved relative to the page would look in the wrong place.
  var self = document.currentScript;
  var origin = "https://app.hauckmarketing.com";
  try {
    if (self && self.src) origin = new URL(self.src).origin;
  } catch (e) {}

  // =========================================================================
  // CONFIG: the things most likely to change. Everything here is used on
  // every page that needs it, so each is edited exactly once.
  // =========================================================================
  var CONFIG = {
    phone: "734-301-0570",
    phoneHref: "tel:+17343010570",
    email: "contact.jakehauck@gmail.com",
    logo: origin + "/hauck-mark.png",

    // The GoHighLevel booking widget the Book page frames, and the script GHL
    // needs in order to size that iframe to its content.
    bookingWidget: "https://link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp",
    bookingEmbedJs: "https://link.hauckmarketing.com/js/form_embed.js",

    // The published GHL path of each page. If a slug in the funnel differs from
    // what is here, change it HERE and every link on all six pages follows.
    paths: {
      home: "/",
      traffic: "/traffic",
      conversion: "/conversion",
      reporting: "/reporting",
      founder: "/founder",
      book: "/book"
    }
  };

  var ROOT_ID = "hm";
  var DEFAULT_PAGE = "home";

  var P = CONFIG.paths;

  // =========================================================================
  // STYLES
  //
  // WARNING: this whole block is a JavaScript template literal. A backtick
  // anywhere inside it, INCLUDING INSIDE A CSS COMMENT, silently ends the
  // string and the file stops parsing. Use plain quotes only.
  //
  // Every rule is scoped to #hm because GHL's theme CSS reaches into custom
  // blocks. At-rules are written bare: "#hm @media(...)" is invalid and the
  // browser drops the entire block, which is how a site ends up with no
  // responsive behaviour at all and nobody notices for months.
  // =========================================================================
  var STYLES = `
/* @import rather than a <link> tag: GoHighLevel's builder strips <link> out of
   custom code blocks, so a linked font never loads on the published page. */
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

/* ============================================================================
   TOKENS: WARM DAYLIGHT. Cream paper, deep forest ink, amber as the one loud
   colour. This replaced a near-black "blueprint" direction because the site
   sells to contractors, and a dark technical console reads as software for
   somebody else's industry.

   THE RULE THAT KEEPS THIS READABLE. Amber and clay are FILLS. They carry
   near-black text on a button, a badge or a bar, and they never become text
   themselves: --amber as type on --bg measures 2.0:1 and is genuinely
   unreadable. Green text is --brand-txt (#1B7A4B), which clears 5.0:1 on the
   cream. The logo green #4DBB83 manages only 2.4:1 here, so it never appears
   as type on this site. It is still the brand green on dark surfaces.

   Token NAMES are unchanged from the dark version on purpose. Every rule and
   every page already refers to --brand, --muted, --line and the rest, so
   repointing the values repaints all six pages without orphaning a selector.
   ========================================================================= */
#hm {
  --bg:#FBF7F0;
  --band:#F5EEE1;
  --surface:#FFFFFF;
  --surface-2:#F5EEE1;
  --surface-3:#EFE5D3;

  --line:rgba(20,55,43,.13);
  --line-soft:rgba(20,55,43,.09);
  --line-2:rgba(20,55,43,.22);

  --text:#14372B;
  --muted:#4A5F55;
  --faint:#6E8177;

  /* green: a fill and a text colour, and they are not interchangeable */
  --brand:#1B7A4B;
  --brand-dk:#14603A;
  --brand-ink:#FFFFFF;
  --brand-txt:#1B7A4B;
  --brand-tint:rgba(27,122,75,.10);
  --brand-line:rgba(27,122,75,.28);

  /* amber and clay: FILLS ONLY, always with --on-fill text sitting on them */
  --amber:#F0A02B;
  --amber-tint:rgba(240,160,43,.16);
  --clay:#C24A26;
  --clay-fill:#E2603A;
  --clay-tint:rgba(226,96,58,.14);
  --on-fill:#221404;

  /* daylight is moulded, not drawn: soft corners and warm shadows */
  --r:16px;
  --r-sm:11px;
  --r-pill:999px;
  --shadow:0 1px 2px rgba(70,50,20,.05), 0 10px 28px -14px rgba(70,50,20,.28);
  --shadow-lift:0 2px 6px rgba(70,50,20,.07), 0 22px 44px -18px rgba(70,50,20,.34);

  --ease:cubic-bezier(.22,1,.36,1);
  --maxw:1200px;
}

/* ===== GHL FULL-BLEED OVERRIDES =====
   GHL wraps a custom block in its own padded, width-capped column. Left alone,
   a full-width site renders inside a narrow gutter. */
html, body{ background:#FBF7F0 !important; overflow-x:hidden !important; }
body{ margin:0 !important; padding:0 !important; }

.c-section, .c-wrapper, .c-row, .c-column, .c-element,
.hl_page-preview--content, .section-wrap, .row-wrap, .col-wrap,
.inner, .container, .fullSection, .fullRow {
  padding-left:0 !important; padding-right:0 !important;
  margin-left:0 !important; margin-right:0 !important;
  max-width:100% !important; width:100% !important;
  background-color:transparent !important;
}
.c-section > .inner, .c-row > .inner, .c-column > .inner {
  max-width:100% !important; padding:0 !important;
}

/* viewport breakout: forces edge to edge no matter what the row is set to */
#hm {
  width:100vw !important; max-width:100vw !important;
  position:relative; left:50%; right:50%;
  margin-left:-50vw !important; margin-right:-50vw !important;
}

#hm *, #hm *::before, #hm *::after{ box-sizing:border-box; }

#hm {
  background-color:var(--bg);
  color:var(--text);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:17px; line-height:1.65;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}

/* GHL's theme styles reach into custom blocks. Reset only what it touches. */
#hm button{ margin:0; text-transform:none; letter-spacing:normal; line-height:normal; font-family:inherit; }
#hm input, #hm select, #hm textarea{ margin:0; max-width:none; box-shadow:none; font-family:inherit; }
#hm label{ margin:0; display:block; text-transform:none; }
#hm ul, #hm ol, #hm li, #hm dl, #hm dd, #hm dt, #hm figure{ margin:0; }
#hm p{ margin:0; }
#hm img{ display:block; max-width:100%; }
#hm a{ color:inherit; text-decoration:none; }
#hm h1, #hm h2, #hm h3, #hm h4{ margin:0; font-family:'Poppins',system-ui,sans-serif; font-weight:600; letter-spacing:-.028em; line-height:1.1; }
#hm ::selection{ background:var(--amber-tint); color:var(--text); }

#hm a:focus-visible, #hm button:focus-visible, #hm summary:focus-visible{
  outline:2px solid var(--brand); outline-offset:3px; border-radius:6px;
}

/* ===== LAYOUT ===== */
#hm .wrap{ width:100%; max-width:var(--maxw); margin:0 auto; padding:0 24px; }
/* SECTION PADDING IS THE SITE'S WHOLE VERTICAL RHYTHM. These two numbers set
   the height of every gap on every page, so they are the only lever worth
   pulling when the site feels airy. They were 100 and 70. Tightened to 72 and
   52: at 100 a contractor on a laptop scrolls through most of a screen of
   cream between finishing one section and starting the next, and that gap
   reads as padding rather than as breathing room. */
#hm .sec{ position:relative; padding:72px 0; }
#hm .sec-tight{ padding:52px 0; }
/* The alternating band IS opaque here. On cream a translucent wash is invisible,
   so the rhythm between sections has to come from a real second paper tone. */
#hm .band{ background:var(--band); border-top:1px solid var(--line-soft); border-bottom:1px solid var(--line-soft); }

/* A soft amber sunrise behind a section. Absolute, not fixed: a fixed layer can
   be knocked out of place by a transform on a GHL ancestor. */
#hm .glow{ position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
#hm .glow::before{
  content:''; position:absolute; left:50%; top:-46%;
  width:min(1050px,130vw); height:min(700px,90vw); transform:translateX(-50%);
  background:radial-gradient(circle at center, rgba(240,160,43,.22), rgba(240,160,43,.07) 45%, transparent 70%);
  filter:blur(20px);
}
#hm .sec > .wrap, #hm .hero > .wrap{ position:relative; z-index:1; }

/* ===== TYPE ===== */
/* The section label is a warm chip. Its emoji is decorative only, so every one
   of them is hidden from assistive tech at the markup level. */
#hm .eyebrow{
  display:inline-flex; align-items:center; gap:9px;
  padding:7px 15px 7px 12px; border-radius:var(--r-pill);
  background:var(--surface-3); border:1px solid var(--line);
  font-size:13px; font-weight:600; letter-spacing:.01em; color:var(--text);
}
#hm .eyebrow .em{ font-size:15px; line-height:1; }
#hm .eyebrow-plain{ background:transparent; border-color:transparent; padding-left:0; color:var(--muted); }

#hm .h1{ font-size:clamp(38px,6.1vw,68px); line-height:1.04; }
#hm .h2{ font-size:clamp(29px,4vw,46px); }
#hm .h3{ font-size:clamp(19px,2vw,22px); line-height:1.28; }
#hm .h4{ font-size:17.5px; line-height:1.35; }

/* The reading measure goes on the TEXT, never on a container that also carries
   .wrap. A .wrap with a narrower max-width gets centred by the auto margins and
   silently falls out of alignment with everything else on the page. */
#hm .lede{ font-size:19px; color:var(--muted); max-width:62ch; }
#hm .body{ color:var(--muted); max-width:70ch; }
#hm .small{ font-size:14.5px; color:var(--faint); }
#hm .accent{ color:var(--brand-txt); }
#hm strong{ color:var(--text); font-weight:600; }

#hm .stack > * + *{ margin-top:18px; }
#hm .stack-sm > * + *{ margin-top:10px; }

/* ===== BUTTONS ===== */
#hm .btn{
  display:inline-flex; align-items:center; gap:9px;
  font-family:'Inter',sans-serif; font-size:15.5px; font-weight:600; line-height:1;
  padding:16px 27px; border-radius:var(--r-pill);
  border:1.5px solid transparent; cursor:pointer;
  transition:transform .18s var(--ease), box-shadow .22s var(--ease), background .18s, border-color .18s, color .18s;
}
#hm .btn .arr{ transition:transform .2s var(--ease); }
#hm .btn:hover .arr{ transform:translateX(3px); }
/* Amber is the primary CTA and the loudest thing on the page. Near-black text
   on it, not white: #221404 reads at 7.5:1 where white manages only 2.0:1. */
#hm .btn-primary{ background:var(--amber); color:var(--on-fill); box-shadow:0 2px 0 rgba(160,100,10,.35); }
#hm .btn-primary:hover{ transform:translateY(-2px); box-shadow:0 4px 0 rgba(160,100,10,.35), 0 14px 30px -12px rgba(240,160,43,.7); }
#hm .btn-ghost{ background:transparent; color:var(--text); border-color:var(--line-2); }
#hm .btn-ghost:hover{ border-color:var(--text); background:rgba(20,55,43,.04); }
#hm .btn-row{ display:flex; flex-wrap:wrap; gap:13px; align-items:center; }

/* ===== CARDS =====
   Moulded, not drawn. A white card lifted off the paper by a warm shadow, and
   it rises a little further on hover. This is the opposite of the blueprint
   direction it replaced, and it is the main reason the page feels friendly. */
#hm .card{
  background:var(--surface); border:1px solid var(--line);
  border-radius:var(--r); padding:30px; box-shadow:var(--shadow);
  transition:transform .22s var(--ease), box-shadow .22s var(--ease), border-color .22s var(--ease);
}
#hm .card-lift:hover{ transform:translateY(-4px); box-shadow:var(--shadow-lift); }
#hm .card-2{ background:var(--surface-2); box-shadow:none; }
/* a decorative emoji opening a card, sized as display art rather than an icon */
#hm .card > .em{ display:block; font-size:27px; line-height:1; margin-bottom:15px; }

#hm .grid{ display:grid; gap:22px; }
#hm .grid-2{ grid-template-columns:repeat(2,minmax(0,1fr)); }
#hm .grid-3{ grid-template-columns:repeat(3,minmax(0,1fr)); }
#hm .grid-4{ grid-template-columns:repeat(4,minmax(0,1fr)); }

/* ===== CHIP / PILL ===== */
#hm .chip{
  display:inline-flex; align-items:center; gap:8px;
  padding:9px 16px; border-radius:var(--r-pill);
  border:1px solid var(--line); background:var(--surface);
  font-size:14px; font-weight:500; color:var(--muted);
}
#hm .chip-brand{ background:var(--brand-tint); border-color:var(--brand-line); color:var(--brand-txt); font-weight:600; }
#hm .chip-row{ display:flex; flex-wrap:wrap; gap:10px; }

/* ===== HEADER ===== */
#hm .hdr{
  position:sticky; top:0; z-index:80;
  background:rgba(251,247,240,.88); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--line);
}
#hm .hdr-in{ display:flex; align-items:center; gap:28px; height:76px; }
#hm .mark{ display:flex; align-items:center; gap:11px; flex-shrink:0; }
#hm .mark img{ width:32px; height:32px; border-radius:9px; object-fit:cover; }
#hm .mark span{
  font-family:'Poppins',sans-serif; font-weight:700; font-size:15px;
  letter-spacing:.05em; text-transform:uppercase; white-space:nowrap; color:var(--text);
}
#hm .nav{ display:flex; align-items:center; gap:4px; margin-left:auto; }
#hm .nav a{
  padding:9px 15px; border-radius:var(--r-pill); font-size:14.5px; font-weight:500; color:var(--muted);
  transition:color .16s, background .16s;
}
#hm .nav a:hover{ color:var(--text); background:rgba(20,55,43,.05); }
/* The current page is marked, not linked away from. That is a real state, so it
   earns the brand green plus a white pill lifting it off the paper. */
#hm .nav a.here{ color:var(--brand-txt); font-weight:600; background:var(--surface); box-shadow:var(--shadow); }
#hm .hdr-cta{ flex-shrink:0; }
#hm .hdr-cta .btn{ padding:12px 22px; font-size:14.5px; }
#hm .burger{ display:none; background:none; border:0; padding:10px; cursor:pointer; flex-direction:column; gap:5px; margin-left:auto; }
#hm .burger span{ display:block; width:22px; height:2px; background:var(--text); border-radius:2px; transition:transform .2s var(--ease), opacity .2s; }
#hm .hdr.open .burger span:nth-child(1){ transform:translateY(7px) rotate(45deg); }
#hm .hdr.open .burger span:nth-child(2){ opacity:0; }
#hm .hdr.open .burger span:nth-child(3){ transform:translateY(-7px) rotate(-45deg); }

/* ===== HERO ===== */
/* The hero sits directly under a sticky header, so its top padding is the
   first thing anyone sees. 88px pushed the headline below the fold on a
   laptop for no reason at all. */
#hm .hero{ position:relative; padding:60px 0 62px; overflow:hidden; }
#hm .hero-in{ position:relative; z-index:1; max-width:900px; }
#hm .hero .h1{ margin-top:22px; }
#hm .hero .lede{ margin-top:22px; font-size:20px; }
#hm .hero .btn-row{ margin-top:34px; }
#hm .hero-note{ margin-top:22px; font-size:14.5px; color:var(--faint); }

/* Page heroes on the three pillar pages carry a big index numeral. Solid green
   rather than an outline: an outlined numeral on cream could not be pushed past
   1.8:1 without thickening the stroke into something clumsy. */
#hm .pillar-no{
  font-family:'Poppins',sans-serif; font-weight:700; font-size:clamp(52px,8.5vw,96px);
  line-height:1; color:var(--brand-txt); letter-spacing:-.045em; margin-bottom:2px;
}

/* ===== THE ENGINE LOOP =====
   Three cards joined by connectors, with a return rail underneath that carries
   the loop back to Traffic. Stacks vertically on small screens, where the rail
   becomes a plain labelled line. */
#hm .engine{ margin-top:44px; }
#hm .engine-row{ display:grid; grid-template-columns:1fr 46px 1fr 46px 1fr; align-items:stretch; }
#hm .engine-node{
  display:flex; flex-direction:column;
  background:var(--surface); border:1px solid var(--line); border-radius:var(--r);
  padding:28px 26px; box-shadow:var(--shadow);
  transition:transform .22s var(--ease), box-shadow .22s var(--ease);
}
#hm .engine-node:hover{ transform:translateY(-4px); box-shadow:var(--shadow-lift); }
/* the tinted badge that carries each pillar's emoji */
#hm .engine-node .em{
  width:52px; height:52px; border-radius:15px;
  display:flex; align-items:center; justify-content:center;
  font-size:25px; line-height:1; margin-bottom:18px;
}
#hm .engine-node.e1 .em{ background:var(--amber-tint); }
#hm .engine-node.e2 .em{ background:var(--clay-tint); }
#hm .engine-node.e3 .em{ background:var(--brand-tint); }
#hm .engine-node .no{
  font-family:'Inter',sans-serif; font-size:11.5px; font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; color:var(--faint);
}
#hm .engine-node .nm{ margin-top:8px; font-family:'Poppins',sans-serif; font-weight:600; font-size:21px; letter-spacing:-.02em; }
#hm .engine-node p{ margin-top:10px; color:var(--muted); font-size:15.5px; }

#hm .engine-link{ position:relative; display:flex; align-items:center; justify-content:center; }
#hm .engine-link::before{ content:''; position:absolute; left:6px; right:6px; height:2px; border-top:2px dotted var(--line-2); }
#hm .engine-link .dot{
  position:relative; width:9px; height:9px; border-radius:50%; background:var(--amber);
  box-shadow:0 0 0 4px rgba(240,160,43,.18);
  animation:hmFlow 2.6s var(--ease) infinite;
}
@keyframes hmFlow{
  0%{ transform:translateX(-18px); opacity:0; }
  22%{ opacity:1; }
  78%{ opacity:1; }
  100%{ transform:translateX(18px); opacity:0; }
}
#hm .engine-link:nth-of-type(4) .dot{ animation-delay:.45s; }

/* the return rail: a three-sided box that reads as the loop closing */
#hm .engine-return{
  position:relative; height:62px; margin:0 9%;
  border-left:2px dashed var(--line-2);
  border-right:2px dashed var(--line-2);
  border-bottom:2px dashed var(--line-2);
  border-radius:0 0 18px 18px;
}
/* An arrowhead on the left end, pointing back up into Traffic. Without it the
   rail reads as a bracket joining three cards rather than as a loop closing,
   which is the one thing this diagram exists to say. */
#hm .engine-return::after{
  content:''; position:absolute; left:-5px; top:-1px;
  width:10px; height:10px;
  border-left:2px solid var(--line-2); border-top:2px solid var(--line-2);
  transform:rotate(45deg);
}
#hm .engine-return .lbl{
  position:absolute; left:50%; bottom:-16px; transform:translateX(-50%);
  display:inline-flex; align-items:center; gap:9px;
  background:var(--surface-3); border:1px solid var(--line);
  border-radius:var(--r-pill); padding:7px 16px; white-space:nowrap;
  font-size:13px; font-weight:600; color:var(--text);
}
#hm .engine-cap{ margin-top:44px; color:var(--muted); font-size:16px; max-width:70ch; }

/* ===== BIG STAT BLOCK (Conversion) ===== */
/* A white card with the number in green and an amber rule under it. The number
   is NOT amber: at 2.0:1 on cream it would fail even the large-text floor. */
#hm .stat{
  text-align:left; background:var(--surface); border:1px solid var(--line);
  border-radius:var(--r); padding:30px 26px; box-shadow:var(--shadow);
}
#hm .stat .n{
  font-family:'Poppins',sans-serif; font-weight:700; letter-spacing:-.045em;
  font-size:clamp(42px,5.4vw,58px); line-height:1; color:var(--brand-txt);
}
#hm .stat .n::after{
  content:''; display:block; width:46px; height:4px; border-radius:2px;
  background:var(--amber); margin:16px 0 0;
}
#hm .stat .t{ margin-top:15px; color:var(--muted); font-size:15.5px; }
#hm .src{
  margin-top:26px; font-size:13.5px; color:var(--faint);
  border-left:3px solid var(--amber); padding-left:14px; max-width:76ch;
}

/* ===== NUMBERED STEP LIST ===== */
#hm .steps{ counter-reset:hmstep; }
#hm .step{ position:relative; padding-left:66px; }
#hm .step + .step{ margin-top:30px; padding-top:28px; border-top:1px solid var(--line); }
#hm .step::before{
  counter-increment:hmstep; content:counter(hmstep);
  position:absolute; left:0; top:0;
  width:46px; height:46px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  background:var(--amber); color:var(--on-fill);
  font-family:'Poppins',sans-serif; font-size:17px; font-weight:700;
}
#hm .step + .step::before{ top:28px; }
/* the last step is the loop closing, so it is green rather than amber */
#hm .step.last::before{ background:var(--brand); color:var(--brand-ink); }
#hm .step p{ margin-top:9px; color:var(--muted); }
#hm .step .em{ font-size:17px; margin-right:7px; }

/* ===== TICK / CROSS LISTS ===== */
#hm .ticks li, #hm .crosses li{
  position:relative; padding-left:34px; list-style:none; color:var(--muted);
}
#hm .ticks li + li, #hm .crosses li + li{ margin-top:12px; }
#hm .ticks li::before, #hm .crosses li::before{
  content:''; position:absolute; left:0; top:4px;
  width:22px; height:22px; border-radius:50%;
  background-repeat:no-repeat; background-position:center; background-size:12px;
}
#hm .ticks li::before{
  background-color:var(--brand-tint);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 6.4 4.6 9 10 3.2' fill='none' stroke='%231B7A4B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}
#hm .crosses li::before{
  background-color:var(--clay-tint);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 3l6 6M9 3l-6 6' fill='none' stroke='%23C24A26' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
}

/* ===== APP MOCK (Reporting) =====
   A drawn representation of the Command Center, deliberately carrying NO
   figures. The Reporting page sells transparency and the one click, not
   results, so every value slot is rendered as a redacted bar. */
#hm .mock{
  background:var(--surface); border:1px solid var(--line);
  border-radius:var(--r); overflow:hidden; box-shadow:var(--shadow-lift);
}
#hm .mock-bar{
  display:flex; align-items:center; gap:8px; padding:14px 18px;
  border-bottom:1px solid var(--line); background:var(--surface-2);
}
#hm .mock-bar i{ width:10px; height:10px; border-radius:50%; background:var(--line-2); display:block; }
#hm .mock-bar b{ margin-left:12px; font-size:12.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
#hm .mock-body{ padding:20px; }
#hm .mock-row{
  display:flex; align-items:center; gap:14px; padding:15px 4px;
}
#hm .mock-row + .mock-row{ border-top:1px solid var(--line); }
#hm .mock-row .nm{ font-weight:600; font-size:15px; flex:1; min-width:0; }
#hm .mock-row .sub{ font-size:13px; color:var(--faint); margin-top:3px; font-weight:400; }
/* The redaction bar: a value exists here, the site is simply not showing one.
   Each bar is LABELLED (.mock-cell .k) rather than left bare. Bare bars floating
   at the right edge read as a loading skeleton, which makes the page look broken
   instead of deliberately withheld. Ink-tinted, not white-tinted: a white
   gradient is invisible on cream, which is how this went blank the first time. */
#hm .redact{
  height:10px; border-radius:5px;
  background:linear-gradient(90deg, rgba(20,55,43,.17), rgba(20,55,43,.07));
  flex-shrink:0; width:100%;
}
#hm .mock-cell{ flex-shrink:0; min-width:68px; }
#hm .mock-cell .k{
  font-size:10.5px; font-weight:700; letter-spacing:.1em;
  text-transform:uppercase; color:var(--faint); white-space:nowrap;
}
#hm .mock-cell .k + .redact{ margin-top:8px; }
#hm .mock-head{ padding-top:4px; padding-bottom:8px; }
#hm .mock-head .nm{ min-height:0; }
#hm .mock-actions{ display:flex; gap:8px; flex-shrink:0; }
#hm .mock-btn{
  font-size:12.5px; font-weight:600; padding:8px 15px; border-radius:var(--r-pill);
  border:1px solid var(--line-2); color:var(--muted); white-space:nowrap;
}
#hm .mock-btn.won{ border-color:var(--brand); background:var(--brand); color:var(--brand-ink); }

/* ===== FAQ ===== */
#hm .faq{ border-top:1px solid var(--line); }
#hm .faq details{ border-bottom:1px solid var(--line); }
#hm .faq summary{
  display:flex; align-items:center; gap:18px; cursor:pointer; list-style:none;
  padding:22px 0; font-family:'Poppins',sans-serif; font-weight:600; font-size:17.5px; letter-spacing:-.015em;
}
#hm .faq summary::-webkit-details-marker{ display:none; }
#hm .faq summary::after{
  content:''; margin-left:auto; flex-shrink:0;
  width:26px; height:26px; border-radius:50%; background-color:var(--surface-3);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M6 2.5v7M2.5 6h7' fill='none' stroke='%2314372B' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:center; background-size:12px;
  transition:transform .22s var(--ease);
}
#hm .faq details[open] summary::after{ transform:rotate(45deg); }
#hm .faq .ans{ padding:0 0 26px; color:var(--muted); max-width:74ch; }

/* ===== LETTER (Founder) ===== */
#hm .letter{ max-width:70ch; }
#hm .letter p{ margin-top:24px; color:var(--muted); font-size:18px; line-height:1.72; }
#hm .letter p:first-child{ margin-top:0; }
#hm .sign{ margin-top:38px; padding-top:26px; border-top:1px solid var(--line); }
#hm .sign .who{ font-family:'Poppins',sans-serif; font-weight:600; font-size:19px; }
#hm .sign .role{ margin-top:4px; color:var(--faint); font-size:14.5px; }

/* ===== CALENDAR (Book) ===== */
#hm .cal{
  background:var(--surface); border:1px solid var(--line); border-radius:var(--r);
  padding:10px; overflow:hidden; box-shadow:var(--shadow);
}
#hm .cal iframe{ width:100%; min-height:760px; border:0; display:block; border-radius:var(--r-sm); background:transparent; }

/* ===== CTA BAND =====
   A deep forest panel on the cream. The page has been light the whole way down,
   so it needs something solid to land on, and this is the one dark surface on
   the site. Everything inside it flips to light type. */
#hm .cta{ position:relative; padding:52px 0 0; }
#hm .cta > .glow{ display:none; }
#hm .cta-in{
  position:relative; z-index:1; text-align:center;
  background:var(--text); color:#F3EFE6;
  border-radius:26px; padding:58px 40px; overflow:hidden;
}
#hm .cta-in::before{
  content:''; position:absolute; left:50%; top:-140px; transform:translateX(-50%);
  width:min(760px,120%); height:420px; border-radius:50%;
  background:radial-gradient(circle at center, rgba(240,160,43,.20), transparent 62%);
  pointer-events:none;
}
#hm .cta-in > *{ position:relative; z-index:1; }
#hm .cta-in .eyebrow{ background:rgba(255,255,255,.10); border-color:rgba(255,255,255,.20); color:#FFFDF8; }
#hm .cta-in .h2{ color:#FFFDF8; max-width:20ch; margin-left:auto; margin-right:auto; }
#hm .cta-in .lede{ margin:19px auto 0; color:rgba(243,239,230,.78); max-width:52ch; }
#hm .cta-in .btn-row{ margin-top:32px; justify-content:center; }
#hm .cta-in .btn-ghost{ color:#FFFDF8; border-color:rgba(255,255,255,.32); }
#hm .cta-in .btn-ghost:hover{ border-color:#FFFDF8; background:rgba(255,255,255,.08); }
#hm .cta-in .hero-note{ color:rgba(243,239,230,.6); }

/* ===== FOOTER ===== */
#hm .ftr{ background:var(--bg); border-top:1px solid var(--line); margin-top:48px; padding:40px 0 34px; }
#hm .ftr-in{ display:flex; flex-wrap:wrap; gap:26px; align-items:flex-start; }
#hm .ftr-nav{ display:flex; flex-wrap:wrap; gap:22px; margin-left:auto; }
#hm .ftr-nav a{ font-size:14.5px; color:var(--muted); }
#hm .ftr-nav a:hover{ color:var(--brand-txt); }
#hm .ftr-btm{
  margin-top:34px; padding-top:22px; border-top:1px solid var(--line);
  display:flex; flex-wrap:wrap; gap:14px; align-items:center;
  font-size:13px; color:var(--faint);
}
#hm .ftr-btm a:hover{ color:var(--brand-txt); }
#hm .ftr-btm .legal{ margin-left:auto; }

/* ===== REVEAL ON SCROLL ===== */
#hm .rv{ opacity:0; transform:translateY(16px); transition:opacity .6s var(--ease), transform .6s var(--ease); }
#hm .rv.in{ opacity:1; transform:none; }

/* ============================================================================
   RESPONSIVE
   At-rules are written BARE. "#hm @media(...)" is not valid CSS and the browser
   throws away the whole block, which is exactly how a site ends up with a hero
   that never collapses and a form sitting off the right edge of every phone.
   ========================================================================= */
@media (max-width:980px){
  #hm .grid-3, #hm .grid-4{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  #hm .engine-row{ grid-template-columns:1fr; gap:16px; }
  #hm .engine-link{ height:34px; }
  #hm .engine-link::before{ left:50%; right:auto; top:2px; bottom:2px; width:0; height:auto; border-top:0; border-left:2px dotted var(--line-2); }
  #hm .engine-link .dot{ animation-name:hmFlowY; }
  #hm .engine-return{ height:46px; margin:16px 22% 0; }
}
@keyframes hmFlowY{
  0%{ transform:translateY(-14px); opacity:0; }
  22%{ opacity:1; }
  78%{ opacity:1; }
  100%{ transform:translateY(14px); opacity:0; }
}

@media (max-width:820px){
  #hm .burger{ display:flex; }
  #hm .hdr-cta{ display:none; }
  #hm .nav{
    position:absolute; top:76px; left:0; right:0;
    flex-direction:column; align-items:stretch; gap:0; margin:0;
    background:rgba(251,247,240,.98); backdrop-filter:blur(14px);
    border-bottom:1px solid var(--line); padding:8px 0;
    box-shadow:var(--shadow-lift);
    opacity:0; transform:translateY(-8px); pointer-events:none;
    transition:opacity .2s var(--ease), transform .2s var(--ease);
  }
  #hm .hdr.open .nav{ opacity:1; transform:none; pointer-events:auto; }
  #hm .nav a{ padding:15px 24px; font-size:16px; border-radius:0; }
  #hm .nav a.here{ background:transparent; box-shadow:none; }
  #hm .sec{ padding:54px 0; }
  #hm .sec-tight{ padding:42px 0; }
  #hm .hero{ padding:44px 0 46px; }
  #hm .hero .lede{ font-size:18px; }
  #hm .cta-in{ padding:46px 30px; }
}

@media (max-width:640px){
  #hm{ font-size:16px; }
  #hm .grid-2, #hm .grid-3, #hm .grid-4{ grid-template-columns:minmax(0,1fr); }
  #hm .wrap{ padding:0 20px; }
  #hm .card{ padding:26px 22px; }
  #hm .btn{ width:100%; justify-content:center; }
  #hm .btn-row{ gap:10px; }
  #hm .letter p{ font-size:17px; }
  #hm .step{ padding-left:56px; }
  #hm .step::before{ width:40px; height:40px; font-size:15px; }
  #hm .cta-in{ padding:40px 22px; border-radius:20px; }
  /* The value columns are fixed width, so on a phone .nm gets squeezed to about
     50px and wraps one word per line. Give the name its own full row and let the
     columns sit underneath it, still aligned to the header because both start at
     the same left edge. */
  #hm .mock-row{ flex-wrap:wrap; row-gap:12px; }
  #hm .mock-row .nm{ flex:0 0 100%; }
  #hm .mock-head .nm{ display:none; }
  #hm .mock-actions{ width:100%; }
  #hm .ftr-nav{ margin-left:0; gap:16px; }
  #hm .ftr-btm .legal{ margin-left:0; width:100%; }
  /* the label is nowrap, so the rail has to be wider than the label or the
     bottom line vanishes behind it and the loop stops reading as a loop */
  #hm .engine-return{ margin:16px 3% 0; }
  #hm .engine-return .lbl{ font-size:11.5px; padding:6px 11px; gap:7px; }
  #hm .cal iframe{ min-height:900px; }
}

/* 320px, the narrowest phone still worth supporting. The return rail label is
   the only thing on the site that cannot wrap, so it gets one more step down. */
@media (max-width:400px){
  #hm .engine-return{ margin:16px 0 0; }
  #hm .engine-return .lbl{ font-size:10.5px; padding:6px 9px; }
}

@media (prefers-reduced-motion:reduce){
  #hm *, #hm *::before, #hm *::after{
    animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important; scroll-behavior:auto !important;
  }
  #hm .rv{ opacity:1; transform:none; }
}
`;

  // =========================================================================
  // SHARED PARTS
  //
  // Header and footer are BUILT per page rather than stored six times, so the
  // current page can be marked rather than linked away from and the section
  // anchors can travel to Home first when they are not already on it.
  // =========================================================================

  function navLink(key, label, page) {
    var here = page === key ? " here" : "";
    return '<a class="' + here.trim() + '" href="' + P[key] + '">' + label + "</a>";
  }

  function header(page) {
    return '' +
      '<header class="hdr" id="hmHdr">' +
        '<div class="wrap hdr-in">' +
          '<a class="mark" href="' + P.home + '">' +
            '<img src="' + CONFIG.logo + '" alt="" aria-hidden="true" />' +
            "<span>Hauck Marketing</span>" +
          "</a>" +
          '<button class="burger" id="hmBurger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="hmNav">' +
            "<span></span><span></span><span></span>" +
          "</button>" +
          '<nav class="nav" id="hmNav">' +
            navLink("traffic", "Traffic", page) +
            navLink("conversion", "Conversion", page) +
            navLink("reporting", "Reporting", page) +
            navLink("founder", "Founder", page) +
          "</nav>" +
          '<div class="hdr-cta">' +
            '<a class="btn btn-primary" href="' + P.book + '">Book a Call <span class="arr" aria-hidden="true">&rarr;</span></a>' +
          "</div>" +
        "</div>" +
      "</header>";
  }

  function ctaBand(heading, sub) {
    return '' +
      '<section class="cta">' +
        '<div class="glow"></div>' +
        '<div class="wrap cta-in">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#9742;&#65039;</span> Book a call</span>' +
          '<h2 class="h2" style="margin-top:16px">' + heading + "</h2>" +
          '<p class="lede">' + sub + "</p>" +
          '<div class="btn-row">' +
            '<a class="btn btn-primary" href="' + P.book + '">Book a Call <span class="arr" aria-hidden="true">&rarr;</span></a>' +
            '<a class="btn btn-ghost" href="' + CONFIG.phoneHref + '">Call ' + CONFIG.phone + "</a>" +
          "</div>" +
          '<p class="hero-note">Fifteen minutes with the founder. No pitch deck, no hard sell.</p>' +
        "</div>" +
      "</section>";
  }

  function footer(page) {
    return '' +
      '<footer class="ftr">' +
        '<div class="wrap">' +
          '<div class="ftr-in">' +
            '<a class="mark" href="' + P.home + '">' +
              '<img src="' + CONFIG.logo + '" alt="" aria-hidden="true" />' +
              "<span>Hauck Marketing</span>" +
            "</a>" +
            '<nav class="ftr-nav">' +
              '<a href="' + P.traffic + '">Traffic</a>' +
              '<a href="' + P.conversion + '">Conversion</a>' +
              '<a href="' + P.reporting + '">Reporting</a>' +
              '<a href="' + P.founder + '">Founder</a>' +
              '<a href="' + P.book + '">Book a Call</a>' +
            "</nav>" +
          "</div>" +
          '<div class="ftr-btm">' +
            '<a href="mailto:' + CONFIG.email + '">' + CONFIG.email + "</a>" +
            "<span>&middot;</span>" +
            '<a href="' + CONFIG.phoneHref + '">' + CONFIG.phone + "</a>" +
            '<span class="legal">&copy; <span id="hmYear">2026</span> Hauck Marketing. The Contractor Growth Engine.</span>' +
          "</div>" +
        "</div>" +
      "</footer>";
  }

  // The three pillar nodes, reused on Home and as cross-links on pillar pages.
  // Each node carries a decorative emoji in a tinted badge. It is art, not an
  // icon, so it is hidden from assistive tech and the label below it carries
  // the meaning on its own.
  var ENGINE_NODES = [
    { no: "01", key: "traffic", nm: "Traffic", em: "&#127919;", p: "Custom branded ads put in front of homeowners who are actually in the market for the work you do." },
    { no: "02", key: "conversion", nm: "Conversion", em: "&#9889;", p: "Every lead contacted inside five minutes and worked until they book an estimate or tell us to stop." },
    { no: "03", key: "reporting", nm: "Reporting", em: "&#128202;", p: "Your own software. Every ad, every lead, every estimate, and one click to log what happened." }
  ];

  function engineRow() {
    var out = '<div class="engine-row">';
    ENGINE_NODES.forEach(function (n, i) {
      if (i > 0) out += '<div class="engine-link"><span class="dot"></span></div>';
      out += '' +
        '<a class="engine-node e' + (i + 1) + '" href="' + P[n.key] + '">' +
          '<span class="em" aria-hidden="true">' + n.em + "</span>" +
          '<span class="no">' + n.no + "</span>" +
          '<div class="nm">' + n.nm + "</div>" +
          "<p>" + n.p + "</p>" +
        "</a>";
    });
    out += "</div>";
    return out;
  }

  // One row of the Paid Ads mock on the Reporting page. Every value is drawn as
  // a labelled redaction bar. The label is the point: it says a number lives
  // here and we are choosing not to show you somebody else's.
  var AD_COLS = [["Spend", 78], ["Leads", 62], ["Cost / est", 92]];

  // The column labels are a header row, written once. Repeating them on every
  // row turns four rows into twelve pieces of shouting.
  function adHead() {
    return '<div class="mock-row mock-head"><div class="nm"></div>' +
      AD_COLS.map(function (c) {
        return '<div class="mock-cell" style="width:' + c[1] + 'px"><div class="k">' + c[0] + "</div></div>";
      }).join("") +
    "</div>";
  }

  function adRow(id, name) {
    return '<div class="mock-row"><div class="nm">' + id + " &middot; " + name + "</div>" +
      AD_COLS.map(function (c) {
        return '<div class="mock-cell" style="width:' + c[1] + 'px"><div class="redact"></div></div>';
      }).join("") +
    "</div>";
  }

  // =========================================================================
  // PAGES
  // =========================================================================
  var PAGES = {};

  // ---------------------------------------------------------------- HOME ---
  PAGES.home = '' +
    '<section class="hero">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="hero-in">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128119;</span> For high ticket contractors</span>' +
          '<h1 class="h1">The Contractor<br />Growth Engine</h1>' +
          '<p class="lede">Motivated homeowners in front of your ads. Every lead contacted inside five minutes. Every dollar tracked to the job it actually closed. Three parts, one loop, built for contractors who sell by the estimate.</p>' +
          '<div class="btn-row">' +
            '<a class="btn btn-primary" href="' + P.book + '">Book a Call <span class="arr" aria-hidden="true">&rarr;</span></a>' +
            '<a class="btn btn-ghost" href="#engine">See how it works</a>' +
          "</div>" +
          // Deliberately names no trade. Listing them reads as a menu, and a
          // contractor whose trade is missing from the list assumes we do not
          // work with them.
          '<p class="hero-note">Same ad spend. More booked estimates. Nothing slips through the cracks.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band" id="engine">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128295;</span> The mechanism</span>' +
          '<h2 class="h2" style="margin-top:16px">It is an engine, not a service.</h2>' +
          '<p class="lede" style="margin-top:18px">Most contractors think they have a leads problem. They have three problems in a row, and fixing one of them wastes the other two.</p>' +
        "</div>" +
        '<div class="engine rv">' +
          engineRow() +
          '<div class="engine-return"><span class="lbl">What you learn here decides what runs there</span></div>' +
          '<p class="engine-cap">Reporting is not the end of the Engine. It is the part that makes next month cheaper. Every outcome you log tells us which ads bought jobs you actually won, so the budget moves toward those and away from the ones that only brought tire kickers.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128184;</span> Why one part alone does nothing</span>' +
          '<h2 class="h2" style="margin-top:16px">Any two of the three still leaks money.</h2>' +
        "</div>" +
        '<div class="grid grid-3 rv" style="margin-top:38px">' +
          '<div class="card card-lift">' +
            '<span class="em" aria-hidden="true">&#9200;</span>' +
            '<h3 class="h3">Traffic without speed</h3>' +
            '<p class="body" style="margin-top:11px">You pay for the lead, then call it four hours later while you are washing up. By then it is somebody else\'s job. You did not lose on price. You lost on the clock.</p>' +
          "</div>" +
          '<div class="card card-lift">' +
            '<span class="em" aria-hidden="true">&#129335;</span>' +
            '<h3 class="h3">Speed without reporting</h3>' +
            '<p class="body" style="margin-top:11px">You book estimates all month and still cannot say which ad paid for them. So next month the budget gets spread evenly across ads that are not performing evenly.</p>' +
          "</div>" +
          '<div class="card card-lift">' +
            '<span class="em" aria-hidden="true">&#128235;</span>' +
            '<h3 class="h3">Reporting without traffic</h3>' +
            '<p class="body" style="margin-top:11px">Immaculate books and nothing to put in them. Dashboards do not sell jobs. They only earn their keep once there is real volume moving through them.</p>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:56px; align-items:center">' +
          "<div>" +
            '<span class="eyebrow"><span class="em" aria-hidden="true">&#127919;</span> 01 Traffic</span>' +
            '<h2 class="h2" style="margin-top:16px">Motivated homeowners, not everybody within 25 miles.</h2>' +
            '<p class="body" style="margin-top:18px">Most contractor ads are a radius, a stock photo and a phone number. That reaches everybody, which means it mostly reaches people who are not replacing anything this year.</p>' +
            '<p class="body" style="margin-top:14px">We build ads around your actual crews and your finished work, branded to your company, and we point them at homeowners showing real buying signals for the job you do.</p>' +
            '<div class="btn-row" style="margin-top:26px"><a class="btn btn-ghost" href="' + P.traffic + '">How the traffic works <span class="arr" aria-hidden="true">&rarr;</span></a></div>' +
          "</div>" +
          '<div class="card card-2">' +
            '<div class="chip-row">' +
              '<span class="chip chip-brand">In market signals</span>' +
              '<span class="chip">Homeowners only</span>' +
              '<span class="chip">Your branding</span>' +
              '<span class="chip">Your crews, your jobs</span>' +
              '<span class="chip">Optimised to booked estimates</span>' +
            "</div>" +
            '<p class="body" style="margin-top:22px">Feed the platform a form fill and it will find you people who fill in forms. Feed it a booked estimate and it starts hunting for people who book. That single choice changes who ever sees the ad.</p>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#9889;</span> 02 Conversion</span>' +
          '<h2 class="h2" style="margin-top:16px">The first five minutes decide who gets the job.</h2>' +
          '<p class="lede" style="margin-top:18px">A homeowner filling in your form is not shopping for you. They are shopping. They filled in three. Whoever gets to them first has the conversation, and the other two get voicemail.</p>' +
        "</div>" +
        '<div class="grid grid-3 rv" style="margin-top:44px">' +
          '<div class="stat"><div class="n">21x</div><p class="t">The odds of qualifying a lead when you call at five minutes rather than thirty.</p></div>' +
          '<div class="stat"><div class="n">60x</div><p class="t">Responding within the hour versus waiting a day, across 1.25 million leads.</p></div>' +
          '<div class="stat"><div class="n">42 hrs</div><p class="t">The average response time companies in that study actually managed.</p></div>' +
        "</div>" +
        '<div class="rv"><div class="btn-row" style="margin-top:38px"><a class="btn btn-ghost" href="' + P.conversion + '">The full picture, with sources <span class="arr" aria-hidden="true">&rarr;</span></a></div></div>' +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:56px; align-items:center">' +
          "<div>" +
            '<span class="eyebrow"><span class="em" aria-hidden="true">&#128202;</span> 03 Reporting</span>' +
            '<h2 class="h2" style="margin-top:16px">Your own software, not a PDF once a month.</h2>' +
            '<p class="body" style="margin-top:18px">Every ad we run is in there with your name on it. Every lead is tagged to the ad that made it. Every estimate lands on the calendar inside the same app.</p>' +
            '<p class="body" style="margin-top:14px">When the estimate is done you click one button. Won or lost, and the job value. That click is what closes the loop and points next month\'s budget at the ads that actually paid.</p>' +
            '<div class="btn-row" style="margin-top:26px"><a class="btn btn-ghost" href="' + P.reporting + '">Inside the software <span class="arr" aria-hidden="true">&rarr;</span></a></div>' +
          "</div>" +
          '<div class="mock">' +
            '<div class="mock-bar"><i></i><i></i><i></i><b>This week&rsquo;s estimates</b></div>' +
            '<div class="mock-body">' +
              '<div class="mock-row">' +
                '<div class="nm">Tuesday, 9:00 am<div class="sub">Full replacement &middot; from Ad 04</div></div>' +
                '<div class="mock-actions"><span class="mock-btn won">Won</span><span class="mock-btn">Lost</span></div>' +
              "</div>" +
              '<div class="mock-row">' +
                '<div class="nm">Tuesday, 1:30 pm<div class="sub">Second estimate &middot; from Ad 02</div></div>' +
                '<div class="mock-actions"><span class="mock-btn">Won</span><span class="mock-btn">Lost</span></div>' +
              "</div>" +
              '<div class="mock-row">' +
                '<div class="nm">Thursday, 8:30 am<div class="sub">Storm damage &middot; from Ad 04</div></div>' +
                '<div class="mock-actions"><span class="mock-btn won">Won</span><span class="mock-btn">Lost</span></div>' +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128197;</span> A week inside the Engine</span>' +
          '<h2 class="h2" style="margin-top:16px">What it actually looks like from your side.</h2>' +
        "</div>" +
        '<div class="steps rv" style="margin-top:44px; max-width:80ch">' +
          '<div class="step">' +
            '<h3 class="h4"><span class="em" aria-hidden="true">&#128227;</span>Monday. The ads run.</h3>' +
            "<p>Homeowners who are genuinely looking see your trucks, your crews and your finished jobs. Not a stock photo of somebody else's job.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4"><span class="em" aria-hidden="true">&#9889;</span>Within five minutes of every enquiry.</h3>' +
            "<p>A text goes out with their name and what they asked about. Then a call. Then email. The follow up does not stop after two tries. It keeps going for weeks until they book or tell us to stop.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4"><span class="em" aria-hidden="true">&#128197;</span>Wednesday. The calendar has names on it.</h3>' +
            "<p>Estimates booked around your real availability, your travel time and your days off. Every one of them already knows who you are before you knock on the door.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4"><span class="em" aria-hidden="true">&#129309;</span>Thursday and Friday. You run the estimates.</h3>' +
            "<p>The part you are actually good at. Nothing about the Engine changes how you sell in somebody's front room.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4"><span class="em" aria-hidden="true">&#9989;</span>Saturday morning. One click each.</h3>' +
            "<p>You open the app. Next to every name there are two buttons. Won or lost. You click, you type the job value, you close the laptop. It takes about a minute for the whole week.</p>" +
          "</div>" +
          '<div class="step last">' +
            '<h3 class="h4"><span class="em" aria-hidden="true">&#128257;</span>And that is the loop closing.</h3>' +
            "<p>Those clicks tell the Engine which ads brought the jobs you won rather than the ones that merely brought leads. Next month more of the budget goes there. That is the difference between buying leads and building an engine.</p>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:44px">' +
          '<div class="card">' +
            '<span class="eyebrow"><span class="em" aria-hidden="true">&#129309;</span> Built for</span>' +
            '<h3 class="h3" style="margin-top:14px">This fits you if</h3>' +
            '<ul class="ticks" style="margin-top:20px">' +
              "<li>You sell high ticket jobs by in home estimate.</li>" +
              "<li>You could run more estimates next week than you have booked.</li>" +
              "<li>Somebody answers the phone, or is willing to let the system answer it.</li>" +
              "<li>You can get to a new estimate inside a week.</li>" +
              "<li>You want to know which ad paid for which job, not just how many leads came in.</li>" +
            "</ul>" +
          "</div>" +
          '<div class="card">' +
            '<span class="eyebrow"><span class="em" aria-hidden="true">&#128581;</span> Not built for</span>' +
            '<h3 class="h3" style="margin-top:14px">This is not for you if</h3>' +
            '<ul class="crosses" style="margin-top:20px">' +
              "<li>Your average job is small and you need volume rather than value.</li>" +
              "<li>You want to buy leads and do nothing else with them.</li>" +
              "<li>Your calendar is already full and you are turning work away.</li>" +
              "<li>Nobody on your side will click two buttons once a week.</li>" +
            "</ul>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv"><span class="eyebrow"><span class="em" aria-hidden="true">&#128172;</span> Straight answers</span>' +
        '<h2 class="h2" style="margin-top:16px">Questions we get before the call.</h2></div>' +
        '<div class="faq rv" style="margin-top:36px">' +
          "<details><summary>Do I own the ad account?</summary>" +
            '<div class="ans">Yes. The ad account, the audiences, the pixel data and the creative are yours and stay yours. We run inside your account, not ours.</div></details>' +
          "<details><summary>What if I already run ads?</summary>" +
            '<div class="ans">Good. We start by reading what is already there, because months of spend is months of data. Anything working keeps running. The gap is almost never the ads on their own, it is what happens in the four hours after the lead comes in.</div></details>' +
          "<details><summary>How fast does it go live?</summary>" +
            '<div class="ans">The follow up and the software go in first, because those work on the leads you are already getting. Ads follow once the creative is shot and approved. We will give you real dates on the call rather than a number on a website.</div></details>' +
          "<details><summary>Does the AI pretend to be me?</summary>" +
            '<div class="ans">No. It is upfront about what it is. Its only job is to get an estimate on the calendar, and the moment a homeowner asks something real it hands the conversation to you.</div></details>' +
          "<details><summary>What do I actually have to do?</summary>" +
            '<div class="ans">Run the estimates, and click won or lost afterwards. That is genuinely it. If you want to be more involved than that you can be, but the Engine does not need you to be.</div></details>' +
          "<details><summary>Am I locked into a long contract?</summary>" +
            '<div class="ans">We will cover terms plainly on the call. What we will not do is quote a price on a website without knowing your job value, your area or your capacity, because that number would be made up.</div></details>' +
        "</div>" +
      "</div>" +
    "</section>" +

    ctaBand(
      "See what the Engine would do in your business.",
      "Fifteen minutes with Jake. We will look at your numbers, your area and your capacity, and tell you plainly whether this fits."
    );

  // ------------------------------------------------------------- TRAFFIC ---
  PAGES.traffic = '' +
    '<section class="hero">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="hero-in">' +
          '<div class="pillar-no">01</div>' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#127919;</span> Traffic</span>' +
          '<h1 class="h1">Motivated homeowners, not everybody within 25 miles.</h1>' +
          '<p class="lede">Reach is easy to buy and almost worthless on its own. The job is to put your name in front of the small number of people in your area who are genuinely about to spend money on the work you do.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#9888;&#65039;</span> The mistake almost everyone makes</span>' +
          '<h2 class="h2" style="margin-top:16px">A radius is not a target.</h2>' +
          '<p class="body" style="margin-top:20px">The standard contractor ad is a 25 mile circle, a photo of a truck and a phone number. It reaches everybody, and everybody is mostly people who are not buying the work you do this year, this decade or ever.</p>' +
          '<p class="body" style="margin-top:14px">You are not buying attention. You are buying the attention of somebody with a problem, the money to fix it and a reason to fix it now. That is a far smaller group, and it costs more per person to reach. It is still the only group worth paying for.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128269;</span> How we find them</span>' +
          '<h2 class="h2" style="margin-top:16px">Four things decide who ever sees the ad.</h2>' +
        "</div>" +
        '<div class="steps rv" style="margin-top:44px; max-width:80ch">' +
          '<div class="step">' +
            '<h3 class="h4">The conversion event we optimise for</h3>' +
            "<p>This is the single biggest lever and almost nobody touches it. Tell the platform to go get form fills and it will find people who fill in forms all day. Tell it to go get booked estimates and it starts hunting for people who book. Same budget, completely different audience.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">Homeowner and property signals</h3>' +
            "<p>Renters are not buying the work you sell. We filter for homeowners, and where the platform allows it we lean toward property age, property value and the life events that tend to sit just before a big job.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">Geography that matches how you actually work</h3>' +
            "<p>Drawn around your real service area and your drive times, not a lazy circle around the shop. Paying to reach somebody 40 minutes past where you are willing to send a crew is money set on fire.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">Seasonality</h3>' +
            "<p>Demand for your trade is not flat across the year and the budget should not be either. We plan around your busy window instead of spending the same amount in February as in June and calling it consistency.</p>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:56px; align-items:center">' +
          "<div>" +
            '<span class="eyebrow"><span class="em" aria-hidden="true">&#127916;</span> Creative</span>' +
            '<h2 class="h2" style="margin-top:16px">Custom branded. Your crews, your trucks, your finished work.</h2>' +
            '<p class="body" style="margin-top:20px">A homeowner is about to let strangers into their house and hand them a large cheque. A stock photo of somebody else&rsquo;s finished job tells them nothing about whether you can be trusted to do that.</p>' +
            '<p class="body" style="margin-top:14px">Your logo and your name are on every frame. Real jobs, shot properly. Before and after on work you actually did. The ad is doing two jobs at once: getting the click, and making you the familiar name in the area long before anybody needs you.</p>' +
          "</div>" +
          '<div class="card card-2">' +
            '<h3 class="h3">What we do not do</h3>' +
            '<ul class="crosses" style="margin-top:20px">' +
              "<li>Fake urgency. No three spots left when there are not three spots.</li>" +
              "<li>Income or savings claims you cannot back up.</li>" +
              "<li>Clickbait that does not deliver on the click.</li>" +
              "<li>Stock imagery pretending to be your work.</li>" +
              "<li>Anything that risks the ad account for a short term bump.</li>" +
            "</ul>" +
            '<p class="small" style="margin-top:22px">Every one of those buys a cheaper click and a worse business. The account is an asset. We protect it.</p>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#127991;&#65039;</span> The offer</span>' +
          '<h2 class="h2" style="margin-top:16px">The estimate is the offer.</h2>' +
          '<p class="body" style="margin-top:20px">Discounting before you have been in the house teaches the market that your price is soft, and it brings you the exact homeowner who will grind you on it later. High ticket work is not won on a coupon. It is won in the front room.</p>' +
          '<p class="body" style="margin-top:14px">So the ad sells the visit, not the price. Get in the door, be the company that turned up first and knew what it was talking about, and the job follows. Your close rate is already good. The Engine exists to give it more chances.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#129514;</span> Testing</span>' +
          '<h2 class="h2" style="margin-top:16px">Every ad has a job, and it keeps running only while it does it.</h2>' +
        "</div>" +
        '<div class="grid grid-4 rv" style="margin-top:38px">' +
          '<div class="card"><h3 class="h4 accent">Kill</h3><p class="body" style="margin-top:10px; font-size:15px">Spending without producing. It comes off, on a rule, not on a feeling.</p></div>' +
          '<div class="card"><h3 class="h4 accent">Watch</h3><p class="body" style="margin-top:10px; font-size:15px">Early or noisy. Left alone deliberately until there is enough data to judge it.</p></div>' +
          '<div class="card"><h3 class="h4 accent">Scale</h3><p class="body" style="margin-top:10px; font-size:15px">Producing booked estimates at a cost that works. It gets more budget.</p></div>' +
          '<div class="card"><h3 class="h4 accent">Refresh</h3><p class="body" style="margin-top:10px; font-size:15px">It worked and the area has now seen it too often. New creative, same angle.</p></div>' +
        "</div>" +
        '<div class="rv"><p class="body" style="margin-top:32px">We test angles against each other, not button colours. Whether a homeowner responds to the storm damage angle or the finance angle is worth knowing. Whether the headline was two words longer is not.</p></div>' +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:44px; align-items:center">' +
          "<div>" +
            '<h2 class="h2">And you can see all of it.</h2>' +
            '<p class="body" style="margin-top:18px">Every ad described above sits in your software, named, live, with what it is spending and what it is bringing back. No waiting for a monthly report, and no taking our word for it.</p>' +
            '<div class="btn-row" style="margin-top:26px"><a class="btn btn-ghost" href="' + P.reporting + '">See the reporting <span class="arr" aria-hidden="true">&rarr;</span></a></div>' +
          "</div>" +
          "<div>" +
            '<h2 class="h2">Then the clock starts.</h2>' +
            '<p class="body" style="margin-top:18px">The best traffic in the world is worth nothing if the lead sits for four hours. That is the next part of the Engine, and it is the one that most often turns a campaign around.</p>' +
            '<div class="btn-row" style="margin-top:26px"><a class="btn btn-ghost" href="' + P.conversion + '">The first five minutes <span class="arr" aria-hidden="true">&rarr;</span></a></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    ctaBand(
      "Let us look at your area and your numbers.",
      "Fifteen minutes with Jake. If the traffic is not your problem we will tell you that, plainly, on the call."
    );

  // ---------------------------------------------------------- CONVERSION ---
  PAGES.conversion = '' +
    '<section class="hero">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="hero-in">' +
          '<div class="pillar-no">02</div>' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#9889;</span> Conversion</span>' +
          '<h1 class="h1">The first five minutes decide who gets the job.</h1>' +
          '<p class="lede">A homeowner filling in your form is not shopping for you. They are shopping. They filled in three of them. Whoever reaches them first gets the conversation, and the other two get voicemail.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128218;</span> What the research actually found</span>' +
          '<h2 class="h2" style="margin-top:16px">This is the most measured thing in sales, and almost nobody acts on it.</h2>' +
        "</div>" +
        '<div class="grid grid-3 rv" style="margin-top:46px">' +
          '<div class="stat"><div class="n">7x</div><p class="t">More likely to qualify a lead when the first contact happens within an hour, rather than an hour later.</p></div>' +
          '<div class="stat"><div class="n">60x</div><p class="t">More likely than the companies that waited 24 hours or more to respond.</p></div>' +
          '<div class="stat"><div class="n">21x</div><p class="t">The odds of qualifying when the call goes out at five minutes rather than thirty.</p></div>' +
        "</div>" +
        '<div class="grid grid-2 rv" style="margin-top:40px">' +
          '<div class="stat"><div class="n">23%</div><p class="t">Of the companies studied never responded to the enquiry at all. Not late. Never.</p></div>' +
          '<div class="stat"><div class="n">42 hrs</div><p class="t">Average response time among the companies that did respond. Nearly two days.</p></div>' +
        "</div>" +
        '<p class="src rv">Sources: <strong>The Short Life of Online Sales Leads</strong>, Oldroyd, McElheran and Elkington, Harvard Business Review, March 2011, drawn from a study of 1.25 million sales leads across 42 companies. The five minute versus thirty minute figure is from the associated Lead Response Management research by the same lead author. We quote these because you can go and check them, which is more than can be said for most numbers on a marketing website.</p>' +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#9201;&#65039;</span> Why it is this brutal</span>' +
          '<h2 class="h2" style="margin-top:16px">Nothing about the lead decays. The attention does.</h2>' +
          '<p class="body" style="margin-top:20px">The homeowner has not changed their mind in those four hours. They have simply moved on with their day, and one of the three companies they contacted has already been friendly, useful and quick. By the time you ring, you are not competing on quality of work. You are the third call about a thing they have already half sorted.</p>' +
          '<p class="body" style="margin-top:14px">Which is why speed is not a nice extra bolted onto the ads. It is the part of the Engine that decides whether the ad spend was worth anything at all.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128736;&#65039;</span> What we do about it</span>' +
          '<h2 class="h2" style="margin-top:16px">One to five minutes, every time, including Sunday.</h2>' +
        "</div>" +
        '<div class="steps rv" style="margin-top:44px; max-width:80ch">' +
          '<div class="step">' +
            '<h3 class="h4">Minute one. A text goes out.</h3>' +
            "<p>By name, referencing the actual job they asked about. Not a generic thanks for your enquiry. It reads like a person at your company sat up and noticed, because from the homeowner's side that is exactly what happened.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">Then a call, then an email.</h3>' +
            "<p>Different people answer different channels. Somebody who ignores a call will reply to a text within a minute. We use all three rather than assuming which one they prefer.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">Then it keeps going.</h3>' +
            "<p>This is where nearly everyone quits. Two attempts and the lead is written off as rubbish. Ours keeps working across weeks, spacing out but never stopping, until they book or they tell us to stop. A lead that goes quiet for nine days is not a dead lead. It is a busy person.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">It answers the questions that stall people.</h3>' +
            "<p>How much does this roughly cost. Do you cover my area. How soon could somebody come out. Those questions kill enquiries when nobody is there to answer them at nine on a Saturday night. The system handles them, honestly, without inventing a price.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">And its only goal is the estimate.</h3>' +
            "<p>Not a chat, not a nurture sequence, not a newsletter. A time and a date on your calendar, booked around your real availability, your travel time and your days off.</p>" +
          "</div>" +
          '<div class="step">' +
            '<h3 class="h4">The moment it gets real, it hands over.</h3>' +
            "<p>It does not pretend to be you and it does not pretend to be human. When a homeowner asks something that deserves a real answer, the conversation comes straight to you with the full history attached.</p>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:56px; align-items:center">' +
          "<div>" +
            '<span class="eyebrow"><span class="em" aria-hidden="true">&#127969;</span> From the homeowner&rsquo;s side</span>' +
            '<h2 class="h2" style="margin-top:16px">Somebody got back to me in a minute.</h2>' +
            '<p class="body" style="margin-top:20px">That is the whole impression, and it is worth more than any line of ad copy. Before you have quoted anything, you are already the company that seems organised, that seems busy in the right way, that seems like it will turn up when it says it will.</p>' +
            '<p class="body" style="margin-top:14px">The other two are still getting round to it.</p>' +
          "</div>" +
          '<div class="card card-2">' +
            '<h3 class="h3">Nothing gets lost</h3>' +
            '<ul class="ticks" style="margin-top:20px">' +
              "<li>Every conversation lands in your software, attached to the lead.</li>" +
              "<li>Every missed call gets a text back before the homeowner has put the phone down.</li>" +
              "<li>Every enquiry is tagged to the ad that produced it.</li>" +
              "<li>Nothing sits in a personal inbox or a notepad on the dashboard of a truck.</li>" +
            "</ul>" +
            '<div class="btn-row" style="margin-top:26px"><a class="btn btn-ghost" href="' + P.reporting + '">Where it all lands <span class="arr" aria-hidden="true">&rarr;</span></a></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    ctaBand(
      "How fast do your leads actually get called?",
      "Most owners think it is twenty minutes. It is usually four hours. Fifteen minutes with Jake and we will work out what yours really is."
    );

  // ----------------------------------------------------------- REPORTING ---
  //
  // NOTE: this page carries NO figures anywhere, by decision. It sells the
  // transparency and the one click, not results. Every value slot is drawn as
  // a redaction bar rather than being filled with an invented number.
  PAGES.reporting = '' +
    '<section class="hero">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="hero-in">' +
          '<div class="pillar-no">03</div>' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128202;</span> Reporting</span>' +
          '<h1 class="h1">You can see everything, and it takes one click to close the loop.</h1>' +
          '<p class="lede">Custom software with your name on it. Every ad, every lead, every estimate, live, in one place. Not a PDF at the end of the month written by the people being graded.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128270;</span> Full transparency</span>' +
          '<h2 class="h2" style="margin-top:16px">Every ad running, and what each one is doing.</h2>' +
          '<p class="body" style="margin-top:20px">Not a summary. Each individual ad, named, with what it has spent, what it has brought back and how it compares to the others. If one is quietly eating budget you will see it at the same time we do.</p>' +
        "</div>" +
        '<div class="mock rv" style="margin-top:38px">' +
          '<div class="mock-bar"><i></i><i></i><i></i><b>Paid ads &middot; live</b></div>' +
          '<div class="mock-body">' +
            adHead() +
            adRow("Ad 01", "Storm damage") +
            adRow("Ad 02", "Spring offer") +
            adRow("Ad 03", "Finance angle") +
            adRow("Ad 04", "Before and after") +
          "</div>" +
        "</div>" +
        '<p class="small rv" style="margin-top:16px">An illustration of the layout. We are not going to put somebody else&rsquo;s numbers on our website and imply they are yours.</p>' +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128279;</span> The chain</span>' +
          '<h2 class="h2" style="margin-top:16px">Ad, lead, conversation, estimate, outcome.</h2>' +
          '<p class="lede" style="margin-top:18px">Every link is joined to the one before it. That is the part almost no agency can show you, and it is the only way to answer the question that actually matters.</p>' +
        "</div>" +
        '<div class="grid grid-2 rv" style="margin-top:40px; gap:20px">' +
          '<div class="card card-lift"><h3 class="h4">Every lead, tagged to its ad</h3><p class="body" style="margin-top:10px; font-size:15.5px">You are never guessing where somebody came from. The ad that produced them is on the record, permanently.</p></div>' +
          '<div class="card card-lift"><h3 class="h4">Every conversation, in full</h3><p class="body" style="margin-top:10px; font-size:15.5px">Texts, calls and emails attached to the lead. What was said, when, and what they replied.</p></div>' +
          '<div class="card card-lift"><h3 class="h4">Every estimate, on the calendar</h3><p class="body" style="margin-top:10px; font-size:15.5px">Booked appointments sit inside the same app, so the week ahead is one screen rather than three.</p></div>' +
          '<div class="card card-lift"><h3 class="h4">Every outcome, logged by you</h3><p class="body" style="margin-top:10px; font-size:15.5px">Won, lost or rescheduled, plus the job value. The one thing the software cannot know on its own.</p></div>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:56px; align-items:center">' +
          "<div>" +
            '<span class="eyebrow"><span class="em" aria-hidden="true">&#9989;</span> The one click</span>' +
            '<h2 class="h2" style="margin-top:16px">Saturday morning, about a minute.</h2>' +
            '<p class="body" style="margin-top:20px">You open the app. The week&rsquo;s estimates are listed. Next to each name are two buttons. Won or lost, then the job value. That is the entire reporting burden on your side.</p>' +
            '<p class="body" style="margin-top:14px">No spreadsheet. No form to fill in. No call with an account manager reading numbers off a screen you could have looked at yourself.</p>' +
          "</div>" +
          '<div class="mock">' +
            '<div class="mock-bar"><i></i><i></i><i></i><b>This week&rsquo;s estimates</b></div>' +
            '<div class="mock-body">' +
              '<div class="mock-row"><div class="nm">Tuesday, 9:00 am<div class="sub">from Ad 04</div></div><div class="mock-actions"><span class="mock-btn won">Won</span><span class="mock-btn">Lost</span></div></div>' +
              '<div class="mock-row"><div class="nm">Tuesday, 1:30 pm<div class="sub">from Ad 02</div></div><div class="mock-actions"><span class="mock-btn">Won</span><span class="mock-btn">Lost</span></div></div>' +
              '<div class="mock-row"><div class="nm">Wednesday, 4:00 pm<div class="sub">from Ad 01</div></div><div class="mock-actions"><span class="mock-btn">Won</span><span class="mock-btn">Lost</span></div></div>' +
              '<div class="mock-row"><div class="nm">Thursday, 8:30 am<div class="sub">from Ad 04</div></div><div class="mock-actions"><span class="mock-btn won">Won</span><span class="mock-btn">Lost</span></div></div>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="rv" style="max-width:74ch">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#128257;</span> Why that click matters more than any dashboard</span>' +
          '<h2 class="h2" style="margin-top:16px">Without it, an agency can only tell you it got you leads.</h2>' +
          '<p class="body" style="margin-top:22px">Leads are the easiest thing in this business to produce and the easiest thing to hide behind. Loosen the targeting, widen the radius, drop the qualifying question, and the lead count goes up while the business gets worse. Every report still looks like a good month.</p>' +
          '<p class="body" style="margin-top:14px">The moment you start logging outcomes, that stops working. Now every ad is judged on the jobs it produced rather than the enquiries it produced, and the ads that were quietly filling your pipeline with people who were never going to buy have nowhere to hide.</p>' +
          '<p class="body" style="margin-top:14px">It also holds us to the same standard, which is rather the point of building it this way.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="grid grid-2 rv" style="gap:44px; align-items:center">' +
          "<div>" +
            '<h2 class="h2">And the loop closes.</h2>' +
            '<p class="body" style="margin-top:18px">Those outcomes feed straight back into the traffic. Budget moves toward the ads producing won jobs and away from the ones producing conversation. That is the whole reason it is called an engine rather than a service.</p>' +
            '<div class="btn-row" style="margin-top:26px"><a class="btn btn-ghost" href="' + P.traffic + '">Back to Traffic <span class="arr" aria-hidden="true">&rarr;</span></a></div>' +
          "</div>" +
          '<div class="card card-2">' +
            '<h3 class="h3">It is yours</h3>' +
            '<ul class="ticks" style="margin-top:20px">' +
              "<li>Your logins, your team, your data.</li>" +
              "<li>Open it whenever you like, from a phone on a job site.</li>" +
              "<li>Nothing is filtered through us before you see it.</li>" +
              "<li>You are never waiting on a report to know how the month is going.</li>" +
            "</ul>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    ctaBand(
      "Let us walk you through the actual software.",
      "Not a slide deck of it. The real thing, on the call, and you can decide for yourself whether it tells you what you need to know."
    );

  // ------------------------------------------------------------- FOUNDER ---
  //
  // Jake's letter, kept as written. The only edits are the mechanism name and
  // the audience wording, so it matches the site it now sits on.
  PAGES.founder = '' +
    '<section class="hero">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="hero-in">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#9997;&#65039;</span> From the founder</span>' +
          '<h1 class="h1">Why I built the Contractor Growth Engine.</h1>' +
          '<p class="lede">Straight from me, no marketing speak. Here is what this does and why I am so confident putting it into your business.</p>' +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec band">' +
      '<div class="wrap">' +
        '<div class="letter rv">' +
          '<h2 class="h2">I need to be straight with you.</h2>' +
          "<p>Most marketing companies sell you more leads and call it a day. That is the easy part. The hard part, the part almost nobody fixes, is everything that happens after the lead comes in. The missed call while you are on a job. The quote you sent that never got a follow up. The past customer who would have booked again if anyone had reached out. That is where the money leaks out of your business, and that is exactly what I built the Contractor Growth Engine to stop.</p>" +
          "<p>I did not put this together overnight, and I did not learn it from a course. I have spent years in real sales and marketing. I have worked alongside high ticket sales teams, run high ticket email marketing, and operated those high ticket offers on five figure and six figure deals. In one 30 day stretch I drove $50,000 plus in sales through email marketing for a single client. Inside those offers I built the automations that did the heavy lifting, the instant follow up, the booking, the nurture, all the moving parts that kept running whether anyone was watching or not.</p>" +
          "<p>Then I looked at contractors and saw something obvious. Almost none of them had any of this. The owners were still buried inside their own business, answering every call themselves, chasing their own quotes, doing it all by hand. It hit me that if I took everything I learned inside those high ticket offers, the same systems and the same high level marketing, and pivoted it straight into contracting businesses, I could help them excel and scale faster than they thought was possible. So that is exactly what I built, because I know what actually moves revenue and how to capture it instead of letting it walk out the door.</p>" +
          "<p>Every single piece of this system has been built, tested, and tightened until it just works. I obsess over the details most people skip, because those details are the whole difference between a business that grows and one that stays stuck. When I install this into your company, it runs. It answers, it follows up, it books, and it brings old customers back, day and night, whether you are thinking about it or not.</p>" +
          "<p>I am this confident because I have seen what it does. If you run a contracting business and you are tired of watching opportunities you already paid for slip away, I can put this in and start scaling you fast. That is not a pitch. That is just what I do, and I take it personally.</p>" +
          "<p>Let me show you what it can do for your business.</p>" +
          '<div class="sign">' +
            '<div class="who">Jake Hauck</div>' +
            '<div class="role">CEO and Founder, Hauck Marketing</div>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec">' +
      '<div class="wrap">' +
        '<div class="rv"><span class="eyebrow"><span class="em" aria-hidden="true">&#128295;</span> The three parts</span>' +
        '<h2 class="h2" style="margin-top:16px">What actually gets installed.</h2></div>' +
        '<div class="engine rv">' + engineRow() + "</div>" +
      "</div>" +
    "</section>" +

    ctaBand(
      "Fifteen minutes, with me, not a salesperson.",
      "You will get a straight answer about whether this fits your business. If it does not, I will say so."
    );

  // ---------------------------------------------------------------- BOOK ---
  PAGES.book = '' +
    '<section class="hero" style="padding-bottom:52px">' +
      '<div class="glow"></div>' +
      '<div class="wrap">' +
        '<div class="hero-in">' +
          '<span class="eyebrow"><span class="em" aria-hidden="true">&#9742;&#65039;</span> Book a call</span>' +
          '<h1 class="h1">Fifteen minutes with the founder.</h1>' +
          '<p class="lede">We will look at your area, your average job value and how fast your leads are actually being called, then tell you plainly whether the Contractor Growth Engine fits. No pitch deck and no hard sell.</p>' +
          '<div class="chip-row" style="margin-top:28px">' +
            '<span class="chip chip-brand">15 minutes</span>' +
            '<span class="chip">Straight with Jake</span>' +
            '<span class="chip">Built for high ticket contractors</span>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</section>" +

    '<section class="sec-tight" style="padding-top:0">' +
      '<div class="wrap">' +
        '<div class="cal">' +
          '<iframe src="' + CONFIG.bookingWidget + '" title="Book a call with Hauck Marketing" scrolling="no" id="hmBooking"></iframe>' +
        "</div>" +
        '<p class="small" style="margin-top:18px">Calendar not loading? Call <a class="accent" href="' + CONFIG.phoneHref + '">' + CONFIG.phone + '</a> or email <a class="accent" href="mailto:' + CONFIG.email + '">' + CONFIG.email + "</a>.</p>" +
      "</div>" +
    "</section>";

  // =========================================================================
  // WIRE: behaviour, per page
  // =========================================================================
  function wire(root, page) {
    var reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}

    /* ---------- footer year ---------- */
    var y = root.querySelector("#hmYear");
    if (y) y.textContent = String(new Date().getFullYear());

    /* ---------- mobile nav ---------- */
    (function () {
      var hdr = root.querySelector("#hmHdr");
      var burger = root.querySelector("#hmBurger");
      var nav = root.querySelector("#hmNav");
      if (!hdr || !burger || !nav) return;
      burger.addEventListener("click", function () {
        var open = hdr.classList.toggle("open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      nav.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          hdr.classList.remove("open");
          burger.setAttribute("aria-expanded", "false");
        });
      });
    })();

    /* ---------- same-page anchors ----------
       The header is sticky, so a raw anchor jump buries the heading underneath
       it. Offset by the header height instead. */
    root.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var id = a.getAttribute("href").slice(1);
        if (!id) return;
        var target = root.querySelector("#" + id);
        if (!target) return;
        ev.preventDefault();
        var hdr = root.querySelector("#hmHdr");
        var off = hdr ? hdr.getBoundingClientRect().height : 0;
        var top = target.getBoundingClientRect().top + window.pageYOffset - off - 8;
        window.scrollTo({ top: top, behavior: reduce ? "auto" : "smooth" });
      });
    });

    /* ---------- reveal on scroll ---------- */
    (function () {
      var items = root.querySelectorAll(".rv");
      if (!items.length) return;
      if (reduce || !("IntersectionObserver" in window)) {
        items.forEach(function (el) { el.classList.add("in"); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          io.unobserve(e.target);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
      items.forEach(function (el) { io.observe(el); });
    })();

    /* ---------- FAQ: one open at a time ---------- */
    (function () {
      var all = root.querySelectorAll(".faq details");
      if (!all.length) return;
      all.forEach(function (d) {
        d.addEventListener("toggle", function () {
          if (!d.open) return;
          all.forEach(function (o) { if (o !== d) o.open = false; });
        });
      });
    })();

    /* ---------- booking widget ----------
       GHL's embed script is what sizes the booking iframe to its content.
       Without it the calendar renders in a fixed box and scrolls internally.
       Loaded only on the page that needs it, and only once. */
    if (page === "book" && !document.querySelector("script[data-hm-booking]")) {
      var s = document.createElement("script");
      s.src = CONFIG.bookingEmbedJs;
      s.setAttribute("data-hm-booking", "1");
      s.async = true;
      document.body.appendChild(s);
    }
  }

  // =========================================================================
  // MOUNT + BOOT
  // =========================================================================
  function mount(root, page) {
    // Injected at runtime rather than carried in a <link> or <style> tag,
    // because GoHighLevel's builder strips <link> out of custom code blocks.
    // The @import inside STYLES is how the fonts survive that.
    if (!document.querySelector("style[data-hm-site]")) {
      var style = document.createElement("style");
      style.setAttribute("data-hm-site", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    root.innerHTML = header(page) + "\n" + PAGES[page] + "\n" + footer(page);
    wire(root, page);
  }

  // GHL can run this script before its own markup lands, and can render the
  // same block twice on a page. Wait for the root, then refuse to mount twice.
  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) { setTimeout(boot, 50); return; }
      // Five seconds and no mount point. The page will sit blank, so say why
      // rather than leaving a black screen with a silent console.
      console.error(
        '[hauck] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        "The GHL step needs BOTH lines of the stub: the div and the script tag."
      );
      return;
    }
    if (root.getAttribute("data-hm-ready")) return;
    root.setAttribute("data-hm-ready", "1");

    var page = (root.getAttribute("data-page") || "").trim();
    if (!PAGES[page]) {
      // A typo in the stub should not leave a blank page in front of a visitor.
      if (page) console.warn('[hauck] unknown data-page "' + page + '", drawing ' + DEFAULT_PAGE);
      page = DEFAULT_PAGE;
    }

    mount(root, page);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
