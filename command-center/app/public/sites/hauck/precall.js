// HAUCK MARKETING: the pre-call page. What a prospect sees AFTER they book a
// strategy call and BEFORE they turn up to it.
//
// GoHighLevel holds a two-line stub (see "Hauck Marketing Website/ghl/
// pre-call.html"). This is the page /book redirects to once a time is picked.
//
// ITS ONLY JOB is to make them show up already sold. Every block on it exists
// to answer a question they would otherwise bring to the call, or to burn one
// they would otherwise raise as an objection. Nothing here asks them to do
// anything except watch and read.
//
// WHY IT IS ITS OWN FILE rather than another data-page inside site.js: the
// website sells the mechanism and rarely changes. This page is a content shelf
// whose CONFIG block gets edited every time a new video or a new win exists.
// Keeping them apart means a Tuesday copy tweak here cannot break the homepage.
//
// One classic script rather than an ES module on purpose: a cross-origin module
// script requires CORS headers on the response, a classic script does not. The
// file is served from app.hauckmarketing.com and rendered on the GHL domain, so
// it is always cross-origin.
//
// HOUSE RULES BAKED IN HERE
//  - No em dashes anywhere in any copy on this page.
//  - No claim about a client that Jake has not supplied. A made-up result on a
//    page a buyer reads an hour before a sales call is the single most
//    expensive kind of filler there is.
//  - Light and quiet. One accent colour, and it appears about four times.
//  - No dead vertical space. Three bands, tight padding, then the footer.
//    Every screen a buyer scrolls past without reading something is a screen
//    that says there is not much here.

