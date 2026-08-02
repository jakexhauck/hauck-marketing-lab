// The pre-call page, served rather than pasted.
//
// GoHighLevel holds a ten-line stub (Sales Funnel/01-pre-call.html) that loads
// this file. Everything the page IS lives here, so a copy change, a new
// screenshot or a new video is a deploy and nobody has to go back into the GHL
// builder. The intake form already works exactly this way, so the pattern is
// proven on these pages: a script tag survives the builder, a <link> tag does
// not.
//
// THIS FILE IS THE SOURCE. Do not keep a second copy of this markup in the
// pasted HTML. That is precisely what went wrong before the intake form moved
// here: two copies drifted apart every time one of them was edited.
//
// It ships from public/, so Cloudflare serves it unhashed at a stable URL and
// revalidates it. The stub in GHL never changes again.
//
// Where this page sits: a PROSPECT lands here straight after booking a demo on
// the calendar. Not to be confused with the onboarding thank-you page, which is
// where an already-signed CLIENT lands and deliberately asks for nothing.

(function () {
  "use strict";

  // Read at top level, while the browser still knows which script is running.
  // Everything this page loads (screenshots especially) hangs off this origin,
  // so the page works identically on a local preview and in production without
  // a single hardcoded absolute URL in the markup.
  var self = document.currentScript;
  var origin = "https://app.hauckmarketing.com";
  try {
    if (self && self.src) origin = new URL(self.src).origin;
  } catch (e) {}

  var ROOT_ID = "hm-precall-root";

  // =========================================================================
  // EVERYTHING JAKE EDITS LIVES IN THIS BLOCK. Change it, deploy, done.
  // =========================================================================
  var CONFIG = {
    // The confirmation text's SENDING number, full international form:
    // "+13135550142". While this is empty the "Open my messages" button is not
    // rendered at all, because a button that opens a blank message to nobody
    // reads as a broken site.
    smsNumber: "",

    // The video EMBED url, not the watch url.
    //   YouTube  https://www.youtube.com/embed/VIDEO_ID
    //   Vimeo    https://player.vimeo.com/video/VIDEO_ID
    //   Loom     https://www.loom.com/embed/VIDEO_ID
    // While this is empty a placeholder frame shows in its place.
    videoEmbedUrl: "",

    // The result screenshots, in the order they appear. `file` is a filename in
    // public/funnel/precall/. `alt` never renders on screen; it is all a screen
    // reader has to go on, so it should describe what the screenshot shows.
    //
    // Drop an entry to remove that screenshot from the page. Add one by putting
    // the PNG in that folder and adding a line here.
    //
    // CHECK BEFORE PUBLISHING: result-1 and result-2 both show a Meta Ads
    // Manager column preset named "Peak Presence | Ad Set View" in the toolbar.
    // Peak Presence is the agency this page was modelled on. If that is not our
    // ad account, delete those two lines: the name is legible at full size and
    // the section above them claims the numbers are ours.
    results: [
      { file: "result-1-campaigns-overview.png", alt: "Meta Ads Manager campaign results" },
      { file: "result-2-campaigns-december.png", alt: "Meta Ads Manager campaign results" },
      { file: "result-3-leads-cost.png", alt: "Leads and cost per lead" },
      { file: "result-4-leads-budget.png", alt: "Leads, budget and spend" },
      { file: "result-5-leads-reach.png", alt: "Leads, reach and impressions" }
    ]
  };

  var STYLES = `/* @import rather than a <link> tag: GoHighLevel's builder strips <link>
   elements out of custom code blocks, which would silently drop the fonts. */
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

.hm-funnel{
  /* Modern Motion, the Command Center palette. Change these three to reskin. */
  --hm-brand:#4F46E5; --hm-brand-2:#7C73F0; --hm-brand-deep:#4338CA;

  --hm-ink:#14161F; --hm-body:#555A6B; --hm-faint:#8A90A3;
  --hm-line:#E7E9F1; --hm-wash:#F6F7FB; --hm-surface:#FFFFFF;
  --hm-border-strong:#D4D8E6;
  --hm-shadow-md:0 6px 18px rgba(40,42,70,.07), 0 2px 6px rgba(40,42,70,.05);
  --hm-shadow-lg:0 18px 40px rgba(40,42,70,.12), 0 6px 14px rgba(40,42,70,.07);

  /* Break out of whatever column GHL wraps this in, so the background runs the
     full width of the page instead of sitting in a boxed strip. */
  width:100vw; max-width:100vw; margin-left:calc(50% - 50vw);
  position:relative; padding:0 20px 72px; overflow:hidden;
  background:
    radial-gradient(60rem 40rem at 12% -8%, rgba(124,115,240,.16), transparent 60%),
    radial-gradient(50rem 38rem at 100% 0%, rgba(79,70,229,.12), transparent 55%),
    var(--hm-wash);
  color:var(--hm-ink);
  font-family:Inter,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;
  text-align:left;
}

/* Targeted resets. GHL's own theme CSS reaches into custom blocks, so anything
   it likes to restyle is pinned here, scoped so it cannot leak back out.

   WARNING, and this has already bitten twice: ".hm-funnel p" scores (0,1,1).
   Any later rule that sets a margin on a paragraph must be written
   ".hm-funnel .hm-thing", not ".hm-thing", or it scores (0,1,0), loses to this
   reset no matter how far down the file it sits, and its margins silently
   vanish. That is how .hm-sub ended up 125px left of centre under a headline
   that measured perfectly centred. */
.hm-funnel *{box-sizing:border-box}
.hm-funnel h1,.hm-funnel h2,.hm-funnel h3{
  margin:0;font-family:Poppins,Inter,sans-serif;font-weight:600;letter-spacing:-.025em;line-height:1.15;
  /* Centred type with a one-word last line looks like a mistake. Balance evens
     the lines out; browsers without it simply wrap as before. */
  text-wrap:balance}
.hm-funnel p{margin:0}
.hm-funnel figure,.hm-funnel figcaption{margin:0}
.hm-funnel a{text-decoration:none;color:inherit}
.hm-funnel b{font-weight:600}
.hm-funnel img{max-width:100%}

.hm-top{display:flex;justify-content:center;padding:38px 0 30px}
.hm-mark{display:flex;align-items:center;gap:9px;font-family:Poppins,Inter,sans-serif;
  font-weight:600;font-size:15px;letter-spacing:-.02em}
.hm-mark-dot{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;
  background:linear-gradient(135deg,var(--hm-brand) 0%,var(--hm-brand-2) 100%);
  color:#fff;font-size:11px;font-weight:600}

/* ---------- hero ---------- */
.hm-hero{max-width:660px;margin:0 auto;text-align:center;padding:6px 0 4px}
.hm-kicker{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;
  background:rgba(79,70,229,.09);color:var(--hm-brand-deep);
  font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
.hm-kicker-dot{width:6px;height:6px;border-radius:50%;background:#16A34A}
.hm-hero h1{margin-top:18px;font-size:38px;font-weight:700;letter-spacing:-.035em}
/* Qualified selector, see the warning in the reset block above. 42ch, not 50:
   at the wider measure this paragraph balanced into three lines that got
   progressively LONGER, an upside-down pyramid that reads as broken even though
   every line was technically balanced. */
.hm-funnel .hm-sub{margin:14px auto 0;font-size:15.5px;line-height:1.62;color:var(--hm-body);
  max-width:42ch;text-wrap:balance}

/* ---------- the three steps ---------- */
.hm-steps{max-width:940px;margin:40px auto 0;display:grid;gap:14px;
  grid-template-columns:repeat(3,1fr)}
/* Centred, to sit with the centred hero and section heads above them. The copy
   is two lines at most, which is short enough that centring reads as deliberate
   rather than as a wall of ragged text. */
.hm-step{display:block;position:relative;padding:24px 20px 22px;border-radius:16px;text-align:center;
  background:var(--hm-surface);border:1px solid var(--hm-line);
  box-shadow:var(--hm-shadow-md);transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s}
.hm-step:hover{transform:translateY(-3px);box-shadow:var(--hm-shadow-lg)}
.hm-num{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;margin:0 auto;
  background:linear-gradient(135deg,var(--hm-brand) 0%,var(--hm-brand-2) 100%);
  color:#fff;font-family:Poppins,Inter,sans-serif;font-size:12.5px;font-weight:600;
  letter-spacing:.02em;box-shadow:0 8px 22px rgba(79,70,229,.28)}
.hm-step b{display:block;margin-top:15px;font-size:15.5px;
  font-family:Poppins,Inter,sans-serif;letter-spacing:-.02em}
.hm-step p{margin-top:6px;font-size:13.5px;line-height:1.55;color:var(--hm-body);text-wrap:balance}
.hm-go{display:inline-block;margin-top:13px;font-size:12.5px;font-weight:600;
  color:var(--hm-brand-deep)}
.hm-go::after{content:" \\2192";transition:margin-left .2s}
.hm-step:hover .hm-go::after{margin-left:3px}

/* ---------- section shell ---------- */
.hm-sec{max-width:940px;margin:0 auto;padding-top:64px;scroll-margin-top:24px}
.hm-sec-head{max-width:56ch;margin:0 auto 22px;text-align:center}
.hm-badge{display:inline-block;padding:5px 11px;border-radius:999px;
  border:1px solid var(--hm-line);background:var(--hm-surface);color:var(--hm-brand-deep);
  font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.hm-sec-head h2{margin-top:14px;font-size:27px}
.hm-sec-head p{margin-top:10px;font-size:14.5px;line-height:1.6;color:var(--hm-body);text-wrap:balance}

/* ---------- step 1: video ---------- */
.hm-video{position:relative;aspect-ratio:16/9;border-radius:18px;overflow:hidden;
  background:#0C0D14;border:1px solid var(--hm-line);box-shadow:var(--hm-shadow-lg)}
.hm-video iframe,.hm-video video{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
.hm-video-ph{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:9px;text-align:center;padding:20px;
  background:radial-gradient(70% 70% at 50% 40%, rgba(124,115,240,.22), transparent 70%), #0C0D14}
.hm-video-ph b{color:#fff;font-family:Poppins,Inter,sans-serif;font-size:15px}
.hm-video-ph p{color:rgba(255,255,255,.5);font-size:12.5px}
.hm-play{display:grid;place-items:center;width:60px;height:60px;border-radius:50%;
  background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22)}
.hm-play::after{content:"";border-style:solid;border-width:9px 0 9px 15px;
  border-color:transparent transparent transparent #fff;margin-left:4px}

/* ---------- step 2: reply ---------- */
.hm-card{background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:18px;
  box-shadow:var(--hm-shadow-md)}
.hm-reply{display:grid;grid-template-columns:1fr 1fr;gap:0;overflow:hidden}
.hm-thread{padding:28px 26px;display:flex;flex-direction:column;gap:10px;
  background:linear-gradient(180deg,#F8F8FC 0%,#F1F2F9 100%);border-right:1px solid var(--hm-line)}
.hm-bub{max-width:88%;padding:11px 14px;border-radius:16px;font-size:13.5px;line-height:1.5}
.hm-bub-in{align-self:flex-start;background:#E9EAF2;color:var(--hm-ink);border-bottom-left-radius:5px}
.hm-bub-out{align-self:flex-end;background:linear-gradient(135deg,var(--hm-brand) 0%,var(--hm-brand-2) 100%);
  color:#fff;border-bottom-right-radius:5px;font-size:17px}
/* Vertically centred against the message thread beside it, so the two halves
   stay balanced once the text button appears and makes this column taller. */
.hm-reply-copy{padding:28px 30px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
.hm-reply-copy b{display:block;font-family:Poppins,Inter,sans-serif;font-size:15px;letter-spacing:-.02em}
.hm-reply-copy p{margin-top:8px;font-size:14px;line-height:1.62;color:var(--hm-body)}
.hm-btn{display:inline-block;margin-top:18px;padding:12px 22px;border-radius:11px;
  background:linear-gradient(135deg,var(--hm-brand) 0%,var(--hm-brand-2) 100%);
  color:#fff;font-size:14px;font-weight:600;font-family:Poppins,Inter,sans-serif;
  letter-spacing:-.01em;box-shadow:0 8px 22px rgba(79,70,229,.28);
  transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}
.hm-btn:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(79,70,229,.34)}
/* Qualified selector, see the warning in the reset block above. */
.hm-funnel .hm-fine{margin-top:11px;font-size:11.5px;line-height:1.55;color:var(--hm-faint)}

/* ---------- step 3: results ----------
   A single stacked column, not a grid. The screenshots are wide strips of table
   data, so they are shown whole at their own aspect ratio. No fixed frame and
   no object-fit:cover: cropping this kind of image removes the figures, which
   are the entire point of showing it. No captions either, by request. */
.hm-shots{display:flex;flex-direction:column;gap:18px}
/* The card is the mat. Without a surround, a screenshot that is itself white
   bleeds into the white card and stops reading as a screenshot at all. */
.hm-funnel .hm-shot{padding:12px;background:#F1F3F9;border:1px solid var(--hm-line);
  border-radius:16px;overflow:hidden;box-shadow:var(--hm-shadow-md);
  transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s}
.hm-shot:hover{transform:translateY(-3px);box-shadow:var(--hm-shadow-lg)}
/* width:auto, not 100%. Several of these screenshots are narrower than the
   card, and stretching a screenshot of small table text past its native width
   makes the numbers fuzzy. They sit at native size and centre instead; only the
   wide ones scale down. */
.hm-shot img{display:block;width:auto;max-width:100%;height:auto;margin:0 auto;
  border-radius:8px;border:1px solid var(--hm-border-strong)}

/* ---------- footer ---------- */
.hm-foot{max-width:940px;margin:70px auto 0;padding-top:26px;border-top:1px solid var(--hm-line);
  display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.hm-foot p{font-size:12px;color:var(--hm-faint)}

/* ---------- motion ----------
   The hidden state is gated behind .hm-js, which the script adds the moment it
   finds the root. Without that gate, a stripped or blocked script would leave
   everything below the fold permanently invisible: a silent, total failure on
   the half of the page that carries the proof. Animation is a nicety, reading
   the page is not, so the page defaults to visible and opts IN to hiding. */
.hm-funnel.hm-js .hm-rise{opacity:0;transform:translateY(14px);
  transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1)}
.hm-funnel.hm-js .hm-rise.is-in{opacity:1;transform:none}

@media(prefers-reduced-motion:reduce){
  .hm-funnel.hm-js .hm-rise{opacity:1;transform:none;transition:none}
  .hm-step:hover,.hm-shot:hover,.hm-btn:hover{transform:none}
}

@media(max-width:860px){
  .hm-steps{grid-template-columns:1fr}
  .hm-reply{grid-template-columns:1fr}
  .hm-thread{border-right:0;border-bottom:1px solid var(--hm-line)}
}
@media(max-width:640px){
  .hm-funnel{padding:0 16px 56px}
  .hm-hero h1{font-size:28px}
  .hm-funnel .hm-sub{font-size:14.5px}
  .hm-sec{padding-top:52px}
  .hm-sec-head h2{font-size:22px}
  .hm-reply-copy{padding:24px 22px}
  .hm-thread{padding:22px 20px}
}`;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function videoBlock() {
    if (CONFIG.videoEmbedUrl) {
      return '<iframe src="' + esc(CONFIG.videoEmbedUrl) + '"' +
        ' title="Watch this before our call" frameborder="0" allowfullscreen' +
        ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"></iframe>';
    }
    return '' +
      '<div class="hm-video-ph">' +
        '<span class="hm-play" aria-hidden="true"></span>' +
        '<b>Video goes here</b>' +
        '<p>Set videoEmbedUrl in funnel/precall.js</p>' +
      '</div>';
  }

  function smsBlock() {
    if (!CONFIG.smsNumber) return "";
    // "?&body=" rather than "?body=": iOS needs the ampersand, Android
    // tolerates it, so the one form works on both.
    var href = "sms:" + CONFIG.smsNumber + "?&body=" + encodeURIComponent("Confirmed");
    return '' +
      '<a class="hm-btn" href="' + esc(href) + '">Open my messages</a>' +
      '<p class="hm-fine">Opens your texting app on a phone. On a computer, just reply from your phone.</p>';
  }

  function shotsBlock() {
    var list = CONFIG.results || [];
    if (!list.length) return "";
    return list.map(function (shot) {
      return '<figure class="hm-shot">' +
        '<img src="' + esc(origin + "/funnel/precall/" + shot.file) + '"' +
        ' alt="' + esc(shot.alt || "") + '" loading="lazy">' +
        '</figure>';
    }).join("");
  }

  function markup() {
    return '' +
    '<div class="hm-funnel">' +

      '<div class="hm-top">' +
        '<div class="hm-mark"><span class="hm-mark-dot">H</span> Hauck Marketing</div>' +
      '</div>' +

      '<header class="hm-hero hm-rise">' +
        '<div class="hm-kicker"><span class="hm-kicker-dot"></span> Call confirmed</div>' +
        '<h1>You are booked. Here is how to make it worth your time.</h1>' +
        '<p class="hm-sub">Three quick things before we talk. Six minutes, and they turn a chat into a call worth having.</p>' +
      '</header>' +

      '<nav class="hm-steps hm-rise" aria-label="Before the call">' +
        '<a class="hm-step" href="#hm-step-1">' +
          '<span class="hm-num">01</span>' +
          '<b>Watch the video</b>' +
          '<p>What I do, who it works for, and what happens on our call.</p>' +
          '<span class="hm-go">Watch it</span>' +
        '</a>' +
        '<a class="hm-step" href="#hm-step-2">' +
          '<span class="hm-num">02</span>' +
          '<b>Reply to my text</b>' +
          '<p>One reply. It is the single biggest thing you can do right now.</p>' +
          '<span class="hm-go">Reply</span>' +
        '</a>' +
        '<a class="hm-step" href="#hm-step-3">' +
          '<span class="hm-num">03</span>' +
          '<b>Look through the results</b>' +
          '<p>Real campaigns, real numbers, so you can judge for yourself.</p>' +
          '<span class="hm-go">See them</span>' +
        '</a>' +
      '</nav>' +

      '<section class="hm-sec hm-rise" id="hm-step-1">' +
        '<div class="hm-sec-head">' +
          '<span class="hm-badge">Step 01</span>' +
          '<h2>Watch this first</h2>' +
          '<p>It covers what I actually do, the businesses it works for, and exactly how our call will run.</p>' +
        '</div>' +
        '<div class="hm-video">' + videoBlock() + '</div>' +
      '</section>' +

      '<section class="hm-sec hm-rise" id="hm-step-2">' +
        '<div class="hm-sec-head">' +
          '<span class="hm-badge">Step 02</span>' +
          '<h2>Reply to my text</h2>' +
          '<p>You just got a confirmation text from me. Reply with anything at all, even a thumbs up.</p>' +
        '</div>' +
        '<div class="hm-card hm-reply">' +
          '<div class="hm-thread" aria-hidden="true">' +
            '<div class="hm-bub hm-bub-in">Hey, it\'s Jake from Hauck Marketing. Your call is booked. Reply here so I know I have the right number.</div>' +
            // Entity, not a raw emoji character: this string travels through a
            // build and a CDN, and non-ASCII bytes are the first thing to get
            // mangled when something in that chain guesses the wrong charset.
            '<div class="hm-bub hm-bub-out">&#128077;</div>' +
          '</div>' +
          '<div class="hm-reply-copy">' +
            '<b>Why it matters</b>' +
            '<p>A reply tells me the number is real, and it means I spend the hour before our call looking at your market instead of wondering whether you are going to show up. People who reply almost always do.</p>' +
            smsBlock() +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="hm-sec hm-rise" id="hm-step-3">' +
        '<div class="hm-sec-head">' +
          '<span class="hm-badge">Step 03</span>' +
          '<h2>See what this looks like in practice</h2>' +
          '<p>Straight out of the ad account and the lead tracker. Judge it for yourself before we speak.</p>' +
        '</div>' +
        '<div class="hm-shots">' + shotsBlock() + '</div>' +
      '</section>' +

      '<footer class="hm-foot">' +
        '<div class="hm-mark"><span class="hm-mark-dot">H</span> Hauck Marketing</div>' +
        '<p>&copy; 2026 Hauck Marketing. All rights reserved.</p>' +
      '</footer>' +

    '</div>';
  }

  function wire(root) {
    var funnel = root.querySelector(".hm-funnel");
    if (!funnel) return;

    // Smooth scroll for the three step cards. Native anchors already work, so
    // this only upgrades the feel and never blocks the jump.
    var links = funnel.querySelectorAll('a[href^="#hm-step-"]');
    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener("click", function (e) {
        var target = document.getElementById(a.getAttribute("href").slice(1));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    var rise = funnel.querySelectorAll(".hm-rise");
    function revealAll() {
      Array.prototype.forEach.call(rise, function (el) { el.classList.add("is-in"); });
    }

    // Only now is it safe to hide anything: the script is demonstrably running
    // and can be trusted to put it back.
    funnel.classList.add("hm-js");

    if (!("IntersectionObserver" in window)) { revealAll(); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    Array.prototype.forEach.call(rise, function (el) { io.observe(el); });

    // Failsafe. If the observer never fires (a builder preview that renders the
    // block inside a zero-height or transformed container will do exactly that)
    // the page reveals itself anyway. A page nobody can read is a worse outcome
    // than a page that forgot to animate.
    setTimeout(revealAll, 2500);
  }

  function mount(root) {
    var style = document.createElement("style");
    style.setAttribute("data-hm-precall", "1");
    style.textContent = STYLES;
    document.head.appendChild(style);

    root.innerHTML = markup();
    wire(root);
  }

  // GHL can run this script before its own markup lands, and can render the same
  // block twice on a page. Wait for the root, then refuse to mount it twice.
  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) setTimeout(boot, 50);
      return;
    }
    if (root.getAttribute("data-hm-ready")) return;
    root.setAttribute("data-hm-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
