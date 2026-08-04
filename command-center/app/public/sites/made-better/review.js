// MADE BETTER LC — the review funnel, served rather than pasted.
//
// GoHighLevel holds a two-line stub (see "Made Better LC Website/review.html").
// Everything the funnel IS lives here, so the Google review link, the webhook
// and every word ship by deploy and nobody reopens the GHL builder.
//
// WHAT IT DOES
//   One page, three views, nothing navigates away except the Google redirect.
//     1. Five stars, one tap.
//     2. 4 or 5  -> straight to the Google review page.
//        1, 2, 3 -> a feedback panel opens IN PLACE, below the stars.
//     3. Either path ends on a thank-you view.
//
// It is deliberately NOT an eighth page inside site.js. A funnel wants no nav
// and no footer, it should not pull 120KB of website to ask one question, and
// editing it must not be able to break the seven live pages.
//
// It is ANONYMOUS on purpose (Jake, 2026-08-04). The link is handed out by QR
// code and in person rather than sent from a workflow, so there is no contact
// to attach and no name, phone or email is asked for. The webhook receives a
// rating and a paragraph. Nothing else exists to send.
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
    phone: "(313) 506-9238",
    phoneHref: "tel:+13135069238",
    logo: "https://drive.google.com/thumbnail?id=1B6zy3IkzRzR4NK3KmoNosWk4N1FBV1jB&sz=w400",

    // Where 4 and 5 star ratings go. Google My Business is still in
    // verification, so this is empty and NOTHING REDIRECTS: the happy path
    // ends on a thank-you card instead. A five-star tap that visibly does
    // nothing reads as a broken page, which is a poor way to treat the only
    // customers who wanted to praise you.
    //
    // TO CONNECT: paste the "write a review" link from the Google Business
    // Profile here and deploy. The same tap then redirects instead. Nothing
    // else changes.
    googleReviewUrl: "",

    // Where 1 to 3 star feedback goes: a GHL inbound webhook.
    //
    // While this is EMPTY the form refuses to pretend. It says plainly that it
    // could not send and shows the phone number, rather than showing a
    // thank-you over a complaint that went nowhere. The website's estimate
    // form used to do the opposite and every request was silently lost.
    //
    // TO CONNECT: add an inbound webhook trigger to a GHL workflow, paste its
    // URL here and deploy.
    //
    // NOTE THE SUB-ACCOUNT: r0WfsA12qpBv7M185V3v is the TEST account, not Made
    // Better's. Fine while nothing is published, but a real customer's
    // complaint sent here lands somewhere Seamus does not look. Swap this for
    // Made Better's own inbound webhook before the funnel goes in front of
    // anyone.
    webhookUrl: "https://services.leadconnectorhq.com/hooks/r0WfsA12qpBv7M185V3v/webhook-trigger/4f0f08da-35ab-44ab-b336-0ceafcfae3c8",

    // 4 and above goes to Google. Everything below it opens the feedback panel.
    googleThreshold: 4
  };

  var ROOT_ID = "mbr";

  // What sits under the stars as they are hovered, and after one is chosen.
  var LABELS = ["Poor", "Not great", "Okay", "Good", "Excellent"];

  // =========================================================================
  // STYLES
  // =========================================================================
  // NOTE: this whole block is a JS template literal. A backtick anywhere in
  // it, including inside a CSS comment, silently ends the string and the file
  // stops parsing. Use plain quotes. (This has already bitten site.js once.)
  //
  // Every rule is scoped to #mbr because GHL's theme CSS reaches into custom
  // blocks. The handful of unscoped rules at the top are GHL's own wrappers,
  // which is the point of them.
  var STYLES = `
/* @import rather than a <link> tag: GHL's builder strips <link> elements out
   of custom code blocks, which silently drops the fonts. */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');

/* ============================================================================
   MADE BETTER LC — review funnel

   The palette, type and button language are the website's, so a customer who
   just left madebetterlc.com does not feel handed off to a survey tool: basalt
   green, brass, warm stone, Plus Jakarta Sans over Inter.

   Colour rules carried over from site.js, both of which were real contrast
   bugs there:
     - Brass #C8974B is a FILL colour, not a text colour. It reads 2.63:1 on
       white. Text uses --brass-text, which clears 4.5:1.
     - A filled star is a shape, so it needs 3:1 rather than 4.5:1. The fill
       alone does not reach it, so every star carries a --brass-text stroke
       and the boundary clears comfortably on white.
   ========================================================================= */

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

#mbr *, #mbr *::before, #mbr *::after{ box-sizing:border-box; }

#mbr{
  --ink:#0E1311;          /* basalt: headings */
  --brass:#C8974B;        /* the accent, as a FILL */
  --brass-text:#876633;   /* the same brass, at text contrast */
  --brass-2:#B5843A;      /* pressed / hover */
  --moss:#4E6B54;
  --paper:#FFFFFF;
  --wash:#F7F6F2;
  --line:#E6E3DA;
  --body:#3D4642;
  --muted:#5C665F;        /* 4.5:1 on white and on --wash */
  --star-empty:#8C857A;   /* 3.4:1 on white: an empty star is still a shape */
  --radius:14px;

  margin:0; background:var(--wash); color:var(--body);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:17px; line-height:1.65; -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}

/* Viewport breakout: edge to edge no matter what the GHL row is set to.
   Measured in --vw rather than the 100vw unit, because 100vw INCLUDES the
   vertical scrollbar and the page it sits in does not. The difference is
   about 8 to 15px of horizontal scroll on every desktop browser with a
   classic scrollbar, which on a centred card reads as the page wobbling
   sideways. --vw is set from clientWidth in sizeToViewport() and kept current
   on resize; the 100vw fallback only applies if the script is somehow gone. */
#mbr{
  width:var(--vw, 100vw) !important; max-width:var(--vw, 100vw) !important;
  position:relative; left:50%; right:50%;
  margin-left:calc(var(--vw, 100vw) / -2) !important;
  margin-right:calc(var(--vw, 100vw) / -2) !important;
}

/* GHL's theme styles reach into custom blocks, and they carry !important.
   These resets have to as well, or the theme simply wins.

   This is not theoretical. Against a builder theme that sets
   "button{text-transform:uppercase!important;letter-spacing:2px!important;
   margin:8px!important}" and "textarea{max-width:300px!important}", the
   unweighted version of this block rendered SEND IT TO SEAMUS in tracked-out
   capitals next to a 300px-wide feedback box, and the button's forced 8px
   margins on top of width:100% pushed the card wide enough to scroll the page
   sideways. Specificity does not beat !important; only !important does. */
#mbr button{
  margin:0 !important; text-transform:none !important; letter-spacing:normal !important;
  line-height:normal !important; font-family:inherit !important; width:auto;
}
#mbr textarea{
  margin:0 !important; max-width:none !important; min-width:0 !important;
  box-shadow:none !important; font-family:inherit !important;
  text-transform:none !important; letter-spacing:normal !important;
}
#mbr p{ margin:0 !important; }
#mbr h1, #mbr h2{ text-transform:none !important; }
#mbr img{ display:block; max-width:100%; }
#mbr a{ color:var(--brass-text); text-decoration:underline; text-underline-offset:2px; }

#mbr h1, #mbr h2{
  font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
  color:var(--ink); margin:0; font-weight:800; letter-spacing:-.02em; line-height:1.14;
}

/* ===== STAGE =====
   A soft brass bloom behind the card, so a single centred card on a flat wash
   does not read as an unstyled form. */
#mbr .stage{
  min-height:100vh; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  padding:48px 20px; position:relative; isolation:isolate;
}
#mbr .stage::before{
  content:''; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:
    radial-gradient(760px 420px at 50% -6%, rgba(200,151,75,.16), transparent 68%),
    radial-gradient(620px 420px at 50% 108%, rgba(78,107,84,.10), transparent 70%);
}

#mbr .card{
  width:100%; max-width:560px; background:var(--paper);
  border:1px solid var(--line); border-radius:var(--radius);
  padding:44px 44px 30px; text-align:center;
  box-shadow:0 30px 60px -34px rgba(14,19,17,.34), 0 2px 6px -2px rgba(14,19,17,.06);
}

#mbr .logo{ height:68px; width:auto; margin:0 auto 26px; }

/* NOTE ON !important BELOW
   The resets above flatten every <p> and <button> margin with !important,
   because GHL's theme sets those with !important and nothing weaker beats it.
   That reset also outranks these rules, so anything that needs its own spacing
   back has to restate it at the same weight. Without this the whole card
   collapses into one unspaced block. */

#mbr h1{ font-size:32px; }
#mbr .sub{ color:var(--muted); font-size:16px; margin-top:10px !important; }

/* ===== STARS ===== */
#mbr .stars{
  display:flex; justify-content:center; gap:6px;
  margin:26px 0 0;
}
#mbr .star{
  -webkit-appearance:none; appearance:none;
  background:none; border:0; padding:6px; cursor:pointer;
  border-radius:10px; line-height:0;
  transition:transform .16s ease;
}
#mbr .star svg{ width:46px; height:46px; display:block; }
#mbr .star path{
  fill:none; stroke:var(--star-empty); stroke-width:1.6;
  stroke-linejoin:round;
  transition:fill .16s ease, stroke .16s ease;
}
#mbr .star.on path{ fill:var(--brass); stroke:var(--brass-text); }
#mbr .star:hover{ transform:translateY(-2px) scale(1.06); }
#mbr .star:focus-visible{ outline:2px solid var(--brass-text); outline-offset:1px; }
#mbr .stars.is-locked .star{ cursor:default; }

#mbr .hint{
  min-height:22px; margin-top:12px !important;
  font-size:13px; font-weight:600; letter-spacing:.10em; text-transform:uppercase;
  color:var(--brass-text);
}

/* ===== PANELS ===== */
#mbr .panel{ display:none; }
#mbr .panel.is-open{ display:block; animation:mbrIn .34s cubic-bezier(.2,.7,.3,1) both; }
@keyframes mbrIn{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:none; } }

#mbr .rule{
  height:1px; background:var(--line);
  margin:30px -44px 28px;
}

#mbr h2{ font-size:23px; }
#mbr .panel .sub{ margin-top:8px !important; font-size:15px; }

#mbr .field{ margin-top:20px; text-align:left; }
#mbr textarea{
  width:100%; min-height:132px; resize:vertical;
  background:var(--wash); color:var(--ink);
  border:1px solid var(--line); border-radius:10px;
  padding:14px 15px; font-size:16px; line-height:1.55;
  transition:border-color .15s ease, box-shadow .15s ease;
}
/* Placeholder text is still text: it has to clear 4.5:1 like everything else.
   The obvious lighter grey (#7A837C) reads 3.62:1 on the --wash field and
   fails. --muted clears it at 5.5:1 and is still plainly lighter than what
   the visitor types (17.3:1), which is the only distinction it owes them. */
#mbr textarea::placeholder{ color:var(--muted); opacity:1; }
#mbr textarea:focus{
  outline:none; border-color:var(--brass);
  box-shadow:0 0 0 3px rgba(200,151,75,.20);
}

#mbr .btn{
  display:inline-flex; align-items:center; justify-content:center;
  width:100%; margin:18px 0 0 !important; padding:15px 26px;
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:16px; font-weight:700; letter-spacing:-.01em;
  background:var(--brass); color:#14100A;
  border:1px solid var(--brass); border-radius:10px; cursor:pointer;
  transition:background .16s ease, box-shadow .16s ease, transform .16s ease;
  box-shadow:0 14px 26px -16px rgba(200,151,75,.9);
}
#mbr .btn:hover:not(:disabled){ background:var(--brass-2); border-color:var(--brass-2); transform:translateY(-1px); }
#mbr .btn:focus-visible{ outline:2px solid var(--ink); outline-offset:2px; }
#mbr .btn:disabled{ opacity:.62; cursor:default; box-shadow:none; }

#mbr .err{
  margin-top:14px !important; padding:12px 14px; text-align:left;
  background:#FCF2E8; border:1px solid #E9C79B; border-radius:9px;
  color:#7A4A1C; font-size:14.5px; line-height:1.55;
}
#mbr .err a{ color:#7A4A1C; font-weight:600; }

/* ===== DONE ===== */
#mbr .tick{
  width:62px; height:62px; margin:0 auto 22px;
  display:flex; align-items:center; justify-content:center;
  border-radius:50%; background:rgba(200,151,75,.14);
  border:1px solid rgba(200,151,75,.44);
}
#mbr .tick svg{ width:28px; height:28px; }
#mbr .tick path{ fill:none; stroke:var(--brass-text); stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }

#mbr .foot{
  margin-top:24px !important; font-size:13.5px; color:var(--muted);
  text-align:center;
}

/* ===== PHONE ===== */
@media (max-width: 560px){
  #mbr .stage{ padding:32px 14px; }
  #mbr .card{ padding:34px 22px 30px; border-radius:12px; }
  #mbr .logo{ height:54px; margin-bottom:20px; }
  #mbr h1{ font-size:26px; }
  #mbr .sub{ font-size:15px; }
  #mbr .rule{ margin:26px -22px 24px; }
  #mbr h2{ font-size:20px; }

  /* The row has to survive a 320px screen, which is the narrowest phone still
     in real use. Budget: 320 - 28 (stage padding) - 44 (card padding) = 248px
     of usable width. Five stars at 36 + 10 padding = 46px each, plus 4 x 2px
     of gap, comes to 238px. The 46px tap target also clears the 44px minimum,
     so this is as small as the row is allowed to get. */
  #mbr .stars{ gap:2px; }
  #mbr .star{ padding:5px; }
  #mbr .star svg{ width:36px; height:36px; }
}

@media (prefers-reduced-motion: reduce){
  #mbr *, #mbr *::before, #mbr *::after{
    animation-duration:.001ms !important; transition-duration:.001ms !important;
  }
  #mbr .star:hover{ transform:none; }
}
`;

  // =========================================================================
  // MARKUP
  // =========================================================================
  var STAR_PATH = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

  function starButton(n) {
    return '' +
      '<button type="button" class="star" data-v="' + n + '" ' +
        'aria-label="Rate ' + n + ' out of 5 stars">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="' + STAR_PATH + '"/>' +
        '</svg>' +
      '</button>';
  }

  function view() {
    var stars = "";
    for (var i = 1; i <= 5; i++) stars += starButton(i);

    return '' +
'<div class="stage">' +
  '<div class="card">' +
    '<img class="logo" src="' + CONFIG.logo + '" alt="Made Better LC">' +

    // ---- rating ----
    '<div id="mbrRate">' +
      '<h1>How did we do?</h1>' +
      '<p class="sub" id="mbrSub">Tap a star. It takes about ten seconds.</p>' +
      '<div class="stars" id="mbrStars" role="group" aria-label="Rate your experience out of 5 stars">' +
        stars +
      '</div>' +
      // aria-live so a screen reader hears the rating as it is chosen, and
      // polite so it does not interrupt the label being read out.
      '<p class="hint" id="mbrHint" aria-live="polite"></p>' +
    '</div>' +

    // ---- feedback (1 to 3 stars) ----
    '<div class="panel" id="mbrFeed">' +
      '<div class="rule"></div>' +
      '<h2>Sorry we missed the mark.</h2>' +
      '<p class="sub">Tell us what we could have done better. We read each one of these to make our service even better!</p>' +
      '<form id="mbrForm" novalidate>' +
        '<div class="field">' +
          '<textarea id="mbrText" name="feedback" required ' +
            'aria-label="What could we have done better?" ' +
            'placeholder="What happened, and what should we have done instead?"></textarea>' +
        '</div>' +
        '<button class="btn" type="submit">Send</button>' +
      '</form>' +
    '</div>' +

    // ---- done ----
    '<div class="panel" id="mbrDone">' +
      '<div class="tick">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6L9 17l-5-5"/></svg>' +
      '</div>' +
      '<h2 id="mbrDoneH">Thank you.</h2>' +
      '<p class="sub" id="mbrDoneP"></p>' +
    '</div>' +

  '</div>' +
  '<p class="foot">Made Better LC &middot; <a href="' + CONFIG.phoneHref + '">' + CONFIG.phone + '</a></p>' +
'</div>';
  }

  // =========================================================================
  // BEHAVIOUR
  // =========================================================================
  function wire(root) {
    var starsRow = root.querySelector("#mbrStars");
    var starEls = [].slice.call(root.querySelectorAll(".star"));
    var hint = root.querySelector("#mbrHint");
    var sub = root.querySelector("#mbrSub");
    var feed = root.querySelector("#mbrFeed");
    var done = root.querySelector("#mbrDone");
    var doneH = root.querySelector("#mbrDoneH");
    var doneP = root.querySelector("#mbrDoneP");
    var rate = root.querySelector("#mbrRate");
    var form = root.querySelector("#mbrForm");
    var text = root.querySelector("#mbrText");

    var selected = 0;

    function paint(n) {
      starEls.forEach(function (el, i) {
        el.classList.toggle("on", i < n);
      });
      hint.textContent = n ? LABELS[n - 1] : "";
    }

    function finish(heading, message) {
      rate.style.display = "none";
      feed.classList.remove("is-open");
      doneH.textContent = heading;
      doneP.innerHTML = message;
      done.classList.add("is-open");
    }

    // Hover previews the rating; leaving the row falls back to what was
    // actually chosen, so a half-hovered row never looks like a selection.
    starEls.forEach(function (el) {
      el.addEventListener("mouseenter", function () { paint(+el.dataset.v); });
      el.addEventListener("focus", function () { paint(+el.dataset.v); });
      el.addEventListener("click", function () { choose(+el.dataset.v); });
    });
    starsRow.addEventListener("mouseleave", function () { paint(selected); });
    starsRow.addEventListener("focusout", function () {
      // Only repaint once focus has genuinely left the row, not while it is
      // moving between two stars inside it.
      setTimeout(function () {
        if (!starsRow.contains(document.activeElement)) paint(selected);
      }, 0);
    });

    function choose(n) {
      selected = n;
      paint(n);

      if (n >= CONFIG.googleThreshold) {
        // The happy path. Log it if there is anywhere to log it to, then go.
        ping({ rating: n, outcome: CONFIG.googleReviewUrl ? "sent_to_google" : "google_not_configured" });

        if (CONFIG.googleReviewUrl) {
          window.location.href = CONFIG.googleReviewUrl;
          return;
        }

        // Google My Business is still in verification. Nothing to redirect to,
        // so thank them properly rather than letting the tap do nothing.
        // NOTE: no "we will send you the link". The funnel is anonymous, so
        // there is no address to send it to and that would be a promise
        // nobody could keep.
        finish(
          "Thank you, that means a lot.",
          'Our Google page is still being verified, so there is nowhere to post it publicly just yet. ' +
          'Taking the time to say so is genuinely appreciated.'
        );
        return;
      }

      // 1 to 3. Open the feedback panel in place and put the cursor in it.
      sub.style.display = "none";
      starsRow.classList.add("is-locked");
      feed.classList.add("is-open");
      if (text) text.focus({ preventScroll: true });
      feed.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Fire and forget. Used for the star tap itself, where the visitor is
    // about to leave for Google and there is nothing to wait for.
    // Form-encoded rather than JSON: a URLSearchParams body sets a safelisted
    // content type, so the request is "simple" and skips the CORS preflight
    // round trip. GHL does answer preflights, so this is a latency saving
    // rather than a correctness fix, and it also replies with
    // "access-control-allow-origin: *", so the reply below can be read.
    function encode(payload) {
      var params = new URLSearchParams();
      Object.keys(payload).forEach(function (k) {
        params.append(k, payload[k] == null ? "" : String(payload[k]));
      });
      return params;
    }

    // Who this is, when the link was sent from a GHL workflow rather than
    // scanned off a QR code.
    //
    // A pipeline cannot be moved for "somebody". GHL needs an identifier or
    // there is no contact to act on, so a workflow that sends the link appends
    // its own merge fields:
    //   .../review?c={{contact.id}}&e={{contact.email}}&p={{contact.phone}}
    // and they ride along on every webhook below.
    //
    // All three are OPTIONAL and the funnel works exactly as before without
    // them: a QR code on a truck hands everyone the same URL, so those visits
    // stay anonymous by nature and simply post no identity. Handing back
    // whatever GHL gave us, rather than requiring it, is what lets one page
    // serve both.
    //
    // Email and phone ride along because GHL matches contacts on those far
    // more reliably than on a raw id, and a workflow that cannot resolve the
    // person cannot move them anywhere.
    function identity() {
      var out = {};
      try {
        var q = new URLSearchParams(window.location.search);
        var id = q.get("c") || q.get("contact_id");
        var email = q.get("e") || q.get("email");
        var phone = q.get("p") || q.get("phone");
        if (id) out.contact_id = id;
        if (email) out.email = email;
        if (phone) out.phone = phone;
      } catch (e) {}
      return out;
    }

    function withIdentity(payload) {
      var who = identity();
      Object.keys(who).forEach(function (k) { payload[k] = who[k]; });
      // Lets a GHL workflow branch without string-matching an id: an
      // attributed visit can move a contact, an anonymous one cannot.
      payload.attributed = who.contact_id || who.email || who.phone ? "yes" : "no";
      return payload;
    }

    function ping(payload) {
      if (!CONFIG.webhookUrl) return;
      payload.source = "Made Better LC review funnel";
      withIdentity(payload);
      try {
        var params = encode(payload);
        if (navigator.sendBeacon && navigator.sendBeacon(CONFIG.webhookUrl, params)) return;
        fetch(CONFIG.webhookUrl, {
          method: "POST",
          body: params,
          keepalive: true,
          mode: "no-cors"
        }).catch(function () {});
      } catch (e) {}
    }

    if (!form) return;
    var btn = form.querySelector("button[type=submit]");
    var btnLabel = btn.textContent;

    function fail(message) {
      btn.disabled = false;
      btn.textContent = btnLabel;
      var err = form.querySelector(".err");
      if (!err) {
        err = document.createElement("p");
        err.className = "err";
        err.setAttribute("role", "alert");
        form.appendChild(err);
      }
      err.innerHTML = message;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var body = (text.value || "").trim();
      if (!body) {
        fail("Please tell us what went wrong, then we can put it right.");
        text.focus();
        return;
      }

      // The webhook is the only thing that makes this real. Without it we say
      // so. A thank-you shown over a complaint that went nowhere is worse than
      // no form at all: the customer stops expecting a call that is never
      // coming, and Seamus never learns the job went wrong.
      if (!CONFIG.webhookUrl) {
        fail('This form is not connected yet, so that did not send. Please call Seamus on <a href="' +
          CONFIG.phoneHref + '">' + CONFIG.phone + '</a> and he will put it right.');
        return;
      }

      btn.disabled = true;
      btn.textContent = "Sending…";

      var params = encode(withIdentity({
        rating: selected,
        feedback: body,
        outcome: "feedback",
        source: "Made Better LC review funnel"
      }));

      // An ordinary cors fetch, so res.ok is real: a complaint that GHL did not
      // accept must not be answered with a thank-you.
      fetch(CONFIG.webhookUrl, {
        method: "POST",
        body: params,
        keepalive: true
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        finish(
          "Thank you for telling us.",
          'Seamus will look at this himself. If you want it sorted today, call him on ' +
          '<a href="' + CONFIG.phoneHref + '">' + CONFIG.phone + '</a>.'
        );
      }).catch(function () {
        fail('That did not send. Please call Seamus on <a href="' +
          CONFIG.phoneHref + '">' + CONFIG.phone + '</a>.');
      });
    });
  }

  // =========================================================================
  // MOUNT + BOOT
  // =========================================================================
  // GHL is free to nest a step one level deeper or rename a div, so its
  // padding can sit somewhere no named rule knows to look. Whatever stands
  // between the mount point and <body> is GHL's chrome, and its padding is not
  // ours to inherit.
  function flattenWrappers(root) {
    for (var n = root.parentElement; n && n !== document.body; n = n.parentElement) {
      n.style.setProperty("padding", "0", "important");
      n.style.setProperty("margin-top", "0", "important");
      n.style.setProperty("margin-bottom", "0", "important");
    }
  }

  // The real viewport width, excluding the vertical scrollbar. See the
  // breakout rule in STYLES for why the 100vw unit will not do.
  //
  // Writing only on a genuine change is what makes it safe to call this from a
  // ResizeObserver on the element it resizes: setting --vw changes the width,
  // which fires the observer again, which would spin forever otherwise.
  function sizeToViewport(root) {
    var w = document.documentElement.clientWidth + "px";
    if (root.style.getPropertyValue("--vw") === w) return;
    root.style.setProperty("--vw", w);
  }

  function mount(root) {
    if (!document.querySelector("style[data-mb-review]")) {
      var style = document.createElement("style");
      style.setAttribute("data-mb-review", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    flattenWrappers(root);
    sizeToViewport(root);
    root.innerHTML = view();
    wire(root);

    // A phone rotating, or a desktop window being dragged, changes the
    // viewport. Re-measure on the next frame rather than on every event.
    var pending = false;
    window.addEventListener("resize", function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        sizeToViewport(root);
      });
    });

    // Resize alone is not enough. Opening the feedback panel makes the card
    // taller, which is what SUMMONS the vertical scrollbar, which is what
    // narrows the viewport. The first measurement was taken on a short page
    // that had no scrollbar yet, so it read 15px too wide and the page scrolled
    // sideways the moment anyone rated us badly. Watch the height too.
    if (window.ResizeObserver) {
      new ResizeObserver(function () { sizeToViewport(root); }).observe(root);
    }
  }

  // GHL can run this script before its own markup lands, and can render the
  // same block twice on a page. Wait for the root, then refuse to mount twice.
  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) { setTimeout(boot, 50); return; }
      console.error(
        '[made-better/review] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        'The GHL step needs BOTH lines of the stub: the div and the script tag.'
      );
      return;
    }
    if (root.getAttribute("data-mbr-ready")) return;
    root.setAttribute("data-mbr-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