(function () {
  "use strict";

  // =====================================================================
  // CONFIG. This is the whole editable surface of the page.
  //
  // Drop a URL into any empty "url" and that slot goes live on the next
  // deploy. Leave it empty and the slot renders a clean placeholder tile.
  // Nothing else needs touching, ever.
  //
  // ACCEPTED VIDEO URLS: a YouTube watch/share/embed link, a Vimeo link, a
  // Loom share link, or a direct .mp4/.webm/.mov file. Anything else is put
  // in an iframe as-is and will work if the host allows embedding.
  //
  // "poster" is optional. YouTube posters are worked out automatically, so
  // only set it for Vimeo, Loom or self-hosted files, otherwise those tiles
  // show a plain grey card until clicked (which is fine, just plainer).
  // =====================================================================
  var CONFIG = {

    // The single video at the top. The one that sets up the call.
    heroVideo: "",
    heroPoster: "",

    // STEP 2. Short videos, one objection each. Seven slots.
    // Rename these freely. The numbering on the tiles is automatic.
    objections: [
      { title: "Why most contractors stay stuck", url: "", poster: "" },
      { title: "What we actually do for you", url: "", poster: "" },
      { title: "What happens on our call", url: "", poster: "" },
      { title: "\"I have tried ads before and they did not work\"", url: "", poster: "" },
      { title: "\"What if I cannot handle more work?\"", url: "", poster: "" },
      { title: "What this costs, and what it is worth", url: "", poster: "" },
      { title: "Who this is not for", url: "", poster: "" }
    ],

    // NOTE: there was a "Real People. Real Progress." block here, six landscape
    // testimonial tiles plus four vertical clips. Cut on Jake's instruction. The
    // screenshots below are the proof this page carries now, so the page goes
    // straight from the objection videos to the numbers.

    // The results wall. The same five screenshots the earlier pre-call page
    // uses, served from the app rather than copied, so there is one set of
    // files and they cannot drift apart.
    //
    // FULL URLS, not relative. This page is rendered on the GoHighLevel
    // domain, so a relative path would resolve against GHL and 404.
    //
    // WIDE, SHORT IMAGES. These are Ads Manager tables, not phone
    // screenshots, so they stack full width one per row rather than sitting
    // in a masonry. A table squeezed into a third of the page is unreadable,
    // and an unreadable proof screenshot is not proof.
    //
    // FLAGGED, ALREADY FLAGGED ONCE IN funnel/precall.js: results 1 and 2
    // show a saved column preset named "Peak Presence | Ad Set View" in the
    // toolbar, legible at full size. Peak Presence is the agency the earlier
    // page was modelled on. If that is not our own ad account, delete those
    // two entries: the heading above them says these numbers are ours.
    wins: [
      { src: "https://app.hauckmarketing.com/funnel/precall/result-1-campaigns-overview.png", alt: "Meta Ads Manager campaign results" },
      { src: "https://app.hauckmarketing.com/funnel/precall/result-2-campaigns-december.png", alt: "Meta Ads Manager campaign results, December" },
      { src: "https://app.hauckmarketing.com/funnel/precall/result-3-leads-cost.png", alt: "Leads and cost per lead" },
      { src: "https://app.hauckmarketing.com/funnel/precall/result-4-leads-budget.png", alt: "Leads, budget and spend" },
      { src: "https://app.hauckmarketing.com/funnel/precall/result-5-leads-reach.png", alt: "Leads, reach and impressions" }
    ],

    // How many show before the button appears. Five is the whole set, so no
    // button. Raise the count above the list length to hide it.
    winsVisible: 5
  };

  var ROOT_ID = "hpc";

  // The three notes under the hero video. Short on purpose: they are a
  // contents page for the video, not a summary of it.
  var HERO_POINTS = [
    { t: "What to expect", d: "Clear understanding of how the call runs" },
    { t: "How to prepare", d: "Two minutes of thinking that make it worth more" },
    { t: "Your next steps", d: "What happens after we speak" }
  ];

  // ---------------------------------------------------------------- styles
  //
  // NOTE: this block is a JS template literal. A backtick anywhere inside it,
  // including inside a CSS comment, silently ends the string and the whole
  // file stops parsing. There are none. Keep it that way.
  //
  // THE !important DISCIPLINE: GoHighLevel's own theme CSS ships with
  // !important on type, spacing and colour. An unweighted rule loses to it.
  // So every rule that decides how something looks carries !important, and the
  // resets at the top are narrow rather than blanket, because a blanket
  // margin reset also flattens our own paragraphs and buttons. That exact
  // mistake cost a rebuild on the Made Better review funnel.
  var STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

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

#hpc *, #hpc *::before, #hpc *::after { box-sizing:border-box !important; }

#hpc {
  --ink:#101317;
  --slate:#5B6472;
  --mute:#8A929E;
  --line:rgba(16,19,23,.10);
  --wash:#F3F4F6;
  --page:#FAFAFB;
  --white:#FFFFFF;
  --accent:#3FA96C;
  --accent-hi:#329058;
  --shade:#DFE2E6;
  --display:'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif;
  --body:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --pad:clamp(20px,5vw,32px);

  display:block !important;
  width:100% !important; max-width:100% !important;
  margin:0 !important; padding:0 !important;
  position:relative !important;
  overflow-x:hidden !important;
  background-color:var(--page) !important;
  font-family:var(--body) !important;
  font-size:16px !important;
  line-height:1.6 !important;
  color:var(--ink) !important;
  text-align:left !important;
  -webkit-font-smoothing:antialiased;
}

#hpc img { border:0 !important; max-width:100% !important; }

/* ---- band + shell -------------------------------------------------
   BAND PADDING IS THE PAGE'S ONLY VERTICAL RHYTHM, so it is the one number
   worth tuning. It was clamp(48,8vw,84). Tightened: the page is a shelf of
   things to watch, and a buyer who has to scroll past an empty half-screen
   between two rows of videos reads that as "there is not much here". */
#hpc .hp-band { width:100% !important; margin:0 !important; padding:clamp(34px,5vw,56px) var(--pad) !important; }
#hpc .hp-band--wash { background:var(--wash) !important; }
#hpc .hp-band--white { background:var(--white) !important; }
/* The first band holds two lines of text and nothing else, so it gets the
   tightest padding on the page. A confirmation should be the first thing on
   the screen, not the thing under the first swipe. */
#hpc .hp-band--top { padding-top:clamp(22px,3.5vw,34px) !important; padding-bottom:clamp(20px,3vw,28px) !important; }
#hpc .hp-in { width:100% !important; max-width:1040px !important; margin:0 auto !important; padding:0 !important; }
#hpc .hp-in--tight { max-width:760px !important; }

/* ---- type --------------------------------------------------------- */
#hpc h1, #hpc h2, #hpc h3 {
  font-family:var(--display) !important;
  color:var(--ink) !important;
  text-transform:none !important;
  letter-spacing:-.02em !important;
  margin:0 !important; padding:0 !important;
}
#hpc h1 {
  font-weight:600 !important;
  font-size:clamp(2.1rem,6.4vw,3.15rem) !important;
  line-height:1.06 !important;
  text-align:center !important;
}
#hpc h2 {
  font-weight:600 !important;
  font-size:clamp(1.45rem,3.9vw,2.05rem) !important;
  line-height:1.16 !important;
  text-align:center !important;
}
#hpc h3 {
  font-weight:600 !important;
  font-size:1rem !important;
  line-height:1.35 !important;
  letter-spacing:-.01em !important;
}
#hpc .hp-sub {
  font-family:var(--body) !important; font-weight:400 !important;
  font-size:.95rem !important; line-height:1.6 !important;
  color:var(--slate) !important; text-align:center !important;
  max-width:46ch !important; margin:12px auto 0 !important; padding:0 !important;
}
#hpc .hp-step {
  display:block !important;
  font-family:var(--display) !important; font-weight:600 !important;
  font-size:.66rem !important; letter-spacing:.2em !important;
  text-transform:uppercase !important; color:var(--mute) !important;
  text-align:center !important;
  margin:0 0 14px !important; padding:0 !important;
}

