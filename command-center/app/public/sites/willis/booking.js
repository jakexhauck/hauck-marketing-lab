// WILLIS WINDOWS — the booking step, between the survey and the thank-you.
//
// GoHighLevel holds a two-line stub (see "willis-windows-landing/book.html").
//
// WHERE IT SITS
//   quote.js (5 steps) -> POSTs the lead to GHL -> HERE -> thanks.js
//
//   The lead is already in GHL before anyone reaches this page. That is the
//   point of the ordering: somebody who opens the calendar, sees no time they
//   like and closes the tab is still a lead Willis can ring, rather than
//   nothing at all. Nothing on this page needs to save anything.
//
// WHAT IT DRAWS
//   The funnel's own chrome (logo, headline, white card, trust chips) wrapped
//   around GHL's booking widget in an iframe. The widget is GHL's, so the
//   times, the timezone and the booking itself are all GHL's business. This
//   file owns the frame around it and the prefill going into it.
//
// PREFILL COMES FROM sessionStorage, NOT THE QUERY STRING.
//   quote.js writes the lead under CONFIG.handoffKey the moment GHL accepts
//   it. Both pages are on williswindows.com, so same-origin sessionStorage
//   simply works, and no real person's phone number lands in browser history,
//   a referrer header or GHL's page analytics.
//
//   Empty storage is a graceful outcome, not a break. Somebody who pastes this
//   URL, or whose browser has storage switched off, gets the same calendar and
//   types their details into it themselves.
//
// THE HEIGHT IS THE FRAGILE PART. The iframe has no height of its own: GHL's
// form_embed.js listens for a postMessage from inside the widget and sets one.
// If that script fails to load, or GHL changes the message, the calendar would
// be clipped to nothing. So the iframe carries a floor height that is enough
// to use on its own, and form_embed.js only ever grows it from there. A page
// that is slightly too tall is survivable; a calendar with no times visible is
// not.
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.

(function () {
  "use strict";

  var CONFIG = {
    logoWebp: "https://app.hauckmarketing.com/sites/willis/logo.webp",
    logoPng: "https://app.hauckmarketing.com/sites/willis/logo.png",
    photo: "https://app.hauckmarketing.com/sites/willis/pole.webp",

    // Jake's calendar, from the embed code GHL generated.
    calendarId: "Jlr88qZDp0Sth1H5Sjzf",
    widgetBase: "https://link.hauckmarketing.com/widget/booking/",

    // GHL's own resize script. Without it the iframe never grows past the
    // floor below, so the calendar is usable but may need scrolling inside a
    // frame that cannot scroll. With it, the frame fits its contents.
    embedScript: "https://link.hauckmarketing.com/js/form_embed.js",

    // The floor, in px. Enough for the month grid and a column of times on a
    // phone. form_embed.js grows it; nothing shrinks it.
    minHeight: 760,

    // Written by quote.js. Same string on both sides or the prefill silently
    // does nothing.
    handoffKey: "ww_lead_v1",

    // WHERE THEY GO AFTER BOOKING IS SET IN GHL, NOT HERE.
    //
    // The calendar's own "redirect after booking" setting must point at
    // https://williswindows.com/thank-you-quote. This page cannot do it: the
    // booking happens inside a cross-origin iframe, and the parent is not told
    // when it succeeds in any way worth trusting.
    //
    // If that setting is left empty, GHL shows its own confirmation inside the
    // iframe. The lead is safe and the appointment is real, but the homeowner
    // never reaches the thank-you page and the Meta pixel never fires.
    thankYouUrl: "https://williswindows.com/thank-you-quote"
  };

  var ROOT_ID = "wwb";

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

#wwb *, #wwb *::before, #wwb *::after { box-sizing:border-box !important; }

#wwb {
  --navy:#183E63;
  --navy-deep:#0F2A45;
  --steel:#4291BC;
  --sky:#65BDE5;
  --gold:#FFC72C;
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

#wwb img { border:0 !important; }

#wwb .wq-bg {
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

#wwb .wq-page {
  position:relative !important; z-index:1 !important;
  width:100% !important; max-width:720px !important;
  margin:0 auto !important;
  padding:clamp(22px,4vw,40px) clamp(18px,5vw,28px) clamp(40px,7vw,64px) !important;
}

#wwb .wq-top { display:flex !important; justify-content:center !important; margin:0 0 clamp(16px,2.6vw,22px) !important; padding:0 !important; }
#wwb .wq-logo {
  display:block !important;
  width:clamp(68px,12vw,84px) !important; height:clamp(68px,12vw,84px) !important;
  border-radius:50% !important; object-fit:cover !important;
  box-shadow:0 10px 30px -12px rgba(0,0,0,.55) !important;
}

