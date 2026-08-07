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
//  - Dark, neutral and quiet. NO GREEN ANYWHERE, Jake's explicit call: the
//    brand's forest green belongs on the website, not on this page.
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

  // Where the self-hosted media lives. ABSOLUTE, and it has to be: this file is
  // served from app.hauckmarketing.com but the page renders on the GoHighLevel
  // domain, so a relative path resolves against GHL and 404s.
  var VID = "https://app.hauckmarketing.com/sites/hauck/";

  var CONFIG = {

    // The single video at the top. The one that sets up the call.
    //
    // FULL URLS, not relative, for the same reason the wins images below are:
    // this page renders on the GoHighLevel domain, so a relative path resolves
    // against GHL and 404s.
    //
    // Self-hosted rather than YouTube or Loom, so no third-party branding or
    // "watch next" grid lands on a page a prospect sees right before a call.
    // The source recording was 68.8 MB, which Cloudflare Pages rejects outright
    // (25 MiB per-file cap); this is the same recording at 1.25x, 30fps,
    // H.264 CRF 23, 16.85 MiB. Re-encode from the original if it ever changes,
    // never from this file.
    //
    // The poster is slide 1 of the deck rendered straight off
    // /sites/hauck/precall-step1, not a frame grab, so Jake's webcam bubble is
    // not in it.
    heroVideo: "https://app.hauckmarketing.com/sites/hauck/precall-step1.mp4",
    heroPoster: "https://app.hauckmarketing.com/sites/hauck/precall-step1-poster.png",

    // WebVTT captions, on by default. Optional: leave it empty and the player
    // simply has no subtitle track.
    //
    // Transcribed from the SHIPPED 1.25x cut, not the original, so the timings
    // line up. Re-transcribe if the video is ever re-cut; a caption file from
    // the old edit drifts further out of sync the longer it plays.
    heroCaptions: "https://app.hauckmarketing.com/sites/hauck/precall-step1.vtt",

    // STEP 2. The eight breakout videos, one objection each.
    //
    // Self-hosted for the same reason the hero is: no third-party branding and
    // no "watch next" grid on the page a prospect sees right before a call.
    //
    // Each was cut from Jake's raw OBS take: trimmed to the first and last word
    // (the takes ran ~2s long on the tail, and he starts talking at ~0.2s), then
    // 1.2x, 30fps, H.264 CRF 24. Biggest is 6.3 MiB against Cloudflare Pages'
    // 25 MiB per-file cap. Re-cut from the raw take in "Pre-Call Vids", never
    // from these files.
    //
    // The posters are slide 1 of each deck rendered straight off
    // /sites/hauck/precall-vN-*, not frame grabs, so Jake's webcam bubble is in
    // none of them.
    //
    // `len` IS HAND-MAINTAINED and the page trusts it. It cannot be read from
    // the file, because the whole design of this page is that no video loads
    // until it is clicked, and duration only arrives with the metadata. Re-cut
    // a video and this string goes stale silently. Update it in the same edit.
    objections: [
      { title: "What To Expect When Working With Us",
        url: VID + "precall-v1-what-to-expect.mp4",
        poster: VID + "precall-v1-what-to-expect-poster.png", len: "1:44" },
      { title: "Our 7 Day Lead Generation Timeline",
        url: VID + "precall-v2-seven-day-timeline.mp4",
        poster: VID + "precall-v2-seven-day-timeline-poster.png", len: "1:21" },
      { title: "Why Our Leads Are Truly Exclusive",
        url: VID + "precall-v3-truly-exclusive.mp4",
        poster: VID + "precall-v3-truly-exclusive-poster.png", len: "1:37" },
      { title: "How Ad Spend Works",
        url: VID + "precall-v4-ad-spend.mp4",
        poster: VID + "precall-v4-ad-spend-poster.png", len: "1:32" },
      { title: "What Happens If This Doesn't Work",
        url: VID + "precall-v5-if-it-doesnt-work.mp4",
        poster: VID + "precall-v5-if-it-doesnt-work-poster.png", len: "1:53" },
      { title: "Our Lead Guarantee & Service Agreement",
        url: VID + "precall-v6-guarantee-agreement.mp4",
        poster: VID + "precall-v6-guarantee-agreement-poster.png", len: "1:07" },
      { title: "How We Guarantee Qualified Leads",
        url: VID + "precall-v7-qualified-leads.mp4",
        poster: VID + "precall-v7-qualified-leads-poster.png", len: "1:47" },
      { title: "How You'll Track Every Lead & Job",
        url: VID + "precall-v8-dashboard.mp4",
        poster: VID + "precall-v8-dashboard-poster.png", len: "2:01" }
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

/* DARK AND NEUTRAL, on Jake's call, twice.
   The first pass took "dark" to mean the brand's deep forest and tinted every
   surface green. Jake's correction was exact: "I don't want it green, I want
   it dark." So there is now NO GREEN ON THIS PAGE AT ALL, not in the
   surfaces, not in the step numbers, not in the tick or the live dot. If a
   future session reaches for the brand green here, that is the thing being
   asked not to happen.

   The greys are very slightly cool rather than pure neutral. A pure #111 dark
   goes muddy next to the blue-white of the Ads Manager screenshots, which are
   the one thing on the page whose colour cannot be chosen.

   TOKEN NAMES ARE UNCHANGED AND ONLY THE VALUES MOVED, which is the same
   move the main site's repaint made. --white now names a raised control
   surface (the pill, the show-all button) rather than the colour white.
   Renaming would have meant touching forty selectors to repaint one page, and
   every one of those is a chance to miss something.

   ONE SURFACE, NOT ALTERNATING BANDS, on Jake's call: --page everywhere, and
   the sections are told apart by a white rule between them instead of by a
   change of tone. The alternation is gone entirely rather than kept and
   overridden, so there is no second surface left to drift. */
#hpc {
  --ink:#F4F6F8;
  --slate:#AEB4BC;
  --mute:#7B828B;
  --line:rgba(255,255,255,.10);
  --page:#0D0E10;
  --white:#161719;
  /* --accent is near-white now, not a colour. It survives as a token because
     the tick, the live dot and the focus ring all read from it, and one of
     those is an accessibility control. */
  --accent:#E8EAEE;
  --accent-hi:#FFFFFF;
  --shade:#212429;
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

/* THE DIVIDERS. Every section sits on the same dark, so the only thing
   separating them is this rule. Full bleed edge to edge rather than inset to
   the 1040px column: an inset rule reads as an underline belonging to the
   block above it, a full-width one reads as a break between two things.
   Applied with the adjacent-sibling combinator so the first band never gets a
   line above it, which would draw a stripe across the very top of the page. */
#hpc .hp-band + .hp-band { border-top:1px solid #FFFFFF !important; }
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
/* STEP 1 / STEP 2 are announcements, not captions. They used to be a .66rem
   grey micro-label, which is the convention, and the convention was wrong for
   a page whose whole instruction to the buyer is "do these two things".

   Big and 700, as asked. NOT the brand green: see the token block.

   With the colour gone, the hierarchy has to come from brightness instead, so
   the step sits at --slate and the headline under it at --ink. Both bright,
   the headline brighter. Two lines of near-white at this size read as two
   headlines arguing; a bright grey label over a white headline reads as a
   label over a headline, which is what it is.

   Tracking drops from .2em to .04em, because letter spacing that wide is a
   device for making small type legible and it makes large type look
   stretched. */
#hpc .hp-step {
  display:block !important;
  font-family:var(--display) !important; font-weight:700 !important;
  font-size:clamp(1.5rem,4.2vw,2.15rem) !important;
  line-height:1.1 !important; letter-spacing:.04em !important;
  text-transform:uppercase !important; color:var(--slate) !important;
  text-align:center !important;
  margin:0 0 6px !important; padding:0 !important;
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
  box-shadow:none !important;
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
/* #fff, NOT var(--white). That token now names a dark raised panel, so
   inheriting it here would turn the play button dark on hover and make it
   vanish into the poster. */
#hpc button.hp-media:hover .hp-play { transform:scale(1.06) !important; background:#FFFFFF !important; }

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
  background:rgba(255,255,255,.92) !important;
  /* A LITERAL dark, not var(--ink). --ink is near-white on this page, so the
     triangle would have been white-on-white and the button would have looked
     empty. Keep this in step with --page. */
  color:#0D0E10 !important;
  box-shadow:0 6px 20px -6px rgba(0,0,0,.6) !important;
  transition:transform .16s ease, background .16s ease !important;
  pointer-events:none !important;
}
#hpc .hp-soon {
  position:absolute !important; left:0 !important; right:0 !important; bottom:12px !important;
  font-family:var(--body) !important; font-size:.72rem !important; font-weight:500 !important;
  letter-spacing:.04em !important; text-transform:uppercase !important;
  color:rgba(242,246,243,.45) !important; text-align:center !important;
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
/* The title sits ABOVE its tile, so it has to hold a fixed two-line box. One
   title in the set wraps and the rest do not, and without a reserved second
   line the tile under a one-line title rides up and the row stops being a row.
   flex-end so a single-line title sits on the same baseline as the second line
   of a wrapped one. */
#hpc .hp-cap--top {
  display:flex !important; align-items:flex-end !important; justify-content:center !important;
  min-height:2.7em !important; line-height:1.35 !important;
  font-family:var(--display) !important; font-size:.95rem !important; font-weight:600 !important;
  color:var(--ink) !important; letter-spacing:-.01em !important;
  margin:0 0 10px !important; padding:0 !important;
}
#hpc .hp-len {
  display:block !important;
  font-family:var(--body) !important; font-size:.74rem !important; font-weight:500 !important;
  letter-spacing:.04em !important;
  color:var(--mute) !important; text-align:center !important;
  margin:8px 0 0 !important; padding:0 !important;
  font-variant-numeric:tabular-nums !important;
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
/* THE SCREENSHOTS STAY WHITE. They are Ads Manager exports and there is no
   honest way to darken them: tinting a screenshot is editing evidence. So
   they are framed instead, as bright documents laid on a dark desk, and the
   border is a light hairline so the frame belongs to the page rather than
   looking like the image failed to load its own edge. */