/* ---- confirmation head -------------------------------------------- */
#hpc .hp-pill {
  display:flex !important; align-items:center !important; justify-content:center !important;
  gap:8px !important; width:fit-content !important;
  font-family:var(--body) !important; font-size:.8rem !important; font-weight:500 !important;
  color:var(--slate) !important;
  background:var(--white) !important;
  border:1px solid var(--line) !important;
  border-radius:999px !important;
  padding:7px 15px !important;
  margin:0 auto 14px !important;
  box-shadow:0 1px 2px rgba(16,19,23,.04) !important;
}
#hpc .hp-pill svg { flex:0 0 14px !important; color:var(--accent) !important; }

/* ---- media tiles --------------------------------------------------- */
#hpc .hp-media {
  display:block !important; position:relative !important;
  width:100% !important; margin:0 !important; padding:0 !important;
  aspect-ratio:16 / 9 !important;
  /* background-COLOR, not the background shorthand. The shorthand carrying
     !important resets background-image to none and then outranks the inline
     poster the tile sets on itself, so every thumbnail silently vanishes. */
  background-color:var(--shade) !important;
  background-size:cover !important; background-position:center !important;
  background-repeat:no-repeat !important;
  border:0 !important; border-radius:12px !important;
  overflow:hidden !important;
  font-family:var(--body) !important;
  cursor:default !important;
}
#hpc button.hp-media { cursor:pointer !important; -webkit-appearance:none !important; appearance:none !important; }
#hpc button.hp-media:hover .hp-play { transform:scale(1.06) !important; background:var(--white) !important; }

#hpc .hp-shroud {
  position:absolute !important; inset:0 !important;
  background:linear-gradient(180deg, rgba(16,19,23,.12) 0%, rgba(16,19,23,.30) 100%) !important;
  pointer-events:none !important;
}
#hpc .hp-play {
  position:absolute !important; top:50% !important; left:50% !important;
  transform:translate(-50%,-50%) !important;
  transform-origin:center !important;
  width:54px !important; height:54px !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  border-radius:50% !important;
  background:rgba(255,255,255,.88) !important;
  color:var(--ink) !important;
  box-shadow:0 6px 20px -6px rgba(16,19,23,.4) !important;
  transition:transform .16s ease, background .16s ease !important;
  pointer-events:none !important;
}
#hpc .hp-soon {
  position:absolute !important; left:0 !important; right:0 !important; bottom:12px !important;
  font-family:var(--body) !important; font-size:.72rem !important; font-weight:500 !important;
  letter-spacing:.04em !important; text-transform:uppercase !important;
  color:rgba(16,19,23,.42) !important; text-align:center !important;
  margin:0 !important; padding:0 !important;
  pointer-events:none !important;
}
#hpc .hp-media iframe, #hpc .hp-media video {
  position:absolute !important; inset:0 !important;
  width:100% !important; height:100% !important;
  border:0 !important; display:block !important;
  background:#000 !important;
}
#hpc .hp-cap {
  display:block !important;
  font-family:var(--body) !important; font-size:.78rem !important; font-weight:500 !important;
  color:var(--mute) !important; text-align:center !important;
  margin:10px 0 0 !important; padding:0 !important;
}

