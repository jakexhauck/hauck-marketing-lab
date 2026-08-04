// WILLIS WINDOWS — the Facebook ads quote funnel, served rather than pasted.
//
// GoHighLevel holds a two-line stub (see "willis-windows-landing/quote.html").
// Everything the funnel IS lives here, so every question, the webhook and the
// thank-you page ship by deploy and nobody reopens the GHL builder.
//
// WHAT IT DOES
//   One page, five steps, one card. Cold traffic off a Facebook ad.
//     1. Do you live in Metro Detroit?      Yes / No   -> No ENDS IT.
//     2. What best describes your home?     stories
//     3. What is your timeline?             ASAP .. 3 months+
//     4. Address, with the reason we want it said out loud.
//     5. Name, phone, email -> POST to GHL -> thank-you.
//   Tapping a choice advances on its own. There is no NEXT button to hunt for
//   on a phone, which is where nearly all of this traffic lands.
//
// "No" on step 1 is an automatic disqualification (Jake, 2026-08-04). The
// funnel stops on a card, no lead is posted, and no contact is created. Willis
// covers roughly 30 miles of Metro Detroit and a lead they cannot drive to is
// worse than no lead: it burns a call slot and looks like a no-show.
//
// THE LOOK IS NOT INVENTED. Every colour, font and radius below is lifted off
// the live williswindows.com, whose whole site is a .ww-scope custom-code block
// inside GHL. That block is NOT in this repo, so if anyone edits it there, the
// two drift apart and this file has to be re-matched by hand.
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not. This is served from
// app.hauckmarketing.com and rendered on the GHL domain, so it is always
// cross-origin.

