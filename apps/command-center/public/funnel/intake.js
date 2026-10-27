// The client intake funnel, served rather than pasted.
//
// GoHighLevel holds a ten-line stub (agency/funnels/client-onboarding/01-intake-form.html)
// that loads this file. Everything the form IS lives here, so a copy change is a
// deploy and nobody has to go back into the GHL builder. Page 2 already loads
// GHL's own form_embed.js exactly this way, so the pattern is proven on these
// pages.
//
// THIS FILE IS THE SOURCE. There is no longer a second copy of the form in the
// HTML, which is the point: two copies drifted every time one was edited.
//
// It ships from public/, so Cloudflare serves it unhashed at a stable URL and
// revalidates it. The stub in GHL never changes again.
//
// Keep the field list in step with apps/command-center/src/lib/intake.ts. The
// server SILENTLY DROPS any key it does not recognise, so a typo here does not
// error, it quietly bins that client's answer. The parity check is
// src/lib/intakeFunnelParity.test.ts.

(function () {
  "use strict";

  // Read at top level, while the browser still knows which script is running.
  var self = document.currentScript;
  var origin = "https://app.hauckmarketing.com";
  try {
    if (self && self.src) origin = new URL(self.src).origin;
  } catch (e) {}
  window.__HM_FUNNEL_ORIGIN = origin;

  var ROOT_ID = "hm-funnel-root";

  var STYLES = `/* @import rather than a <link> tag: GoHighLevel's builder strips <link>
   elements out of custom code blocks, which would silently drop the fonts. */
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

.hm-funnel{
  --hm-green:#4DBB83; --hm-green-deep:#3AA470; --hm-ink:#0C1512; --hm-body:#4A5A55;
  --hm-line:#E3E9E6; --hm-faint:#8B9A94; --hm-wash:#F6F8F7;
  /* Break out of whatever column GHL wraps this in, so the background runs the
     full width of the page instead of sitting in a boxed strip. */
  width:100vw; max-width:100vw; margin-left:calc(50% - 50vw);
  position:relative; min-height:100vh; padding:0 20px 80px; overflow:hidden;
  background:radial-gradient(120% 60% at 50% -10%, rgba(77,187,131,.14), transparent 60%), var(--hm-wash);
  color:var(--hm-ink); font-family:Inter,-apple-system,"Segoe UI",sans-serif; -webkit-font-smoothing:antialiased;
  text-align:left;
}
/* GHL's theme styles reach into custom blocks. Reset only what it touches. */
.hm-funnel *{box-sizing:border-box}
.hm-funnel button{margin:0;text-transform:none;letter-spacing:normal;line-height:normal}
.hm-funnel input,.hm-funnel select,.hm-funnel textarea{margin:0;max-width:none;box-shadow:none}
.hm-funnel label{margin:0;display:block;text-transform:none}
.hm-funnel dl,.hm-funnel dd,.hm-funnel dt{margin:0}
.hm-funnel h2{margin:0;font-family:Poppins,Inter,sans-serif;font-weight:600;letter-spacing:-.02em}
.hm-funnel h3{margin:0}
.hm-funnel p{margin:0}
.hm-top{display:flex;justify-content:center;padding:38px 0 28px}
.hm-mark{display:flex;align-items:center;gap:9px;font-family:Poppins,Inter,sans-serif;font-weight:600;font-size:15px;letter-spacing:-.02em}
.hm-mark-dot{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--hm-green);color:#062018;font-size:11px;font-weight:600}
.hm-card{position:relative;max-width:620px;margin:0 auto;background:#fff;border:1px solid #E9EEEC;border-radius:20px;
  box-shadow:0 2px 4px rgba(10,29,25,.03), 0 16px 44px rgba(10,29,25,.09);overflow:hidden}
.hm-pad{padding:32px 40px 34px}
.hm-segs{display:flex;gap:6px;margin-bottom:24px}
.hm-segs i{flex:1;height:4px;border-radius:3px;background:#E7EDEA;transition:background .3s,opacity .3s}
.hm-segs i.is-done{background:var(--hm-green)}
.hm-segs i.is-now{background:var(--hm-green);opacity:.45}
.hm-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.hm-head h2{font-size:25px}
.hm-step-of{font-size:11.5px;color:var(--hm-faint);font-variant-numeric:tabular-nums;white-space:nowrap}
.hm-sub{margin-top:8px;font-size:14px;line-height:1.55;color:var(--hm-body)}
.hm-body{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.hm-wide{grid-column:1/-1}
.hm-field{display:flex;flex-direction:column;gap:6px}
.hm-field>label{font-size:12.5px;font-weight:500;color:var(--hm-body)}
.hm-req{color:var(--hm-green-deep)}
.hm-field input,.hm-field select,.hm-field textarea{
  width:100%;padding:11px 13px;font:inherit;font-size:14.5px;color:var(--hm-ink);background:#fff;
  border:1px solid var(--hm-line);border-radius:10px;transition:border-color .15s,box-shadow .15s}
.hm-field textarea{resize:vertical}
.hm-field input::placeholder,.hm-field textarea::placeholder{color:#A9B6B1}
.hm-field input:focus,.hm-field select:focus,.hm-field textarea:focus{
  outline:none;border-color:var(--hm-green);box-shadow:0 0 0 3px rgba(77,187,131,.16)}
.hm-field.has-error input,.hm-field.has-error select,.hm-field.has-error textarea{border-color:#D4553F}
.hm-help{font-size:11.5px;line-height:1.45;color:var(--hm-faint)}
/* Help text can carry a link (the A2P explainer, the app store links). GHL's
   theme styles anchors, so these get their own rule rather than inheriting
   whatever colour the surrounding funnel happens to use. */
.hm-funnel .hm-help a{color:var(--hm-green-deep);font-weight:500;
  text-decoration:underline;text-underline-offset:2px}
.hm-funnel .hm-help a:hover{color:var(--hm-ink)}
/* The one line in a help note that people skip and then get wrong: sharing
   permissions on an asset link, and the wording the ad call-out wants. Marked
   rather than merely bolded, because at 11.5px bold alone barely reads. */
.hm-funnel .hm-help .hm-mark-em{color:var(--hm-ink);font-weight:600;
  background:rgba(77,187,131,.18);border-radius:4px;padding:1px 4px;
  box-decoration-break:clone;-webkit-box-decoration-break:clone}
.hm-err{font-size:11.5px;line-height:1.45;color:#C2492F}
.hm-check{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
.hm-check input{width:17px;height:17px;margin-top:1px;flex:none;accent-color:var(--hm-green)}
.hm-check span{font-size:14px;line-height:1.45;color:var(--hm-ink)}
.hm-radios{display:flex;flex-wrap:wrap;gap:8px}
.hm-radio{display:flex;align-items:center;gap:8px;cursor:pointer;padding:9px 14px;border:1px solid var(--hm-line);
  border-radius:10px;font-size:14px;background:#fff;transition:border-color .15s,background .15s}
.hm-radio input{width:15px;height:15px;accent-color:var(--hm-green)}
.hm-radio.is-on{border-color:var(--hm-green);background:rgba(77,187,131,.07)}
.hm-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:32px;padding-top:22px;border-top:1px solid var(--hm-line)}
.hm-saved{font-size:11.5px;color:var(--hm-faint)}
.hm-btn{border:none;border-radius:10px;padding:12px 22px;cursor:pointer;font-family:Poppins,Inter,sans-serif;
  font-size:14px;font-weight:600;letter-spacing:-.01em;transition:background .15s,color .15s,border-color .15s}
.hm-btn:disabled{opacity:.55;cursor:default}
/* The confirmation's "Book your call" is a link, not a button: it has to survive
   a blocked redirect, and a link is the thing a browser will always follow. */
a.hm-btn{display:inline-block;text-decoration:none}
.hm-btn-primary{background:var(--hm-green);color:#062018}
.hm-btn-primary:not(:disabled):hover{background:var(--hm-green-deep);color:#fff}
.hm-btn-ghost{background:transparent;color:var(--hm-body);border:1px solid var(--hm-line)}
.hm-btn-ghost:not(:disabled):hover{border-color:#C7D3CE;color:var(--hm-ink)}
.hm-add{justify-self:start;padding:9px 14px;font-size:13px}
.hm-reassure{max-width:620px;margin:18px auto 0;text-align:center;font-size:12px;line-height:1.6;color:var(--hm-faint)}
.hm-group+.hm-group{margin-top:22px}
.hm-group h3{margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--hm-green-deep)}
.hm-group-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.hm-rows{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin:0}
.hm-rows dt{font-size:11.5px;color:var(--hm-faint)}
.hm-rows dd{margin:0 0 6px;font-size:14px;color:var(--hm-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.hm-edit{background:none;border:none;padding:0;cursor:pointer;font:inherit;font-size:12px;font-weight:500;color:var(--hm-body)}
.hm-edit:hover{color:var(--hm-green-deep)}
.hm-banner{margin-bottom:20px;padding:12px 14px;border-radius:10px;font-size:13px;line-height:1.5}
.hm-banner-warn{background:rgba(212,85,63,.07);border:1px solid rgba(212,85,63,.3);color:#8F3323}
.hm-banner-info{background:rgba(77,187,131,.08);border:1px solid rgba(77,187,131,.35);color:#24614A}
.hm-final{padding:46px 40px;text-align:center}
.hm-final-mark{display:grid;place-items:center;width:46px;height:46px;margin:0 auto 18px;border-radius:50%;
  background:rgba(77,187,131,.14);color:var(--hm-green-deep);font-size:20px}
.hm-final h2{font-size:23px}
.hm-final p{margin-top:10px;font-size:14px;line-height:1.6;color:var(--hm-body)}
@media(max-width:640px){
  .hm-pad{padding:26px 22px 24px}
  .hm-head h2{font-size:21px}
  .hm-body,.hm-rows{grid-template-columns:1fr}
  .hm-foot{flex-wrap:wrap}
  .hm-saved{order:3;width:100%;text-align:center}
}`;

  var MARKUP = `<div class="hm-funnel" id="hm-funnel">
  <div class="hm-top">
    <div class="hm-mark"><span class="hm-mark-dot">H</span> Hauck Marketing</div>
  </div>
  <div class="hm-card"><div class="hm-pad" id="hm-slot"></div></div>
  <p class="hm-reassure" id="hm-reassure"></p>
</div>`;

  // The stub is one empty div. If a funnel builder renders the block twice, or
  // the script lands before its own div, neither should produce two forms.
  function mount() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return false;
    if (root.getAttribute("data-hm-mounted") === "1") return true;
    root.setAttribute("data-hm-mounted", "1");

    if (!document.getElementById("hm-funnel-styles")) {
      var style = document.createElement("style");
      style.id = "hm-funnel-styles";
      // @import has to be the first rule in a sheet, which it is: the styles
      // are injected verbatim, fonts line first.
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    root.innerHTML = MARKUP;
    return true;
  }

  // The div may not exist yet when this runs. Same reasoning as the form's own
  // boot() below: a builder can run a script before the markup it belongs to.
  if (!mount()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (mount() || ++tries > 100) clearInterval(timer);
    }, 50);
    document.addEventListener("DOMContentLoaded", mount);
  }
})();


