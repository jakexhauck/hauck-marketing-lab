// MADE BETTER LC — the whole website, served rather than pasted.
//
// GoHighLevel holds a two-line stub per page (see the stubs in
// "Made Better LC Website/"). Everything the site IS lives here, so a copy
// change, a phone number or a new photo ships by deploy and nobody reopens the
// GHL builder.
//
// THIS FILE IS THE SOURCE. There is no second copy of the site anywhere. The
// seven pages used to be seven pasted HTML files carrying byte-identical CSS
// and JS; changing the footer phone number meant seven edits and the copies
// drifted apart every time one was missed.
//
// It ships from public/, so Cloudflare serves it unhashed at a stable URL and
// the stubs in GHL never change again.
//
// WHICH PAGE IT DRAWS is read from the mount div:
//   <div id="mb" data-page="services"></div>
// An unknown or missing data-page falls back to "home".
//
// One classic script rather than ES modules on purpose: a cross-origin module
// script requires CORS headers, a classic script does not.

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
  window.__MB_ORIGIN = origin;

  // =========================================================================
  // CONFIG — the things most likely to change. Everything here is used in
  // every page that needs it, so each is edited exactly once.
  // =========================================================================
  var CONFIG = {
    phone: "(313) 506-9238",
    phoneHref: "tel:+13135069238",
    email: "madebetterlc@gmail.com",
    logo: "https://drive.google.com/thumbnail?id=1B6zy3IkzRzR4NK3KmoNosWk4N1FBV1jB&sz=w400",

    // The GHL inbound webhook the estimate form posts to. Workflow > Trigger >
    // "Inbound Webhook", then copy the URL it hands back. It looks like:
    // https://services.leadconnectorhq.com/hooks/<locationId>/webhook-trigger/<uuid>
    //
    // While this is EMPTY the form refuses to pretend: it re-enables the button
    // and shows the phone number. The pasted pages used to send the visitor to
    // the thank-you page having posted nothing, so an estimate request looked
    // received and was silently lost. A form that plainly does nothing is worse
    // than nothing; a form that fakes success is worse than both.
    webhookUrl: ""
  };

  var ROOT_ID = "mb";
  var DEFAULT_PAGE = "home";

  var STYLES = `
/* @import rather than a <link> tag: GoHighLevel's builder strips <link>
   elements out of custom code blocks, which silently dropped these fonts on
   every pasted page. */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

/* ============================================================================
   MADE BETTER LC — design system

   Structure, type scale, spacing rhythm and button language follow the Willis
   Windows format: a light site with white and warm pale bands, dark bands for
   the moments that need weight, 1180px container, 112px section rhythm, and a
   10px-radius button with a coloured glow under it.

   The palette is Made Better's own: basalt green, brass, moss, warm stone. The
   two are agencymates in the same metro, so the format is shared and the
   colour is not.
   ========================================================================= */

/* The sticky mobile bar and the scroll progress bar are appended to <body>,
   which puts them outside #mb, so custom properties declared only on #mb never
   reached them: var(--brass) resolved to nothing and the bar's "Free estimate"
   button rendered as #14100A text on no background over a near-black bar, at
   about 1.05:1. Invisible, and it is the primary call to action on a phone.
   The handful of values both scopes need live here once, namespaced so a
   builder theme cannot collide with them. */
:root{
  --mb-brass:#C8974B;
  --mb-ink-3:#26332E;
  --mb-radius:10px;
}

#mb {
  /* ===== BRAND COLOURS: swap these to match the logo ===== */
  --ink:#0E1311;        /* basalt, near-black green: dark bands, headings */
  --ink-2:#17201C;      /* raised panel on a dark band */
  --ink-3:var(--mb-ink-3); /* hairline on a dark band */
  --brass:var(--mb-brass); /* the accent: CTA fills, rules, dots, brass on dark */
  --brass-2:#B5843A;    /* pressed / hover */
  --brass-soft:#E8D9BC; /* brass text on a dark band */
  --moss:#4E6B54;       /* secondary accent */

  /* Brass at #C8974B is a fill colour, not a text colour. On white it reads
     2.63:1, so every eyebrow, label and numeral set in it failed AA and the
     small ones were genuinely hard to read. Text keeps the brass hue and
     takes the contrast: --brass-text clears 4.5:1 on all four light bands,
     --brass-display clears the 3:1 large-text threshold so the 40px numerals
     stay bright. Dark bands override both back to --brass, where it already
     reads 7.13:1. */
  --light-brass:#876633;    /* brass on light, body-size */
  --light-brass-lg:#AB8140; /* brass on light, 24px+ or bold 19px+ */

  --brass-text:var(--light-brass);
  --brass-display:var(--light-brass-lg);

  --paper:#FFFFFF;      /* the default band */
  --wash:#F7F6F2;       /* the alternating warm band */
  --wash-2:#EFEDE6;     /* the deepest light band */
  --line:#E6E3DA;       /* hairline on a light band */
  --stone:#E9E5DC;      /* primary text on a dark band */

  /* ===== TEXT ON A LIGHT BAND =====
     Declared once here and referenced by name everywhere else, including by
     .form-card, which has to restate the whole light set because it is a white
     card that can sit inside a dark band. It used to restate them as literals
     and had already drifted: its --muted was still the old failing value after
     the root was corrected, so the card's helper text stayed at 3.81:1 while
     the rest of the site moved. One definition, no second copy to miss.

     --muted carries most of the secondary copy on the site and was light
     enough to fail AA on every band it appears on (3.81:1 on white, 3.25:1 on
     --wash-2). --faint was worse at 2.63:1 and is used at 12.5px. Both are now
     the lightest value that still clears 4.5:1 on the deepest light band. */
  --light-head:#0E1311;
  --light-body:#5B655F;
  --light-muted:#646C67;
  --light-faint:#6B726E;

  --head:var(--light-head);    /* headings on light */
  --body:var(--light-body);    /* body copy on light */
  --muted:var(--light-muted);  /* secondary copy on light */
  --faint:var(--light-faint);  /* fineprint on light */

  --radius:var(--mb-radius); /* buttons, inputs */
  --radius-lg:16px;     /* cards, media */
  --shadow:0 1px 2px rgba(14,19,17,.04), 0 14px 34px -20px rgba(14,19,17,.30);
  --shadow-lift:0 2px 6px rgba(14,19,17,.06), 0 26px 56px -28px rgba(14,19,17,.38);
}

/* ===== GHL FULL-BLEED OVERRIDES ===== */
html, body{ background:#FFFFFF !important; overflow-x:hidden !important; }
body{ margin:0 !important; padding:0 !important; }

/* strip padding and width caps off every GHL wrapper level.
   The vertical axis matters as much as the horizontal one: a step whose
   padding was never cleared in the builder holds the header down off the top
   of the window, and since only Home's step kept its padding, Home alone
   opened with a band of white above the nav bar. Left and right were stripped
   here from the start; top and bottom were not, so the site depended on the
   builder being set correctly on all seven steps and drifted the moment one
   was missed. It no longer depends on it. */
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
#mb *, #mb *::before, #mb *::after{ box-sizing:border-box; }

#mb {
  margin:0; background:var(--paper); color:var(--body);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:17px; line-height:1.65; -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}

/* viewport breakout: forces edge-to-edge no matter what the row is set to */
#mb {
  width:100vw !important; max-width:100vw !important;
  position:relative; left:50%; right:50%;
  margin-left:-50vw !important; margin-right:-50vw !important;
}

/* GHL's theme styles reach into custom blocks. Reset only what it touches. */
#mb button{ margin:0; text-transform:none; letter-spacing:normal; line-height:normal; font-family:inherit; }
#mb input, #mb select, #mb textarea{ margin:0; max-width:none; box-shadow:none; font-family:inherit; }
#mb label{ margin:0; display:block; text-transform:none; }
#mb ul, #mb ol, #mb li, #mb dl, #mb dd, #mb dt, #mb figure{ margin:0; }
#mb p{ margin:0; }
#mb img{ display:block; max-width:100%; }
#mb a{ color:inherit; text-decoration:none; }

/* ===== TYPE =====
   Plus Jakarta Sans at 800 for display, Inter for everything else. Tight
   negative tracking on the headings is what stops a big sans from reading as
   a system font. */
#mb h1, #mb h2, #mb h3, #mb h4 {
  font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;
  color:var(--head); margin:0; font-weight:800; letter-spacing:-.02em; line-height:1.12;
}
#mb h1{ font-size:clamp(38px,5vw,64px); }
#mb h2{ font-size:clamp(30px,3.6vw,46px); }
#mb h3{ font-size:21px; font-weight:700; letter-spacing:-.015em; line-height:1.25; }
#mb h4{ font-size:15px; font-weight:700; letter-spacing:-.01em; }

#mb .eyebrow {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:12.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
  color:var(--brass-text); margin-bottom:16px;
}

/* ===== LAYOUT ===== */
#mb .wrap{ width:100%; max-width:1180px; margin:0 auto; padding:0 24px; }
#mb .sec{ padding:88px 0; position:relative; }
/* The hairline in .sec::before is drawn on the section's top edge, so a
   padding-top of 0 left the rule sitting directly on the heading it introduces
   with nothing between them. Consecutive sections keep a half step of air. */
#mb .sec + .sec{ padding-top:48px; }
#mb .sec-head{ max-width:720px; margin-bottom:44px; }
#mb .sec-head p{ margin-top:16px; font-size:18px; color:var(--muted); max-width:62ch; }

/* The alternating warm band, applied to a whole section. Willis alternates
   white and pale down the page and it is most of why the site reads as calm.
   A banded section needs its own top padding back, and so does whatever
   follows it, or the tint starts flush against the previous section's copy. */
#mb .band{ background:var(--wash); }
/* One step deeper than .band, for the section that should sit forward of the
   rest of the page. */
#mb .band-deep{ background:var(--wash-2); }
#mb .sec.band, #mb .sec.band + .sec,
#mb .sec.band-deep, #mb .sec.band-deep + .sec,
#mb .sec.band-dark, #mb .sec.band-dark + .sec,
/* .close is a full-bleed dark band and needs its own top padding for the same
   reason the others do. Without it the closing form card and the "Ready when
   you are" eyebrow started flush against the top edge of the black. */
#mb .sec.close{ padding-top:88px; }

/* A dark band for mid-page figures. The numbers on About were three white
   cards on a white page, which is the one place on the site where the content
   is the whole point and the surface was doing nothing to say so. */
#mb .band-dark {
  background:var(--ink); color:var(--stone);
  --head:#FFFFFF; --muted:#A8B2AC; --body:#C9D1CB;
  --brass-text:var(--brass); --brass-display:var(--brass);
}
#mb .band-dark .stat{ background:var(--ink-2); border-color:var(--ink-3); box-shadow:none; }

/* ===== BUTTONS =====
   10px radius, 700 weight, generous padding, and a coloured glow beneath the
   primary. Dark ink on brass rather than white: brass and white is about 2:1
   and unreadable at button size. */
#mb .btn {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:16px; font-weight:700; letter-spacing:-.01em;
  padding:15px 28px; border-radius:var(--radius); border:2px solid transparent;
  cursor:pointer; transition:background .18s, color .18s, border-color .18s, box-shadow .18s, transform .18s;
  white-space:nowrap;
}
#mb .btn-primary {
  background:var(--brass); color:#14100A; border-color:var(--brass);
  box-shadow:0 12px 26px -14px rgba(200,151,75,.9);
}
#mb .btn-primary:hover{ background:var(--brass-2); border-color:var(--brass-2); box-shadow:0 16px 30px -14px rgba(200,151,75,.95); }
#mb .btn-ghost{ background:transparent; color:var(--head); border-color:var(--line); }
#mb .btn-ghost:hover{ border-color:var(--brass); color:var(--brass-text); }
#mb .btn:disabled{ opacity:.55; cursor:default; box-shadow:none; }
#mb a.btn{ text-decoration:none; }

/* on a dark band the ghost button flips */
#mb .on-dark .btn-ghost, #mb .hero .btn-ghost, #mb .close .btn-ghost {
  color:var(--stone); border-color:rgba(233,229,220,.28);
}
#mb .on-dark .btn-ghost:hover, #mb .hero .btn-ghost:hover, #mb .close .btn-ghost:hover {
  border-color:var(--brass); color:var(--brass-soft);
}

/* ===== CHIP =====
   Willis's pill. Used for the hero proof points and the service-area cities. */
#mb .chip {
  display:inline-flex; align-items:center; gap:7px;
  padding:8px 14px; border-radius:999px;
  font-size:13.5px; font-weight:600; letter-spacing:-.005em;
  background:rgba(200,151,75,.10); border:1px solid rgba(200,151,75,.42); color:var(--brass-soft);
}

/* ===== HEADER ===== */
#mb .hdr {
  position:sticky; top:0; z-index:60;
  background:rgba(255,255,255,.86); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--line);
  transition:height .25s, box-shadow .25s, background .25s;
}
#mb .hdr.is-stuck{ box-shadow:0 10px 30px -22px rgba(14,19,17,.5); background:rgba(255,255,255,.94); }
#mb .hdr-in{ display:flex; align-items:center; justify-content:space-between; gap:32px; height:92px; transition:height .25s; }
#mb .hdr.is-stuck .hdr-in{ height:78px; }
#mb .brand{ display:flex; align-items:center; gap:12px; flex:none; }
#mb .brand-logo{ height:54px; width:auto; transition:height .25s; }
#mb .hdr.is-stuck .brand-logo{ height:44px; }
/* The mark alone does not say who this is. The name sits beside it, set in the
   display face so the header opens the same way the footer closes. */
#mb .brand-name {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:19px; font-weight:800; letter-spacing:-.02em; color:var(--head);
  white-space:nowrap; transition:font-size .25s;
}
#mb .brand-name i{ font-style:normal; color:var(--brass-text); }
#mb .hdr.is-stuck .brand-name{ font-size:17.5px; }

#mb .nav{ display:flex; align-items:center; gap:34px; }
#mb .nav a {
  font-size:15px; font-weight:600; color:var(--head); letter-spacing:-.01em;
  transition:color .15s; position:relative; padding:6px 0;
}
#mb .nav a:hover{ color:var(--brass-text); }
#mb .nav a.is-active{ color:var(--head); }
#mb .nav a.is-active::after {
  content:""; position:absolute; left:0; right:0; bottom:-2px; height:2px;
  background:var(--brass); border-radius:2px;
}

#mb .hdr-cta{ display:flex; align-items:center; gap:14px; flex:none; }
#mb .hdr-phone {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:15px; font-weight:700; color:var(--head); letter-spacing:-.01em;
}
#mb .hdr-phone:hover{ color:var(--brass-text); }
#mb .hdr-cta .btn{ padding:11px 20px; font-size:14.5px; }
#mb .burger {
  display:none; background:transparent; border:1px solid var(--line); border-radius:var(--radius);
  width:44px; height:44px; font-size:19px; color:var(--head); cursor:pointer;
}

/* ===== HERO =====
   A photograph under a basalt wash, white type over it. Willis's hero shape,
   with the estimate form Willis does not have. */
#mb .hero {
  position:relative; background:var(--ink); color:var(--stone);
  padding:72px 0 88px; overflow:hidden;
  --muted:#A8B2AC; --head:#FFFFFF; --body:#C9D1CB;
  --brass-text:var(--brass); --brass-display:var(--brass);
}
#mb .hero-bg{ position:absolute; inset:0; overflow:hidden; }
/* The photograph has to survive the wash. Heavy on the left where the headline
   sits, light on the right where the form card floats, so the work is actually
   visible instead of the hero reading as a flat dark slab. */
#mb .hero-bg img{ width:100%; height:100%; object-fit:cover; opacity:.62; }
#mb .hero-bg::after {
  content:""; position:absolute; inset:0;
  background:linear-gradient(100deg, var(--ink) 4%, rgba(14,19,17,.88) 38%, rgba(14,19,17,.55) 72%, rgba(14,19,17,.42) 100%);
}
/* Top-aligned, not centred. Centring measured the copy against the form card,
   which is the taller of the two, so the headline was pushed 88px further down
   than the heading on every interior page and Home alone looked like it had a
   gap under the nav bar. Both columns now start at the same line. */
#mb .hero-in{ position:relative; display:grid; grid-template-columns:1.05fr .95fr; gap:64px; align-items:start; }
#mb .hero h1{ color:#FFFFFF; }
#mb .hero h1 em{ font-style:normal; color:var(--brass); }
#mb .hero-sub{ margin-top:20px; font-size:18.5px; line-height:1.6; color:#C9D1CB; max-width:540px; }

#mb .hero-pts{ list-style:none; margin:30px 0 0; padding:0; display:flex; flex-direction:column; gap:13px; }
#mb .hero-pts li{ display:flex; align-items:flex-start; gap:11px; font-size:15.5px; color:#D6DDD8; line-height:1.5; }
#mb .hero-pts svg{ width:19px; height:19px; flex:none; margin-top:2px; stroke:var(--brass); }

#mb .hero-actions{ display:flex; flex-wrap:wrap; gap:12px; margin-top:34px; }

/* ===== ESTIMATE FORM CARD =====
   A white card floating on the dark hero. This is the piece Willis does not
   have: their hero sends you to a page, ours takes the job on the spot. */
#mb .form-card {
  background:var(--paper); border-radius:var(--radius-lg); border:1px solid rgba(255,255,255,.10);
  padding:34px 34px 30px; box-shadow:0 30px 70px -30px rgba(0,0,0,.75);
  /* A white card that floats on a dark band, so it has to put the light-band
     text colours back for everything inside it. */
  --head:var(--light-head); --body:var(--light-body);
  --muted:var(--light-muted); --faint:var(--light-faint);
  --brass-text:var(--light-brass); --brass-display:var(--light-brass-lg);
}
#mb .form-card h3{ font-size:23px; color:var(--head); }
#mb .form-note{ margin-top:9px; font-size:14.5px; color:var(--muted); line-height:1.55; }
#mb .fields{ margin-top:22px; display:flex; flex-direction:column; gap:14px; }
#mb .row-2{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
#mb .field{ display:flex; flex-direction:column; gap:6px; }
#mb .field > label {
  font-size:12.5px; font-weight:600; color:var(--body);
  letter-spacing:.05em; text-transform:uppercase;
}
#mb .field input, #mb .field select, #mb .field textarea {
  width:100%; padding:12px 14px; font:inherit; font-size:15px; color:var(--head);
  background:var(--paper); border:1px solid var(--line); border-radius:var(--radius);
  transition:border-color .15s, box-shadow .15s;
}
#mb .field textarea{ resize:vertical; min-height:92px; }
#mb .field input::placeholder, #mb .field textarea::placeholder{ color:#AEB6B1; }
#mb .field input:focus, #mb .field select:focus, #mb .field textarea:focus {
  outline:none; border-color:var(--brass); box-shadow:0 0 0 3px rgba(200,151,75,.18);
}
#mb .field.has-error input, #mb .field.has-error select, #mb .field.has-error textarea{ border-color:#C2492F; }

/* The select arrow, drawn rather than left to the platform, so it sits in from
   the edge by the same amount as the text sits in from the other side. */
#mb .field select {
  appearance:none; -webkit-appearance:none; -moz-appearance:none;
  padding-right:44px; cursor:pointer;
  background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B655F' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 14px center; background-size:17px 17px;
}
#mb .field select::-ms-expand{ display:none; }

#mb .fields .btn{ width:100%; margin-top:4px; }
#mb .fineprint{ margin-top:14px; font-size:12.5px; color:var(--faint); line-height:1.5; text-align:center; }
#mb .form-success{ display:none; }
#mb .form-success h3{ font-size:23px; }
#mb .form-success p{ margin-top:10px; }

/* the honest failure line. never styled as a success. */
#mb .mb-form-err {
  margin-top:14px; padding:12px 14px; border-radius:var(--radius);
  font-size:14.5px; line-height:1.5;
  color:#8C2F19; background:#FBEDE9; border:1px solid #E9C3B7;
}
#mb .mb-form-err a{ color:#8C2F19; font-weight:700; text-decoration:underline; }

/* ===== TRUST STRIP =====
   Four claims that used to be plain text in a hairline grid, which read as a
   table. They are cards now, each led by its own mark, so the eye takes one at
   a time instead of scanning a row. */
#mb .trust{ background:var(--wash); border-bottom:1px solid var(--line); }
#mb .trust-in{
  display:grid; grid-template-columns:repeat(4,1fr); gap:16px;
  padding:30px 24px; background:transparent;
}
#mb .trust-item{
  display:flex; align-items:center; gap:14px;
  background:var(--paper); border:1px solid var(--line); border-radius:var(--radius-lg);
  padding:22px 20px; box-shadow:0 1px 2px rgba(14,19,17,.04);
  transition:border-color .2s, box-shadow .2s, transform .2s cubic-bezier(.16,1,.3,1);
}
#mb .trust-item:hover{
  border-color:rgba(200,151,75,.5); transform:translateY(-2px);
  box-shadow:0 2px 4px rgba(14,19,17,.05), 0 18px 34px -22px rgba(14,19,17,.35);
}
#mb .trust-ico{
  flex:none; width:42px; height:42px; border-radius:12px; display:grid; place-items:center;
  background:rgba(200,151,75,.12); border:1px solid rgba(200,151,75,.34);
}
#mb .trust-ico svg{ width:21px; height:21px; stroke:var(--brass); fill:none; }
#mb .trust-item strong {
  display:block; font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:15.5px; font-weight:700; color:var(--head); letter-spacing:-.015em; margin-bottom:4px;
}
/* :not(.trust-ico) because the mark's container is a <span> too, and this rule
   was matching it and beating "#mb .trust-ico" on specificity. It forced
   display:block over the grid, which killed the place-items:center underneath
   and dropped the glyph onto a text baseline at the top of its box: 1px of air
   above it and 20px below. The icon was not badly centred, it was not being
   centred at all. */
#mb .trust-item span:not(.trust-ico){ display:block; font-size:13.5px; color:var(--muted); line-height:1.5; }

/* ===== BEFORE / AFTER SLIDER =====
   Made Better's own. Willis has nothing like it. */
#mb .ba {
  position:relative; width:100%; aspect-ratio:16/10; overflow:hidden;
  border-radius:var(--radius-lg); border:1px solid var(--line);
  cursor:ew-resize; background:#0B0F0D; box-shadow:var(--shadow);
  touch-action:pan-y;
  user-select:none; -webkit-user-select:none; -ms-user-select:none;
  -webkit-touch-callout:none;
}
#mb .ba img {
  position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
  pointer-events:none;
  -webkit-user-drag:none; -moz-user-drag:none; user-drag:none;
  user-select:none; -webkit-user-select:none;
}
#mb .ba .ba-after{ clip-path:inset(0 0 0 var(--pos)); }
#mb .ba-handle {
  position:absolute; top:0; bottom:0; left:var(--pos); width:2px; background:#fff;
  transform:translateX(-1px); pointer-events:none; box-shadow:0 0 0 1px rgba(0,0,0,.18);
}
#mb .ba-knob {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
  width:46px; height:46px; border-radius:50%; background:#fff; color:var(--ink);
  display:grid; place-items:center; font-size:17px; box-shadow:0 6px 20px rgba(0,0,0,.35);
}
#mb .ba-tag {
  position:absolute; bottom:16px; padding:7px 13px; border-radius:999px;
  font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  background:rgba(14,19,17,.62); color:#fff; backdrop-filter:blur(6px); pointer-events:none;
}
#mb .ba-tag.l{ left:16px; }
#mb .ba-tag.r{ right:16px; }
#mb .ba-cap{ display:flex; justify-content:space-between; gap:20px; margin-top:16px; font-size:14.5px; color:var(--muted); }
#mb .ba-cap p:last-child{ color:var(--brass-text); font-weight:600; white-space:nowrap; }

#mb .ba-thumbs{ display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
#mb .ba-thumbs button {
  padding:9px 18px; min-height:44px; border-radius:999px; border:1px solid var(--line); background:var(--paper);
  font-size:14px; font-weight:600; color:var(--body); cursor:pointer; transition:all .15s;
}
#mb .ba-thumbs button:hover{ border-color:var(--brass); color:var(--head); }
#mb .ba-thumbs button[aria-pressed="true"]{ background:var(--ink); border-color:var(--ink); color:#fff; }

#mb .split-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
#mb .split-grid figure{ margin:0; border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--line); background:var(--wash); }
/* crop the white margin baked into the screenshot before/afters. raise if any
   white still shows, lower if the photos look too tight. */
#mb .split-grid{ --ba-crop:1.12; }
#mb .split-grid img {
  width:100%; aspect-ratio:3/2; object-fit:cover;
  transform:scale(var(--ba-crop));
  transition:transform .7s cubic-bezier(.16,1,.3,1), filter .4s ease;
}
#mb .split-grid figure:hover img{ transform:scale(calc(var(--ba-crop) + .06)); filter:saturate(1.1); }
#mb .split-grid figcaption{ font-size:13.5px; color:var(--muted); padding:9px 0 0; }

/* ===== SERVICE / VALUE CARDS ===== */
#mb .svc{ display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
#mb .svc-card {
  background:var(--paper); border:1px solid var(--line); border-radius:var(--radius-lg);
  padding:34px 30px 32px; box-shadow:var(--shadow);
  transition:transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s, border-color .25s;
}
#mb .svc-card:hover{ transform:translateY(-4px); box-shadow:var(--shadow-lift); border-color:rgba(200,151,75,.45); }
#mb .svc-num {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:11.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
  color:var(--brass-text); margin-bottom:14px;
}
#mb .svc-card h3{ margin-bottom:12px; }
#mb .svc-card p{ font-size:15.5px; color:var(--muted); line-height:1.6; max-width:62ch; }
#mb .svc-list{ list-style:none; margin:20px 0 0; padding:0; display:flex; flex-direction:column; gap:9px; }
#mb .svc-list li{ position:relative; padding-left:20px; font-size:15px; color:var(--body); }
#mb .svc-list li::before {
  content:""; position:absolute; left:2px; top:9px;
  width:6px; height:6px; border-radius:50%; background:var(--brass);
}

/* ===== GALLERY ===== */
#mb .gal{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
#mb .gal figure {
  margin:0; aspect-ratio:1; overflow:hidden; border-radius:var(--radius-lg);
  border:1px solid var(--line); background:var(--wash);
}
/* the same white margin that the split shots have is baked into several of
   these photos; the crop hides it. */
#mb .gal{ --gal-crop:1.06; }
#mb .gal img {
  width:100%; height:100%; object-fit:cover;
  transform:scale(var(--gal-crop));
  transition:transform .6s cubic-bezier(.16,1,.3,1), filter .4s;
}
#mb .gal figure:hover img{ transform:scale(calc(var(--gal-crop) + .08)); filter:saturate(1.1); }
#mb .gal .tall{ grid-row:span 2; aspect-ratio:1/2.06; }

/* ===== PROCESS ===== */
#mb .steps-wrap{ position:relative; }
#mb .steps-line{ position:absolute; top:26px; left:0; width:100%; height:40px; overflow:visible; }
#mb .steps-line path{ fill:none; stroke:var(--line); stroke-width:2; stroke-dasharray:1400; stroke-dashoffset:1400; transition:stroke-dashoffset 1.4s ease .1s; }
#mb .steps-line circle{ r:5; fill:var(--brass); opacity:0; transition:opacity .4s ease .6s; }
#mb .steps-wrap.drawn .steps-line path{ stroke-dashoffset:0; }
#mb .steps-wrap.drawn .steps-line circle{ opacity:1; }
#mb .steps{ position:relative; display:grid; grid-template-columns:repeat(3,1fr); gap:34px; }
#mb .steps > div{ padding-top:72px; }
#mb .step-n {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:40px; font-weight:800; color:var(--brass-display); line-height:1;
  letter-spacing:-.03em; margin-bottom:14px; font-variant-numeric:tabular-nums;
}
#mb .steps h3{ margin-bottom:10px; }
#mb .steps p{ font-size:15.5px; color:var(--muted); max-width:62ch; }

/* ===== CITY MARQUEE ===== */
#mb .marq{ overflow:hidden; background:var(--ink); padding:16px 0; border-top:1px solid var(--ink-3); border-bottom:1px solid var(--ink-3); }
#mb .marq-track{ display:flex; gap:0; white-space:nowrap; animation:mbMarq 46s linear infinite; width:max-content; }
#mb .marq-track span {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:14px; font-weight:600; color:#7E8B84; letter-spacing:.02em; padding:0 0 0 24px;
}
#mb .marq-track span::after{ content:"\\2022"; color:var(--brass); margin-left:24px; }
@keyframes mbMarq{ from{ transform:translateX(0) } to{ transform:translateX(-50%) } }

/* ===== SERVICE AREA ===== */
#mb .area{ display:grid; grid-template-columns:.9fr 1.1fr; gap:52px; align-items:start; }
#mb .area-map {
  position:sticky; top:110px; aspect-ratio:4/5; overflow:hidden;
  border-radius:var(--radius-lg); border:1px solid var(--line); background:var(--wash); box-shadow:var(--shadow);
}
#mb .area-map iframe{ width:100%; height:100%; border:0; filter:grayscale(1) contrast(.92); }
#mb .county {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:12.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
  color:var(--brass-text); margin:34px 0 14px;
}
#mb .county:first-child{ margin-top:0; }
/* Willis's city pills */
#mb .cities{ display:flex; flex-wrap:wrap; gap:8px; }
#mb .cities span {
  display:inline-flex; align-items:center; padding:8px 14px; border-radius:999px;
  font-size:13.5px; font-weight:600; color:var(--body);
  background:var(--wash); border:1px solid var(--line);
}

/* ===== CLOSING CTA ===== */
#mb .close {
  background:var(--ink); color:var(--stone); padding:88px 0;
  --head:#FFFFFF; --muted:#A8B2AC; --body:#C9D1CB;
  --brass-text:var(--brass); --brass-display:var(--brass);
}
#mb .close-in{ display:grid; grid-template-columns:1.2fr .8fr; gap:56px; align-items:center; }
#mb .close h2{ color:var(--head); }
/* Scoped to the copy column, not the whole band. As ".close p" it also matched
   every paragraph inside the white form card sitting in the other column, and
   beat ".form-note" on specificity: the card's helper text and fineprint were
   painted #C9D1CB, a dark-band colour, onto white. 1.56:1, near enough to
   invisible, and blown up to 18px besides. */
#mb .close-in > div:not(.form-card) p{ margin-top:16px; font-size:18px; color:var(--body); max-width:520px; }
#mb .close-phone {
  display:inline-block; margin-top:26px;
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:34px; font-weight:800; letter-spacing:-.025em; color:var(--brass);
}
#mb .close-phone:hover{ color:var(--brass-soft); }

/* ===== FAQ =====
   Willis has one and Made Better did not. Native <details> so it works with no
   JavaScript at all, which matters inside a builder that may run scripts late. */
#mb .faq{ max-width:860px; }
#mb .faq details {
  border-bottom:1px solid var(--line); background:transparent;
}
#mb .faq details:first-child{ border-top:1px solid var(--line); }
#mb .faq summary {
  list-style:none; cursor:pointer; padding:24px 44px 24px 0; position:relative;
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:17.5px; font-weight:700; color:var(--head); letter-spacing:-.015em; line-height:1.4;
}
#mb .faq summary::-webkit-details-marker{ display:none; }
#mb .faq summary::after {
  content:""; position:absolute; right:6px; top:50%; width:12px; height:12px;
  margin-top:-8px; border-right:2.2px solid var(--brass); border-bottom:2.2px solid var(--brass);
  transform:rotate(45deg); transition:transform .25s;
}
#mb .faq details[open] summary::after{ transform:rotate(-135deg); margin-top:-3px; }
#mb .faq summary:hover{ color:var(--brass-text); }
#mb .faq .faq-a{ padding:0 44px 26px 0; font-size:16px; color:var(--muted); line-height:1.65; max-width:62ch; }

/* ===== STAT BLOCK ===== */
#mb .stats{ display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
#mb .stat {
  background:var(--paper); border:1px solid var(--line); border-radius:var(--radius-lg);
  padding:30px 28px; box-shadow:var(--shadow);
}
#mb .stat b {
  display:block; font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:42px; font-weight:800; color:var(--brass-display); letter-spacing:-.03em;
  line-height:1; margin-bottom:8px; font-variant-numeric:tabular-nums; min-height:42px;
}
#mb .stat span{ font-size:14.5px; color:var(--muted); }

/* ===== FOOTER ===== */
/* White, not black. It drops the dark-scope token overrides entirely rather
   than restating them, so every colour in here comes from the same light-band
   set the rest of the page uses and there is no second copy to drift. */
#mb .ft {
  background:var(--paper); color:var(--body); padding:64px 0 30px;
  border-top:1px solid var(--line);
}
#mb .ft-in{ display:grid; grid-template-columns:1.6fr 1fr 1fr; gap:48px; }
#mb .brand-txt {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:19px; font-weight:800; color:var(--head); letter-spacing:-.02em;
}
#mb .brand-txt span{ color:var(--brass-text); }
#mb .ft-blurb{ margin-top:14px; font-size:14.5px; color:var(--muted); line-height:1.65; max-width:400px; }
#mb .ft h4{ color:var(--head); font-size:12.5px; letter-spacing:.16em; text-transform:uppercase; margin-bottom:16px; }
#mb .ft-links{ display:flex; flex-direction:column; gap:7px; }
#mb .ft-links a{ font-size:14.5px; color:var(--muted); transition:color .15s; padding:5px 0; }
#mb .ft-links a:hover{ color:var(--brass-text); }
#mb .ft-bot {
  display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap;
  margin-top:44px; padding-top:24px; border-top:1px solid var(--line);
  font-size:13px; color:var(--muted);
}
#mb .ft-bot a{ color:var(--muted); display:inline-block; padding:5px 0; }
#mb .ft-bot a:hover{ color:var(--brass-text); }

/* ===== INTERIOR PAGE HEAD ===== */
#mb .phead {
  position:relative; background:var(--ink); color:var(--stone); overflow:hidden;
  --head:#FFFFFF; --brass-text:var(--brass); --brass-display:var(--brass);
}
#mb .phead-bg{ position:absolute; inset:0; overflow:hidden; }
#mb .phead-bg img{ width:100%; height:100%; object-fit:cover; opacity:.26; }
#mb .phead-bg::after {
  content:""; position:absolute; inset:0;
  background:linear-gradient(104deg, var(--ink) 8%, rgba(14,19,17,.82) 100%);
}
/* The measure belongs on the text, not on the container. This element carries
   "wrap" too, and a 780px max-width on a "margin:0 auto" wrap centred the whole
   page head in the viewport: on a 1440px screen its left edge landed 178px
   right of the logo above it and the first section below it, so five of the
   seven pages opened with their title out of alignment with everything else on
   the page. The container goes back to the 1180px column every other band uses
   and the headline keeps its 780px measure. */
#mb .phead-in{ position:relative; padding:72px 24px 68px; }
#mb .phead-in h1{ max-width:780px; }
#mb .phead-in p{ max-width:680px; }
#mb .phead h1{ color:#fff; margin-bottom:18px; }
#mb .phead p{ font-size:19px; color:#C9D1CB; }

/* ===== PROSE (legal pages) ===== */
#mb .prose{ max-width:1180px; }
#mb .prose h2, #mb .prose h3, #mb .prose h4{ max-width:780px; }
#mb .prose h2{ font-size:27px; margin:48px 0 14px; }
#mb .prose h2:first-child{ margin-top:0; }
#mb .prose h3{ font-size:18px; margin:28px 0 8px; }
#mb .prose p{ color:var(--muted); margin-bottom:16px; font-size:16px; max-width:62ch; }
#mb .prose ul{ color:var(--muted); margin:0 0 18px; padding-left:20px; font-size:16px; max-width:62ch; }
#mb .prose li{ margin-bottom:8px; }
#mb .prose a{ color:var(--brass-text); text-decoration:underline; text-underline-offset:2px; }
#mb .prose strong{ color:var(--head); }
#mb .updated{ font-size:13px; color:var(--faint); padding:14px 0 0; border-top:1px solid var(--line); margin-top:10px; }

/* ===== ABOUT ===== */
#mb .split{ display:grid; grid-template-columns:1fr 1fr; gap:64px; align-items:center; }
#mb .split img{ width:100%; aspect-ratio:4/5; object-fit:cover; border-radius:var(--radius-lg); border:1px solid var(--line); }
#mb .split h2{ margin-bottom:18px; }
#mb .split p{ color:var(--muted); margin-bottom:16px; font-size:16.5px; max-width:62ch; }
#mb .vals{ display:grid; grid-template-columns:repeat(2,1fr); gap:22px; }
#mb .val {
  background:var(--paper); border:1px solid var(--line); border-radius:var(--radius-lg);
  padding:32px 30px; box-shadow:var(--shadow);
}
#mb .val h3{ margin-bottom:10px; }
#mb .val p{ color:var(--muted); font-size:15.5px; }

/* ===== SERVICE DETAIL ROWS ===== */
#mb .row{ display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:center; padding:60px 0; border-bottom:1px solid var(--line); }
#mb .row:last-child{ border-bottom:0; }
#mb .row > img, #mb .row .img-frame{ align-self:center; }
#mb .row .row-txt{ min-width:0; }
#mb .row img{ width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:var(--radius-lg); border:1px solid var(--line); }
#mb .row .img-frame{ border-radius:var(--radius-lg); overflow:hidden; }
#mb .row .img-frame img{ border-radius:0; border:0; }
#mb .row.flip .row-txt{ order:2; }
#mb .row h2{ margin-bottom:16px; }
#mb .row > div > p{ color:var(--muted); font-size:16.5px; margin-bottom:22px; max-width:62ch; }
#mb .row .svc-list{ margin-bottom:26px; }

/* ===== CONTACT ===== */
#mb .cgrid{ display:grid; grid-template-columns:1fr 1fr; gap:60px; align-items:start; }
/* The service-area map runs the full width of the grid, under both columns,
   rather than stacking portrait inside the left one. It is a map of a metro
   area, which is a wide shape: the 4/5 crop spent most of its height on water
   above and below the counties actually being named. */
#mb .cgrid > .map-wide {
  grid-column:1 / -1; position:static; aspect-ratio:24/7; top:auto;
}
#mb .cblock{ padding:24px 0; border-bottom:1px solid var(--line); }
#mb .cblock:first-of-type{ padding-top:0; }
#mb .cblock h4{ font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin:0 0 8px; }
#mb .cblock a, #mb .cblock p {
  font-family:'Plus Jakarta Sans','Inter',sans-serif;
  font-size:25px; font-weight:800; letter-spacing:-.025em; color:var(--head);
  overflow-wrap:anywhere; line-height:1.25; display:block;
}
#mb .cblock a:hover{ color:var(--brass-text); }
#mb .cblock small{ display:block; font-family:'Inter',sans-serif; font-size:14.5px; font-weight:400; color:var(--muted); margin-top:6px; letter-spacing:0; }

/* ===== THANK YOU ===== */
#mb .ty{ max-width:660px; margin:0 auto; text-align:center; padding:88px 0 80px; }
#mb .ty-mark {
  width:76px; height:76px; border-radius:50%; background:rgba(200,151,75,.12);
  border:1px solid rgba(200,151,75,.5); color:var(--brass-display);
  display:flex; align-items:center; justify-content:center; margin:0 auto 30px; font-size:31px;
}
#mb .ty h1{ margin-bottom:16px; }
#mb .ty > p{ color:var(--muted); font-size:18px; margin-bottom:34px; }
#mb .ty-next {
  text-align:left; border:1px solid var(--line); background:var(--wash);
  border-radius:var(--radius-lg); padding:32px; margin-bottom:34px;
}
#mb .ty-next h3{ margin-bottom:18px; }
#mb .ty-next ol{ margin:0; padding-left:20px; color:var(--muted); font-size:15.5px; }
#mb .ty-next li{ margin-bottom:12px; }
/* The lead-in of each step was inline-styled to --stone, which is the text
   colour for a DARK band. On this pale panel it rendered 1.16:1: the three
   phrases that carry the whole page were invisible. */
#mb .ty-next strong{ color:var(--head); font-weight:700; }
#mb .ty-next li:last-child{ margin-bottom:0; }

/* ===== SCROLL PROGRESS + STICKY MOBILE BAR ===== */
#mb-progress{ position:fixed; top:0; left:0; height:3px; width:0; background:var(--mb-brass); z-index:90; }
#mb-bar {
  position:fixed; left:0; right:0; bottom:0; z-index:80; display:none; gap:10px; padding:11px 14px;
  background:rgba(14,19,17,.95); backdrop-filter:blur(10px);
  transform:translateY(110%); transition:transform .3s cubic-bezier(.16,1,.3,1);
  border-top:1px solid var(--mb-ink-3);
}
#mb-bar.up{ transform:translateY(0); }
#mb-bar a {
  flex:1; text-align:center; padding:13px 10px; border-radius:var(--mb-radius);
  font-family:'Plus Jakarta Sans','Inter',sans-serif; font-size:14.5px; font-weight:700;
}
#mb-bar .b-call{ background:transparent; color:#fff; border:1px solid rgba(255,255,255,.28); }
#mb-bar .b-est{ background:var(--mb-brass); color:#14100A; }

/* ===== MOTION ===== */
#mb .reveal, #mb .reveal-l, #mb .reveal-r, #mb .gal figure, #mb .split-grid figure {
  opacity:0; transform:translateY(22px); transition:opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1);
}
#mb .reveal-l{ transform:translateX(-26px); }
#mb .reveal-r{ transform:translateX(26px); }
#mb .is-in{ opacity:1 !important; transform:none !important; }

#mb .w-line{ display:inline-block; overflow:hidden; vertical-align:bottom; }
#mb .w-word{ display:inline-block; transform:translateY(105%); transition:transform .8s cubic-bezier(.16,1,.3,1); }
#mb .w-ready .w-word{ transform:translateY(0); }

#mb .sec::before {
  content:""; position:absolute; top:0; left:0; width:0; height:1px; background:var(--line);
  transition:width 1.1s cubic-bezier(.16,1,.3,1);
}
#mb .sec.line-in::before{ width:100%; }

#mb .btn-primary.mag{ transition:transform .12s ease, background .18s, box-shadow .18s; }

#mb .px, #mb .px-soft{ will-change:transform; }
#mb .hero-copy{ will-change:transform, opacity; }

/* ===== RESPONSIVE =====
   This block used to open "#mb @media(...)". An at-rule cannot carry a selector,
   so the browser threw the whole block away and every rule in it was dead. The
   casualty that mattered: .hero-in never collapsed to one column, so on a phone
   the estimate form sat in a second grid column running off the right edge of
   the screen, roughly two thirds of it unreachable, on the page whose entire
   job is that form. */
@media(max-width:1060px){
  #mb .hero-in{ grid-template-columns:1fr; gap:44px; }
  #mb .form-card{ max-width:560px; }
  #mb .area{ grid-template-columns:1fr; gap:36px; }
  #mb .area-map{ position:static; aspect-ratio:16/10; }
}

@media(max-width:960px){
  #mb .sec{ padding:62px 0; }
  #mb .sec + .sec{ padding-top:34px; }
  #mb .sec.band, #mb .sec.band + .sec,
  #mb .sec.band-deep, #mb .sec.band-deep + .sec,
  #mb .sec.band-dark, #mb .sec.band-dark + .sec,
  #mb .sec.close{ padding-top:62px; }
  #mb .sec-head{ margin-bottom:34px; }
  #mb .hero{ padding:52px 0 60px; }
  #mb .svc, #mb .stats, #mb .steps, #mb .split-grid{ grid-template-columns:1fr; }
  #mb .trust-in{ grid-template-columns:1fr 1fr; }
  #mb .gal{ grid-template-columns:repeat(2,1fr); }
  #mb .gal .tall{ grid-row:span 1; aspect-ratio:1; }
  #mb .split, #mb .cgrid, #mb .row, #mb .vals{ grid-template-columns:1fr; gap:36px; }
  /* 24/7 across a phone is a 100px letterbox slit, not a map */
  #mb .cgrid > .map-wide{ aspect-ratio:16/10; }
  #mb .row.flip .row-txt{ order:0; }
  #mb .close-in{ grid-template-columns:1fr; gap:34px; }
  #mb .ft-in{ grid-template-columns:1fr; gap:34px; }
  #mb .phead-in{ padding:52px 0 48px; }
  #mb .ty{ padding:58px 0 52px; }
  #mb .steps > div{ padding-top:0; }
  #mb .steps-line{ display:none; }
  #mb .nav {
    display:none; position:absolute; top:100%; left:0; right:0;
    flex-direction:column; align-items:flex-start; gap:0; padding:12px 24px 20px;
    background:var(--paper); border-bottom:1px solid var(--line);
    box-shadow:0 20px 40px -26px rgba(14,19,17,.5); scrollbar-width:thin;
  }
  #mb .nav.open{ display:flex; }
  #mb .nav a{ width:100%; padding:13px 0; border-bottom:1px solid var(--line); font-size:16px; }
  #mb .nav a:last-child{ border-bottom:0; }
  #mb .nav a.is-active::after{ display:none; }
  #mb .burger{ display:grid; place-items:center; }
  #mb .hdr-phone, #mb .hdr-cta .btn{ display:none; }
  #mb-bar{ display:flex; }
  #mb .brand-logo{ height:44px; }
  #mb .hdr.is-stuck .brand-logo{ height:38px; }
  #mb .brand-name{ font-size:17px; }
  #mb .trust-in{ padding:26px 24px; }
  #mb .hdr-in{ height:76px; }
  #mb .hdr.is-stuck .hdr-in{ height:68px; }
}

@media(max-width:640px){
  #mb{ font-size:16px; }
  #mb .row-2{ grid-template-columns:1fr; }
  #mb .trust-in{ grid-template-columns:1fr; }
  #mb .form-card{ padding:26px 22px 24px; }
  #mb .ba-cap{ flex-direction:column; gap:6px; }
  #mb .close-phone{ font-size:28px; }
  #mb .cblock a, #mb .cblock p{ font-size:21px; }
}

@media(prefers-reduced-motion:reduce){
  #mb *{ animation-duration:.01ms !important; transition-duration:.01ms !important; }
  #mb .marq-track{ animation:none; }
}
`;

  // =========================================================================
  // HEADER — the top bar switches pages and does nothing else.
  //
  // Home used to carry Our Work, Pricing and Service Area as same-page
  // anchors, so the nav changed meaning depending on where you were standing:
  // four of the six items scrolled rather than navigated. It is now the same
  // four page links everywhere. The sections still have their ids, and the
  // footer still links into them.
  // =========================================================================
  var NAV = [
    ["/home", "Home"],
    ["/about", "About"],
    ["/services", "Services"],
    ["/contact", "Contact"]
  ];

  function header(page) {
    var links = NAV;

    var nav = links.map(function (l) {
      // The current page is marked rather than linked away from. A class, not
      // an inline colour: the header is light now and the mark is a brass rule
      // under the word, which an inline colour cannot express.
      var active = l[0] === "/" + page;
      return '<a href="' + l[0] + '"' + (active ? ' class="is-active"' : "") + ">" + l[1] + "</a>";
    }).join("\n        ");

    var cta = page === "home" ? "#estimate" : "/contact";

    return [
      '  <header class="hdr">',
      '    <div class="wrap hdr-in">',
      '      <a href="/home" class="brand">',
      '        <img class="brand-logo" src="' + CONFIG.logo + '" alt="">',
      '        <span class="brand-name">MADE BETTER<i>.</i></span>',
      "      </a>",
      '      <nav class="nav" id="mbNav">',
      "        " + nav,
      "      </nav>",
      '      <div class="hdr-cta">',
      '        <a class="hdr-phone" href="' + CONFIG.phoneHref + '">' + CONFIG.phone + "</a>",
      '        <a class="btn btn-primary" href="' + cta + '">Free estimate</a>',
      '        <button class="burger" id="mbBurger" aria-label="Open menu" aria-expanded="false">\u2630</button>',
      "      </div>",
      "    </div>",
      "  </header>"
    ].join("\n");
  }

  // =========================================================================
  // FOOTER — identical everywhere except the two links that are anchors on
  // Home and journeys anywhere else.
  // =========================================================================
  function footer(page) {
    var work = page === "home" ? "#work" : "/home#work";
    var estimate = page === "home" ? "#estimate" : "/contact";

    return [
      '  <footer class="ft">',
      '    <div class="wrap">',
      '      <div class="ft-in">',
      "        <div>",
      '          <span class="brand-txt">MADE BETTER<span>.</span></span>',
      '          <p class="ft-blurb">Hardscaping, landscaping, and exterior works across Metro Detroit. A young, local crew serving Metro Detroit. Owner-operated by Seamus Geohagen, licensed and insured, with honest pricing on every job.</p>',
      "        </div>",
      "        <div>",
      "          <h4>Company</h4>",
      '          <div class="ft-links">',
      '            <a href="/about">About us</a>',
      '            <a href="/services">Services</a>',
      '            <a href="/contact">Contact us</a>',
      '            <a href="' + work + '">Our work</a>',
      "          </div>",
      "        </div>",
      "        <div>",
      "          <h4>Get in touch</h4>",
      '          <div class="ft-links">',
      '            <a href="' + CONFIG.phoneHref + '">' + CONFIG.phone + "</a>",
      '            <a href="mailto:' + CONFIG.email + '">' + CONFIG.email + "</a>",
      '            <a href="' + estimate + '">Free estimate</a>',
      "          </div>",
      "        </div>",
      "      </div>",
      '      <div class="ft-bot">',
      '        <span>\u00A9 <span id="mbYear">2026</span> Made Better LC. All rights reserved.</span>',
      '        <span><a href="/privacy-policy">Privacy Policy</a> &nbsp;\u00B7&nbsp; <a href="/terms">Terms</a></span>',
      "      </div>",
      "    </div>",
      "  </footer>"
    ].join("\n");
  }

  // =========================================================================
  // PAGE BODIES — everything between the header and the footer.
  // =========================================================================
  var PAGES = {
  "home": `
<!-- ================= HERO ================= -->
  <section class="hero" id="estimate">
    <div class="hero-bg">
      <img loading="lazy" src="https://drive.google.com/thumbnail?id=1WuWK-Zg2qeVk_QtcqHDSu7rtQSXzL1y6&amp;sz=w1900" alt="Finished brick paver patio in Metro Detroit">
    </div>
    <div class="wrap hero-in">
      <div>
        <div class="eyebrow">Hardscaping &amp; Landscaping · Metro Detroit</div>
        <h1>Your yard, <em>made better.</em></h1>
        <p class="hero-sub">Brick pavers, retaining walls, and full exterior work from a young local crew. Honest pricing, itemized down to the last line.</p>
        <ul class="hero-pts">
          <li><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Free estimate with every cost itemized, no pressure</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Proper base prep, the part that decides if it lasts</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Low overhead, so you get big-company work at a fair price</li>
        </ul>
        <div class="hero-actions">
          <a class="btn btn-ghost" href="#work">See the work</a>
          <a class="btn btn-ghost" href="tel:+13135069238">Call (313) 506-9238</a>
        </div>
      </div>

      <div class="form-card">
        <div id="mbFormWrap">
          <h3>Get your free estimate</h3>
          <p class="form-note">Tell us about the project. We price it honestly and get back to you the same day.</p>
          <form class="fields" id="mbForm" novalidate>
            <div class="row-2">
              <div class="field">
                <label for="mbName">Name</label>
                <input id="mbName" name="name" type="text" required>
              </div>
              <div class="field">
                <label for="mbPhone">Phone</label>
                <input id="mbPhone" name="phone" type="tel" required>
              </div>
            </div>
            <div class="row-2">
              <div class="field">
                <label for="mbEmail">Email</label>
                <input id="mbEmail" name="email" type="email" required>
              </div>
              <div class="field">
                <label for="mbZip">Zip code</label>
                <input id="mbZip" name="zip" type="text" inputmode="numeric" required>
              </div>
            </div>
            <div class="field">
              <label for="mbService">What do you need?</label>
              <select id="mbService" name="service">
                <option>Brick pavers: patio, walkway or driveway</option>
                <option>Retaining wall</option>
                <option>Landscaping: beds, plantings, mulch</option>
                <option>Sod, grading or drainage</option>
                <option>Exterior works: something else</option>
                <option>Not sure yet</option>
              </select>
            </div>
            <div class="field">
              <label for="mbNotes">Project details <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
              <textarea id="mbNotes" name="notes" placeholder="Rough size, timeline, anything we should know."></textarea>
            </div>
            <button class="btn btn-primary" type="submit">Request my free estimate</button>
          </form>
          <p class="fineprint">We'll only use your info to quote this project. No spam, ever.</p>
        </div>
        <div class="form-success" id="mbSuccess">
          <h3>Request received</h3>
          <p style="color:var(--muted)">We'll call you shortly at the number you gave us. If it's urgent, reach us at (313) 506-9238.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= TRUST ================= -->
  <div class="trust">
    <div class="wrap trust-in">
      <div class="trust-item">
        <span class="trust-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg></span>
        <div><strong>Licensed &amp; insured</strong><span>Fully covered on every job</span></div>
      </div>
      <div class="trust-item">
        <span class="trust-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4.8A2 2 0 0 1 4.8 2.8H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8Z"/><path d="M7.5 7.5h.01"/></svg></span>
        <div><strong>100% transparent pricing</strong><span>Itemized, no hidden costs, no surprises</span></div>
      </div>
      <div class="trust-item">
        <span class="trust-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>
        <div><strong>50+ communities</strong><span>Wayne, Oakland, Macomb, Washtenaw</span></div>
      </div>
      <div class="trust-item">
        <span class="trust-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17H4a8 8 0 0 1 16 0Z"/><path d="M2 17h20"/><path d="M9.5 9.3V5.6a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3.7"/></svg></span>
        <div><strong>Owner on site</strong><span>Seamus is on the job, not behind a desk</span></div>
      </div>
    </div>
  </div>

  <!-- ================= BEFORE / AFTER ================= -->
  <section class="sec" id="work">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">Before &amp; after</div>
        <h2>Drag to see the difference.</h2>
        <p>Same yard, same angle. The only thing that changed is what's under your feet.</p>
      </div>

      <div class="ba" id="mbBA" style="--pos:50%" tabindex="0" role="slider"
           aria-label="Before and after comparison" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
        <img id="mbBefore" draggable="false" src="https://drive.google.com/thumbnail?id=18FJswUSNeyQ-oGvb3FsptotxfMAhT1Eu&amp;sz=w1400" alt="Yard before work">
        <img id="mbAfter" draggable="false" class="ba-after" src="https://drive.google.com/thumbnail?id=18PmjXBeqMa8i50PUp9LlbbcwdlGbWcUB&amp;sz=w1400" alt="Finished paver installation">
        <div class="ba-handle"><div class="ba-knob">&#8646;</div></div>
        <div class="ba-tag l">Before</div>
        <div class="ba-tag r">After</div>
      </div>

      <div class="ba-cap">
        <p id="mbBACap">Front walkway rebuild with full base excavation, new pavers, polymeric sand.</p>
        <p style="color:var(--brass-text)">Drag the handle</p>
      </div>

      <div class="ba-thumbs" id="mbBAThumbs">
        <button aria-pressed="true"  data-b="https://drive.google.com/thumbnail?id=18FJswUSNeyQ-oGvb3FsptotxfMAhT1Eu&amp;sz=w1400" data-a="https://drive.google.com/thumbnail?id=18PmjXBeqMa8i50PUp9LlbbcwdlGbWcUB&amp;sz=w1400" data-c="Brick paver installation with full base excavation, new pavers, polymeric sand.">Walkway</button>
        <button aria-pressed="false" data-b="https://drive.google.com/thumbnail?id=1Fq3GAV5pCnpV5qBE_jsrthHtULcTmjxr&amp;sz=w1400" data-a="https://drive.google.com/thumbnail?id=1TMiPlKDntE2c7gZR7vzDljOPP3hF5jF9&amp;sz=w1400" data-c="Brick work rebuilt and reset level.">Patio</button>
        <button aria-pressed="false" data-b="https://drive.google.com/thumbnail?id=1tnL2zxt0oNASjZviDx6DjS1wLWMy1S48&amp;sz=w1400" data-a="https://drive.google.com/thumbnail?id=1IRETMeqWUiGSm-oG39K8CNdKcZCUXKeg&amp;sz=w1400" data-c="Landscape bed cleared, re-edged and replanted.">Porch</button>
      </div>
    </div>
  </section>

  <!-- ================= SERVICES ================= -->
  <section class="sec band-deep" id="services">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">What we do</div>
        <h2>Three trades, one crew.</h2>
        <p>Most yards need more than one of these. You get all of it from the same people, on the same schedule.</p>
      </div>
      <div class="svc">
        <div class="svc-card">
          <div class="svc-num">HARDSCAPING</div>
          <h3>Brick &amp; stone work</h3>
          <p>The heavy build. Everything gets excavated, compacted, and set on a proper base so it doesn't sink or heave.</p>
          <ul class="svc-list">
            <li>Paver patios &amp; walkways</li>
            <li>Driveways &amp; aprons</li>
            <li>Retaining &amp; seat walls</li>
            <li>Steps, porches &amp; landings</li>
            <li>Fire pits &amp; borders</li>
          </ul>
        </div>
        <div class="svc-card">
          <div class="svc-num">LANDSCAPING</div>
          <h3>Beds &amp; plantings</h3>
          <p>The part people see first. Cleared, shaped, and planted so it still looks right three seasons from now.</p>
          <ul class="svc-list">
            <li>Bed design &amp; installation</li>
            <li>Shrubs, trees &amp; perennials</li>
            <li>Mulch &amp; decorative stone</li>
            <li>Edging &amp; bed redefinition</li>
            <li>Sod &amp; lawn repair</li>
          </ul>
        </div>
        <div class="svc-card">
          <div class="svc-num">EXTERIOR WORKS</div>
          <h3>Everything else outside</h3>
          <p>The jobs that don't fit a category. If it's on the outside of the house, ask us.</p>
          <ul class="svc-list">
            <li>Grading &amp; drainage</li>
            <li>Demolition &amp; haul-away</li>
            <li>Downspout &amp; water management</li>
            <li>Seasonal cleanups</li>
            <li>Property maintenance</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= MORE TRANSFORMATIONS =================
       Its own section now, sitting after the services rather than tucked on
       the end of the slider. The slider proves one job in detail; this proves
       there are plenty more, which lands better once someone knows what we
       actually do. -->
  <section class="sec">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">More transformations</div>
        <h2>The same story, nine more times.</h2>
        <p>Every one of these is a real Metro Detroit property, shot from the same spot before and after.</p>
      </div>
      <div class="split-grid">
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1Qi4vmWYhJWXY6OP3wVLrZE-djr-nTX3J&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1YuTbOca-bnbkzcE0qow3yh1fDX5p3hBV&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1-XmB_uirOunnLT_eTTJExLH458UaqOl7&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1l4nMoIsbsDZ9cuccRM_O5jkzqQ9KG2Y3&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1cLuagJqGpVIROouCSLNrEHuo_xssNWdl&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1AZrp7WUsGm_oW_N2xiYIuXuwB4tuTXEL&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1Ca5HsIjopeYd_I7JLv0aVPcufd4Qce4X&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1UIAzYi5qXxHuuo1HLJiE1doVUGymv_AA&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1d0BY3yBDJBL7lr_5GYgfQYZcN92Buy37&amp;sz=w1200" alt="Before and after of a Made Better LC project"></figure>
      </div>
    </div>
  </section>

  <!-- ================= PRICING TRANSPARENCY ================= -->
  <section class="sec band" id="pricing">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">What you pay for</div>
        <h2>Every estimate, broken all the way down.</h2>
        <p>You should not need a second quote to find out whether the first one was fair. Here is exactly what shows up on ours.</p>
      </div>
      <div class="svc">
        <div class="svc-card">
          <div class="svc-num">MATERIALS</div>
          <h3>Listed by name</h3>
          <p>Pavers, aggregate, sand, wall block, plant material. The product, the quantity, and what it costs. If you want to spend less, we will show you which material choice actually moves the number.</p>
        </div>
        <div class="svc-card">
          <div class="svc-num">LABOUR</div>
          <h3>Priced by the job</h3>
          <p>Excavation, base prep, install, and finish work, quoted as a job and not an open clock. It does not go up because we hit a slow day.</p>
        </div>
        <div class="svc-card">
          <div class="svc-num">DISPOSAL</div>
          <h3>Included, not extra</h3>
          <p>Hauling off the old patio, the spoil pile, and the pallets is part of the price. No surprise dump fee on the final invoice.</p>
        </div>
      </div>
      <p style="color:var(--muted);font-size:16.5px;margin-top:34px;max-width:720px">
        We are a young crew with low overhead, and we would rather win the job on an honest number than pad it and hope you do not notice.
        If a line does not make sense to you, ask. We will walk you through it.
      </p>
    </div>
  </section>

  <!-- ================= GALLERY ================= -->
  <section class="sec">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">Recent jobs</div>
        <h2>Work from around Metro Detroit.</h2>
      </div>
      <div class="gal">
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1xLKGauwoccGwSWM3-_x8Pf6VnyqV-etf&amp;sz=w1000" alt="Completed hardscaping work"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1s7ZdCO0IIXPjfwZtk2eMpJwV80Sv8Ut4&amp;sz=w1000" alt="Completed hardscaping work"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1MWGUG-6Mx5Gf9Y65JtV9xndr4AHJXm4t&amp;sz=w1000" alt="Completed hardscaping work"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=121VMnXK8cmXF4h5U6-k7PWoUyptHwahp&amp;sz=w1000" alt="Completed landscaping work"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=13cVac7dCvsfOg3wR_jpbig8fR8t66qJD&amp;sz=w1000" alt="Completed landscaping work"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1OuoCDFn5r6m5-vFgD2AQfCfqwF_XfxQG&amp;sz=w1000" alt="Brick paver detail"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1WuWK-Zg2qeVk_QtcqHDSu7rtQSXzL1y6&amp;sz=w1000" alt="Brick paver installation"></figure>
        <figure><img loading="lazy" src="https://drive.google.com/thumbnail?id=1VEPh5axiRkH3x_q9XST8Uup6fsJ9VXpS&amp;sz=w1000" alt="Equipment on site"></figure>
      </div>
    </div>
  </section>

  <!-- ================= PROCESS ================= -->
  <section class="sec band">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">How it goes</div>
        <h2>Three steps, no surprises.</h2>
      </div>
      <div class="steps-wrap">
        <svg class="steps-line" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M 30 20 L 500 20 L 970 20"></path>
          <circle cx="30" cy="20"></circle>
          <circle cx="500" cy="20"></circle>
          <circle cx="970" cy="20"></circle>
        </svg>
      <div class="steps">
        <div>
          <div class="step-n">01</div>
          <h3>We come look</h3>
          <p>Send the form or call. We walk the property, measure, and talk through what you actually want, usually within a day or two.</p>
        </div>
        <div>
          <div class="step-n">02</div>
          <h3>You see every number</h3>
          <p>Materials, labour and disposal broken out line by line, so you know exactly what you are paying for. No line called "miscellaneous," no moving target once we start.</p>
        </div>
        <div>
          <div class="step-n">03</div>
          <h3>We build it</h3>
          <p>Base prep, install, cleanup. We leave the site swept and haul off everything we tore out. You get before-and-after photos when it's done.</p>
        </div>
      </div>
      </div>
    </div>
  </section>


  <div class="marq" aria-hidden="true">
    <div class="marq-track" id="mbMarq"></div>
  </div>

  <!-- ================= SERVICE AREA ================= -->
  <section class="sec" id="area">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">Where we work</div>
        <h2>Serving 50+ Metro Detroit communities.</h2>
        <p>If your city isn't listed, call anyway and we'll tell you straight if it's too far.</p>
      </div>
      <div class="area">
        <div class="area-map">
          <iframe src="https://www.google.com/maps?q=Metro+Detroit+Michigan&output=embed" loading="lazy" title="Made Better LC service area map"></iframe>
        </div>
        <div>
          <div class="county">Oakland County</div>
          <div class="cities">
            <span>Berkley</span><span>Beverly Hills</span><span>Birmingham</span><span>Bloomfield Hills</span>
            <span>Clawson</span><span>Commerce Twp</span><span>Farmington</span><span>Farmington Hills</span>
            <span>Franklin</span><span>Hazel Park</span><span>Highland</span><span>Huntington Woods</span>
            <span>Lathrup Village</span><span>Madison Heights</span><span>Milford</span><span>Novi</span>
            <span>Pleasant Ridge</span><span>Rochester</span><span>Rochester Hills</span><span>Royal Oak</span>
            <span>South Lyon</span><span>Southfield</span><span>Troy</span><span>Walled Lake</span>
            <span>West Bloomfield</span><span>White Lake</span><span>Wixom</span>
          </div>

          <div class="county">Wayne County</div>
          <div class="cities">
            <span>Allen Park</span><span>Belleville</span><span>Canton</span><span>Dearborn</span>
            <span>Dearborn Heights</span><span>Garden City</span><span>Inkster</span><span>Lincoln Park</span>
            <span>Livonia</span><span>Northville</span><span>Plymouth</span><span>Romulus</span>
            <span>Taylor</span><span>Wayne</span><span>Westland</span>
          </div>

          <div class="county">Macomb County</div>
          <div class="cities">
            <span>Clinton Twp</span><span>Macomb Twp</span><span>Shelby Twp</span><span>St. Clair Shores</span>
            <span>Sterling Heights</span><span>Utica</span><span>Warren</span>
          </div>

          <div class="county">Washtenaw County</div>
          <div class="cities">
            <span>Ann Arbor</span><span>Ypsilanti</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= FAQ =================
       Willis has one and Made Better did not. Every answer here restates
       something the site already commits to further up; nothing is invented. -->
  <section class="sec band">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">Questions</div>
        <h2>Straight answers before you book.</h2>
      </div>
      <div class="faq">
        <details>
          <summary>How does the estimate work?</summary>
          <div class="faq-a">Send the form or call. We walk the property, measure, and talk through what you actually want, usually within a day or two. It takes about twenty minutes on site and there is no pressure at the end of it.</div>
        </details>
        <details>
          <summary>What is actually in the price?</summary>
          <div class="faq-a">Materials listed by name with the quantity and what each costs, labour quoted as a job rather than an open clock, and disposal. Hauling off the old patio, the spoil pile and the pallets is part of the number, so there is no surprise dump fee on the final invoice.</div>
        </details>
        <details>
          <summary>Do I need separate people for the hardscaping and the landscaping?</summary>
          <div class="faq-a">No. Brick and stone work, beds and plantings, and the exterior jobs that do not fit a category all come from the same crew on the same schedule. Most yards need more than one of the three.</div>
        </details>
        <details>
          <summary>Are you licensed and insured?</summary>
          <div class="faq-a">Yes, and fully covered on every job.</div>
        </details>
        <details>
          <summary>Who is actually on the job?</summary>
          <div class="faq-a">Seamus is on site rather than behind a desk. We are a young crew with low overhead, which is what lets us quote a real number instead of padding it.</div>
        </details>
        <details>
          <summary>Do you work in my city?</summary>
          <div class="faq-a">We cover 50+ communities across Oakland, Wayne, Macomb and Washtenaw counties. If your city is not on the list above, call anyway and we will tell you straight if it is too far.</div>
        </details>
        <details>
          <summary>What if a line on the estimate does not make sense?</summary>
          <div class="faq-a">Ask, and we will walk you through it. You should not need a second quote to find out whether the first one was fair.</div>
        </details>
      </div>
    </div>
  </section>

  <!-- ================= CLOSING CTA ================= -->
  <section class="sec close">
    <div class="wrap close-in">
      <div>
        <div class="eyebrow">Ready when you are</div>
        <h2>See exactly what it costs.</h2>
        <p>Free estimate, every cost itemized, and a straight answer on timing. Takes about twenty minutes on site.</p>
        <a class="close-phone" href="tel:+13135069238">(313) 506-9238</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;align-items:flex-start">
        <a class="btn btn-primary" href="#estimate" style="padding:20px 40px;font-size:16px">Request my free estimate</a>
        <a class="btn btn-ghost" href="mailto:madebetterlc@gmail.com" style="padding:20px 40px;font-size:16px">madebetterlc@gmail.com</a>
      </div>
    </div>
  </section>

  <!-- ================= FOOTER ================= -->
`,

  "services": `
<section class="phead">
    <div class="phead-bg">
      <img loading="lazy" src="https://drive.google.com/thumbnail?id=1OuoCDFn5r6m5-vFgD2AQfCfqwF_XfxQG&amp;sz=w1900" alt="Finished paver patio">
    </div>
    <div class="wrap phead-in">
      <div class="eyebrow">Services</div>
      <h1>Hardscaping, landscaping, exterior works.</h1>
      <p>Most yards need more than one of these. You get all of it from the same local crew, on the same schedule, at one transparent price.</p>
    </div>
  </section>

  <section class="sec" style="padding-top:0;padding-bottom:0">
    <div class="wrap">

      <div class="row">
        <div class="row-txt">
          <div class="eyebrow">Hardscaping</div>
          <h2>Brick &amp; stone work</h2>
          <p>The heavy build. Everything gets excavated to depth, compacted in lifts, and set on a base sized for what's going on top of it. A patio and a driveway are not the same job.</p>
          <ul class="svc-list">
            <li>Paver patios &amp; walkways</li>
            <li>Driveways &amp; aprons</li>
            <li>Retaining walls &amp; seat walls</li>
            <li>Steps, porches &amp; landings</li>
            <li>Fire pits &amp; soldier-course borders</li>
            <li>Repairs &amp; releveling of settled work</li>
          </ul>
          <a class="btn btn-primary" href="/contact">Get a hardscaping estimate</a>
        </div>
        <img loading="lazy" src="https://drive.google.com/thumbnail?id=1WuWK-Zg2qeVk_QtcqHDSu7rtQSXzL1y6&amp;sz=w1400" alt="Brick paver patio installation">
      </div>

      <div class="row flip">
        <div class="row-txt">
          <div class="eyebrow">Landscaping</div>
          <h2>Beds &amp; plantings</h2>
          <p>The part people see from the street. Beds get cleared, re-edged, and planted with material that suits the light and the soil, so it still looks right three seasons from now, not just on install day.</p>
          <ul class="svc-list">
            <li>Bed design &amp; installation</li>
            <li>Shrubs, trees &amp; perennials</li>
            <li>Mulch &amp; decorative stone</li>
            <li>Edging &amp; bed redefinition</li>
            <li>Sod installation &amp; lawn repair</li>
            <li>Overgrowth clearing &amp; removals</li>
          </ul>
          <a class="btn btn-primary" href="/contact">Get a landscaping estimate</a>
        </div>
        <img loading="lazy" src="https://drive.google.com/thumbnail?id=1IRETMeqWUiGSm-oG39K8CNdKcZCUXKeg&amp;sz=w1400" alt="Freshly installed landscape beds">
      </div>

      <div class="row">
        <div class="row-txt">
          <div class="eyebrow">Exterior works</div>
          <h2>Everything else outside</h2>
          <p>The jobs that don't fit a category, and the ones that have to happen before the pretty work can start. Water in the wrong place ruins more hardscape than anything else, so grading and drainage usually come first.</p>
          <ul class="svc-list">
            <li>Grading &amp; drainage correction</li>
            <li>Downspout &amp; water management</li>
            <li>Demolition &amp; haul-away</li>
            <li>Seasonal cleanups</li>
            <li>Ongoing property maintenance</li>
          </ul>
          <a class="btn btn-primary" href="/contact">Ask about exterior work</a>
        </div>
        <img loading="lazy" src="https://drive.google.com/thumbnail?id=1VEPh5axiRkH3x_q9XST8Uup6fsJ9VXpS&amp;sz=w1400" alt="Grading and drainage work">
      </div>

    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">How it goes</div>
        <h2>Three steps, no surprises.</h2>
      </div>
      <div class="steps-wrap">
        <svg class="steps-line" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M 30 20 L 500 20 L 970 20"></path>
          <circle cx="30" cy="20"></circle>
          <circle cx="500" cy="20"></circle>
          <circle cx="970" cy="20"></circle>
        </svg>
      <div class="steps">
        <div>
          <div class="step-n">01</div>
          <h3>We come look</h3>
          <p>Send the form or call. We walk the property, measure, and talk through what you actually want, usually within a day or two.</p>
        </div>
        <div>
          <div class="step-n">02</div>
          <h3>You see every number</h3>
          <p>Materials, labour and disposal broken out line by line, so you know exactly what you are paying for. No line called "miscellaneous," no moving target once we start.</p>
        </div>
        <div>
          <div class="step-n">03</div>
          <h3>We build it</h3>
          <p>Base prep, install, cleanup. We haul off everything we tore out and leave the site swept. You get before-and-after photos when it's done.</p>
        </div>
      </div>
      </div>
    </div>
  </section>

  <section class="sec close">
    <div class="wrap close-in">
      <div>
        <div class="eyebrow">Free estimate</div>
        <h2>Not sure what it should cost?</h2>
        <p>Describe the problem and we'll tell you what it actually takes to fix it, itemized, even if that's less work and less money than you expected.</p>
        <a class="close-phone" href="tel:+13135069238">(313) 506-9238</a>
      </div>
      <div class="form-card">
        <h3>Get your free, itemized estimate</h3>
        <p class="form-note">Tell us about the project. We price it honestly and get back to you the same day.</p>
        <form class="fields" id="mbForm" novalidate>
          <div class="row-2">
            <div class="field"><label for="mbName">Name</label><input id="mbName" name="name" type="text" required></div>
            <div class="field"><label for="mbPhone">Phone</label><input id="mbPhone" name="phone" type="tel" required></div>
          </div>
          <div class="row-2">
            <div class="field"><label for="mbEmail">Email</label><input id="mbEmail" name="email" type="email" required></div>
            <div class="field"><label for="mbZip">Zip code</label><input id="mbZip" name="zip" type="text" inputmode="numeric" required></div>
          </div>
          <div class="field">
            <label for="mbService">What do you need?</label>
            <select id="mbService" name="service">
              <option>Brick pavers: patio, walkway or driveway</option>
              <option>Retaining wall</option>
              <option>Landscaping: beds, plantings, mulch</option>
              <option>Sod, grading or drainage</option>
              <option>Exterior works: something else</option>
              <option>Not sure yet</option>
            </select>
          </div>
          <div class="field">
            <label for="mbNotes">Project details <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
            <textarea id="mbNotes" name="notes" placeholder="Rough size, timeline, anything we should know."></textarea>
          </div>
          <button class="btn btn-primary" type="submit">Request my free estimate</button>
        </form>
        <p class="fineprint">We'll only use your info to quote this project. No spam, ever.</p>
      </div>
    </div>
  </section>
`,

  "about": `
<section class="phead">
    <div class="phead-bg">
      <img loading="lazy" src="https://drive.google.com/thumbnail?id=1VEPh5axiRkH3x_q9XST8Uup6fsJ9VXpS&amp;sz=w1900" alt="Made Better LC crew on a job site">
    </div>
    <div class="wrap phead-in">
      <div class="eyebrow">About us</div>
      <h1>We'd rather do it right than do it twice.</h1>
      <p>Made Better LC is a Metro Detroit hardscaping and landscaping company. Same crew, every job, start to finish.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap split">
      <div>
        <div class="eyebrow">Our story</div>
        <h2>A young crew that has to earn it.</h2>
        <p>Seamus started Made Better LC two years ago, straight out of school, with a truck and a standard he refused to move on. When you are the new crew in a market full of established companies, you do not get to coast on a name. You earn every job, and then you earn the referral.</p>
        <p>A lot of what we get called for is fixing work somebody else rushed. Patios that sank. Walkways that heaved after one winter. Walls leaning because nobody handled the drainage behind them. Almost always it comes down to the base, the part that gets covered up, so it is the easiest place to cut corners and the hardest place to catch it. We do not cut it.</p>
        <p>The other half of it is the price. We run lean, we do the work ourselves, and we show you where every dollar goes. You should not need a second quote to find out whether the first one was fair.</p>
        <p>That's the whole idea behind the name. Not just built. Made better.</p>
        <p>Seamus is the one who shows up for the estimate, writes the number, and is on site while the work is happening. Same person, start to finish.</p>
      </div>
      <img loading="lazy" src="https://drive.google.com/thumbnail?id=121VMnXK8cmXF4h5U6-k7PWoUyptHwahp&amp;sz=w1100" alt="Base preparation before paver installation">
    </div>
  </section>

  <section class="sec band-dark">
    <div class="wrap">
      <div class="stats">
        <div class="stat"><b>50+</b><span>Metro Detroit communities served</span></div>
        <div class="stat"><b>2 yrs</b><span>Serving Metro Detroit homeowners</span></div>
        <div class="stat"><b>100%</b><span>Transparent pricing, itemized before work starts</span></div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">How we work</div>
        <h2>Four things we don't move on.</h2>
      </div>
      <div class="vals">
        <div class="val">
          <h3>The base gets done right</h3>
          <p>Proper excavation depth, compacted aggregate, and the right edge restraint. It's the invisible part of the job and the only part that decides whether it lasts.</p>
        </div>
        <div class="val">
          <h3>Transparent, every time</h3>
          <p>You see materials, labour and disposal broken out before we start. If something genuinely changes, we tell you before we do it, not after. No upsells invented halfway through.</p>
        </div>
        <div class="val">
          <h3>Fair, not cheap</h3>
          <p>We keep overhead low and pass that on, but we do not win jobs by thinning the base or skipping steps. Affordable is what you pay. Cheap is what you get back in three years.</p>
        </div>
        <div class="val">
          <h3>We clean up</h3>
          <p>Everything we tear out leaves with us. The site gets swept, the lawn gets protected, and we don't leave a pallet in your driveway for three weeks.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="sec close">
    <div class="wrap close-in">
      <div>
        <div class="eyebrow">Ready when you are</div>
        <h2>Get an honest number.</h2>
        <p>Free estimate, every cost itemized, straight answer on timing. Takes about twenty minutes on site.</p>
        <a class="close-phone" href="tel:+13135069238">(313) 506-9238</a>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;align-items:flex-start">
        <a class="btn btn-primary" href="/contact" style="padding:20px 40px;font-size:16px">Request my free estimate</a>
        <a class="btn btn-ghost" href="/services" style="padding:20px 40px;font-size:16px">See all services</a>
      </div>
    </div>
  </section>
`,

  "contact": `
<section class="phead">
    <div class="phead-bg">
      <img loading="lazy" src="https://drive.google.com/thumbnail?id=13cVac7dCvsfOg3wR_jpbig8fR8t66qJD&amp;sz=w1900" alt="Made Better LC job site">
    </div>
    <div class="wrap phead-in">
      <div class="eyebrow">Contact us</div>
      <h1>Get an honest number.</h1>
      <p>Free, fully itemized, no obligation. Send the form and we'll call you back the same day, or reach out directly, whichever is easier.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap cgrid">
      <div>
        <div class="cblock">
          <h4>Call or text</h4>
          <a href="tel:+13135069238">(313) 506-9238</a>
          <small>Fastest way to reach us. If we're on a job, leave a message and we'll call back.</small>
        </div>
        <div class="cblock">
          <h4>Email</h4>
          <a href="mailto:madebetterlc@gmail.com">madebetterlc@gmail.com</a>
          <small>Send photos of the area and we can usually give you an honest ballpark before we come out.</small>
        </div>
        <div class="cblock">
          <h4>Hours</h4>
          <p style="font-size:22px">Mon&ndash;Fri, 9am&ndash;5pm</p>
          <small>Leave a message outside these hours and we'll get back to you the next business day.</small>
        </div>
        <div class="cblock" style="border-bottom:0">
          <h4>Service area</h4>
          <p style="font-size:22px">Metro Detroit</p>
          <small>Wayne, Oakland, Macomb and Washtenaw counties, 50+ communities. Not sure if you're in range? Call and ask.</small>
        </div>
      </div>
      <div class="form-card">
        <h3>Request your free estimate</h3>
        <p class="form-note">Takes about a minute. Every cost itemized, no obligation, no pressure.</p>
        <form class="fields" id="mbForm" novalidate>
          <div class="row-2">
            <div class="field"><label for="mbName">Name</label><input id="mbName" name="name" type="text" required></div>
            <div class="field"><label for="mbPhone">Phone</label><input id="mbPhone" name="phone" type="tel" required></div>
          </div>
          <div class="row-2">
            <div class="field"><label for="mbEmail">Email</label><input id="mbEmail" name="email" type="email" required></div>
            <div class="field"><label for="mbZip">Zip code</label><input id="mbZip" name="zip" type="text" inputmode="numeric" required></div>
          </div>
          <div class="field">
            <label for="mbService">What do you need?</label>
            <select id="mbService" name="service">
              <option>Brick pavers: patio, walkway or driveway</option>
              <option>Retaining wall</option>
              <option>Landscaping: beds, plantings, mulch</option>
              <option>Sod, grading or drainage</option>
              <option>Exterior works: something else</option>
              <option>Not sure yet</option>
            </select>
          </div>
          <div class="field">
            <label for="mbNotes">Project details <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
            <textarea id="mbNotes" name="notes" placeholder="Rough size, timeline, anything we should know."></textarea>
          </div>
          <button class="btn btn-primary" type="submit">Request my free estimate</button>
        </form>
        <p class="fineprint">We'll only use your info to quote this project. No spam, ever.</p>
      </div>
      <div class="area-map map-wide reveal">
        <iframe src="https://www.google.com/maps?q=Metro+Detroit+Michigan&output=embed" loading="lazy" title="Made Better LC service area map"></iframe>
      </div>
    </div>
  </section>
`,

  "thank-you": `
<section>
    <div class="wrap ty">
      <div class="ty-mark">&#10003;</div>
      <h1>Request received.</h1>
      <p>Thanks, your estimate request came through. We'll be in touch shortly.</p>

      <div class="ty-next">
        <h3>What happens next</h3>
        <ol>
          <li><strong>We call you back.</strong> Usually the same day, at the number you gave us. If you'd rather not wait, call (313) 506-9238 and we'll pick up if we're not on a job.</li>
          <li><strong>We set a time to come look.</strong> Twenty minutes on site to measure, check drainage, and talk through what you want. Evenings and weekends work.</li>
          <li><strong>You get an itemized price.</strong> Materials, labour and disposal broken out separately, no obligation to move forward.</li>
        </ol>
      </div>

      <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
        <a class="btn btn-primary" href="tel:+13135069238">Call (313) 506-9238</a>
        <a class="btn btn-ghost" href="/home#work">See our work</a>
      </div>
    </div>
  </section>
`,

  "privacy-policy": `
<section class="phead">
    <div class="wrap phead-in">
      <div class="eyebrow">Legal</div>
      <h1>Privacy Policy</h1>
      <p>How Made Better LC collects, uses, and protects the information you share with us.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap prose">
      <p class="updated">Last updated: <span id="mbUpd">August 2026</span></p>

      <h2>Who we are</h2>
      <p>Made Better LC ("we," "us," or "our") provides hardscaping, landscaping, and exterior services in the Metro Detroit area. This policy explains what we do with the information you give us through this website, by phone, by text, or by email.</p>

      <h2>Information we collect</h2>
      <p>We only collect what we need to quote and complete your project:</p>
      <ul>
        <li><strong>Contact information</strong> you submit through our estimate form: name, phone number, email address, and zip code.</li>
        <li><strong>Project details</strong> you choose to share, including descriptions, measurements, and any photos you send us.</li>
        <li><strong>Basic site usage data</strong> collected automatically, such as pages visited and general location, through standard analytics tools.</li>
      </ul>
      <p>We do not collect payment card numbers through this website.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To contact you about the estimate or project you asked about.</li>
        <li>To prepare and send you a written quote.</li>
        <li>To schedule and complete work you've hired us for.</li>
        <li>To follow up about your project or, occasionally, about seasonal services. You can opt out of these at any time.</li>
      </ul>
      <p>We do not sell your information, and we do not rent or trade contact lists.</p>

      <h2>Text messages</h2>
      <p>If you give us your mobile number, you agree that we may contact you by text about your estimate or project. Message and data rates may apply. Reply STOP to any message to opt out, or HELP for assistance. Opting out of texts does not affect your ability to reach us by phone or email.</p>

      <h2>Who we share it with</h2>
      <p>We share information only with service providers that help us run the business, for example our customer management software, email provider, and phone system. These providers are only permitted to use your information to provide services to us. We may also disclose information if required by law.</p>

      <h2>Cookies and analytics</h2>
      <p>This site may use cookies and similar technologies to understand how visitors use the site and to improve it. You can disable cookies in your browser settings, though some parts of the site may not work as expected.</p>

      <h2>How long we keep it</h2>
      <p>We keep estimate requests and project records for as long as needed to serve you and to meet our business and legal obligations. You may ask us to delete your information at any time.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Ask us what information we have about you.</li>
        <li>Ask us to correct or delete it.</li>
        <li>Opt out of marketing emails or texts at any time.</li>
      </ul>
      <p>To make any of these requests, email <a href="mailto:madebetterlc@gmail.com">madebetterlc@gmail.com</a> or call <a href="tel:+13135069238">(313) 506-9238</a>.</p>

      <h2>Children</h2>
      <p>This website is not directed at children under 13, and we do not knowingly collect information from them.</p>

      <h2>Changes to this policy</h2>
      <p>If we update this policy, we'll change the date at the top of this page. Material changes will be noted here.</p>

      <h2>Contact</h2>
      <p>Made Better LC<br>
      Phone: <a href="tel:+13135069238">(313) 506-9238</a><br>
      Email: <a href="mailto:madebetterlc@gmail.com">madebetterlc@gmail.com</a></p>
    </div>
  </section>
`,

  "terms": `
<section class="phead">
    <div class="wrap phead-in">
      <div class="eyebrow">Legal</div>
      <h1>Terms of Service</h1>
      <p>The terms that apply when you use this website or request work from Made Better LC.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap prose">
      <p class="updated">Last updated: <span>August 2026</span></p>

      <h2>Agreement</h2>
      <p>By using this website or requesting an estimate from Made Better LC, you agree to these terms. If you don't agree with them, please don't use the site.</p>

      <h2>Estimates and quotes</h2>
      <p>Estimates are free and carry no obligation. Any price shown on this website or given verbally is an approximation until we've seen the property. A written estimate is valid for 30 days from the date issued unless stated otherwise, and assumes the conditions we observed at the time of the visit.</p>
      <p>If we uncover conditions that weren't visible during the estimate, such as buried debris, unexpected utilities, unsuitable soil, or drainage problems, we'll stop, tell you what we found, and get your approval before doing additional work or charging additional cost.</p>

      <h2>Scheduling and weather</h2>
      <p>Outdoor work depends on weather and ground conditions. We may reschedule for rain, frost, or saturated ground. We'll give you as much notice as we can, and we don't charge for delays outside our control.</p>

      <h2>Site access and property</h2>
      <p>You agree to provide reasonable access to the work area and to identify any private utilities, irrigation lines, invisible fencing, or septic components that aren't marked by the public utility locate service. We call for public utility locates before we dig. We're not responsible for damage to unmarked private lines.</p>

      <h2>Payment</h2>
      <p>Payment terms for your project are set out in your written estimate or contract. Any deposit amount, payment schedule, and accepted payment methods will be stated there before work begins. Past-due balances may accrue interest as permitted by Michigan law.</p>

      <h2>Workmanship and warranties</h2>
      <p>We take pride in the quality of our installations. We do not offer a separate written workmanship warranty unless one is specifically stated in your estimate or contract for your project.</p>
      <p>Manufacturer warranties on materials such as pavers, wall block, and plant material are provided by the manufacturer or grower, not by Made Better LC. We'll pass along any manufacturer documentation that comes with your materials.</p>
      <p>If something isn't right with work we've completed, tell us. We'd rather hear about it and come look than have you live with it.</p>

      <h2>Plant material</h2>
      <p>Plants are living material and their survival depends heavily on watering and care after installation. We'll tell you what your plantings need. Coverage on plant material, where offered, is stated in your written estimate.</p>

      <h2>Cancellation</h2>
      <p>You may cancel before work begins. If materials have already been ordered or custom-cut, you may be responsible for those costs. We'll always tell you where things stand before you decide.</p>

      <h2>Photos of completed work</h2>
      <p>We may photograph completed projects for our portfolio, website, and social media. Photos won't include your address or personal information. If you'd rather we didn't, just tell us. There's no penalty and it won't affect your project.</p>

      <h2>Website content</h2>
      <p>Content on this site is provided for general information and is owned by Made Better LC. Photos of completed projects represent our own work. Nothing on this site is a binding offer or a guarantee of specific results on your property.</p>

      <h2>Limitation of liability</h2>
      <p>To the extent permitted by law, our liability for any claim related to our services is limited to the amount you paid for the work in question. We're not liable for indirect or consequential damages.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of Michigan.</p>

      <h2>Contact</h2>
      <p>Questions about these terms?<br>
      Phone: <a href="tel:+13135069238">(313) 506-9238</a><br>
      Email: <a href="mailto:madebetterlc@gmail.com">madebetterlc@gmail.com</a></p>
    </div>
  </section>
`
  };

  // =========================================================================
  // BEHAVIOUR — one wire() for all seven pages.
  //
  // Every block below guards on the element it needs, because a page that does
  // not have a before/after slider must not throw and take the rest of the
  // page's behaviour down with it. The pasted pages had two versions of this,
  // a guarded one for the interiors and an unguarded one for Home; the guarded
  // one is the correct one everywhere.
  // =========================================================================
  function wire(root, page) {
    var y = document.getElementById("mbYear");
    if (y) y.textContent = new Date().getFullYear();

    /* ---------- mobile nav ---------- */
    var burger = document.getElementById("mbBurger"), nav = document.getElementById("mbNav");
    if (burger && nav) {
      burger.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      nav.addEventListener("click", function (e) {
        if (e.target.tagName === "A") { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }
      });
    }

    /* ---------- before / after slider (Home) ---------- */
    var ba = document.getElementById("mbBA");
    if (ba) {
      var dragging = false;
      var setPos = function (clientX) {
        var r = ba.getBoundingClientRect();
        var pct = ((clientX - r.left) / r.width) * 100;
        pct = Math.max(0, Math.min(100, pct));
        ba.style.setProperty("--pos", pct + "%");
        ba.setAttribute("aria-valuenow", Math.round(pct));
      };
      ba.addEventListener("dragstart", function (e) { e.preventDefault(); });
      ba.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        ba.classList.add("touched");
        dragging = true; ba.setPointerCapture(e.pointerId); setPos(e.clientX);
      });
      ba.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        e.preventDefault(); setPos(e.clientX);
      });
      ba.addEventListener("pointerup", function () { dragging = false; });
      ba.addEventListener("pointercancel", function () { dragging = false; });
      ba.addEventListener("lostpointercapture", function () { dragging = false; });

      /* keyboard: arrow keys nudge, home/end jump */
      ba.addEventListener("keydown", function (e) {
        var cur = parseFloat(ba.style.getPropertyValue("--pos")) || 50, step = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowLeft") cur -= step;
        else if (e.key === "ArrowRight") cur += step;
        else if (e.key === "Home") cur = 0;
        else if (e.key === "End") cur = 100;
        else return;
        e.preventDefault();
        cur = Math.max(0, Math.min(100, cur));
        ba.style.setProperty("--pos", cur + "%");
        ba.setAttribute("aria-valuenow", Math.round(cur));
      });

      /* project switcher under the slider */
      var thumbs = document.getElementById("mbBAThumbs");
      if (thumbs) {
        thumbs.addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          thumbs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          document.getElementById("mbBefore").src = b.dataset.b;
          document.getElementById("mbAfter").src = b.dataset.a;
          document.getElementById("mbBACap").textContent = b.dataset.c;
          ba.style.setProperty("--pos", "50%");
        });
      }
    }

    /* ---------- estimate form ---------- */
    var form = document.getElementById("mbForm");
    if (form) {
      var btn = form.querySelector("button[type=submit]");
      var btnLabel = btn ? btn.textContent : "Request my free estimate";

      var fail = function (message) {
        if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
        var err = form.querySelector(".mb-form-err");
        if (!err) {
          err = document.createElement("p");
          err.className = "mb-form-err";
          err.setAttribute("role", "alert");
          form.appendChild(err);
        }
        err.innerHTML = message;
      };

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }

        // The webhook is the only thing that makes this form real. Without it
        // we say so, rather than showing a thank-you nobody earned.
        if (!CONFIG.webhookUrl) {
          fail('This form is not connected yet. Please call us on <a href="' +
            CONFIG.phoneHref + '">' + CONFIG.phone + '</a> and we will book you in.');
          return;
        }

        if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

        // Read by name off form.elements rather than form.<name>. Both work, but
        // the second collides with the form's own properties (form.action is the
        // one that bites), and this says what it means.
        var val = function (n) {
          var el = form.elements[n];
          return el && el.value ? String(el.value).trim() : "";
        };

        // GHL wants a first and last name. One "Name" box is friendlier to fill
        // in, so it is split here instead: everything before the first space is
        // the first name, the remainder is the last. Sending the whole thing as
        // one field is what leaves business names sitting in the wrong slot.
        var whole = val("name").replace(/\s+/g, " ");
        var cut = whole.indexOf(" ");
        var first = cut === -1 ? whole : whole.slice(0, cut);
        var last = cut === -1 ? "" : whole.slice(cut + 1);

        // Field names match GHL's standard contact keys so the workflow can map
        // them without hand-typing each one.
        var payload = {
          first_name: first,
          last_name: last,
          full_name: whole,
          phone: val("phone"),
          email: val("email"),
          postal_code: val("zip"),
          service: val("service"),
          notes: val("notes"),
          source: "Made Better LC website (" + page + ")"
        };

        // Form-encoded, NOT JSON. A JSON content type makes this a non-simple
        // request, so the browser sends a CORS preflight first, and GHL's hook
        // endpoint does not answer preflights. The estimate then never leaves
        // the browser and the visitor is told it failed. Willis Windows hit
        // exactly this. URLSearchParams keeps it a simple request.
        var params = new URLSearchParams();
        Object.keys(payload).forEach(function (k) { params.append(k, payload[k]); });

        // sendBeacon survives the page navigating away, which matters on the
        // contact page because it redirects immediately after.
        var sent = false;
        try { sent = !!(navigator.sendBeacon && navigator.sendBeacon(CONFIG.webhookUrl, params)); }
        catch (err) { sent = false; }

        if (!sent) {
          try {
            fetch(CONFIG.webhookUrl, { method: "POST", body: params, keepalive: true, mode: "no-cors" });
            sent = true;
          } catch (err) { sent = false; }
        }

        if (!sent) {
          fail('That did not send. Please call us on <a href="' +
            CONFIG.phoneHref + '">' + CONFIG.phone + '</a>.');
          return;
        }

        // A no-cors response is opaque, so the reply cannot be read: "sent" here
        // means it left the browser, not that GHL liked it. Watch the workflow
        // after connecting rather than trusting this screen.
        //
        // Home answers in place; the contact page has a thank-you page to go to.
        var wrap = document.getElementById("mbFormWrap"), ok = document.getElementById("mbSuccess");
        if (wrap && ok) {
          wrap.style.display = "none";
          ok.style.display = "block";
          return;
        }

        // Hold briefly so the request is on the wire before the page changes.
        setTimeout(function () {
          try { window.top.location.href = "/thank-you"; }
          catch (err) { window.location.href = "/thank-you"; }
        }, 600);
      });
    }

    /* ---------- scroll reveal ---------- */
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var targets = root.querySelectorAll(
      ".sec-head, .trust-item, .svc-card, .steps > div, .val, .stat, .ba, .ba-cap, .ba-thumbs," +
      ".splits-h, .area-map, .cities, .county, .close-in > div, .ft-in > div, .row > div, .row > img," +
      ".split > div, .split > img, .cblock, .prose > *, .ty-mark, .ty > h1, .ty > p, .ty-next"
    );

    if (reduce || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("is-in"); });
      root.querySelectorAll(".gal figure, .split-grid figure").forEach(function (el) { el.classList.add("is-in"); });
    } else {
      targets.forEach(function (el) { el.classList.add("reveal"); });

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      targets.forEach(function (el) { io.observe(el); });

      /* grids stagger tile by tile */
      root.querySelectorAll(".gal, .split-grid").forEach(function (grid) {
        var tiles = grid.querySelectorAll("figure");
        var gio = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            tiles.forEach(function (t, i) {
              setTimeout(function () { t.classList.add("is-in"); }, i * 65);
            });
            gio.unobserve(en.target);
          });
        }, { threshold: 0.12 });
        gio.observe(grid);
      });
    }

    /* ---------- header condenses on scroll ---------- */
    var hdr = root.querySelector(".hdr");
    if (hdr) {
      var onScroll = function () {
        if (window.scrollY > 40) hdr.classList.add("is-stuck");
        else hdr.classList.remove("is-stuck");
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    /* ---------- count up the stat numbers ---------- */
    root.querySelectorAll(".stat b").forEach(function (el) {
      var raw = el.textContent, m = raw.match(/\d+/);
      if (!m || reduce || !("IntersectionObserver" in window)) return;
      var target = parseInt(m[0], 10), prefix = raw.slice(0, m.index), suffix = raw.slice(m.index + m[0].length);
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var start = null, dur = 900;
          var tick = function (ts) {
            if (!start) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            el.textContent = prefix + Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          };
          el.textContent = prefix + "0" + suffix;
          requestAnimationFrame(tick);
          sio.unobserve(en.target);
        });
      }, { threshold: 0.5 });
      sio.observe(el);
    });

    /* ---------- smooth in-page anchors ---------- */
    root.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var t = document.querySelector(a.getAttribute("href"));
        if (!t) return;
        e.preventDefault();
        t.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    });

    /* ---------- scroll progress ---------- */
    (function () {
      if (reduce || document.getElementById("mb-progress")) return;
      var bar = document.createElement("div"); bar.id = "mb-progress";
      document.body.appendChild(bar);
      var upd = function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
      };
      window.addEventListener("scroll", upd, { passive: true }); upd();
    })();

    /* ---------- headline word reveal ---------- */
    (function () {
      var heads = root.querySelectorAll(".hero h1, .phead h1, .sec-head h2, .close h2, .ty h1, .split h2, .row h2");
      heads.forEach(function (h) {
        if (h.dataset.split) return; h.dataset.split = "1";
        var out = "";
        Array.prototype.forEach.call(h.childNodes, function (n) {
          if (n.nodeType === 3) {
            n.textContent.split(/(\s+)/).forEach(function (w) {
              if (!w.trim()) { out += " "; return; }
              out += '<span class="w-line"><span class="w-word">' + w + "</span></span>";
            });
          } else {
            out += '<span class="w-line"><span class="w-word">' + n.outerHTML + "</span></span> ";
          }
        });
        h.innerHTML = out;
        var words = h.querySelectorAll(".w-word");
        words.forEach(function (w, i) { w.style.transitionDelay = (i * 55) + "ms"; });
      });

      var fire = function (h) { h.classList.add("w-ready"); };
      if (reduce || !("IntersectionObserver" in window)) { heads.forEach(fire); return; }
      var hio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { fire(e.target); hio.unobserve(e.target); } });
      }, { threshold: 0.25 });
      heads.forEach(function (h) { hio.observe(h); });
      setTimeout(function () {
        root.querySelectorAll(".hero h1, .phead h1, .ty h1").forEach(fire);
      }, 250);
    })();

    /* ---------- alternating slide direction ---------- */
    root.querySelectorAll(".row .row-txt, .split > div:first-child").forEach(function (el) { el.classList.add("reveal-l"); });
    root.querySelectorAll(".row > .img-frame, .split > .img-frame").forEach(function (el) { el.classList.add("reveal-r"); });

    /* ---------- parallax ---------- */
    (function () {
      if (reduce) return;
      var items = [];
      var hero = root.querySelector(".hero-bg img"); if (hero) { hero.classList.add("px"); items.push([hero, .18]); }
      /* interior images sit in unclipped grid cells, so they get a gentle
         transform inside their own frame instead of page-level parallax */
      root.querySelectorAll(".row > img, .split > img").forEach(function (im) {
        var frame = document.createElement("div");
        frame.className = "img-frame";
        im.parentNode.insertBefore(frame, im);
        frame.appendChild(im);
        im.classList.add("px-soft");
        items.push([im, .045]);
      });
      if (!items.length) return;
      var ticking = false;
      var run = function () {
        items.forEach(function (p) {
          var el = p[0], sp = p[1], r = el.getBoundingClientRect();
          if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
          var off = (r.top + r.height / 2 - window.innerHeight / 2) * sp;
          el.style.transform = "translate3d(0," + (-off).toFixed(1) + "px,0)" + (el === hero ? " scale(1.22)" : " scale(1.10)");
        });
        ticking = false;
      };
      window.addEventListener("scroll", function () {
        if (!ticking) { requestAnimationFrame(run); ticking = true; }
      }, { passive: true });
      run();
    })();

    /* ---------- sticky mobile call bar ---------- */
    (function () {
      if (document.getElementById("mb-bar")) return;
      var bar = document.createElement("div"); bar.id = "mb-bar";
      bar.innerHTML = '<a class="b-call" href="' + CONFIG.phoneHref + '">Call ' + CONFIG.phone + "</a>" +
        '<a class="b-est" href="/contact">Free estimate</a>';
      document.body.appendChild(bar);
      var onS = function () { bar.classList.toggle("up", window.scrollY > 420); };
      window.addEventListener("scroll", onS, { passive: true }); onS();
    })();

    /* ---------- city marquee (Home) ---------- */
    (function () {
      var track = document.getElementById("mbMarq"); if (!track) return;
      var names = [];
      root.querySelectorAll(".cities span").forEach(function (s) { names.push(s.textContent.trim()); });
      if (!names.length) return;
      var html = names.map(function (n) { return "<span>" + n + "</span>"; }).join("");
      track.innerHTML = html + html;
    })();

    /* ---------- mortar line wipe on every section ---------- */
    (function () {
      var secs = root.querySelectorAll(".sec");
      if (reduce || !("IntersectionObserver" in window)) {
        secs.forEach(function (s) { s.classList.add("line-in"); }); return;
      }
      var lio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("line-in"); lio.unobserve(e.target); } });
      }, { threshold: 0.05 });
      secs.forEach(function (s) { lio.observe(s); });
    })();

    /* ---------- process connector draws itself ---------- */
    (function () {
      var wrap = root.querySelector(".steps-wrap"); if (!wrap) return;
      if (reduce || !("IntersectionObserver" in window)) { wrap.classList.add("drawn"); return; }
      var dio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { wrap.classList.add("drawn"); dio.unobserve(e.target); } });
      }, { threshold: 0.3 });
      dio.observe(wrap);
    })();

    /* ---------- magnetic primary buttons ---------- */
    (function () {
      var noHover = window.matchMedia && window.matchMedia("(hover: none)").matches;
      if (reduce || noHover) return;
      root.querySelectorAll(".btn-primary").forEach(function (b) {
        b.addEventListener("mousemove", function (e) {
          var r = b.getBoundingClientRect();
          var x = e.clientX - r.left - r.width / 2;
          var y = e.clientY - r.top - r.height / 2;
          b.classList.add("mag");
          b.style.transform = "translate(" + (x * 0.22).toFixed(1) + "px," + (y * 0.3).toFixed(1) + "px) scale(1.03)";
        });
        b.addEventListener("mouseleave", function () {
          b.classList.remove("mag");
          b.style.transform = "";
        });
      });
    })();

    /* ---------- scroll-driven hero (Home) ---------- */
    (function () {
      var copy = root.querySelector(".hero-in > div:first-child");
      if (!copy || reduce) return;
      copy.classList.add("hero-copy");
      var hero = root.querySelector(".hero");
      if (!hero) return;
      var tick = false;
      var run = function () {
        var r = hero.getBoundingClientRect();
        var p = Math.min(Math.max(-r.top / (r.height * 0.85), 0), 1);
        copy.style.transform = "translateY(" + (p * 70).toFixed(1) + "px) scale(" + (1 - p * 0.06).toFixed(3) + ")";
        copy.style.opacity = (1 - p * 1.1).toFixed(2);
        tick = false;
      };
      window.addEventListener("scroll", function () {
        if (!tick) { requestAnimationFrame(run); tick = true; }
      }, { passive: true });
      run();
    })();

    /* ---------- trust strip number roll ---------- */
    (function () {
      if (reduce || !("IntersectionObserver" in window)) return;
      root.querySelectorAll(".trust-item strong").forEach(function (el) {
        var raw = el.textContent, m = raw.match(/\d+/); if (!m) return;
        var target = parseInt(m[0], 10), pre = raw.slice(0, m.index), post = raw.slice(m.index + m[0].length);
        var tio = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (!e.isIntersecting) return;
            var t0 = null, dur = 1100;
            var step = function (ts) {
              if (!t0) t0 = ts;
              var p = Math.min((ts - t0) / dur, 1);
              el.textContent = pre + Math.round(target * (1 - Math.pow(1 - p, 4))) + post;
              if (p < 1) requestAnimationFrame(step);
            };
            el.textContent = pre + "0" + post;
            requestAnimationFrame(step);
            tio.unobserve(e.target);
          });
        }, { threshold: 0.6 });
        tio.observe(el);
      });
    })();
  }

  // =========================================================================
  // MOUNT + BOOT
  // =========================================================================
  // The wrapper class names in the stylesheet are a list of the ones seen so
  // far, not a contract: GHL is free to nest a step one level deeper, or to
  // rename a div, and then its padding sits somewhere no rule here knows to
  // look. So the ancestors are flattened by position rather than by name.
  // Whatever stands between the mount point and <body> is GHL's chrome, and
  // its padding is not ours to inherit.
  function flattenWrappers(root) {
    for (var n = root.parentElement; n && n !== document.body; n = n.parentElement) {
      n.style.setProperty("padding", "0", "important");
      n.style.setProperty("margin-top", "0", "important");
      n.style.setProperty("margin-bottom", "0", "important");
    }
  }

  function mount(root, page) {
    // Injected at runtime rather than carried in a <link> or <style> tag,
    // because GoHighLevel's builder strips <link> out of custom code blocks.
    // The @import inside STYLES is how the fonts survive that.
    if (!document.querySelector("style[data-mb-site]")) {
      var style = document.createElement("style");
      style.setAttribute("data-mb-site", "1");
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    flattenWrappers(root);
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
      // rather than leaving a white screen with a silent console.
      console.error(
        '[made-better] no <div id="' + ROOT_ID + '"> on this page after 5s, so nothing was drawn. ' +
        'The GHL step needs BOTH lines of the stub: the div and the script tag.'
      );
      return;
    }
    if (root.getAttribute("data-mb-ready")) return;
    root.setAttribute("data-mb-ready", "1");

    var page = (root.getAttribute("data-page") || "").trim();
    if (!PAGES[page]) {
      // A typo in the stub should not leave a blank page in front of a customer.
      if (page) console.warn('[made-better] unknown data-page "' + page + '", drawing ' + DEFAULT_PAGE);
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