/* ---- hero ---------------------------------------------------------- */
#hpc .hp-hero-media { max-width:760px !important; margin:20px auto 0 !important; }
#hpc .hp-hint {
  font-family:var(--body) !important; font-size:.78rem !important; font-weight:400 !important;
  color:var(--mute) !important; text-align:center !important;
  margin:8px 0 0 !important; padding:0 !important;
}
#hpc .hp-points {
  display:grid !important; grid-template-columns:repeat(3,1fr) !important;
  gap:clamp(16px,3vw,30px) !important;
  list-style:none !important;
  max-width:760px !important;
  margin:clamp(20px,3vw,28px) auto 0 !important; padding:0 !important;
}
#hpc .hp-points li { margin:0 !important; padding:0 !important; list-style:none !important; text-align:center !important; }
#hpc .hp-points b {
  display:block !important;
  font-family:var(--display) !important; font-weight:600 !important; font-size:.92rem !important;
  color:var(--ink) !important; letter-spacing:-.01em !important;
  margin:0 0 4px !important;
}
#hpc .hp-points span {
  display:block !important;
  font-family:var(--body) !important; font-size:.82rem !important; font-weight:400 !important;
  line-height:1.5 !important; color:var(--slate) !important;
}

/* ---- grids --------------------------------------------------------- */
#hpc .hp-grid {
  display:grid !important; grid-template-columns:repeat(2,1fr) !important;
  gap:clamp(18px,3vw,28px) !important;
  list-style:none !important;
  margin:clamp(22px,3.5vw,32px) 0 0 !important; padding:0 !important;
}
#hpc .hp-grid li { margin:0 !important; padding:0 !important; list-style:none !important; }

/* ---- results wall ---------------------------------------------------
   Stacked, one per row, NOT a masonry. The screenshots are Ads Manager
   tables: wide, short, and full of small figures. Three columns would make
   every number illegible, and a proof screenshot nobody can read proves
   nothing. */
#hpc .hp-wins {
  list-style:none !important;
  margin:clamp(22px,3.5vw,32px) 0 0 !important; padding:0 !important;
}
#hpc .hp-wins li {
  margin:0 0 clamp(14px,2vw,20px) !important; padding:0 !important;
  list-style:none !important;
}
#hpc .hp-wins img {
  display:block !important; width:100% !important; height:auto !important;
  border-radius:10px !important;
  border:1px solid var(--line) !important;
  background:var(--white) !important;
  box-shadow:0 10px 30px -22px rgba(16,19,23,.5) !important;
}
/* A table this wide cannot shrink to a phone and stay readable, so on small
   screens it holds close to its native size and scrolls sideways INSIDE its
   own row. The row scrolls; the page never does.
   300px is chosen so the figures are legible rather than merely present.
   Fitted to the width instead, these tables render at about six pixels a
   row, which is a picture of a screenshot rather than evidence. */