/* The green tick and "your details are saved" line. Somebody who has just
   filled in five steps and been handed ANOTHER page needs telling, in the
   first second, that the work they did was not thrown away. */
#wwb .wq-saved {
  display:flex !important; align-items:center !important; justify-content:center !important;
  gap:8px !important;
  font-family:var(--body) !important;
  font-size:.86rem !important; font-weight:600 !important;
  color:#BEE3D2 !important;
  text-align:center !important;
  margin:0 0 12px !important; padding:0 !important;
}
#wwb .wq-saved svg { flex:0 0 15px !important; color:#5FCf9B !important; }

#wwb h1 {
  font-family:var(--display) !important; font-weight:800 !important;
  font-size:clamp(1.6rem,5.4vw,2.3rem) !important;
  line-height:1.12 !important; letter-spacing:-.02em !important;
  color:var(--white) !important; text-transform:none !important;
  text-align:center !important;
  margin:0 0 10px !important; padding:0 !important;
  text-shadow:0 2px 18px rgba(6,20,34,.5);
}
#wwb .wq-sub {
  font-family:var(--body) !important;
  font-size:clamp(.98rem,3.4vw,1.06rem) !important; font-weight:500 !important;
  color:#C8DCEC !important; text-align:center !important;
  max-width:42ch !important;
  margin:0 auto clamp(18px,3vw,26px) !important; padding:0 !important;
}

#wwb .wq-card {
  background:var(--white) !important; border:0 !important;
  border-radius:var(--radius) !important; box-shadow:var(--shadow) !important;
  /* Tight padding on purpose. GHL's widget draws its own generous margins, and
     doubling them wastes the fold on a phone. */
  padding:clamp(10px,2vw,16px) !important;
  margin:0 !important;
  overflow:hidden !important;
}

#wwb .wq-cal {
  display:block !important;
  width:100% !important; max-width:100% !important;
  border:0 !important; margin:0 !important; padding:0 !important;
  background:transparent !important;
  /* See the header note: this is a FLOOR, not a height. form_embed.js only
     ever grows it. */
  min-height:760px !important;
}

/* The three promises, under the calendar rather than above it: above, they
   push the times below the fold, which is the one thing this page must not
   do. */
#wwb .wq-promise {
  list-style:none !important;
  display:flex !important; flex-wrap:wrap !important; justify-content:center !important;
  gap:8px !important;
  margin:clamp(18px,3vw,24px) 0 0 !important; padding:0 !important;
}
#wwb .wq-promise li {
  display:inline-flex !important; align-items:center !important; gap:7px !important;
  font-family:var(--body) !important; font-size:.82rem !important; font-weight:600 !important;
  color:#DCEDF8 !important;
  background:rgba(101,189,229,.12) !important;
  border:1px solid rgba(101,189,229,.42) !important;
  border-radius:999px !important;
  padding:7px 13px !important; margin:0 !important;
  list-style:none !important;
}
#wwb .wq-promise svg { flex:0 0 14px !important; color:var(--sky) !important; }