#hpc .hp-wins img {
  display:block !important; width:100% !important; height:auto !important;
  border-radius:10px !important;
  border:1px solid rgba(255,255,255,.14) !important;
  background:#FFFFFF !important;
  box-shadow:0 14px 34px -20px rgba(0,0,0,.8) !important;
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
#hpc .hp-more:hover { border-color:rgba(255,255,255,.32) !important; }
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
  /* Same white rule as between the bands. The footer is a section too. */
  border-top:1px solid #FFFFFF !important;
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
      (item.captions ? ' data-cc="' + esc(item.captions) + '"' : "") +
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
      '<div class="hp-band" style="padding-top:clamp(22px,3.5vw,32px)!important">' +
        '<div class="hp-in hp-in--tight">' +
          '<span class="hp-step">Step 1</span>' +
          "<h2>Watch This Short Video</h2>" +
          '<div class="hp-hero-media">' +
            media({ url: CONFIG.heroVideo, poster: CONFIG.heroPoster, captions: CONFIG.heroCaptions }, { label: "Welcome video" }) +
          "</div>" +
          // Nothing at all when there is no video, rather than a blank line
          // holding the space open. An empty line under an empty tile is the
          // exact kind of whitespace that has no job.
          (CONFIG.heroVideo ? '<p class="hp-hint">(click for sound)</p>' : "") +
          '<ul class="hp-points">' + points + "</ul>" +
        "</div>" +
      "</div>";

    // 2. objections
    //
    // Title ABOVE the tile, running time BELOW it, on Jake's instruction. The
    // title is the thing that decides whether they press play, so it reads
    // first; the length is the thing that decides whether they press play NOW,
    // so it sits under the tile where it answers "how long is this" without
    // competing with the title.
    var objs = "";
    for (i = 0; i < CONFIG.objections.length; i++) {
      var o = CONFIG.objections[i];
      objs += "<li>" +
        '<span class="hp-cap hp-cap--top">' + esc(o.title) + "</span>" +
        media(o, { label: o.title }) +
        (o.len ? '<span class="hp-len">' + esc(o.len) + "</span>" : "") +
        "</li>";
    }
    var step2 = '' +
      '<div class="hp-band">' +
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
    var winsBlock = '' +
      '<div class="hp-band">' +
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
        var cc = tile.getAttribute("data-cc");
        // crossOrigin must be set BEFORE src, and only when there are captions
        // to load. A <track> from another origin is refused without it, and
        // setting it unconditionally would put a CORS check on the video file
        // for no reason.
        if (cc) v.crossOrigin = "anonymous";
        v.src = src;
        v.controls = true;
        v.autoplay = true;
        v.setAttribute("playsinline", "");
        if (cc) {
          var t = document.createElement("track");
          t.kind = "captions";
          t.srclang = "en";
          t.label = "English";
          t.src = cc;
          t.default = true;
          v.appendChild(t);
          // Safari ignores the default attribute often enough that the only
          // reliable switch is the TextTrack itself, once it exists.
          v.addEventListener("loadedmetadata", function () {
            if (v.textTracks && v.textTracks[0]) v.textTracks[0].mode = "showing";
          });
        }
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

  // A DARK PAGE HAS TO CLAIM THE DOCUMENT, not just its own div.
  //
  // #hpc paints its own background, but it only covers the box it occupies.
  // Everything outside that box is still GoHighLevel's white: the strip under
  // the footer when the content is shorter than the viewport, the overscroll
  // rubber band at the top of the page on iOS, and the scrollbar track, which
  // Windows draws light unless color-scheme says otherwise.
  //
  // Each of those is a white flash on a page that is meant to be dark, so the
  // background goes on <html> and <body> too. Safe here in a way it would not
  // be in a shared component: this file only ever runs on its own GHL step,
  // where our div IS the page.
  function darkenDocument() {
    var el = [document.documentElement, document.body];
    for (var i = 0; i < el.length; i++) {
      if (!el[i]) continue;
      el[i].style.setProperty("background-color", "#0D0E10", "important");
      el[i].style.setProperty("color-scheme", "dark", "important");
    }
  }

  function mount(root) {
    if (!document.querySelector("style[data-hm-precall]")) {
      var style = document.createElement("style");
      style.setAttribute("data-hm-precall", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    darkenDocument();
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