@media (max-width:640px) {
  #hpc .hp-wins li {
    overflow-x:auto !important;
    -webkit-overflow-scrolling:touch !important;
    border-radius:10px !important;
  }
  #hpc .hp-wins img { width:auto !important; max-width:none !important; height:300px !important; }
}
#hpc .hp-skel {
  display:block !important; width:100% !important;
  border-radius:10px !important;
  background:var(--shade) !important;
  opacity:.55 !important;
}
#hpc .hp-wins li[hidden] { display:none !important; }
#hpc .hp-more {
  display:block !important; width:fit-content !important;
  font-family:var(--display) !important; font-weight:600 !important; font-size:.82rem !important;
  color:var(--ink) !important;
  background:var(--white) !important;
  border:1px solid var(--line) !important;
  border-radius:999px !important;
  padding:10px 20px !important;
  margin:26px auto 0 !important;
  cursor:pointer !important;
  -webkit-appearance:none !important; appearance:none !important;
  transition:border-color .16s ease !important;
}
#hpc .hp-more:hover { border-color:rgba(16,19,23,.3) !important; }
#hpc .hp-live {
  display:flex !important; align-items:center !important; justify-content:center !important;
  gap:7px !important;
  font-family:var(--body) !important; font-size:.75rem !important; font-weight:400 !important;
  color:var(--mute) !important;
  margin:14px 0 0 !important; padding:0 !important;
}
#hpc .hp-dot {
  width:6px !important; height:6px !important; border-radius:50% !important;
  background:var(--accent) !important; display:block !important; flex:0 0 6px !important;
}

/* ---- closing --------------------------------------------------------
   The "Next Step: Show Up Ready" band that used to sit here is gone on Jake's
   instruction, along with its mark, its Check Your Email plate and its fine
   print. The results wall is now the last thing they read before the footer,
   which is the right note to leave them on. */
#hpc .hp-foot {
  border-top:1px solid var(--line) !important;
  text-align:center !important;
  padding:22px var(--pad) !important; margin:0 !important;
  background:var(--page) !important;
}
#hpc .hp-foot p {
  font-family:var(--body) !important; font-size:.72rem !important; font-weight:400 !important;
  color:var(--mute) !important; text-align:center !important;
  margin:0 !important; padding:0 !important;
}
/* Scoped under .hp-foot deliberately: the rule above it targets every p in
   the footer and would otherwise out-specify this one and grey the wordmark
   out. */
#hpc .hp-foot .hp-wordmark {
  font-family:var(--display) !important; font-weight:600 !important; font-size:.88rem !important;
  letter-spacing:-.01em !important; color:var(--ink) !important;
  margin:0 0 8px !important; padding:0 !important; text-align:center !important;
}

/* ---- responsive -----------------------------------------------------
   The two "columns" rules that used to live here were left over from when the
   wins wall was a masonry. They survived the rewrite to a stacked list and
   were quietly putting two Ads Manager tables side by side on a tablet, which
   is exactly what the stacked layout exists to prevent. Removed. */
@media (max-width:640px) {
  #hpc .hp-grid { grid-template-columns:1fr !important; }
  #hpc .hp-points { grid-template-columns:1fr !important; gap:18px !important; }
  #hpc .hp-play { width:46px !important; height:46px !important; }
}