#wwb .wq-in { animation:wwbIn .3s cubic-bezier(.22,1,.36,1) both; }
@keyframes wwbIn { from { opacity:0; transform:translateY(9px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) {
  #wwb .wq-in { animation:none !important; }
}
#wwb :focus-visible { outline:3px solid var(--sky) !important; outline-offset:3px !important; }
`;

  var TICK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5 6 12l7.5-8"/></svg>';
  var SAVED = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5 6 12l7.5-8"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // What quote.js left behind, or null. Never throws: a browser with storage
  // switched off must still get a calendar.
  function lead() {
    try {
      var raw = sessionStorage.getItem(CONFIG.handoffKey);
      if (!raw) return null;
      var v = JSON.parse(raw);
      return v && typeof v === "object" ? v : null;
    } catch (e) {
      return null;
    }
  }

  // GHL's widget reads prefill off the query string. Both spellings go in
  // because GHL has shipped both over the years and an unrecognised parameter
  // is simply ignored, whereas a missing one costs a homeowner three fields
  // they have already typed.
  function widgetUrl() {
    var url = CONFIG.widgetBase + CONFIG.calendarId;
    var who = lead();
    if (!who) return url;

    var q = new URLSearchParams();
    if (who.first_name) { q.set("first_name", who.first_name); q.set("firstName", who.first_name); }
    if (who.last_name) { q.set("last_name", who.last_name); q.set("lastName", who.last_name); }
    if (who.email) q.set("email", who.email);
    // E.164 rather than the pretty version: this is a number GHL has to dial.
    var tel = who.phone_e164 || who.phone || "";
    if (tel) { q.set("phone", tel); q.set("phone_number", tel); }

    var qs = q.toString();
    return qs ? url + "?" + qs : url;
  }

  function view() {
    var who = lead();
    var first = who && who.first_name ? String(who.first_name).trim() : "";

    // Named only if the name came from this browser's own session. It is not
    // in the URL, so it cannot be spoofed by sending somebody a link.
    var heading = first
      ? esc(first) + ", pick a time for your call."
      : "Pick a time for your call.";

    return '' +
      '<div class="wq-bg"></div>' +
      '<div class="wq-page wq-in">' +
        '<div class="wq-top">' +
          "<picture>" +
            '<source srcset="' + esc(CONFIG.logoWebp) + '" type="image/webp">' +
            '<img class="wq-logo" src="' + esc(CONFIG.logoPng) + '" width="84" height="84" alt="Willis Windows">' +
          "</picture>" +
        "</div>" +
        '<p class="wq-saved">' + SAVED + "Your details are saved</p>" +
        "<h1>" + heading + "</h1>" +
        // Fifteen minutes, matching the calendar's own "15 min Phone
        // Appointment". A page that promises ten and then shows a widget
        // saying fifteen loses the trust it just spent five steps building.
        '<p class="wq-sub">Pick a slot and we will ring you then with a flat price for your windows. About fifteen minutes, and nobody comes to the house.</p>' +
        '<div class="wq-card">' +
          '<iframe class="wq-cal" id="wwbCal" title="Pick a time for your estimate call" ' +
            'src="' + esc(widgetUrl()) + '" allow="payment" scrolling="no"></iframe>' +
        "</div>" +
        '<ul class="wq-promise">' +
          "<li>" + TICK + "Free, over the phone</li>" +
          "<li>" + TICK + "A flat price, not a range</li>" +
          "<li>" + TICK + "No door knocks</li>" +
        "</ul>" +
      "</div>";
  }

  // Same reasoning as quote.js: inline !important beats any theme rule without
  // having to guess its selector.
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

  function loadEmbedScript() {
    if (document.querySelector('script[data-ww-embed]')) return;
    var s = document.createElement("script");
    s.setAttribute("data-ww-embed", "1");
    s.type = "text/javascript";
    s.src = CONFIG.embedScript;
    s.onerror = function () {
      // Not fatal. The iframe keeps its floor height and the calendar is still
      // usable; it just will not shrink-wrap its contents.
      console.warn("[willis/book] GHL form_embed.js did not load, so the calendar keeps its fallback height.");
    };
    document.body.appendChild(s);
  }

  // A backstop for the height, independent of form_embed.js. GHL's widget
  // posts its own height out of the iframe; if the official script is blocked
  // by an ad blocker (which happens, on the exact traffic that arrives from an
  // ad) this still grows the frame. Anything it does not recognise is ignored,
  // and it never SHRINKS below the floor.
  function listenForHeight(frame) {
    window.addEventListener("message", function (e) {
      if (typeof e.origin !== "string" || e.origin.indexOf("link.hauckmarketing.com") === -1) return;

      var d = e.data;
      var h = 0;
      if (d && typeof d === "object") h = parseInt(d.height || d.docHeight || 0, 10);
      else if (typeof d === "string" && d.indexOf("height") !== -1) {
        var m = d.match(/(\d{3,5})/);
        if (m) h = parseInt(m[1], 10);
      }

      if (h > CONFIG.minHeight && h < 6000) {
        frame.style.setProperty("height", h + "px", "important");
      }
    });
  }

  function mount(root) {
    if (!document.querySelector("style[data-ww-book]")) {
      var style = document.createElement("style");
      style.setAttribute("data-ww-book", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    flattenWrappers(root);
    root.style.setProperty("--wq-photo", 'url("' + CONFIG.photo + '")');
    root.innerHTML = view();

    var frame = root.querySelector("#wwbCal");
    if (frame) listenForHeight(frame);
    loadEmbedScript();
  }

  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) { setTimeout(boot, 50); return; }
      console.error(
        '[willis/book] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        "The GHL step needs BOTH lines of the stub: the div and the script tag."
      );
      return;
    }
    if (root.getAttribute("data-wwb-ready")) return;
    root.setAttribute("data-wwb-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
