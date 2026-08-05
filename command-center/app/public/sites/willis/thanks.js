// WILLIS WINDOWS — the thank-you page for the ads quote funnel.
//
// GoHighLevel holds a two-line stub (see
// "willis-windows-landing/thank-you-quote.html"). This is the page quote.js
// redirects to after a lead posts successfully.
//
// WHY IT IS ITS OWN GHL STEP rather than the card quote.js can already draw
// in place: a redirect gives the Meta pixel a URL that ONLY a completed lead
// can reach, which is what a conversion event needs. A card swapped in on the
// same URL cannot be counted.
//
// It says nothing the funnel has not earned. It knows a lead was submitted and
// nothing else: no name, no price, no appointment time. Anyone landing here by
// pasting the URL sees the same thing, which is the correct outcome.
//
// NO NAME IS PASSED THROUGH THE URL. Greeting them by name would mean putting
// a real person's details in a query string, where they end up in browser
// history, the referrer header and GHL's own analytics.
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.

(function () {
  "use strict";

  // No phone number here, on purpose (Jake, 2026-08-05). The page's whole job
  // is to confirm the lead and let the pixel count it. A call button invites a
  // conversion Meta cannot see, off a page that only converts once.
  var CONFIG = {
    logoWebp: "https://app.hauckmarketing.com/sites/willis/logo.webp",
    logoPng: "https://app.hauckmarketing.com/sites/willis/logo.png",
    photo: "https://app.hauckmarketing.com/sites/willis/pole.webp"
  };

  var ROOT_ID = "wwt";

  // What happens next, in the order it happens. Only claims Willis's own
  // documented process supports: they look the home up, they quote a flat
  // price on the phone, and they do not upcharge at the door.
  //
  // Deliberately NOT here: any promise about how fast somebody calls, or the
  // five-day driveway guarantee. The guarantee is recorded as pending ops
  // sign-off, and a thank-you page is a bad place to invent an SLA that the
  // two people doing every job then have to keep.
  var NEXT = [
    { n: "1", t: "We look up your home", d: "So the price you hear is based on your actual windows, not a guess." },
    { n: "2", t: "We call you with a flat price", d: "One number, on the phone. No upcharges at the door." },
    { n: "3", t: "We book you in", d: "You pick the day. Your $100 off is already on it." }
  ];

  // NOTE: this whole block is a JS template literal. A backtick anywhere in
  // it, including inside a CSS comment, silently ends the string and the file
  // stops parsing.
  //
  // The tokens, the !important discipline and the wrapper flattening are the
  // same as quote.js, and for the same reasons. See the long comments there.
  var STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');

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

#wwt *, #wwt *::before, #wwt *::after { box-sizing:border-box !important; }

#wwt {
  --navy:#183E63;
  --navy-deep:#0F2A45;
  --steel:#4291BC;
  --sky:#65BDE5;
  --gold:#FFC72C;
  --gold-hi:#FFD455;
  --ink:#14293D;
  --slate:#51657A;
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

  width:100% !important;
  max-width:100% !important;
  margin:0 !important;
  position:relative !important;
  padding:0 !important;
  overflow-x:hidden !important;
  background-color:var(--navy-deep) !important;
  min-height:100vh !important;
}

#wwt img { border:0 !important; }

#wwt .wq-bg {
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

#wwt .wq-page {
  position:relative !important; z-index:1 !important;
  width:100% !important; max-width:640px !important;
  margin:0 auto !important;
  padding:clamp(22px,4vw,40px) clamp(18px,5vw,28px) clamp(40px,7vw,64px) !important;
}

#wwt .wq-top { display:flex !important; justify-content:center !important; margin:0 0 clamp(18px,3vw,26px) !important; padding:0 !important; }
#wwt .wq-logo {
  display:block !important;
  width:clamp(76px,14vw,96px) !important; height:clamp(76px,14vw,96px) !important;
  border-radius:50% !important; object-fit:cover !important;
  box-shadow:0 10px 30px -12px rgba(0,0,0,.55) !important;
}

#wwt .wq-card {
  background:var(--white) !important; border:0 !important;
  border-radius:var(--radius) !important; box-shadow:var(--shadow) !important;
  padding:clamp(24px,5vw,34px) !important; margin:0 !important;
  text-align:center !important;
}
#wwt .wq-mark {
  display:flex !important; align-items:center !important; justify-content:center !important;
  width:66px !important; height:66px !important; border-radius:50% !important;
  margin:0 auto 18px !important;
  background:#EAF3F9 !important; color:var(--steel) !important;
}
#wwt h1 {
  font-family:var(--display) !important; font-weight:800 !important;
  font-size:clamp(1.6rem,5.4vw,2.15rem) !important;
  line-height:1.14 !important; letter-spacing:-.02em !important;
  color:var(--navy-deep) !important; text-transform:none !important;
  text-align:center !important;
  margin:0 0 10px !important; padding:0 !important;
}
#wwt .wq-lede {
  font-family:var(--body) !important; font-size:1.02rem !important; font-weight:400 !important;
  line-height:1.6 !important; color:var(--slate) !important;
  text-align:center !important; max-width:40ch !important;
  margin:0 auto !important; padding:0 !important;
}