(function () {
  "use strict";

  // =========================================================================
  // CONFIG — the two empty strings below are the whole wiring job.
  // =========================================================================
  var CONFIG = {
    phone: "(313) 405-3227",
    phoneHref: "tel:+13134053227",

    // Served from this same folder so the funnel owns its own assets. The live
    // site loads its logo off GHL's CDN; borrowing that URL would mean a lead
    // page that breaks the day somebody re-uploads a file in the builder.
    logoWebp: "https://app.hauckmarketing.com/sites/willis/logo.webp",
    logoPng: "https://app.hauckmarketing.com/sites/willis/logo.png",

    // A real Willis crew member on a water-fed pole. Not stock, which their
    // brand notes rule out by name.
    photo: "https://app.hauckmarketing.com/sites/willis/pole.webp",

    offer: "$100 Off Residential Window Cleaning!",

    // Where the lead goes: a GHL inbound webhook on the Willis sub-account.
    //
    // While this is EMPTY the last step refuses to pretend. It says plainly
    // that it could not send and shows the phone number, rather than showing a
    // thank-you over a lead that went nowhere. Willis's own website form used
    // to do the opposite and every request was silently lost.
    //
    // TO CONNECT: add an inbound webhook trigger to a GHL workflow, paste its
    // URL here and deploy.
    //
    // DO NOT reuse the one on the old news-channel landing page
    // (.../webhook-trigger/7f254ff9-...). Ad leads and news-channel leads
    // arriving on the same trigger cannot be told apart afterwards.
    webhookUrl: "",

    // Where they land after a successful submit.
    //
    // While this is EMPTY the funnel shows its own thank-you card in place and
    // nothing navigates. That is deliberate: a redirect to a page that does not
    // exist loses the confirmation, and williswindows.com/thank-you is a soft
    // 404 today. It answers 200 with an empty body, so a status check on it
    // lies.
    //
    // TO CONNECT: build a thank-you step for THIS funnel and paste its URL.
    // Give it its own path rather than reusing /thank-you-news-channel, so the
    // Meta pixel fires a conversion on a URL only this funnel can reach.
    thankYouUrl: ""
  };

  var ROOT_ID = "wwq";

  // =========================================================================
  // THE QUESTIONS
  // =========================================================================
  // Jake's wording, in Jake's order. The keys are what GHL receives, so
  // renaming one silently changes the shape of every lead after the deploy.
  var STEPS = [
    {
      key: "metro_detroit",
      kind: "choice",
      q: "Do you live in Metro Detroit?",
      options: [
        { v: "Yes" },
        { v: "No", dq: true }
      ]
    },
    {
      key: "home_type",
      kind: "choice",
      q: "What best describes your home?",
      // Stories, not property type. It is what actually sets the price and the
      // risk on a window job, and two and three-storey work is Willis's flex.
      options: [
        { v: "One story / ranch", icon: "one" },
        { v: "Two stories", icon: "two" },
        { v: "Three stories or more", icon: "three" },
        { v: "Condo or townhome", icon: "condo" }
      ]
    },
    {
      key: "timeline",
      kind: "choice",
      q: "What is your timeline for the window cleaning?",
      options: [
        { v: "ASAP" },
        { v: "Within a week" },
        { v: "Within a month" },
        { v: "3 months or more" }
      ]
    },
    {
      key: "address",
      kind: "address",
      q: "What is the address we would be cleaning?",
      // Jake asked for the reason to be said out loud before the field. People
      // hand over an address far more readily when they are told it buys them a
      // price on the phone instead of a salesman on the doorstep.
      why: "We look up your home before we call, so you get a real price on the phone instead of a rough range. Nobody turns up at your door to guess.",
      placeholder: "Street address, city, ZIP"
    },
    {
      key: "contact",
      kind: "contact",
      q: "Last step. Where do we send your price?"
    }
  ];

  var TOTAL = STEPS.length;

  // =========================================================================
  // STYLES
  // =========================================================================
  // NOTE: this whole block is a JS template literal. A backtick anywhere in
  // it, including inside a CSS comment, silently ends the string and the file
  // stops parsing. Use plain quotes. (This has already bitten site.js once.)
  //
  // Every rule is scoped to #wwq because GHL's theme CSS reaches into custom
  // blocks. The handful of unscoped rules at the top are GHL's own wrappers,
  // which is the point of them.
  //
  // THE !important IS NOT DECORATION. GHL themes ship their own button, input
  // and paragraph rules carrying !important, so an unweighted reset LOSES and
  // the submit button renders as tracked-out capitals. The catch, learned the
  // hard way on the Made Better funnel: once the reset is !important it also
  // flattens our own margins, so every element that wants spacing has to
  // restate it at the same weight. That is why the spacing below is loud.
  var STYLES = `
/* @import rather than a <link> tag: GHL's builder strips <link> elements out
   of custom code blocks, which silently drops the fonts. */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');

/* GHL wraps the block in its own padded column. Flatten what it is known to
   render; flattenWrappers() below walks the ancestors it is not. */
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

#wwq *, #wwq *::before, #wwq *::after { box-sizing:border-box !important; }

#wwq {
  /* Lifted verbatim off the live williswindows.com .ww-scope block. */
  --navy:#183E63;
  --navy-deep:#0F2A45;
  --steel:#4291BC;
  --steel-press:#357da4;
  --sky:#65BDE5;
  --gold:#FFC72C;
  --gold-hi:#FFD455;
  --ink:#14293D;
  --slate:#51657A;      /* 4.9:1 on white */
  --line:rgba(24,62,99,.13);
  --wash:#F4F8FB;
  --white:#fff;
  --display:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --body:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --radius:18px;
  --shadow:0 24px 60px -28px rgba(15,42,69,.55);

  display:block !important;
  font-family:var(--body) !important;
  color:var(--ink) !important;
  font-size:17px !important;
  line-height:1.6 !important;
  text-align:left !important;
  -webkit-font-smoothing:antialiased;

  /* Fill whatever GHL wrapper this lands in, and let flattenWrappers() below
     widen those wrappers to the viewport with inline !important, which no
     stylesheet can outrank.
     NOT the 100vw breakout the Made Better funnel uses. 100vw counts the
     vertical scrollbar, so it needs the real width measured into a custom
     property, and the measurement is circular: the card growing is what
     summons the scrollbar, which changes the width, which resizes the card.
     Measured at 1920 on the short first step, it stayed 1920 after the
     scrollbar appeared and pushed 8px of the page off the right edge, and
     correcting it can flip the scrollbar back and oscillate. Width that is
     always 100% of something cannot drift, and if a wrapper ever refuses to
     widen, the funnel renders narrow instead of scrolling sideways. */
  width:100% !important;
  max-width:100% !important;
  margin:0 !important;
  position:relative !important;
  padding:0 !important;
  overflow-x:hidden !important;

  background-color:var(--navy-deep) !important;
  /* Without this the navy stops at the bottom of the card and the rest of the
     screen is the GHL page's own white, which reads as a half-loaded page.
     100vh rather than 100dvh: dvh shrinks as mobile Safari's toolbar slides
     away, and the backdrop visibly resizing under a fixed card looks broken. */
  min-height:100vh !important;
}

/* GHL themes are entitled to put a border on every image, and one of them
   does. A red frame around the logo is not a look Willis chose. */
#wwq img { border:0 !important; }

/* ---------------------------------------------------------------- backdrop */
/* The photo carries the navy gradient on top of it at the same angle the
   website's hero uses, so a visitor arriving from an ad lands somewhere that
   looks like the same company. background-color underneath means a failed
   image degrades to plain navy rather than to white text on white. */
#wwq .wq-bg {
  position:absolute !important; inset:0 !important;
  background-color:var(--navy-deep) !important;
  background-image:
    linear-gradient(105deg, rgba(15,42,69,.95) 0%, rgba(15,42,69,.86) 45%, rgba(24,62,99,.68) 100%),
    var(--wq-photo);
  background-size:cover, cover !important;
  background-position:center, 52% 68% !important;
  background-repeat:no-repeat, no-repeat !important;
  z-index:0 !important;
  pointer-events:none !important;
}

#wwq .wq-page {
  position:relative !important;
  z-index:1 !important;
  width:100% !important;
  max-width:640px !important;
  margin:0 auto !important;
  padding:clamp(22px,4vw,40px) clamp(18px,5vw,28px) clamp(40px,7vw,64px) !important;
  min-height:100% !important;
}

/* ------------------------------------------------------------------ header */
/* No nav, no phone bar, no footer links. This is paid traffic: the only two
   things worth doing on the page are answering it or calling. */
#wwq .wq-top {
  display:flex !important; justify-content:center !important;
  margin:0 0 clamp(18px,3vw,26px) !important; padding:0 !important;
}
#wwq .wq-logo {
  display:block !important;
  width:clamp(76px,14vw,96px) !important;
  height:clamp(76px,14vw,96px) !important;
  /* The logo file is a round badge on a navy square. Circle-cropping it means
     the square never shows as a slightly-wrong navy patch on the gradient. */
  border-radius:50% !important;
  object-fit:cover !important;
  box-shadow:0 10px 30px -12px rgba(0,0,0,.55) !important;
}

/* ------------------------------------------------------------------- offer */
#wwq .wq-offer {
  font-family:var(--display) !important;
  font-weight:800 !important;
  font-size:clamp(1.75rem,6.2vw,2.6rem) !important;
  line-height:1.1 !important;
  letter-spacing:-.02em !important;
  color:var(--white) !important;
  text-align:center !important;
  text-transform:none !important;
  margin:0 0 12px !important;
  padding:0 !important;
  text-shadow:0 2px 18px rgba(6,20,34,.5);
}
#wwq .wq-offer b { color:var(--gold) !important; font-weight:800 !important; }
#wwq .wq-sub {
  font-family:var(--body) !important;
  font-size:clamp(.98rem,3.4vw,1.06rem) !important;
  font-weight:500 !important;
  color:#C8DCEC !important;
  text-align:center !important;
  max-width:34ch !important;
  margin:0 auto clamp(20px,3.5vw,28px) !important;
  padding:0 !important;
}

/* -------------------------------------------------------------------- card */
#wwq .wq-card {
  background:var(--white) !important;
  border:0 !important;
  border-radius:var(--radius) !important;
  box-shadow:var(--shadow) !important;
  padding:clamp(20px,4.5vw,30px) !important;
  margin:0 !important;
  overflow:hidden !important;
}

/* ---------------------------------------------------------------- progress */
#wwq .wq-prog { margin:0 0 clamp(18px,3.4vw,24px) !important; padding:0 !important; }
#wwq .wq-prog__bar {
  height:6px !important; width:100% !important;
  background:#E3EBF2 !important; border-radius:999px !important;
  overflow:hidden !important; margin:0 0 9px !important; padding:0 !important;
}
#wwq .wq-prog__fill {
  display:block !important; height:100% !important;
  background:linear-gradient(90deg,var(--steel),var(--sky)) !important;
  border-radius:999px !important;
  transition:width .32s cubic-bezier(.4,0,.2,1) !important;
}
#wwq .wq-prog__txt {
  font-family:var(--display) !important;
  font-size:.72rem !important; font-weight:700 !important;
  letter-spacing:.14em !important; text-transform:uppercase !important;
  color:var(--steel) !important;
  text-align:center !important;
  margin:0 !important; padding:0 !important;
}

/* --------------------------------------------------------------- questions */
#wwq .wq-q {
  font-family:var(--display) !important;
  font-weight:800 !important;
  font-size:clamp(1.28rem,4.6vw,1.6rem) !important;
  line-height:1.2 !important;
  letter-spacing:-.02em !important;
  color:var(--navy-deep) !important;
  text-transform:none !important;
  /* Stated rather than inherited. GHL themes centre headings with !important,
     and a layout that only works because the current theme happens to agree
     with it is a layout that breaks when Willis changes theme. */
  text-align:center !important;
  margin:0 0 clamp(14px,2.6vw,20px) !important;
  padding:0 !important;
}
#wwq .wq-why {
  font-family:var(--body) !important;
  font-size:.94rem !important; font-weight:400 !important;
  line-height:1.55 !important;
  color:var(--slate) !important;
  background:var(--wash) !important;
  border-left:3px solid var(--sky) !important;
  border-radius:0 10px 10px 0 !important;
  padding:12px 14px !important;
  margin:0 0 16px !important;
  /* Left, not centred: this is four lines of reasoning, and centred ragged
     text is measurably slower to read. */
  text-align:left !important;
}
#wwq .wq-why b {
  font-family:var(--display) !important; font-weight:700 !important;
  color:var(--navy) !important;
}

/* ----------------------------------------------------------------- choices */
#wwq .wq-opts { display:grid !important; gap:10px !important; margin:0 !important; padding:0 !important; }
#wwq .wq-opt {
  display:flex !important; align-items:center !important; gap:13px !important;
  width:100% !important;
  font-family:var(--display) !important;
  font-size:1.02rem !important; font-weight:700 !important;
  letter-spacing:-.01em !important; text-transform:none !important;
  text-align:left !important;
  color:var(--navy-deep) !important;
  background:var(--white) !important;
  border:2px solid #DDE6EE !important;
  border-radius:12px !important;
  padding:15px 16px !important;
  margin:0 !important;
  cursor:pointer !important;
  transition:border-color .15s ease, background .15s ease, transform .12s ease !important;
  -webkit-appearance:none !important; appearance:none !important;
}
#wwq .wq-opt:hover { border-color:var(--steel) !important; background:var(--wash) !important; }
#wwq .wq-opt:active { transform:scale(.99) !important; }
#wwq .wq-opt.is-picked { border-color:var(--steel) !important; background:#EAF3F9 !important; }
#wwq .wq-opt__lbl { flex:1 1 auto !important; }
#wwq .wq-opt__ico { flex:0 0 34px !important; width:34px !important; height:34px !important; color:var(--steel) !important; }
#wwq .wq-opt__go { flex:0 0 auto !important; width:9px !important; height:15px !important; color:#9FB4C6 !important; }
#wwq .wq-opt:hover .wq-opt__go { color:var(--steel) !important; }

/* ------------------------------------------------------------------ fields */
#wwq .wq-field { margin:0 0 13px !important; padding:0 !important; }
#wwq .wq-label {
  display:block !important;
  font-family:var(--display) !important;
  font-size:.8rem !important; font-weight:700 !important;
  letter-spacing:.02em !important; text-transform:none !important;
  color:var(--navy-deep) !important;
  text-align:left !important;
  margin:0 0 6px !important; padding:0 !important;
}
#wwq .wq-input {
  /* max-width is not redundant. GHL themes clamp inputs (one ships
     max-width:300px !important), and width:100% loses to it silently: the
     field looks right on a phone, where the card is under 300px anyway, and
     only goes stumpy on desktop. */
  display:block !important; width:100% !important; max-width:100% !important;
  font-family:var(--body) !important;
  /* 16px is the floor. Anything smaller and iOS Safari zooms the page in on
     focus and never zooms back out. */
  font-size:16px !important; font-weight:500 !important;
  line-height:1.4 !important;
  color:var(--ink) !important;
  background:#FBFDFE !important;
  border:2px solid #DDE6EE !important;
  border-radius:11px !important;
  padding:13px 14px !important;
  margin:0 !important;
  text-transform:none !important;
  -webkit-appearance:none !important; appearance:none !important;
  transition:border-color .15s ease, box-shadow .15s ease !important;
}
/* #6C7F91 clears 4.5:1 on #FBFDFE. The obvious grey does not, and placeholder
   text is still text. */
#wwq .wq-input::placeholder { color:#6C7F91 !important; opacity:1 !important; }
#wwq .wq-input:focus {
  outline:none !important;
  border-color:var(--steel) !important;
  box-shadow:0 0 0 4px rgba(66,145,188,.16) !important;
}
#wwq .wq-input.is-bad {
  border-color:#C0392B !important;
  box-shadow:0 0 0 4px rgba(192,57,43,.12) !important;
}

/* ----------------------------------------------------------------- buttons */
#wwq .wq-btn {
  display:flex !important; align-items:center !important; justify-content:center !important;
  gap:9px !important; width:100% !important;
  font-family:var(--display) !important;
  font-size:1.05rem !important; font-weight:800 !important;
  letter-spacing:-.01em !important; text-transform:none !important;
  line-height:1.25 !important;
  color:#10202E !important;
  background:var(--gold) !important;
  border:2px solid transparent !important;
  border-radius:11px !important;
  padding:16px 20px !important;
  margin:16px 0 0 !important;
  cursor:pointer !important;
  box-shadow:0 12px 26px -14px rgba(255,199,44,.75) !important;
  transition:background .16s ease, transform .16s ease !important;
  -webkit-appearance:none !important; appearance:none !important;
}
#wwq .wq-btn:hover { background:var(--gold-hi) !important; transform:translateY(-2px) !important; }
#wwq .wq-btn:disabled { opacity:.62 !important; cursor:default !important; transform:none !important; }

#wwq .wq-back {
  display:inline-flex !important; align-items:center !important; gap:7px !important;
  width:auto !important;
  font-family:var(--display) !important;
  font-size:.86rem !important; font-weight:700 !important;
  letter-spacing:0 !important; text-transform:none !important;
  color:var(--slate) !important;
  background:none !important; border:0 !important; border-radius:6px !important;
  padding:8px 2px !important; margin:14px 0 0 !important;
  cursor:pointer !important;
  -webkit-appearance:none !important; appearance:none !important;
}
#wwq .wq-back:hover { color:var(--navy) !important; }

/* ------------------------------------------------------------------ errors */
#wwq .wq-err {
  font-family:var(--body) !important;
  font-size:.9rem !important; font-weight:500 !important;
  color:#B03024 !important;
  text-align:left !important;
  margin:12px 0 0 !important; padding:0 !important;
}
#wwq .wq-err a { color:#B03024 !important; text-decoration:underline !important; font-weight:700 !important; }
#wwq .wq-fine {
  font-family:var(--body) !important;
  font-size:.8rem !important; font-weight:400 !important;
  line-height:1.5 !important;
  color:var(--slate) !important;
  text-align:center !important;
  margin:12px 0 0 !important; padding:0 !important;
}

/* ------------------------------------------------------------- end screens */
#wwq .wq-end { text-align:center !important; padding:6px 0 2px !important; margin:0 !important; }
#wwq .wq-end__mark {
  display:flex !important; align-items:center !important; justify-content:center !important;
  width:62px !important; height:62px !important;
  border-radius:50% !important;
  margin:0 auto 16px !important;
  background:#EAF3F9 !important; color:var(--steel) !important;
}
#wwq .wq-end--dq .wq-end__mark { background:var(--wash) !important; color:var(--slate) !important; }
#wwq .wq-end h2 {
  font-family:var(--display) !important; font-weight:800 !important;
  font-size:clamp(1.35rem,4.8vw,1.7rem) !important;
  line-height:1.18 !important; letter-spacing:-.02em !important;
  color:var(--navy-deep) !important; text-transform:none !important;
  margin:0 0 10px !important; padding:0 !important;
}
#wwq .wq-end p {
  font-family:var(--body) !important; font-size:1rem !important; font-weight:400 !important;
  line-height:1.6 !important; color:var(--slate) !important;
  max-width:38ch !important; margin:0 auto 10px !important; padding:0 !important;
}
#wwq .wq-end a {
  color:var(--steel) !important; font-weight:700 !important;
  text-decoration:underline !important;
}

/* ------------------------------------------------------------------- chips */
#wwq .wq-chips {
  display:flex !important; flex-wrap:wrap !important; justify-content:center !important;
  gap:8px !important;
  list-style:none !important;
  margin:clamp(18px,3vw,24px) 0 0 !important; padding:0 !important;
}
#wwq .wq-chips li {
  display:inline-flex !important; align-items:center !important; gap:7px !important;
  font-family:var(--body) !important;
  font-size:.82rem !important; font-weight:600 !important;
  color:#DCEDF8 !important;
  background:rgba(101,189,229,.12) !important;
  border:1px solid rgba(101,189,229,.42) !important;
  border-radius:999px !important;
  padding:7px 13px !important; margin:0 !important;
}
#wwq .wq-chips svg { flex:0 0 14px !important; color:var(--sky) !important; }

/* ------------------------------------------------------------------ motion */
#wwq .wq-slot { animation:wqIn .26s cubic-bezier(.22,1,.36,1) both; }
@keyframes wqIn { from { opacity:0; transform:translateY(9px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) {
  #wwq .wq-slot { animation:none !important; }
  #wwq .wq-prog__fill { transition:none !important; }
  #wwq .wq-btn:hover, #wwq .wq-opt:active { transform:none !important; }
}

#wwq :focus-visible { outline:3px solid var(--sky) !important; outline-offset:3px !important; }
#wwq .wq-sr {
  position:absolute !important; width:1px !important; height:1px !important;
  overflow:hidden !important; clip:rect(0 0 0 0) !important; white-space:nowrap !important;
}
`;

  // =========================================================================
  // ICONS
  // =========================================================================
  // Stroke shapes rather than emoji: emoji render as a different font on every
  // platform and one of them is always the wrong colour.
  function svg(inner, w, h) {
    return '<svg class="wq-opt__ico" viewBox="0 0 ' + (w || 32) + ' ' + (h || 32) +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner + "</svg>";
  }

  var ICONS = {
    // A wide, low ranch.
    one: svg('<path d="M4 15 16 7l12 8"/><path d="M7 15v10h18V15"/><rect x="11" y="18" width="4" height="4"/><rect x="17" y="18" width="4" height="4"/>'),
    // Two rows of windows.
    two: svg('<path d="M4 13 16 5l12 8"/><path d="M7 13v14h18V13"/><rect x="10.5" y="15.5" width="4" height="4"/><rect x="17.5" y="15.5" width="4" height="4"/><rect x="10.5" y="22" width="4" height="4"/><rect x="17.5" y="22" width="4" height="4"/>'),
    // Taller, narrower, three rows.
    three: svg('<path d="M6 11 16 4l10 7"/><path d="M8.5 11v17h15V11"/><rect x="11" y="13" width="3.6" height="3.6"/><rect x="17.4" y="13" width="3.6" height="3.6"/><rect x="11" y="18.6" width="3.6" height="3.6"/><rect x="17.4" y="18.6" width="3.6" height="3.6"/><rect x="11" y="24.2" width="3.6" height="3.6"/><rect x="17.4" y="24.2" width="3.6" height="3.6"/>'),
    // A block with a shared wall.
    condo: svg('<path d="M4 28h24"/><path d="M6 28V10h10v18"/><path d="M16 28V15h10v13"/><rect x="8.5" y="13" width="3" height="3"/><rect x="8.5" y="19" width="3" height="3"/><rect x="18.5" y="18" width="3" height="3"/><rect x="18.5" y="23" width="3" height="3"/>'),
    chev: '<svg class="wq-opt__go" viewBox="0 0 9 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 1.5 7 7.5l-5.5 6"/></svg>',
    back: '<svg viewBox="0 0 9 15" width="7" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 1.5 2 7.5l5.5 6"/></svg>',
    tick: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5 6 12l7.5-8"/></svg>',
    done: '<svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17l7 7L27 9"/></svg>',
    pin: '<svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 29s10-8.4 10-16a10 10 0 1 0-20 0c0 7.6 10 16 10 16Z"/><circle cx="16" cy="13" r="3.6"/></svg>'
  };

  // =========================================================================
  // HELPERS
  // =========================================================================
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // =========================================================================
  // VIEWS
  // =========================================================================
  function shell() {
    return '' +
      '<div class="wq-bg"></div>' +
      '<div class="wq-page">' +
        '<div class="wq-top">' +
          '<picture>' +
            '<source srcset="' + esc(CONFIG.logoWebp) + '" type="image/webp">' +
            '<img class="wq-logo" src="' + esc(CONFIG.logoPng) + '" width="96" height="96" alt="Willis Windows">' +
          '</picture>' +
        '</div>' +
        '<h1 class="wq-offer">' + esc(CONFIG.offer) + '</h1>' +
        '<p class="wq-sub">Answer a few quick questions and we will call you with a real price.</p>' +
        '<div class="wq-card">' +
          '<div class="wq-prog" id="wwqProg">' +
            '<span class="wq-prog__bar"><span class="wq-prog__fill" id="wwqFill" style="width:20%"></span></span>' +
            '<p class="wq-prog__txt" id="wwqStepTxt">Step 1 of ' + TOTAL + '</p>' +
          '</div>' +
          '<div id="wwqSlot" aria-live="polite"></div>' +
        '</div>' +
        '<ul class="wq-chips">' +
          '<li>' + ICONS.tick + 'Fully insured</li>' +
          '<li>' + ICONS.tick + '60+ five-star reviews</li>' +
          '<li>' + ICONS.tick + 'The owners do every job</li>' +
        '</ul>' +
      '</div>';
  }

  function backBtn() {
    return '<button type="button" class="wq-back" data-back>' + ICONS.back + 'Back</button>';
  }

  function choiceView(step, i) {
    var opts = step.options.map(function (o, n) {
      return '<button type="button" class="wq-opt" data-pick="' + n + '">' +
        (o.icon ? ICONS[o.icon] : "") +
        '<span class="wq-opt__lbl">' + esc(o.v) + "</span>" +
        ICONS.chev +
        "</button>";
    }).join("");

    return '<div class="wq-slot">' +
      '<h2 class="wq-q">' + esc(step.q) + "</h2>" +
      '<div class="wq-opts" role="group" aria-label="' + esc(step.q) + '">' + opts + "</div>" +
      (i > 0 ? backBtn() : "") +
      "</div>";
  }

  function addressView(step) {
    return '<div class="wq-slot">' +
      '<h2 class="wq-q">' + esc(step.q) + "</h2>" +
      '<p class="wq-why"><b>Why we ask:</b> ' + esc(step.why) + "</p>" +
      '<form novalidate>' +
        '<div class="wq-field">' +
          '<label class="wq-label" for="wwqAddr">Home address</label>' +
          '<input class="wq-input" id="wwqAddr" name="address" type="text" autocomplete="street-address" ' +
            'placeholder="' + esc(step.placeholder) + '" enterkeyhint="next">' +
        "</div>" +
        '<button type="submit" class="wq-btn">Continue</button>' +
      "</form>" +
      backBtn() +
      "</div>";
  }

  function contactView(step) {
    return '<div class="wq-slot">' +
      '<h2 class="wq-q">' + esc(step.q) + "</h2>" +
      '<form novalidate>' +
        '<div class="wq-field">' +
          '<label class="wq-label" for="wwqName">Your name</label>' +
          '<input class="wq-input" id="wwqName" name="name" type="text" autocomplete="name" placeholder="First and last name">' +
        "</div>" +
        '<div class="wq-field">' +
          '<label class="wq-label" for="wwqPhone">Phone number</label>' +
          '<input class="wq-input" id="wwqPhone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(313) 555-0142">' +
        "</div>" +
        '<div class="wq-field">' +
          '<label class="wq-label" for="wwqEmail">Email</label>' +
          '<input class="wq-input" id="wwqEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" enterkeyhint="send">' +
        "</div>" +
        '<button type="submit" class="wq-btn">Get My $100 Off Quote</button>' +
        '<p class="wq-fine">We call you with your price. No door knocks, no pressure.</p>' +
      "</form>" +
      backBtn() +
      "</div>";
  }

  // Out of area. No form, nothing posted, no contact created.
  //
  // The phone number is here on purpose even though the rest of the page has
  // none: the 30-mile line is a circle drawn on a map and somebody sitting just
  // outside it is often still worth a truck. Better they call and hear a
  // straight answer than be told nothing at all.
  function dqView() {
    return '<div class="wq-slot wq-end wq-end--dq">' +
      '<span class="wq-end__mark">' + ICONS.pin + "</span>" +
      "<h2>We are Metro Detroit only, for now.</h2>" +
      "<p>Willis Windows runs out of Metro Detroit and covers about 30 miles from there. We would rather say so now than take your details and never call.</p>" +
      '<p>Close to the line? Call <a href="' + esc(CONFIG.phoneHref) + '">' + esc(CONFIG.phone) + "</a> and we will tell you straight.</p>" +
      "</div>";
  }

  // Shown when CONFIG.thankYouUrl is empty. A funnel that submits successfully
  // and then sits there looks broken, and the lead is already in GHL by this
  // point, so there is nothing to apologise for.
  function doneView() {
    return '<div class="wq-slot wq-end">' +
      '<span class="wq-end__mark">' + ICONS.done + "</span>" +
      "<h2>You are in.</h2>" +
      "<p>We have your details. Expect a call from Willis Windows with your price, and your $100 off is on it.</p>" +
      '<p>Rather not wait? Call <a href="' + esc(CONFIG.phoneHref) + '">' + esc(CONFIG.phone) + "</a>.</p>" +
      "</div>";
  }

  // =========================================================================
  // WIRING
  // =========================================================================
  function wire(root) {
    var slot = root.querySelector("#wwqSlot");
    var fill = root.querySelector("#wwqFill");
    var stepTxt = root.querySelector("#wwqStepTxt");
    var prog = root.querySelector("#wwqProg");

    var at = 0;
    var answers = {};

    // ---------------------------------------------------------- attribution
    // Everything the ad platform hung on the URL, handed straight back to GHL.
    // Without fbclid and the utm_ set there is no way to tell which creative
    // paid for a booked job, which is the entire point of running the ads.
    var TRACKED = [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "fbclid", "gclid", "ad_id", "adset_id", "campaign_id", "ref"
    ];

    function attribution() {
      var out = {};
      try {
        var q = new URLSearchParams(window.location.search);
        TRACKED.forEach(function (k) {
          var v = q.get(k);
          if (v) out[k] = v;
        });
      } catch (e) {}
      return out;
    }

    // ---------------------------------------------------------------- paint
    function showProgress(on) {
      if (prog) prog.style.setProperty("display", on ? "block" : "none", "important");
    }

    function render() {
      var step = STEPS[at];
      showProgress(true);
      if (fill) fill.style.width = Math.round(((at + 1) / TOTAL) * 100) + "%";
      if (stepTxt) stepTxt.textContent = "Step " + (at + 1) + " of " + TOTAL;

      if (step.kind === "choice") slot.innerHTML = choiceView(step, at);
      else if (step.kind === "address") slot.innerHTML = addressView(step);
      else slot.innerHTML = contactView(step);

      bind();
    }

    function end(html) {
      showProgress(false);
      slot.innerHTML = html;
      // The card can be below the fold on a small phone by the last step.
      // Without this the end screen renders off-screen and reads as a page
      // that did nothing.
      try { root.querySelector(".wq-card").scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    }

    // ---------------------------------------------------------------- input
    // (313) 405-3227 as they type. Ten digits max, and anything that is not a
    // digit is dropped, so a pasted "+1 313-405-3227" still lands correctly.
    function formatPhone(v) {
      var d = String(v || "").replace(/\D/g, "");
      if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
      d = d.slice(0, 10);
      if (d.length <= 3) return d;
      if (d.length <= 6) return "(" + d.slice(0, 3) + ") " + d.slice(3);
      return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
    }

    // Deliberately loose. This gates a quote request, not a payment: turning
    // away a real homeowner over an unusual address format costs far more than
    // one scruffy record.
    function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
    function looksLikePhone(v) { return String(v).replace(/\D/g, "").length >= 10; }

    function showErr(form, message) {
      var err = form.querySelector(".wq-err");
      if (!err) {
        err = document.createElement("p");
        err.className = "wq-err";
        err.setAttribute("role", "alert");
        form.appendChild(err);
      }
      err.innerHTML = message;
    }

    function reject(form, el, message) {
      if (el) {
        el.classList.add("is-bad");
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      }
      showErr(form, message);
      return false;
    }

    // ----------------------------------------------------------------- send
    function encode(payload) {
      var params = new URLSearchParams();
      Object.keys(payload).forEach(function (k) {
        params.append(k, payload[k] == null ? "" : String(payload[k]));
      });
      return params;
    }

    function payload(name, phone, email) {
      // Split on the last space so "Mary Anne Willis" keeps its first name
      // whole. GHL matches and de-duplicates on first_name / last_name, and
      // full_name goes too because some GHL actions take a single field.
      var parts = String(name).trim().split(/\s+/);
      var lastName = parts.length > 1 ? parts.pop() : "";
      var firstName = parts.join(" ");

      var body = {
        first_name: firstName,
        last_name: lastName,
        full_name: String(name).trim(),
        name: String(name).trim(),
        phone: phone,
        email: email,
        address: answers.address || "",
        metro_detroit: answers.metro_detroit || "",
        home_type: answers.home_type || "",
        timeline: answers.timeline || "",
        offer: CONFIG.offer,
        source: "Willis Windows Facebook ads funnel",
        page_url: window.location.href,
        referrer: document.referrer || ""
      };

      var who = attribution();
      Object.keys(who).forEach(function (k) { body[k] = who[k]; });
      return body;
    }

    // --------------------------------------------------------------- events
    function bind() {
      var step = STEPS[at];

      var backEl = slot.querySelector("[data-back]");
      if (backEl) {
        backEl.addEventListener("click", function () {
          if (at > 0) { at--; render(); }
        });
      }

      if (step.kind === "choice") {
        slot.querySelectorAll("[data-pick]").forEach(function (el) {
          el.addEventListener("click", function () {
            var opt = step.options[+el.dataset.pick];
            answers[step.key] = opt.v;

            // A picked state that is never seen is not worth drawing. Hold it
            // just long enough to register as a confirmation, then advance.
            el.classList.add("is-picked");

            if (opt.dq) {
              setTimeout(function () { end(dqView()); }, 190);
              return;
            }
            setTimeout(function () {
              if (at < TOTAL - 1) { at++; render(); }
            }, 190);
          });
        });
        return;
      }

      var form = slot.querySelector("form");
      if (!form) return;

      // Clearing the marker the moment they start fixing it keeps the red from
      // following them around while they type.
      form.querySelectorAll(".wq-input").forEach(function (el) {
        el.addEventListener("input", function () { el.classList.remove("is-bad"); });
      });

      if (step.kind === "address") {
        var addr = form.querySelector("#wwqAddr");
        if (answers.address) addr.value = answers.address;
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var v = (addr.value || "").trim();
          // A street number is the one thing that separates an address from a
          // city name, and a city name cannot be quoted from.
          if (v.length < 6 || !/\d/.test(v)) {
            return reject(form, addr, "Please add the full street address, including the number.");
          }
          answers.address = v;
          at++;
          render();
        });
        return;
      }

      // Contact.
      var nameEl = form.querySelector("#wwqName");
      var phoneEl = form.querySelector("#wwqPhone");
      var emailEl = form.querySelector("#wwqEmail");
      var btn = form.querySelector("button[type=submit]");
      var btnLabel = btn.textContent;

      if (answers._name) nameEl.value = answers._name;
      if (answers._phone) phoneEl.value = answers._phone;
      if (answers._email) emailEl.value = answers._email;

      phoneEl.addEventListener("input", function () {
        var pos = phoneEl.selectionStart === phoneEl.value.length;
        phoneEl.value = formatPhone(phoneEl.value);
        if (pos) {
          try { phoneEl.setSelectionRange(phoneEl.value.length, phoneEl.value.length); } catch (e) {}
        }
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();

        var name = (nameEl.value || "").trim();
        var phone = (phoneEl.value || "").trim();
        var email = (emailEl.value || "").trim();

        // Checked in the order they appear, so focus lands on the first thing
        // wrong rather than jumping down the form.
        if (name.length < 2) return reject(form, nameEl, "Please add your name.");
        if (!looksLikePhone(phone)) return reject(form, phoneEl, "Please add a phone number we can reach you on.");
        if (!looksLikeEmail(email)) return reject(form, emailEl, "Please check your email address.");

        // Kept so Back does not wipe what they typed.
        answers._name = name;
        answers._phone = phone;
        answers._email = email;

        // The webhook is the only thing that makes this real. Without it we say
        // so. A thank-you shown over a lead that went nowhere is worse than no
        // form at all: the homeowner stops expecting a call that is never
        // coming, and Willis never learns the job existed.
        if (!CONFIG.webhookUrl) {
          return reject(form, null,
            'This form is not connected yet, so that did not send. Please call Willis Windows on <a href="' +
            esc(CONFIG.phoneHref) + '">' + esc(CONFIG.phone) + "</a>.");
        }

        btn.disabled = true;
        btn.textContent = "Sending…";

        // An ordinary CORS fetch, so res.ok is real: GHL answers with
        // "access-control-allow-origin: *", and a lead GHL did not accept must
        // not be answered with a thank-you. Form-encoded rather than JSON,
        // which keeps it a simple request and skips the preflight round trip.
        fetch(CONFIG.webhookUrl, {
          method: "POST",
          body: encode(payload(name, phone, email)),
          keepalive: true
        }).then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          if (CONFIG.thankYouUrl) {
            window.location.href = CONFIG.thankYouUrl;
            return;
          }
          end(doneView());
        }).catch(function () {
          btn.disabled = false;
          btn.textContent = btnLabel;
          showErr(form,
            'That did not send. Please call Willis Windows on <a href="' +
            esc(CONFIG.phoneHref) + '">' + esc(CONFIG.phone) + "</a>.");
        });
      });
    }

    render();
  }

  // =========================================================================
  // MOUNT + BOOT
  // =========================================================================
  // GHL is free to nest a step one level deeper or rename a div, so its
  // padding and its centred max-width can sit somewhere no named rule knows to
  // look. Whatever stands between the mount point and <body> is GHL's chrome:
  // its padding is not ours to inherit, and its 1140px column is not a width
  // this page agreed to.
  //
  // Inline styles carrying !important are the top of the cascade, so this
  // beats any theme rule without having to guess its selector, and it is what
  // lets #wwq simply be width:100% instead of measuring the viewport.
  function flattenWrappers(root) {
    for (var n = root.parentElement; n && n !== document.body; n = n.parentElement) {
      n.style.setProperty("padding", "0", "important");
      n.style.setProperty("margin-top", "0", "important");
      n.style.setProperty("margin-bottom", "0", "important");
      n.style.setProperty("margin-left", "0", "important");
      n.style.setProperty("margin-right", "0", "important");
      n.style.setProperty("max-width", "none", "important");
      n.style.setProperty("width", "100%", "important");
    }
  }

  function mount(root) {
    if (!document.querySelector("style[data-ww-quote]")) {
      var style = document.createElement("style");
      style.setAttribute("data-ww-quote", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    flattenWrappers(root);

    // The photo goes in as a custom property rather than in the stylesheet so
    // the URL stays in CONFIG with everything else that is swappable.
    root.style.setProperty("--wq-photo", 'url("' + CONFIG.photo + '")');

    root.innerHTML = shell();
    wire(root);

    // No resize listener and no ResizeObserver, on purpose. Nothing here is
    // measured, so there is nothing to keep in sync when a phone rotates or a
    // scrollbar appears: the CSS is percentages and viewport units, and the
    // browser recalculates those itself.
  }

  // GHL can run this script before its own markup lands, and can render the
  // same block twice on a page. Wait for the root, then refuse to mount twice.
  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) { setTimeout(boot, 50); return; }
      console.error(
        '[willis/quote] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        "The GHL step needs BOTH lines of the stub: the div and the script tag."
      );
      return;
    }
    if (root.getAttribute("data-wwq-ready")) return;
    root.setAttribute("data-wwq-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