#hpc :focus-visible { outline:3px solid var(--accent) !important; outline-offset:3px !important; }
@media (prefers-reduced-motion: reduce) {
  #hpc .hp-play, #hpc .hp-more { transition:none !important; }
}
`;

  // ------------------------------------------------------------- glyphs
  var TICK = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8.5 6 12l7.5-8"/></svg>';
  var PLAY = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.7-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2z"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ------------------------------------------------------- video plumbing
  //
  // Everything here is about ONE decision: no video is loaded until it is
  // clicked. This page can hold seventeen of them. Seventeen live YouTube
  // iframes is several megabytes and a second of main-thread work before a
  // buyer sees anything, on a page whose entire value is that they actually
  // watch it. So each tile is a poster and a play button, and the iframe is
  // built on click with autoplay already set.

  function youtubeId(u) {
    var m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
  function vimeoId(u) {
    var m = u.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
    return m ? m[1] : null;
  }
  function loomId(u) {
    var m = u.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]{8,})/);
    return m ? m[1] : null;
  }
  function isFile(u) { return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u); }

  // The URL that actually goes in the iframe once clicked. Autoplay is on
  // because the click WAS the play press, and muted is off because they asked
  // for sound by clicking.
  function embedUrl(u) {
    var id = youtubeId(u);
    if (id) return "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
    id = vimeoId(u);
    if (id) return "https://player.vimeo.com/video/" + id + "?autoplay=1&title=0&byline=0";
    id = loomId(u);
    if (id) return "https://www.loom.com/embed/" + id + "?autoplay=1";
    return u;
  }

  // A YouTube poster comes free. Everything else needs one supplied, and
  // without one the tile is a plain grey card, which is honest and fine.
  function posterFor(item) {
    if (item.poster) return item.poster;
    var id = item.url ? youtubeId(item.url) : null;
    return id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : "";
  }

  // opts: { label:string }
  //
  // Every tile on this page is now 16/9. The portrait variant and the name
  // plate that sat on the footage went with the testimonial section.
  function media(item, opts) {
    opts = opts || {};
    var poster = posterFor(item);
    // !important on the inline rule too, so a GHL theme that styles buttons
    // cannot take the poster back off.
    var bg = poster
      ? " style=\"background-image:url('" + esc(poster).replace(/['()]/g, "") + "') !important\""
      : "";

    // No URL yet. Not a button, because there is nothing to press.
    if (!item.url) {
      return '<div class="hp-media">' +
        '<span class="hp-play">' + PLAY + "</span>" +
        '<span class="hp-soon">Video coming soon</span>' +
        "</div>";
    }

    var aria = opts.label ? esc(opts.label) : "Play video";
    return '<button type="button" class="hp-media"' + bg +
      ' data-src="' + esc(embedUrl(item.url)) + '"' +
      ' data-file="' + (isFile(item.url) ? "1" : "0") + '"' +
      ' aria-label="Play: ' + aria + '">' +
      (poster ? '<span class="hp-shroud"></span>' : "") +
      '<span class="hp-play">' + PLAY + "</span>" +
      "</button>";
  }

  // --------------------------------------------------------------- view
  function view() {
    var i;

    // 1. confirmation head + step one
    var points = HERO_POINTS.map(function (p) {
      return "<li><b>" + esc(p.t) + "</b><span>" + esc(p.d) + "</span></li>";
    }).join("");

    var head = '' +
      '<div class="hp-band hp-band--top">' +
        '<div class="hp-in hp-in--tight">' +
          '<p class="hp-pill">' + TICK + "Your Strategy Call is Confirmed</p>" +
          "<h1>You're Booked.</h1>" +
        "</div>" +
      "</div>" +
      '<div class="hp-band hp-band--white" style="padding-top:clamp(22px,3.5vw,32px)!important">' +
        '<div class="hp-in hp-in--tight">' +
          '<span class="hp-step">Step 1</span>' +
          "<h2>Watch This Short Video</h2>" +
          '<div class="hp-hero-media">' +
            media({ url: CONFIG.heroVideo, poster: CONFIG.heroPoster }, { label: "Welcome video" }) +
          "</div>" +
          // Nothing at all when there is no video, rather than a blank line
          // holding the space open. An empty line under an empty tile is the
          // exact kind of whitespace that has no job.
          (CONFIG.heroVideo ? '<p class="hp-hint">(click for sound)</p>' : "") +
          '<ul class="hp-points">' + points + "</ul>" +
        "</div>" +
      "</div>";

    // 2. objections
    var objs = "";
    for (i = 0; i < CONFIG.objections.length; i++) {
      var o = CONFIG.objections[i];
      objs += "<li>" + media(o, { label: o.title }) +
        '<span class="hp-cap">' + esc(o.title) + "</span></li>";
    }
    var step2 = '' +
      '<div class="hp-band hp-band--wash">' +
        '<div class="hp-in">' +
          '<span class="hp-step">Step 2</span>' +
          "<h2>Get Your Questions Answered</h2>" +
          '<p class="hp-sub">Most people have the same questions before the call. Watch these short videos to get clarity.</p>' +
          '<ul class="hp-grid">' + objs + "</ul>" +
        "</div>" +
      "</div>";

    // 3. wins wall
    var wins = "";
    var total = CONFIG.wins.length;
    if (total) {
      for (i = 0; i < total; i++) {
        // A plain string still works, so the list can be a bare array of URLs
        // when nobody has bothered writing alt text.
        var w = CONFIG.wins[i];
        var wsrc = typeof w === "string" ? w : w.src;
        var walt = typeof w === "string" ? "Campaign results screenshot" : (w.alt || "Campaign results screenshot");
        var hide = i >= CONFIG.winsVisible ? " hidden" : "";
        wins += "<li" + hide + '><img src="' + esc(wsrc) +
          '" alt="' + esc(walt) + '" loading="lazy"></li>';
      }
    } else {
      // Skeletons at varied heights, so the shape of the section is legible
      // before a single screenshot exists.
      var hs = [148, 96, 176, 120, 200, 108, 132, 168, 92];
      for (i = 0; i < hs.length; i++) {
        wins += '<li><span class="hp-skel" style="height:' + hs[i] + 'px"></span></li>';
      }
    }
    var moreBtn = total > CONFIG.winsVisible
      ? '<button type="button" class="hp-more" data-more="1">Show all ' + total + " wins</button>"
      : "";
    // WHITE, not wash. With the testimonial band gone this now sits directly
    // under Step 2, and two wash bands touching read as one very long section
    // with a stray heading in the middle of it.
    var winsBlock = '' +
      '<div class="hp-band hp-band--white">' +
        '<div class="hp-in">' +
          // The copy names what the screenshots actually are. They are Ads
          // Manager exports, not client conversations, and a heading that
          // promises conversations over a picture of a spend table is the
          // kind of small lie a buyer notices.
          "<h2>Look Through The Results</h2>" +
          '<p class="hp-sub">Real campaigns, real numbers, straight out of Ads Manager. Judge for yourself.</p>' +
          '<ul class="hp-wins">' + wins + "</ul>" +
          moreBtn +
          '<p class="hp-live"><span class="hp-dot"></span>Pulled straight from the ad accounts</p>' +
        "</div>" +
      "</div>";

    // 4. footer. All that is left of the closing section.
    var foot = '' +
      '<div class="hp-foot">' +
        '<p class="hp-wordmark">Hauck Marketing</p>' +
        "<p>&copy; " + new Date().getFullYear() + " Hauck Marketing. All rights reserved.</p>" +
      "</div>";

    return head + step2 + winsBlock + foot;
  }

  // ------------------------------------------------------------ behaviour
  function wire(root) {
    root.addEventListener("click", function (ev) {
      var more = ev.target.closest ? ev.target.closest("[data-more]") : null;
      if (more) {
        var hidden = root.querySelectorAll(".hp-wins li[hidden]");
        for (var i = 0; i < hidden.length; i++) hidden[i].removeAttribute("hidden");
        more.remove();
        return;
      }

      var tile = ev.target.closest ? ev.target.closest("button.hp-media") : null;
      if (!tile || !tile.getAttribute("data-src")) return;

      var src = tile.getAttribute("data-src");
      var file = tile.getAttribute("data-file") === "1";

      // Swap the facade for the real player. The tile becomes a plain div
      // because it is no longer something you press.
      var box = document.createElement("div");
      box.className = tile.className;
      box.style.cssText = "background-image:none !important";

      if (file) {
        var v = document.createElement("video");
        v.src = src;
        v.controls = true;
        v.autoplay = true;
        v.setAttribute("playsinline", "");
        box.appendChild(v);
      } else {
        var f = document.createElement("iframe");
        f.src = src;
        f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen");
        f.setAttribute("allowfullscreen", "");
        f.setAttribute("loading", "eager");
        f.setAttribute("title", tile.getAttribute("aria-label") || "Video");
        box.appendChild(f);
      }
      tile.replaceWith(box);
    });
  }

  // Same reasoning as the Willis funnel: inline !important beats any theme
  // rule without having to guess its selector, and it is what lets #hpc be
  // width:100% instead of measuring the viewport with a --vw breakout. The
  // breakout depends on a ResizeObserver that min-height:100vh silences, so
  // this page does not use one at all.
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
    if (!document.querySelector("style[data-hm-precall]")) {
      var style = document.createElement("style");
      style.setAttribute("data-hm-precall", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    flattenWrappers(root);
    root.innerHTML = view();
    wire(root);
  }

  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) { setTimeout(boot, 50); return; }
      console.error(
        '[hauck/precall] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        "The GHL step needs BOTH lines of the stub: the div and the script tag."
      );
      return;
    }
    if (root.getAttribute("data-hpc-ready")) return;
    root.setAttribute("data-hpc-ready", "1");
    mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