/* what happens next */
#wwt .wq-next { list-style:none !important; margin:26px 0 0 !important; padding:0 !important; text-align:left !important; }
#wwt .wq-next li {
  display:flex !important; align-items:flex-start !important; gap:14px !important;
  margin:0 !important; padding:14px 0 !important;
  border-top:1px solid rgba(24,62,99,.13) !important;
  list-style:none !important;
}
#wwt .wq-next li:first-child { border-top:0 !important; padding-top:4px !important; }
#wwt .wq-next__n {
  flex:0 0 30px !important; width:30px !important; height:30px !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  border-radius:50% !important;
  background:var(--wash) !important; color:var(--steel) !important;
  font-family:var(--display) !important; font-weight:800 !important; font-size:.86rem !important;
  margin-top:2px !important;
}
#wwt .wq-next__t {
  display:block !important;
  font-family:var(--display) !important; font-weight:700 !important; font-size:1.01rem !important;
  letter-spacing:-.01em !important; color:var(--navy-deep) !important;
  text-align:left !important; text-transform:none !important;
  margin:0 0 2px !important; padding:0 !important;
}
#wwt .wq-next__d {
  display:block !important;
  font-family:var(--body) !important; font-weight:400 !important; font-size:.92rem !important;
  line-height:1.5 !important; color:var(--slate) !important;
  text-align:left !important;
  margin:0 !important; padding:0 !important;
}

/* No .wq-btn or .wq-fine here any more: the call button is gone and there is
   nothing else on this page for a homeowner to click. --gold and --gold-hi are
   kept in the tokens above so the two files stay one palette. */

#wwt .wq-chips {
  display:flex !important; flex-wrap:wrap !important; justify-content:center !important;
  gap:8px !important; list-style:none !important;
  margin:clamp(18px,3vw,24px) 0 0 !important; padding:0 !important;
}
#wwt .wq-chips li {
  display:inline-flex !important; align-items:center !important; gap:7px !important;
  font-family:var(--body) !important; font-size:.82rem !important; font-weight:600 !important;
  color:#DCEDF8 !important;
  background:rgba(101,189,229,.12) !important;
  border:1px solid rgba(101,189,229,.42) !important;
  border-radius:999px !important;
  padding:7px 13px !important; margin:0 !important;
  list-style:none !important;
}
#wwt .wq-chips svg { flex:0 0 14px !important; color:var(--sky) !important; }

#wwt .wq-in { animation:wwtIn .3s cubic-bezier(.22,1,.36,1) both; }
@keyframes wwtIn { from { opacity:0; transform:translateY(9px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) {
  #wwt .wq-in { animation:none !important; }
}
#wwt :focus-visible { outline:3px solid var(--sky) !important; outline-offset:3px !important; }
`;

  var TICK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5 6 12l7.5-8"/></svg>';
  var DONE = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17l7 7L27 9"/></svg>';
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function view() {
    var steps = NEXT.map(function (s) {
      return '<li><span class="wq-next__n">' + esc(s.n) + "</span><span>" +
        '<span class="wq-next__t">' + esc(s.t) + "</span>" +
        '<span class="wq-next__d">' + esc(s.d) + "</span></span></li>";
    }).join("");

    return '' +
      '<div class="wq-bg"></div>' +
      '<div class="wq-page wq-in">' +
        '<div class="wq-top">' +
          "<picture>" +
            '<source srcset="' + esc(CONFIG.logoWebp) + '" type="image/webp">' +
            '<img class="wq-logo" src="' + esc(CONFIG.logoPng) + '" width="96" height="96" alt="Willis Windows">' +
          "</picture>" +
        "</div>" +
        '<div class="wq-card">' +
          '<span class="wq-mark">' + DONE + "</span>" +
          "<h1>You are in.</h1>" +
          '<p class="wq-lede">We have your details and your $100 off is locked to them. Here is what happens next.</p>' +
          '<ul class="wq-next">' + steps + "</ul>" +
        "</div>" +
        '<ul class="wq-chips">' +
          "<li>" + TICK + "Fully insured</li>" +
          "<li>" + TICK + "60+ five-star reviews</li>" +
          "<li>" + TICK + "The owners do every job</li>" +
        "</ul>" +
      "</div>";
  }

  // Same reasoning as quote.js: inline !important beats any theme rule without
  // having to guess its selector, and it is what lets #wwt be width:100%
  // instead of measuring the viewport.
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
    if (!document.querySelector("style[data-ww-thanks]")) {
      var style = document.createElement("style");
      style.setAttribute("data-ww-thanks", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    flattenWrappers(root);
    root.style.setProperty("--wq-photo", 'url("' + CONFIG.photo + '")');
    root.innerHTML = view();
  }

  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) { setTimeout(boot, 50); return; }
      console.error(
        '[willis/thanks] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        "The GHL step needs BOTH lines of the stub: the div and the script tag."
      );
      return;
    }
    if (root.getAttribute("data-wwt-ready")) return;
    root.setAttribute("data-wwt-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