(function () {
  "use strict";

  // ---------------------------------------------------------------- config
  var HM_CONFIG = {
    // The origin this script was served from, so the form always posts to the
    // deploy that shipped it. Nothing to keep in step by hand, and a preview
    // deploy talks to itself rather than to production.
    apiBase: window.__HM_FUNNEL_ORIGIN,
    // LIVE by default. Add ?dry=1 to the funnel URL to walk the whole thing
    // without saving anything, which is how you check a copy change without
    // creating a real client. A flag that has to be edited and re-pasted to
    // flip is a flag that ends up wrong.
    dryRun: /[?&]dry=1(&|$)/.test(window.location.search)
  };

  // ------------------------------------------------- schema (mirrors intake.ts)
  // Keep in step with apps/command-center/src/lib/intake.ts. The server drops any
  // key it does not recognise, so an extra field here is silently ignored rather
  // than stored: safe, but it will not reach Jake.
  var TIMEZONES = [
    ["Pacific/Honolulu", "Hawaii (HST)"],
    ["America/Anchorage", "Alaska (AKT)"],
    ["America/Los_Angeles", "Pacific (PT)"],
    ["America/Phoenix", "Arizona (no DST)"],
    ["America/Denver", "Mountain (MT)"],
    ["America/Chicago", "Central (CT)"],
    ["America/New_York", "Eastern (ET)"],
    ["America/Detroit", "Eastern - Detroit (ET)"],
    ["America/Toronto", "Eastern - Toronto (ET)"]
  ];

  // "4 out of 10" is how an owner counts; a typed percentage comes back as
  // "pretty good". Mirrors CLOSE_RATES in intake.ts.
  var CLOSE_RATES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (k) {
    return [String(k), k + " out of 10"];
  });

  // Service boxes and job rows open one at a time, up to these many. Must match
  // SERVICE_SLOTS and JOB_SLOTS in intake.ts (the parity test checks these
  // exact lines).
  var SERVICE_SLOTS = 6;
  var JOB_SLOTS = 5;

  // help renders as HTML (see fieldHtml), so the one instruction people get
  // wrong is emphasised rather than buried in the middle of a sentence.
  var ASSET_HELP = "A Google Drive, Dropbox or iCloud link, " +
    '<b class="hm-mark-em">set so anyone with the link can view it</b>.';

  // Jake's headings, in his order (2026-10-27). No line under a heading except
  // Assets, where he asked for one. No login step: clients sign in with the
  // Email on Contact, and the server makes their password when they send the
  // form (they do not choose one).
  var STEPS = [
    { n: 1, label: "Business", blurb: "" },
    { n: 2, label: "Contact", blurb: "" },
    { n: 3, label: "Targeting", blurb: "" },
    { n: 4, label: "Working hours", blurb: "" },
    { n: 5, label: "Services", blurb: "" },
    { n: 6, label: "Numbers", blurb: "" },
    { n: 7, label: "Story", blurb: "" },
    { n: 8, label: "Assets", blurb: "All optional. If you do not have these ready, just submit the form and we can go over them on your onboarding call." },
    { n: 9, label: "Review", blurb: "" }
  ];
  var LAST_INPUT_STEP = 8;
  var REVIEW_STEP = 9;

  var FIELDS = [
    // 1 Your business
    { key: "name", label: "Business name", type: "text", step: 1, required: true, placeholder: "Willis Exteriors" },
    { key: "niche", label: "What do you do?", type: "text", step: 1, required: true, placeholder: "Roofing & Exteriors" },
    { key: "websiteUrl", label: "Website", type: "url", step: 1, placeholder: "https://willisexteriors.com", help: "Leave blank if you do not have one yet." },

    // 2 Contact
    { key: "contactName", label: "Owner name", type: "text", step: 2, required: true, placeholder: "Jim Willis" },
    { key: "contactEmail", label: "Email", type: "email", step: 2, required: true, placeholder: "jim@willisexteriors.com" },
    { key: "contactPhone", label: "Phone", type: "tel", step: 2, required: true, placeholder: "(313) 555 0134" },
    { key: "timezone", label: "Timezone", type: "select", step: 2, required: true, options: TIMEZONES, help: "This sets the times on your booking calendar, so please get it right." },
    // No address (Jake, 2026-10-27). The Email above is also their login.

    // 3 Targeting
    { key: "targetZips", label: "Zip codes", type: "textarea", step: 3, required: true, wide: true, placeholder: "48135, 48150, 48154, 48185", help: "Zip codes only please, separated by commas. If you are not sure which ones cover your area, put the ones you work in most and we will build out from there." },
    { key: "areaCallout", label: "Area call-out", type: "text", step: 3, required: true, wide: true, placeholder: "Metro Detroit", help: 'This is what the ad calls the people it is shown to: <b class="hm-mark-em">"Metro Detroit Homeowners..."</b>. Give us the name locals actually use.' },

    // 4 Working hours, a day at a time. Ideal hours, not a promise: a blank day
    // is a day off, which is why none of them are required.
    { key: "hoursMonday", label: "Monday", type: "text", step: 4, placeholder: "9am - 5pm", help: "Your ideal hours, not a commitment. Leave a day blank to take it off." },
    { key: "hoursTuesday", label: "Tuesday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursWednesday", label: "Wednesday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursThursday", label: "Thursday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursFriday", label: "Friday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursSaturday", label: "Saturday", type: "text", step: 4, placeholder: "10am - 2pm" },
    { key: "hoursSunday", label: "Sunday", type: "text", step: 4, placeholder: "Closed" },

    // 5 Services. One box per service: a comma-separated sentence has to be
    // split by hand afterwards, and the split is a guess. Service 1 is
    // required; 2 to 6 open from the "Add another service" button (see REPEATS).
    { key: "service1", label: "Service 1", type: "text", step: 5, required: true, wide: true, placeholder: "Paver patios", help: "One service per box, named the way your customers ask for it." },
    { key: "service2", label: "Service 2", type: "text", step: 5, wide: true, placeholder: "Retaining walls" },
    { key: "service3", label: "Service 3", type: "text", step: 5, wide: true, placeholder: "Landscape design" },
    { key: "service4", label: "Service 4", type: "text", step: 5, wide: true, placeholder: "Lawn maintenance" },
    { key: "service5", label: "Service 5", type: "text", step: 5, wide: true, placeholder: "Drainage" },
    { key: "service6", label: "Service 6", type: "text", step: 5, wide: true, placeholder: "Snow removal" },

    // 6 Numbers. A row per job type, because a replacement and a repair do not
    // share a price. Row 1 is required; rows 2 to 5 open from the "Add another
    // job type" button (see REPEATS).
    { key: "jobType1", label: "Job type 1", type: "text", step: 6, required: true, wide: true, placeholder: "Roof replacement" },
    { key: "jobTicket1", label: "Job 1 average ticket", type: "text", step: 6, required: true, placeholder: "$15,000" },
    { key: "jobMargin1", label: "Job 1 margin", type: "text", step: 6, required: true, placeholder: "35%" },
    { key: "jobType2", label: "Job type 2", type: "text", step: 6, wide: true, placeholder: "Roof repair" },
    { key: "jobTicket2", label: "Job 2 average ticket", type: "text", step: 6, placeholder: "$900" },
    { key: "jobMargin2", label: "Job 2 margin", type: "text", step: 6, placeholder: "35%" },
    { key: "jobType3", label: "Job type 3", type: "text", step: 6, wide: true, placeholder: "Gutters" },
    { key: "jobTicket3", label: "Job 3 average ticket", type: "text", step: 6, placeholder: "$2,500" },
    { key: "jobMargin3", label: "Job 3 margin", type: "text", step: 6, placeholder: "35%" },
    { key: "jobType4", label: "Job type 4", type: "text", step: 6, wide: true, placeholder: "Siding" },
    { key: "jobTicket4", label: "Job 4 average ticket", type: "text", step: 6, placeholder: "$18,000" },
    { key: "jobMargin4", label: "Job 4 margin", type: "text", step: 6, placeholder: "35%" },
    { key: "jobType5", label: "Job type 5", type: "text", step: 6, wide: true, placeholder: "Windows" },
    { key: "jobTicket5", label: "Job 5 average ticket", type: "text", step: 6, placeholder: "$9,000" },
    { key: "jobMargin5", label: "Job 5 margin", type: "text", step: 6, placeholder: "35%" },
    { key: "closeRate", label: "Estimated close rate", type: "select", step: 6, required: true, wide: true, options: CLOSE_RATES },

    // 7 Story. None required: not every business has run an offer or can name
    // its competitors.
    { key: "competitors", label: "Local competitors", type: "textarea", step: 7, wide: true, placeholder: "Renewal by Andersen, Detroit Roofing Co, Smith & Sons" },
    { key: "pastOffers", label: "Past offers", type: "textarea", step: 7, wide: true, placeholder: "Free gutter guards with a new roof, $500 off in the spring, 0% financing for 12 months" },
    { key: "usp", label: "What makes your company unique?", type: "textarea", step: 7, wide: true, placeholder: "We guarantee a home sale in 30 days or pay the seller $10k" },
    { key: "whySignedUp", label: "Why did you sign up?", type: "textarea", step: 7, wide: true },
    { key: "notes", label: "Anything else?", type: "textarea", step: 7, wide: true },

    // 8 Assets. All optional; the step's line sends them to the onboarding call.
    { key: "logoUrl", label: "Logo", type: "url", step: 8, wide: true, help: ASSET_HELP },
    { key: "headshotUrl", label: "Headshot", type: "url", step: 8, wide: true, help: ASSET_HELP },
    { key: "pastWorkUrl", label: "Past work photos", type: "url", step: 8, wide: true, help: ASSET_HELP }
  ];

  // Fields that open a row at a time: row 1 shows, the add button under the
  // last open row opens the next, up to the cap. A row is every field sharing
  // a number (a job row is three fields, a service row one).
  var REPEATS = [
    { name: "service", re: /^service(\d)$/, slots: SERVICE_SLOTS, first: "service", last: "service", add: "+ Add another service" },
    { name: "job", re: /^job(?:Type|Ticket|Margin)(\d)$/, slots: JOB_SLOTS, first: "jobType", last: "jobMargin", add: "+ Add another job type" }
  ];

  // ------------------------------------------------------------------ state
  var state = { step: 1, answers: {}, errors: {}, token: null, saving: false,
                savedAt: null, banner: null, done: false, dead: false,
                shown: { service: 1, job: 1 } };

  // Assigned in boot(), not here: GHL sometimes runs a block's script before it
  // has finished injecting that block's markup.
  var slot = null;
  var reassure = null;

  // ------------------------------------------------------------- validation
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var URL_RE = /^(https?:\/\/)?[^\s.]+(\.[^\s.]+)+(\/\S*)?$/;

  function txt(key) {
    var v = state.answers[key];
    return typeof v === "string" ? v.trim() : "";
  }
  function fieldsFor(step) {
    return FIELDS.filter(function (f) { return f.step === step; });
  }

  // Which repeat a key belongs to and its row (jobTicket3 -> job, 3), or null
  // for any other field.
  function repeatOf(key) {
    for (var i = 0; i < REPEATS.length; i++) {
      var m = REPEATS[i].re.exec(key);
      if (m) return { rep: REPEATS[i], row: Number(m[1]) };
    }
    return null;
  }
  // Rows on show: as many as the button has opened, or as far as the answers
  // already go, so a resumed form reopens every row it filled.
  function rowsShown(rep) {
    var shown = state.shown[rep.name];
    FIELDS.forEach(function (f) {
      var hit = repeatOf(f.key);
      if (hit && hit.rep === rep && hit.row > shown && txt(f.key)) shown = hit.row;
    });
    return shown;
  }
  function validate(step) {
    var errs = {};
    fieldsFor(step).forEach(function (f) {
      var v = txt(f.key);
      if (f.required && !v) { errs[f.key] = f.label + " is required"; return; }
      if (!v) return;
      if (f.type === "email" && !EMAIL_RE.test(v)) errs[f.key] = "That does not look like an email address";
      if (f.type === "url" && !URL_RE.test(v)) errs[f.key] = "That does not look like a web address";
    });
    return errs;
  }

  // ------------------------------------------------------------------ saving
  function answersToSend() {
    var out = {};
    Object.keys(state.answers).forEach(function (k) {
      // Internal bookkeeping, not an answer. The server would drop it anyway
      // (it ignores keys not on the schema), but there is no reason to send it.
      if (k.indexOf("__") === 0) return;
      out[k] = state.answers[k];
    });
    return out;
  }

  function save(submit) {
    if (HM_CONFIG.dryRun) {
      state.savedAt = new Date();
      return Promise.resolve(true);
    }
    state.saving = true; render();
    return fetch(HM_CONFIG.apiBase + "/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: state.token, answers: answersToSend(),
        step: state.step, submit: !!submit
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "We could not save that. Please try again.");
        if (data.token && !state.token) {
          state.token = data.token;
          rememberToken(data.token);
        }
        state.savedAt = new Date();
        state.banner = null;
        return true;
      });
    }).catch(function (err) {
      state.banner = { tone: "warn", text: err.message ||
        "We could not reach the server. Check your connection and try again." };
      return false;
    }).then(function (ok) {
      state.saving = false; render();
      return ok;
    });
  }

  // The resume token lives in the URL so a shared or bookmarked link works.
  // Some funnel builders sandbox history.replaceState, so localStorage is kept
  // as a second copy: same tab and same browser still resume, which covers the
  // common case of closing the tab and coming back.
  var TOKEN_STORE = "hm.intake.token";

  function rememberToken(token) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("r", token);
      window.history.replaceState({}, "", url.toString());
    } catch (e) { /* sandboxed; the store below still covers us */ }
    try { window.localStorage.setItem(TOKEN_STORE, token); } catch (e) {}
  }

  function readToken() {
    var token = null;
    try { token = new URL(window.location.href).searchParams.get("r"); } catch (e) {}
    if (token) return token;
    try { return window.localStorage.getItem(TOKEN_STORE); } catch (e) { return null; }
  }

  function resume() {
    var token = readToken();
    if (!token || HM_CONFIG.dryRun) { render(); return; }

    fetch(HM_CONFIG.apiBase + "/api/intake/" + encodeURIComponent(token))
      .then(function (res) {
        if (!res.ok) throw new Error("dead");
        return res.json();
      })
      .then(function (data) {
        state.token = token;
        state.answers = data.answers || {};
        if (!data.editable) {
          state.done = true;
          // Finished. Drop the stored token so the next client on a shared
          // machine gets a fresh form rather than someone else's thank-you.
          try { window.localStorage.removeItem(TOKEN_STORE); } catch (e) {}
          render();
          return;
        }
        state.step = Math.min(data.furthestStep || 1, REVIEW_STEP);
        render();
      })
      .catch(function () { state.dead = true; render(); });
  }

  // ------------------------------------------------------------------ render
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function segs() {
    var out = '<div class="hm-segs">';
    for (var i = 1; i <= REVIEW_STEP; i++) {
      var cls = i < state.step ? "is-done" : (i === state.step ? "is-now" : "");
      out += '<i class="' + cls + '"></i>';
    }
    return out + "</div>";
  }

  function fieldHtml(f) {
    var val = state.answers[f.key];
    var err = state.errors[f.key];
    var cls = "hm-field" + (f.wide ? " hm-wide" : "") + (err ? " has-error" : "");
    var req = f.required ? ' <span class="hm-req">*</span>' : "";
    var id = "hm-" + f.key;
    var h = "";

    if (f.type === "checkbox") {
      h += '<div class="' + cls + '">';
      h += '<label class="hm-check"><input type="checkbox" data-k="' + f.key + '"' +
           (val === true ? " checked" : "") + '><span>' + esc(f.label) + "</span></label>";
    } else if (f.type === "radio") {
      h += '<div class="' + cls + '"><label>' + esc(f.label) + req + "</label>";
      h += '<div class="hm-radios">';
      f.options.forEach(function (o) {
        var on = val === o[0];
        h += '<label class="hm-radio' + (on ? " is-on" : "") + '">' +
             '<input type="radio" name="' + id + '" data-k="' + f.key + '" value="' + esc(o[0]) + '"' +
             (on ? " checked" : "") + ">" + esc(o[1]) + "</label>";
      });
      h += "</div>";
    } else if (f.type === "select") {
      h += '<div class="' + cls + '"><label for="' + id + '">' + esc(f.label) + req + "</label>";
      h += '<select id="' + id + '" data-k="' + f.key + '"><option value="">Please choose...</option>';
      f.options.forEach(function (o) {
        h += '<option value="' + esc(o[0]) + '"' + (val === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      });
      h += "</select>";
    } else if (f.type === "textarea") {
      h += '<div class="' + cls + '"><label for="' + id + '">' + esc(f.label) + req + "</label>";
      h += '<textarea id="' + id + '" rows="3" data-k="' + f.key + '" placeholder="' +
           esc(f.placeholder || "") + '">' + esc(typeof val === "string" ? val : "") + "</textarea>";
    } else {
      h += '<div class="' + cls + '"><label for="' + id + '">' + esc(f.label) + req + "</label>";
      h += '<input id="' + id + '" type="' + f.type + '" data-k="' + f.key + '" placeholder="' +
           esc(f.placeholder || "") + '" value="' + esc(typeof val === "string" ? val : "") + '">';
    }

    if (err) h += '<p class="hm-err">' + esc(err) + "</p>";
    else if (f.help) h += '<p class="hm-help">' + f.help + "</p>";

    return h + "</div>";
  }

  // A step's fields, less the rows not opened yet. The add button sits under
  // the last open row until every slot is open.
  function bodyHtml(step) {
    return fieldsFor(step).map(function (f) {
      var hit = repeatOf(f.key);
      if (!hit) return fieldHtml(f);
      var shown = rowsShown(hit.rep);
      if (hit.row > shown) return "";
      var h = fieldHtml(f);
      if (hit.row === shown && f.key === hit.rep.last + hit.row && shown < hit.rep.slots) {
        h += '<button type="button" class="hm-btn hm-btn-ghost hm-add hm-wide" data-add="' +
             hit.rep.name + '">' + esc(hit.rep.add) + "</button>";
      }
      return h;
    }).join("");
  }

  function reviewHtml() {
    var h = "";
    STEPS.slice(0, LAST_INPUT_STEP).forEach(function (s) {
      var rows = fieldsFor(s.n).map(function (f) {
        var v = state.answers[f.key];
        if (f.type === "checkbox") return v === true ? { l: f.label, v: "Yes" } : null;
        if (typeof v !== "string" || !v.trim()) return null;
        if (f.options) {
          var hit = f.options.filter(function (o) { return o[0] === v; })[0];
          return { l: f.label, v: hit ? hit[1] : v };
        }
        return { l: f.label, v: v };
      }).filter(Boolean);
      if (!rows.length) return;

      h += '<div class="hm-group"><div class="hm-group-head"><h3>' + esc(s.label) + "</h3>" +
           '<button type="button" class="hm-edit" data-goto="' + s.n + '">Edit</button></div><dl class="hm-rows">';
      rows.forEach(function (r) {
        h += "<dt>" + esc(r.l) + "</dt><dd>" + esc(r.v) + "</dd>";
      });
      h += "</dl></div>";
    });
    return h || '<p class="hm-sub">Nothing filled in yet.</p>';
  }

  function render() {
    if (state.dead) {
      slot.innerHTML = '<div class="hm-final"><div class="hm-final-mark">!</div>' +
        "<h2>That link is not valid</h2>" +
        "<p>It may have expired, or been mistyped. Reply to the email that brought you here and we will send a fresh one.</p></div>";
      reassure.textContent = "";
      return;
    }
    if (state.done) {
      // The form ends here. No onboarding call to book (Jake cut it 2026-10-10).
      slot.innerHTML = '<div class="hm-final"><div class="hm-final-mark">&#10003;</div>' +
        "<h2>Thank you for submitting the onboarding form</h2></div>";
      reassure.textContent = "";
      return;
    }

    var step = STEPS[state.step - 1];
    var onReview = state.step === REVIEW_STEP;
    var h = segs();

    if (state.banner) {
      h += '<div class="hm-banner hm-banner-' + state.banner.tone + '">' + esc(state.banner.text) + "</div>";
    }

    h += '<div class="hm-head"><h2>' + esc(step.label) + "</h2>" +
         '<p class="hm-step-of">' + state.step + " of " + REVIEW_STEP + "</p></div>";
    if (step.blurb) h += '<p class="hm-sub">' + esc(step.blurb) + "</p>";

    if (onReview) {
      h += '<div style="margin-top:28px">' + reviewHtml() + "</div>";
    } else {
      h += '<div class="hm-body">' + bodyHtml(state.step) + "</div>";
    }

    h += '<div class="hm-foot">';
    h += '<button type="button" class="hm-btn hm-btn-ghost" data-act="back"' +
         (state.step === 1 ? " disabled" : "") + ">Back</button>";
    h += '<p class="hm-saved">' + (state.saving ? "Saving..." :
         (state.savedAt ? "Saved " + timeAgo(state.savedAt) : "&nbsp;")) + "</p>";
    h += '<button type="button" class="hm-btn hm-btn-primary" data-act="' +
         (onReview ? "submit" : "next") + '"' + (state.saving ? " disabled" : "") + ">" +
         (onReview ? "Send it in" : "Continue") + "</button>";
    h += "</div>";

    slot.innerHTML = h;

    // Nothing under the card, on any step. The ticks show progress and the
    // footer shows the save state; saying either again in prose was noise on
    // every screen. The review step used to add a line about what pressing send
    // would do, which Jake cut: the button says "Send it in", and the screen
    // after it says what happens next.
    reassure.textContent = "";

    wire();
  }

  function timeAgo(d) {
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 45) return "a moment ago";
    if (s < 90) return "a minute ago";
    return Math.round(s / 60) + " minutes ago";
  }

  // ------------------------------------------------------------------ events
  function wire() {
    slot.querySelectorAll("[data-k]").forEach(function (el) {
      var key = el.getAttribute("data-k");
      var evt = (el.type === "checkbox" || el.type === "radio" || el.tagName === "SELECT")
        ? "change" : "input";
      el.addEventListener(evt, function () {
        if (el.type === "checkbox") state.answers[key] = el.checked;
        else state.answers[key] = el.value;

        if (state.errors[key]) { delete state.errors[key]; render(); }
        else if (el.type === "radio" || el.type === "checkbox") render();
      });
    });

    slot.querySelectorAll("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.step = Number(b.getAttribute("data-goto"));
        state.errors = {};
        render(); top();
      });
    });

    slot.querySelectorAll("[data-add]").forEach(function (b) {
      var rep = REPEATS.filter(function (r) { return r.name === b.getAttribute("data-add"); })[0];
      b.addEventListener("click", function () {
        state.shown[rep.name] = rowsShown(rep) + 1;
        render();
        var opened = document.getElementById("hm-" + rep.first + state.shown[rep.name]);
        if (opened) opened.focus();
      });
    });

    var back = slot.querySelector('[data-act="back"]');
    if (back) back.addEventListener("click", function () {
      if (state.step === 1) return;
      state.step--; state.errors = {}; render(); top();
    });

    var go = slot.querySelector('[data-act="next"], [data-act="submit"]');
    if (go) go.addEventListener("click", function () {
      var submitting = go.getAttribute("data-act") === "submit";

      if (!submitting) {
        var errs = validate(state.step);
        if (Object.keys(errs).length) { state.errors = errs; render(); top(); return; }
      } else {
        // On submit, re-check every input step so nothing incomplete slips past.
        for (var s = 1; s <= LAST_INPUT_STEP; s++) {
          var e = validate(s);
          if (Object.keys(e).length) {
            state.step = s;
            state.errors = e;
            state.banner = { tone: "warn", text: "Something on this step still needs filling in." };
            render();
            top();
            return;
          }
        }
      }

      save(submitting).then(function (ok) {
        if (!ok) { top(); return; }
        if (submitting) {
          state.done = true;
          try { window.localStorage.removeItem(TOKEN_STORE); } catch (e) {}
        }
        else if (state.step < REVIEW_STEP) { state.step++; state.errors = {}; }
        render(); top();
      });
    });
  }

  function top() {
    try {
      document.getElementById("hm-funnel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { window.scrollTo(0, 0); }
  }

  // GHL can run this script before its own markup lands, and can render the same
  // block twice on a page. Wait for the markup, then refuse to wire it twice.
  var tries = 0;
  function boot() {
    slot = document.getElementById("hm-slot");
    reassure = document.getElementById("hm-reassure");
    if (!slot || !reassure) {
      if (tries++ < 100) { setTimeout(boot, 50); }
      return;
    }
    if (slot.getAttribute("data-hm-ready")) return;
    slot.setAttribute("data-hm-ready", "1");
    resume();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
