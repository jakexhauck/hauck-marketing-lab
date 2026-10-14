// WILLIS WINDOWS — the Services page of williswindows.com, served rather than pasted.
//
// GoHighLevel holds a two-line stub on the "Services" page and nothing else:
//
//     <div id="wws"></div>
//     <script src="https://app.hauckmarketing.com/sites/willis/site/services.js"></script>
//
// Everything the page IS lives here, so copy, styling and photos ship by deploy
// instead of by reopening the GHL code editor, which does not open.
//
// PORTED, NOT REWRITTEN. The CSS and markup below came off the live block as it
// stood on 2026-08-12. The photos, which used to be base64 data URIs inside the
// markup, are now real files in ./img/ and shared between pages.
//
// The page's own behaviour is a real function here rather than a <script> tag in
// the markup, because innerHTML never executes script tags and the burger menu
// would silently die.
//
// One classic script rather than an ES module on purpose: a cross-origin module
// script requires CORS headers, a classic script does not. This is served from
// app.hauckmarketing.com and rendered on the GHL domain, so it is always
// cross-origin.

(function () {
  "use strict";

  var ROOT_ID = "wws";

  // Where the photos live. Worked out from this file's own URL rather than
  // hardcoded, so the same file serves from localhost, a preview deploy and
  // production without an edit. The paths in HTML are written as __IMG__.
  var SELF = (document.currentScript && document.currentScript.src) || "";
  var IMG = SELF
    ? SELF.replace(/[^/]+$/, "") + "img/"
    : "https://app.hauckmarketing.com/sites/willis/site/img/";

  var CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

/* ============ GHL FULL-BLEED OVERRIDES ============ */
.ww-scope, .ww-scope * { box-sizing: border-box; }
.hl_page-preview--content .c-column, .hl_page-preview--content .c-row,
.hl_page-preview--content .c-section, .c-column, .c-row, .c-section,
.c-wrapper, .inner, #ghl-inner, .container-fluid {
  padding-left: 0 !important; padding-right: 0 !important;
  max-width: 100% !important; width: 100% !important;
}
/* kill the white gap GHL leaves above the first section */
.hl_page-preview--content .c-section:first-child,
.c-section:first-child, .c-row:first-child, .c-column:first-child {
  padding-top: 0 !important; margin-top: 0 !important;
}
.ww-scope { width: 100vw; margin-left: calc(50% - 50vw); margin-top: 0; }
.ww-scope > .ww-head:first-child { margin-top: 0; }

/* ============ TOKENS ============ */
.ww-scope {
  --navy:#183E63; --navy-deep:#0F2A45; --steel:#4291BC; --sky:#65BDE5;
  --cream:#FBF7DE; --gold:#FFC72C; --ink:#14293D; --slate:#51657A; --line:rgba(24,62,99,.13);
  --white:#fff; --wash:#F4F8FB;
  --display:'Plus Jakarta Sans',system-ui,sans-serif;
  --body:'Inter',system-ui,sans-serif;
  --pad: clamp(28px,5vw,64px);
  --sect: clamp(64px,8vw,112px);
  --shadow: 0 18px 40px -22px rgba(15,42,69,.45);
  font-family: var(--body);
  color: var(--ink);
  background: var(--white);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.ww-scope img, .ww-scope video { max-width:100%; display:block; }
.ww-scope a { text-decoration: none; }
.ww-scope a:not(.ww-btn) { color: inherit; }
.ww-scope p { margin: 0 0 1em; }
.ww-scope h1,.ww-scope h2,.ww-scope h3,.ww-scope h4 {
  font-family: var(--display); color: var(--navy-deep);
  margin: 0 0 .5em; line-height: 1.12; letter-spacing: -.02em; font-weight: 800;
}
.ww-scope h1 { font-size: clamp(2.15rem,5.2vw,4rem); }
.ww-scope h2 { font-size: clamp(1.75rem,3.6vw,2.85rem); }
.ww-scope h3 { font-size: clamp(1.15rem,1.7vw,1.45rem); font-weight:700; }
.ww-scope :focus-visible { outline: 3px solid var(--sky); outline-offset: 3px; }

.ww-wrap { width:100%; max-width:1180px; margin:0 auto; padding:0 var(--pad); }
.ww-sect { padding: var(--sect) 0; }
.ww-sect--wash { background: var(--wash); }
.ww-sect--navy { background: var(--navy-deep); color:#D9E6F2; }
.ww-sect--navy h2, .ww-sect--navy h3 { color:#fff; }

/* eyebrow + water rule (signature) */
.ww-eyebrow {
  font-family: var(--display); font-size:.78rem; font-weight:700;
  letter-spacing:.16em; text-transform:uppercase; color: var(--steel);
  display:flex; align-items:center; gap:12px; margin-bottom:14px;
}
.ww-eyebrow::after {
  content:''; height:2px; flex:0 0 56px; border-radius:2px;
  background: linear-gradient(90deg,var(--sky),rgba(101,189,229,0));
}
.ww-sect--navy .ww-eyebrow { color: var(--sky); }
.ww-banner .ww-eyebrow, .ww-hero .ww-eyebrow { color:#fff; }
.ww-lede { font-size: clamp(1.02rem,1.35vw,1.18rem); color: var(--slate); max-width: 62ch; }
.ww-sect--navy .ww-lede { color:#B9CDE0; }

/* ============ BUTTONS ============ */
.ww-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  font-family:var(--display); font-weight:700; font-size:1rem;
  padding:15px 28px; border-radius:10px; border:2px solid transparent;
  cursor:pointer; transition:transform .16s ease, box-shadow .16s ease, background .16s ease;
}
.ww-btn--primary { background: var(--steel); color:#fff; box-shadow:0 12px 26px -14px rgba(66,145,188,.9); }
.ww-btn--primary:hover { background:#357da4; transform:translateY(-2px); }
.ww-btn--ghost { border-color: rgba(255,255,255,.5); color:#fff; }
.ww-btn--ghost:hover { background: rgba(255,255,255,.12); }
.ww-btn--outline { border-color: var(--navy); color: var(--navy); }
.ww-btn--outline:hover { background: var(--navy); color:#fff; }
.ww-btn--sun { background: var(--gold); color: #10202E; box-shadow:0 12px 26px -14px rgba(255,199,44,.75); }
.ww-btn--sun:hover { background:#FFD455; }
.ww-btn--sun:hover { transform:translateY(-2px); }

/* ============ HEADER ============ */
.ww-head {
  position:sticky; top:0; z-index:900; background:rgba(15,42,69,.97);
  backdrop-filter: blur(10px); border-bottom:1px solid rgba(255,255,255,.1);
}
.ww-head__in { display:flex; align-items:center; gap:20px; height:76px; }
.ww-head__logo { display:flex; align-items:center; gap:10px; margin-right:auto; }
.ww-head__logo img { height:44px; width:auto; }
.ww-head__logo span { font-family:var(--display); font-weight:800; color:#fff; font-size:1.06rem; letter-spacing:-.01em; }
.ww-nav { display:flex; gap:30px; margin-right: clamp(18px,3vw,40px); }
/* .ww-scope prefix beats the \`a:not(.ww-btn){color:inherit}\` reset above */
.ww-scope .ww-nav a { font-weight:600; font-size:.95rem; color:#fff; padding:6px 0; border-bottom:2px solid transparent; }
.ww-scope .ww-nav a:hover { color:#fff; border-color: var(--sky); }
.ww-scope .ww-nav a[aria-current="page"] { color:#fff; border-color: var(--sky); }
.ww-head .ww-btn { padding:11px 20px; font-size:.92rem; }
.ww-burger { display:none; background:none; border:0; padding:8px; cursor:pointer; }
.ww-burger span { display:block; width:24px; height:2px; background:#fff; margin:5px 0; border-radius:2px; }

@media (max-width: 900px) {
  .ww-nav {
    position:absolute; top:76px; left:0; right:0; background:var(--navy-deep);
    flex-direction:column; gap:0; padding:8px 0 18px; display:none;
    border-bottom:1px solid rgba(255,255,255,.12);
  }
  .ww-nav.is-open { display:flex; }
  .ww-nav a { padding:14px var(--pad); border-bottom:0; }
  .ww-burger { display:block; order:3; }
  .ww-head .ww-btn { order:2; }
  .ww-head__in { position:relative; }
}
@media (max-width: 560px) { .ww-head .ww-btn span.lbl { display:none; } }

/* ============ HERO ============ */
.ww-hero { position:relative; background:var(--navy-deep); color:#fff; overflow:hidden; }
.ww-hero__media { position:absolute; inset:0; }
.ww-hero__media video, .ww-hero__media img { width:100%; height:100%; object-fit:cover; }
.ww-hero__media::after {
  content:''; position:absolute; inset:0;
  background: linear-gradient(105deg, rgba(15,42,69,.94) 0%, rgba(15,42,69,.82) 45%, rgba(24,62,99,.55) 100%);
}
.ww-hero__in { position:relative; padding: clamp(72px,10vw,132px) 0 clamp(64px,8vw,110px); max-width:760px; }
.ww-hero h1 { color:#fff; }
.ww-hero h1 em { font-style:normal; color:var(--sky); }
.ww-hero p { color:#C8DCEC; font-size: clamp(1.02rem,1.4vw,1.18rem); max-width:56ch; }
.ww-hero__cta { display:flex; flex-wrap:wrap; gap:14px; margin-top:30px; }
.ww-hero__badges { display:flex; flex-wrap:wrap; gap:10px 8px; margin-top:34px; }
.ww-chip {
  display:inline-flex; align-items:center; gap:7px; font-size:.83rem; font-weight:600;
  padding:8px 14px; border-radius:999px; border:1px solid rgba(101,189,229,.42);
  background:rgba(101,189,229,.1); color:#DCEDF8;
}
.ww-chip svg { flex:0 0 15px; }

/* page banner (interior pages) */
.ww-banner { background:var(--navy-deep); color:#fff; padding: clamp(56px,7vw,92px) 0 clamp(48px,6vw,80px); position:relative; overflow:hidden; }
.ww-banner::before {
  content:''; position:absolute; right:-120px; top:-120px; width:420px; height:420px; border-radius:50%;
  background: radial-gradient(circle, rgba(101,189,229,.28), transparent 68%);
}
.ww-banner h1 { color:#fff; position:relative; }
.ww-banner p { color:#C0D6E8; max-width:58ch; position:relative; margin-bottom:0; }

/* ============ FEATURED / TRUST STRIP ============ */
.ww-strip { background: #EDEFF2; border-top:1px solid rgba(24,62,99,.07); border-bottom:1px solid rgba(24,62,99,.07); }
.ww-strip__in { display:flex; align-items:center; justify-content:center; gap:14px 28px; flex-wrap:wrap; padding:18px 0; }
.ww-strip__label { font-family:var(--display); font-weight:700; font-size:.76rem; letter-spacing:.14em; text-transform:uppercase; color:var(--navy); }
.ww-strip__in { flex-direction:column; gap:14px; padding:26px 0 30px; }
.ww-mdn { display:inline-flex; align-items:center; gap:10px; font-size:.9rem; font-weight:600; color:var(--navy); }
.ww-mdn img { height:34px; width:auto; border-radius:6px; filter:grayscale(1); opacity:.75; }
.ww-mdn b { font-family:var(--display); }

/* ---- logo marquee (signature motion) ---- */
.ww-marquee { width:100%; overflow:hidden; position:relative; padding:4px 0 2px;
  -webkit-mask-image: linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);
          mask-image: linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent); }
.ww-marquee__track { display:flex; width:max-content; animation: ww-slide 34s linear infinite; }
.ww-marquee:hover .ww-marquee__track { animation-play-state: paused; }
.ww-marquee__set { display:flex; align-items:center; gap:clamp(38px,6vw,76px); padding-right:clamp(38px,6vw,76px); }
.ww-marquee__set img { height:38px; width:auto; opacity:.5; filter:grayscale(1) contrast(.9);
  transition:opacity .2s ease; }
.ww-marquee__set img:hover { opacity:.85; }
@keyframes ww-slide { from { transform:translateX(0); } to { transform:translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  .ww-marquee__track { animation:none; flex-wrap:wrap; justify-content:center; width:100%; }
  .ww-marquee__set:last-child { display:none; }
  .ww-marquee { -webkit-mask-image:none; mask-image:none; }
}

/* ============ GRID + CARDS ============ */
.ww-grid { display:grid; gap: clamp(18px,2.4vw,28px); }
.ww-grid--3 { grid-template-columns: repeat(3,1fr); }
.ww-grid--2 { grid-template-columns: repeat(2,1fr); }
@media (max-width: 900px) { .ww-grid--3, .ww-grid--2 { grid-template-columns:1fr; } }

.ww-card {
  background:#fff; border:1px solid var(--line); border-radius:16px; overflow:hidden;
  display:flex; flex-direction:column; transition:transform .18s ease, box-shadow .18s ease;
}
.ww-card:hover { transform:translateY(-4px); box-shadow: var(--shadow); }
.ww-card__img { aspect-ratio:16/10; background:var(--wash); }
.ww-card__img img { width:100%; height:100%; object-fit:cover; }
.ww-card__body { padding:26px; flex:1; display:flex; flex-direction:column; }
.ww-card__kicker { font-family:var(--display); font-size:.74rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--steel); margin-bottom:9px; }
.ww-card p { color:var(--slate); font-size:.97rem; }
.ww-card__link { margin-top:auto; font-family:var(--display); font-weight:700; font-size:.94rem; color:var(--navy); display:inline-flex; gap:7px; align-items:center; }
.ww-card__link:hover { color:var(--steel); }

/* feature rows */
.ww-feat { display:grid; grid-template-columns: 1fr 1fr; gap: clamp(28px,5vw,72px); align-items:center; }
.ww-feat + .ww-feat { margin-top: clamp(48px,6vw,90px); }
.ww-feat__img { border-radius:18px; overflow:hidden; aspect-ratio:4/3; background:var(--wash); }
.ww-feat__img img { width:100%; height:100%; object-fit:cover; }
.ww-feat--flip .ww-feat__img { order:2; }
.ww-feat__img--tall { aspect-ratio:4/5; }
@media (max-width: 880px) { .ww-feat__img--tall { aspect-ratio:4/3; } }

/* owners duo */
.ww-duo { display:grid; grid-template-columns:repeat(2,1fr); gap:0; margin-top:26px;
  border-top:1px solid var(--line); }
.ww-duo div { padding:22px 0; }
.ww-duo div + div { padding-left:26px; border-left:1px solid var(--line); }
.ww-duo b { display:block; font-family:var(--display); font-size:1.12rem; color:var(--navy-deep); font-weight:800; }
.ww-duo span { font-size:.86rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--steel); }
.ww-duo p { font-size:.95rem; color:var(--slate); margin:10px 0 0; }
@media (max-width:560px){ .ww-duo{grid-template-columns:1fr} .ww-duo div+div{padding-left:0;border-left:0;border-top:1px solid var(--line)} }
@media (max-width: 880px) { .ww-feat { grid-template-columns:1fr; } .ww-feat--flip .ww-feat__img { order:0; } }

/* checklist */
.ww-list { list-style:none; padding:0; margin:22px 0 0; display:grid; gap:12px; }
.ww-list li { display:flex; gap:11px; align-items:flex-start; font-size:1rem; color:var(--slate); }
.ww-list li strong { color:var(--ink); }
.ww-list svg { flex:0 0 20px; margin-top:3px; }
.ww-sect--navy .ww-list li { color:#C3D6E6; }
.ww-sect--navy .ww-list li strong { color:#fff; }

/* stat / meter signature */
.ww-meter { display:grid; grid-template-columns:repeat(2,1fr); gap:2px; background:var(--line); border-radius:16px; overflow:hidden; border:1px solid var(--line); }
.ww-meter div { background:#fff; padding:26px 24px; }
.ww-meter b { display:block; font-family:var(--display); font-size:clamp(1.9rem,3.4vw,2.6rem); font-weight:800; color:var(--navy); line-height:1; }
.ww-meter span { font-size:.86rem; color:var(--slate); font-weight:600; }
.ww-meter .hi b { color:var(--steel); }

/* ============ REVIEWS ============ */
.ww-rating { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:34px; }
.ww-stars { color:#F2B01E; letter-spacing:2px; font-size:1.05rem; }
.ww-rating b { font-family:var(--display); font-size:1.5rem; color:var(--navy-deep); }
.ww-rating span { color:var(--slate); font-size:.94rem; }
.ww-reviews { columns: 3; column-gap: clamp(18px,2.2vw,24px); }
@media (max-width: 980px) { .ww-reviews { columns:2; } }
@media (max-width: 640px) { .ww-reviews { columns:1; } }
.ww-review {
  break-inside:avoid; background:#fff; border:1px solid var(--line); border-radius:14px;
  padding:24px; margin-bottom: clamp(18px,2.2vw,24px);
}
.ww-review p { font-size:.98rem; color:var(--ink); }
.ww-review__who { display:flex; align-items:center; gap:11px; margin-top:16px; }
.ww-avatar {
  width:38px; height:38px; border-radius:50%; background:var(--navy); color:#fff;
  display:grid; place-items:center; font-family:var(--display); font-weight:700; font-size:.82rem; flex:0 0 38px;
}
.ww-review__who b { display:block; font-size:.92rem; font-family:var(--display); }
.ww-review__who small { color:var(--slate); font-size:.8rem; }

/* ============ AREAS + FAQ ============ */
.ww-areas { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; }
.ww-areas span {
  font-size:.9rem; font-weight:600; padding:9px 16px; border-radius:999px;
  background:#fff; border:1px solid var(--line); color:var(--navy);
}
.ww-faq { border-top:1px solid var(--line); }
.ww-faq details { border-bottom:1px solid var(--line); }
.ww-faq summary {
  cursor:pointer; list-style:none; padding:24px 44px 24px 0; position:relative;
  font-family:var(--display); font-weight:700; font-size:clamp(1rem,1.4vw,1.13rem); color:var(--navy-deep);
}
.ww-faq summary::-webkit-details-marker { display:none; }
.ww-faq summary::after {
  content:'+'; position:absolute; right:6px; top:50%; transform:translateY(-50%);
  font-size:1.6rem; font-weight:500; color:var(--steel); line-height:1;
}
.ww-faq details[open] summary::after { content:'–'; }
.ww-faq p { color:var(--slate); padding-bottom:24px; margin:0; max-width:78ch; }

/* ============ CTA BAND ============ */
.ww-cta { background: linear-gradient(120deg,var(--navy-deep) 0%,var(--navy) 55%,#20527F 100%); color:#fff; text-align:center; }
.ww-cta h2 { color:#fff; }
.ww-cta p { color:#C4D8E9; max-width:52ch; margin:0 auto 28px; }
.ww-cta__row { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; }
.ww-cta__note { margin-top:clamp(30px,3.4vw,44px); font-size:.92rem; color:#9FBBD3; }
.ww-cta__note a { color:#fff; font-weight:600; }

/* ============ FORM ============ */
.ww-form-grid { display:grid; grid-template-columns: 1.05fr .95fr; gap: clamp(30px,4.5vw,64px); align-items:start; }
@media (max-width: 900px) { .ww-form-grid { grid-template-columns:1fr; } }
.ww-form { background:#fff; border:1px solid var(--line); border-radius:18px; padding: clamp(26px,3.4vw,40px); box-shadow: var(--shadow); }
.ww-form h3 { margin-bottom:6px; }
.ww-form__sub { color:var(--slate); font-size:.96rem; margin-bottom:24px; }
.ww-field { margin-bottom:18px; }
.ww-field label { display:block; font-family:var(--display); font-weight:700; font-size:.86rem; color:var(--navy-deep); margin-bottom:7px; }
.ww-field input {
  width:100%; font-family:var(--body); font-size:1rem; padding:14px 16px;
  border:1.5px solid rgba(24,62,99,.2); border-radius:10px; background:#fff; color:var(--ink);
  transition:border-color .15s ease, box-shadow .15s ease;
}
.ww-field input:focus { outline:none; border-color:var(--steel); box-shadow:0 0 0 4px rgba(66,145,188,.16); }
.ww-field input[aria-invalid="true"] { border-color:#D14343; }
.ww-err { display:none; color:#C43D3D; font-size:.84rem; margin-top:6px; font-weight:600; }
.ww-field.is-bad .ww-err { display:block; }
.ww-form .ww-btn { width:100%; margin-top:6px; }
.ww-form__fine { font-size:.79rem; color:var(--slate); margin:14px 0 0; line-height:1.55; }
.ww-hp { position:absolute; left:-9999px; opacity:0; height:0; width:0; }
.ww-form__status { display:none; margin-top:14px; padding:12px 14px; border-radius:9px; font-size:.9rem; font-weight:600; }
.ww-form__status.bad { display:block; background:#FDEBEB; color:#A32B2B; }

/* contact detail list */
.ww-detail { display:grid; gap:20px; margin-top:26px; }
.ww-detail a, .ww-detail div { display:flex; gap:14px; align-items:flex-start; }
.ww-detail .ico { flex:0 0 42px; height:42px; border-radius:11px; background:rgba(66,145,188,.13); display:grid; place-items:center; }
.ww-detail b { display:block; font-family:var(--display); font-size:.98rem; color:var(--navy-deep); }
.ww-detail span { color:var(--slate); font-size:.95rem; }

/* ============ FOOTER ============ */
.ww-foot { background:var(--navy-deep); color:#A9C2D6; padding: clamp(52px,6vw,76px) 0 0; }
.ww-foot__grid { display:grid; grid-template-columns: 1.5fr 1fr 1fr; gap: clamp(28px,4vw,56px); }
@media (max-width: 780px) { .ww-foot__grid { grid-template-columns:1fr; } }
.ww-foot__logo { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
.ww-foot__logo img { height:46px; }
.ww-foot__logo span { font-family:var(--display); font-weight:800; color:#fff; font-size:1.06rem; }
.ww-foot p { font-size:.94rem; max-width:44ch; }
.ww-foot h4 { color:#fff; font-size:.8rem; letter-spacing:.14em; text-transform:uppercase; margin-bottom:16px; font-family:var(--display); }
.ww-foot ul { list-style:none; padding:0; margin:0; display:grid; gap:11px; }
.ww-foot ul a { font-size:.94rem; }
.ww-foot ul a:hover { color:#fff; }
.ww-foot__badges { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
.ww-foot__badges span {
  font-size:.76rem; font-weight:600; padding:6px 12px; border-radius:999px;
  border:1px solid rgba(101,189,229,.34); color:#CFE4F3;
}
.ww-foot__bar {
  margin-top: clamp(38px,5vw,58px); border-top:1px solid rgba(255,255,255,.11);
  padding:22px 0; display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap; font-size:.85rem;
}
.ww-foot__bar a:hover { color:#fff; }

@media (prefers-reduced-motion: reduce) {
  .ww-scope *, .ww-scope *::before, .ww-scope *::after { animation:none !important; transition:none !important; }
}

/* ============ LEGAL PAGES ============ */
.ww-legal { max-width: 820px; }
.ww-legal h2 { font-size: clamp(1.3rem,2vw,1.6rem); margin-top: 46px; }
.ww-legal h2:first-of-type { margin-top: 0; }
.ww-legal p, .ww-legal li { color: var(--slate); font-size: 1rem; }
.ww-legal ul { padding-left: 20px; margin: 0 0 1em; display:grid; gap:8px; }
.ww-legal a { color: var(--steel); text-decoration: underline; }
.ww-legal__meta {
  border-left: 3px solid var(--sky); padding: 4px 0 4px 18px; margin-bottom: 40px;
  font-size: .93rem; color: var(--slate);
}
`;

  var HTML = `
<div class="ww-scope">

<header class="ww-head">
  <div class="ww-wrap ww-head__in">
    <a class="ww-head__logo" href="https://williswindows.com/home">
      <img src="__IMG__logo.png" alt="Willis Windows">
      <span>Willis Windows</span>
    </a>
    <nav class="ww-nav" id="wwNav">
      <a href="https://williswindows.com/home" >Home</a>
      <a href="https://williswindows.com/about" >About</a>
      <a href="https://williswindows.com/services" aria-current="page">Services</a>
      <a href="https://williswindows.com/contact" >Contact</a>
    </nav>
    <a class="ww-btn ww-btn--primary" href="tel:3134053227">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>
      <span class="lbl">(313) 405-3227</span>
    </a>
    <button class="ww-burger" id="wwBurger" aria-label="Open menu" aria-expanded="false" aria-controls="wwNav">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>

<main>
<section class="ww-banner">
  <div class="ww-wrap">
    <div class="ww-eyebrow">Our services</div>
    <h1>What can we help you with?</h1>
    <p>Three services, done thoroughly. Every job is quoted free over the phone before we book you in.</p>
  </div>
</section>

<section class="ww-sect">
  <div class="ww-wrap">

    <div class="ww-feat" id="residential">
      <div class="ww-feat__img">
        <img src="__IMG__residential.webp" alt="Residential window cleaning in Metro Detroit">
      </div>
      <div>
        <div class="ww-eyebrow">Home care</div>
        <h2>Residential window cleaning</h2>
        <p>Exteriors are cleaned with our water-fed pole system using 0 PPM pure water, so the glass air-dries without a single mineral spot. Interiors are done by hand with squeegees and detail cloths. Homes up to three stories, no ladders needed.</p>
        <ul class="ww-list">
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Interior and exterior glass</strong> — or exterior only if that's all you need</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Screen cleaning</strong> through our Xero system, which lifts dust and pollen without stressing the mesh</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Tracks and sills</strong> cleaned out as part of the job, not as an upsell</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Screen repair available</strong> — torn screens get repaired rather than cleaned, quoted before we touch them</span></li>
        </ul>
        <div class="ww-hero__cta">
          <a class="ww-btn ww-btn--primary" href="https://williswindows.com/contact">Get a free estimate</a>
        </div>
      </div>
    </div>

    <div class="ww-feat ww-feat--flip" id="commercial">
      <div class="ww-feat__img">
        <img src="__IMG__commercial.webp" alt="Commercial window cleaning for Metro Detroit businesses">
      </div>
      <div>
        <div class="ww-eyebrow">Business solutions</div>
        <h2>Commercial window cleaning</h2>
        <p>Storefronts, offices, restaurants, and clinics across Metro Detroit. We work around your hours — before you open, after you close, or on a recurring schedule so it never lands on your to-do list.</p>
        <ul class="ww-list">
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Recurring schedules</strong> — weekly, monthly, or quarterly</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Off-hours service</strong> so we're never in front of your customers</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Fully insured</strong> with certificates available on request</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Multi-location pricing</strong> for property managers and small chains</span></li>
        </ul>
        <div class="ww-hero__cta">
          <a class="ww-btn ww-btn--primary" href="https://williswindows.com/contact">Request commercial pricing</a>
        </div>
      </div>
    </div>

    <div class="ww-feat" id="gutters">
      <div class="ww-feat__img">
        <img src="__IMG__gutters.webp" alt="Gutter cleaning">
      </div>
      <div>
        <div class="ww-eyebrow">Prevention</div>
        <h2>Gutter cleaning</h2>
        <p>Clogged gutters send water over the edge and down your siding into the foundation. We clear the leaves, grit, and shingle debris, check that the downspouts actually run, and bag everything up before we leave.</p>
        <ul class="ww-list">
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Gutters cleared by hand</strong> and flushed through</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Downspouts checked</strong> for flow, not just cleared at the top</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Debris hauled away</strong> — nothing left in your beds or on the drive</span></li>
          <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4291BC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span><strong>Bundle it with a window clean</strong> and we'll do both in the same visit</span></li>
        </ul>
        <div class="ww-hero__cta">
          <a class="ww-btn ww-btn--primary" href="https://williswindows.com/contact">Get a free estimate</a>
        </div>
      </div>
    </div>

  </div>
</section>

<section class="ww-sect ww-sect--wash">
  <div class="ww-wrap">
    <div class="ww-eyebrow">How it works</div>
    <h2>From your first call to clear glass</h2>
    <p class="ww-lede">A real sequence, not a sales funnel. Here's exactly what happens.</p>
    <div class="ww-grid ww-grid--3" style="margin-top:clamp(32px,4vw,48px)">
      <article class="ww-card"><div class="ww-card__body">
        <div class="ww-card__kicker">Step 1</div>
        <h3>You tell us about your windows</h3>
        <p>Call or send the form. We ask roughly how many windows you have, whether you want inside and out, and where you are. That's it.</p>
      </div></article>
      <article class="ww-card"><div class="ww-card__body">
        <div class="ww-card__kicker">Step 2</div>
        <h3>We give you a price on the phone</h3>
        <p>Free, firm, and usually within the hour. No estimator visit, no waiting three days for an email, no pressure to book on the spot.</p>
      </div></article>
      <article class="ww-card"><div class="ww-card__body">
        <div class="ww-card__kicker">Step 3</div>
        <h3>We show up and get it done</h3>
        <p>Most homes take two to three hours. We walk the job with you at the end, and if something isn't right we fix it before we pack up.</p>
      </div></article>
    </div>
  </div>
</section>

<section class="ww-sect">
  <div class="ww-wrap">
    <div class="ww-feat ww-feat--flip">
      <div class="ww-feat__img">
        <img src="__IMG__screens.webp" alt="Cleaning a window screen with the Xero screen cleaning system">
      </div>
      <div>
        <div class="ww-eyebrow">Bigger jobs</div>
        <h2>More complicated than a standard clean?</h2>
        <p>Post-construction haze, hard-water staining, storm windows, three-story sliding glass, a screen wall that's seen better days — we've handled all of it. Tell us what you're looking at on the phone and we'll quote it honestly, including telling you if it isn't worth doing.</p>
        <div class="ww-hero__cta">
          <a class="ww-btn ww-btn--outline" href="https://williswindows.com/contact">Talk it through with us</a>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="ww-sect ww-sect--wash">
  <div class="ww-wrap">
    <div class="ww-eyebrow">Questions</div>
    <h2>Straight answers before you book</h2>
    <div class="ww-faq">
  <details open>
    <summary>How do estimates work?</summary>
    <p>Over the phone, free, and usually the same day you reach out. Tell us roughly how many windows you have, whether you want inside and out, and your address — we'll give you a firm price on the call. No appointment for someone to come out and quote you, and no pressure at the door.</p>
  </details>
  <details>
    <summary>What equipment do you use?</summary>
    <p>Exterior glass is cleaned with a pure-water, water-fed pole system that filters water down to 0 PPM, so it rinses off without leaving mineral spots. Interior glass is done the traditional way with squeegees and detailing cloths. Screens go through our Xero screen cleaning system, which lifts out dust, pollen, and debris without stressing the mesh.</p>
  </details>
  <details>
    <summary>Do you clean screens, tracks, and sills?</summary>
    <p>Yes, and they're part of the job rather than an add-on we spring on you later. If a screen is torn, we won't clean it — we'll tell you and quote a repair instead.</p>
  </details>
  <details>
    <summary>Do you use ladders?</summary>
    <p>Almost never. The water-fed pole system reaches up to three stories from the ground, which keeps weight off your gutters and boots out of your landscaping. If one window genuinely can't be reached any other way, we'll safely use a ladder for that window and nothing else.</p>
  </details>
  <details>
    <summary>Are you licensed and insured?</summary>
    <p>Yes. Willis Windows is fully insured, covering both your property and our crew for the entire time we're on site.</p>
  </details>
  <details>
    <summary>What happens if it rains?</summary>
    <p>Light rain doesn't affect the results — pure water is what we're rinsing with anyway, so we work right through it. If there's lightning or high wind, we stop and reschedule you for the next available slot at no charge.</p>
  </details>
  <details>
    <summary>How long does a typical job take?</summary>
    <p>Most homes take two to three hours from setup to final walkthrough. We'll give you a time window when we book you and call if anything shifts.</p>
  </details>
</div>

  </div>
</section>

<section class="ww-sect ww-cta">
  <div class="ww-wrap">
    <div class="ww-eyebrow" style="justify-content:center">Free estimate</div>
    <h2>Ready for windows you can see through?</h2>
    <p>Send us your name and number and we'll call you back with a firm price — no appointment, no sales visit, no obligation.</p>
    <div class="ww-cta__row">
      <a class="ww-btn ww-btn--sun" href="https://williswindows.com/contact">Get my free estimate</a>
      <a class="ww-btn ww-btn--ghost" href="tel:3134053227">Call (313) 405-3227</a>
    </div>
    <p class="ww-cta__note">Serving Metro Detroit &amp; surrounding suburbs · Mon–Sat, 8am–7pm</p>
  </div>
</section>


</main>

<footer class="ww-foot">
  <div class="ww-wrap">
    <div class="ww-foot__grid">
      <div>
        <div class="ww-foot__logo">
          <img src="__IMG__logo.png" alt="Willis Windows">
          <span>Willis Windows</span>
        </div>
        <p>Streak-free, spot-free window cleaning for homes and businesses across Metro Detroit. Pure filtered water, no ladders, and a crew that shows up when it says it will.</p>
        <div class="ww-foot__badges">
          <span>Licensed &amp; Insured</span><span>4.9★ on Google</span><span>0 PPM Pure Water</span><span>No Ladders</span>
        </div>
      </div>
      <div>
        <h4>Pages</h4>
        <ul>
          <li><a href="https://williswindows.com/home">Home</a></li>
          <li><a href="https://williswindows.com/about">About</a></li>
          <li><a href="https://williswindows.com/services">Services</a></li>
          <li><a href="https://williswindows.com/contact">Get a free estimate</a></li>
        </ul>
      </div>
      <div>
        <h4>Get in touch</h4>
        <ul>
          <li><a href="tel:3134053227">(313) 405-3227</a></li>
          <li><a href="https://williswindows.com/contact">Request your estimate</a></li>
          <li>Mon–Sat, 8am–7pm</li>
          <li>Serving Metro Detroit &amp; surrounding suburbs</li>
        </ul>
      </div>
    </div>
    <div class="ww-foot__bar">
      <span>© 2026 Willis Windows LLC. All rights reserved.</span>
      <span><a href="https://williswindows.com/privacy-policy">Privacy Policy</a> &nbsp;·&nbsp; <a href="https://williswindows.com/terms">Terms of Use</a></span>
    </div>
  </div>
</footer>


</div>
`;

  // ==== behaviour =========================================================
  // Lifted from the page's own inline <script>.
  function enhance(root) {
    (function(){
      var b=document.getElementById('wwBurger'), n=document.getElementById('wwNav');
      if(b&&n){b.addEventListener('click',function(){
        var open=n.classList.toggle('is-open');
        b.setAttribute('aria-expanded',open?'true':'false');
        b.setAttribute('aria-label',open?'Close menu':'Open menu');
      });}
    })();

    /* Force our own links to navigate directly.
       Runs in the CAPTURE phase, so it fires before any GHL/page-builder
       click handler that might rewrite the destination. */
    (function(){
      var scope = document.querySelector('.ww-scope');
      if(!scope) return;
      scope.addEventListener('click', function(e){
        var a = e.target.closest('a[href]');
        if(!a || !scope.contains(a)) return;
        var href = a.getAttribute('href');
        if(!href) return;
        if(href.charAt(0) === '#') return;                 // let anchors work
        if(/^(tel:|mailto:|sms:)/i.test(href)) return;     // let tel/mail work
        if(a.target === '_blank') return;                  // let new tabs work
        e.preventDefault();
        e.stopImmediatePropagation();
        window.location.assign(href);
      }, true);
    })();
  }

  // ==== mount =============================================================
  // GHL can run this script before its own markup lands, and can render the
  // same block twice on a page. Wait for the root, then refuse to mount twice.
  var tries = 0;
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      if (tries++ < 100) { setTimeout(boot, 50); return; }
      console.error(
        '[willis/site] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        "The GHL page needs BOTH lines of the stub: the div and the script tag."
      );
      return;
    }
    if (root.getAttribute("data-wws-ready")) return;
    root.setAttribute("data-wws-ready", "1");

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    root.innerHTML = HTML.split("__IMG__").join(IMG);
    enhance(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
