// The client intake funnel, served rather than pasted.
//
// GoHighLevel holds a ten-line stub (Client Onboarding Funnel/01-intake-form.html)
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
// Keep the field list in step with command-center/app/src/lib/intake.ts. The
// server SILENTLY DROPS any key it does not recognise, so a typo here does not
// error, it quietly bins that client's answer. The parity check is in
// Client Onboarding Funnel/README.md.

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
/* The password rule, as a list. Marker drawn by ::before rather than a real
   list-style, because GHL's page CSS resets list markers on custom blocks and
   a rule with invisible bullets reads as one run-on sentence. */
.hm-funnel .hm-rules{list-style:none;margin:5px 0 0;padding:0}
.hm-funnel .hm-rules li{position:relative;padding-left:14px;line-height:1.55}
.hm-funnel .hm-rules li::before{content:"";position:absolute;left:3px;top:7px;
  width:4px;height:4px;border-radius:50%;background:var(--hm-green)}
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
    // Step 2 of the funnel: the onboarding calendar. Sending them there is the
    // whole point of finishing this form, so it is a full page navigation.
    nextUrl: "https://www.hauckmarketing.com/onboarding-calendar",
    // LIVE by default. Add ?dry=1 to the funnel URL to walk the whole thing
    // without saving anything, which is how you check a copy change without
    // creating a real client. A flag that has to be edited and re-pasted to
    // flip is a flag that ends up wrong.
    dryRun: /[?&]dry=1(&|$)/.test(window.location.search)
  };

  // ------------------------------------------------- schema (mirrors intake.ts)
  // Keep in step with command-center/app/src/lib/intake.ts. The server drops any
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

  // help renders as HTML (see fieldHtml), so the one instruction people get
  // wrong is emphasised rather than buried in the middle of a sentence.
  var ASSET_HELP = "Optional. Paste a Google Drive, Dropbox or iCloud link, and " +
    '<b class="hm-mark-em">set it so anyone with the link can view it</b>. ' +
    "If you are not sure how, leave it blank and message Jake, who will sort it out with you.";

  // The password rule, mirroring MIN_PASSWORD_LEN / PASSWORD_RULES /
  // passwordProblems in src/lib/intake.ts. Stated on the field rather than
  // sprung as an error, and checked again on the server, which is what makes it
  // a rule rather than a suggestion.
  var MIN_PASSWORD_LEN = 12;
  // Written out rather than built from MIN_PASSWORD_LEN: the parity test reads
  // this file as TEXT, so an interpolated number is invisible to it. Both the
  // number above and these three lines are checked against src/lib/intake.ts.
  var PASSWORD_HELP =
    "Your password needs to:" +
    '<ul class="hm-rules">' +
    "<li>Include both upper and lower case characters</li>" +
    "<li>Include at least one symbol and number</li>" +
    "<li>Be at least 12 characters long</li>" +
    "</ul>";

  // Every rule the password breaks, in the order the list shows them. A symbol
  // is anything that is not a letter, a number or a space.
  function passwordProblems(p) {
    var out = [];
    if (!/[a-z]/.test(p) || !/[A-Z]/.test(p)) out.push("Use both upper and lower case characters");
    if (!/[0-9]/.test(p) || !/[^a-zA-Z0-9\s]/.test(p)) out.push("Use at least one symbol and one number");
    if (p.length < MIN_PASSWORD_LEN) out.push("Use at least " + MIN_PASSWORD_LEN + " characters");
    return out;
  }

  var STEPS = [
    { n: 1, label: "Your business", blurb: "The basics, so we know who we are building for." },
    { n: 2, label: "Contact details", blurb: "How we reach you, and what we need to register your phone number." },
    { n: 3, label: "Your login", blurb: "Choose how you will sign in once your account is ready." },
    { n: 4, label: "Targeting", blurb: "Where your ads run, and the hours you would like to be booked in." },
    { n: 5, label: "Your services", blurb: "One service per box, in the words your customers use for them." },
    { n: 6, label: "Your story", blurb: "What makes you different. This is the raw material for your ads." },
    { n: 7, label: "Assets", blurb: "Photos and a logo we can use in your marketing. All three are optional." },
    { n: 8, label: "Review", blurb: "Check it over, then send it to us." }
  ];
  var LAST_INPUT_STEP = 7;
  var REVIEW_STEP = 8;

  var FIELDS = [
    // 1 Your business
    { key: "name", label: "Business name", type: "text", step: 1, required: true, placeholder: "Willis Exteriors" },
    { key: "niche", label: "What do you do?", type: "text", step: 1, required: true, placeholder: "Roofing & Exteriors" },
    { key: "websiteUrl", label: "Website", type: "url", step: 1, placeholder: "https://willisexteriors.com", help: "Leave blank if you do not have one yet." },

    // 2 Contact details
    { key: "contactName", label: "Your name", type: "text", step: 2, required: true, placeholder: "Jim Willis" },
    { key: "contactEmail", label: "Email", type: "email", step: 2, required: true, placeholder: "jim@willisexteriors.com" },
    { key: "contactPhone", label: "Phone", type: "tel", step: 2, required: true, placeholder: "(313) 555 0134" },
    { key: "timezone", label: "Timezone", type: "select", step: 2, required: true, options: TIMEZONES, help: "This sets the times on your booking calendar, so please get it right." },
    // The address in parts. One box came back as "Garden City" as often as it
    // came back as an address, and the A2P registration needs the pieces.
    { key: "addressStreet", label: "Street address", type: "text", step: 2, required: true, wide: true, placeholder: "123 Ford Rd" },
    { key: "addressUnit", label: "Suite, unit or floor", type: "text", step: 2, placeholder: "Suite 200", help: "Leave blank if there is not one." },
    { key: "addressCity", label: "City", type: "text", step: 2, required: true, placeholder: "Garden City" },
    { key: "addressState", label: "State", type: "text", step: 2, required: true, placeholder: "MI", help: "The two-letter state, like MI or TX." },
    { key: "addressZip", label: "ZIP code", type: "text", step: 2, required: true, placeholder: "48135" },
    // The A2P block. All four optional: a client who does not know their EIN
    // off-hand must still be able to finish. help renders as HTML (see
    // fieldHtml), which is what lets the EIN note carry a link out.
    { key: "legalName", label: "Legal business name", type: "text", step: 2, wide: true, placeholder: "Willis Exteriors LLC", help: "As registered with the IRS. Often your trading name plus LLC or Inc." },
    { key: "taxId", label: "Tax ID / EIN", type: "text", step: 2, wide: true, placeholder: "12-3456789",
      help: "We know this one is sensitive, so here is exactly why we ask. The mobile carriers will not let a business send texts until they have checked it is a real business, and the EIN is how they check. We use it for that registration and nothing else. " +
            '<a href="https://www.twilio.com/docs/messaging/compliance/a2p-10dlc" target="_blank" rel="noreferrer">Read what this registration is</a>' },
    { key: "entityType", label: "Business structure", type: "select", step: 2, options: [["llc", "LLC"], ["corporation", "Corporation"], ["sole_proprietor", "Sole proprietor"], ["partnership", "Partnership"], ["non_profit", "Non-profit"]] },
    { key: "contactTitle", label: "Your job title", type: "text", step: 2, placeholder: "Owner", help: "The carriers ask who is authorising the registration." },

    // 3 Your login
    { key: "loginEmail", label: "Login email", type: "email", step: 3, required: true, wide: true, help: "Prefilled from the email above. Change it if you would rather sign in with another." },
    { key: "password", label: "Choose a password", type: "password", step: 3, required: true, help: PASSWORD_HELP },
    { key: "passwordConfirm", label: "Confirm password", type: "password", step: 3, required: true },

    // 4 Targeting
    { key: "targetZips", label: "Zip codes to target for your ads", type: "textarea", step: 4, required: true, wide: true, placeholder: "48135, 48150, 48154, 48185", help: "Zip codes only please, separated by commas. If you are not sure which ones cover your area, put the ones you work in most and we will build out from there." },
    { key: "areaCallout", label: "What should the call-out name of your area for the ads be?", type: "text", step: 4, required: true, wide: true, placeholder: "Metro Detroit", help: 'This is what the ad calls the people it is shown to: <b class="hm-mark-em">"Metro Detroit Homeowners..."</b>. Give us the name locals actually use.' },
    // Their hours, a day at a time. Ideal hours, not a promise: a blank day is a
    // day off, which is why none of them are required.
    { key: "hoursMonday", label: "Monday", type: "text", step: 4, placeholder: "9am - 5pm", help: "Your ideal hours, not a commitment. Leave a day blank to take it off." },
    { key: "hoursTuesday", label: "Tuesday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursWednesday", label: "Wednesday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursThursday", label: "Thursday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursFriday", label: "Friday", type: "text", step: 4, placeholder: "9am - 5pm" },
    { key: "hoursSaturday", label: "Saturday", type: "text", step: 4, placeholder: "10am - 2pm" },
    { key: "hoursSunday", label: "Sunday", type: "text", step: 4, placeholder: "Closed" },

    // 5 Your services. One box per service: a comma-separated sentence has to be
    // split by hand afterwards, and the split is a guess.
    { key: "service1", label: "Service 1", type: "text", step: 5, required: true, placeholder: "Paver patios", help: "One service per box, named the way your customers ask for it. Leave the rest blank if you offer fewer." },
    { key: "service2", label: "Service 2", type: "text", step: 5, required: true, placeholder: "Retaining walls" },
    { key: "service3", label: "Service 3", type: "text", step: 5, placeholder: "Landscape design" },
    { key: "service4", label: "Service 4", type: "text", step: 5, placeholder: "Lawn maintenance" },
    { key: "service5", label: "Service 5", type: "text", step: 5, placeholder: "Drainage" },
    { key: "service6", label: "Service 6", type: "text", step: 5, placeholder: "Snow removal" },

    // 6 Your story
    { key: "usp", label: "Do you have a unique selling proposition?", type: "textarea", step: 6, wide: true, placeholder: "We guarantee a home sale in 30 days or pay the seller $10k" },
    { key: "whySignedUp", label: "What made you want to work with Hauck Marketing?", type: "textarea", step: 6, wide: true },
    { key: "notes", label: "Anything else we should know?", type: "textarea", step: 6, wide: true },

    // 7 Assets
    { key: "logoUrl", label: "Your logo", type: "url", step: 7, wide: true, help: ASSET_HELP },
    { key: "headshotUrl", label: "A clear headshot of yourself", type: "url", step: 7, wide: true, help: ASSET_HELP },
    { key: "pastWorkUrl", label: "Photos of your past work", type: "url", step: 7, wide: true, help: ASSET_HELP }
  ];

  // ------------------------------------------------------------------ state
  var state = { step: 1, answers: {}, errors: {}, token: null, saving: false,
                savedAt: null, banner: null, done: false, dead: false };

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
  function validate(step) {
    var errs = {};
    fieldsFor(step).forEach(function (f) {
      var v = txt(f.key);
      if (f.required && !v) { errs[f.key] = f.label + " is required"; return; }
      if (!v) return;
      if (f.type === "email" && !EMAIL_RE.test(v)) errs[f.key] = "That does not look like an email address";
      if (f.type === "url" && !URL_RE.test(v)) errs[f.key] = "That does not look like a web address";
    });
    if (step === 3) {
      var p = txt("password"), c = txt("passwordConfirm");
      // One rule at a time: a field listing three faults at once reads as a
      // telling-off, fixing them one by one reads as progress.
      if (p && passwordProblems(p).length) errs.password = passwordProblems(p)[0];
      if (p && c && p !== c) errs.passwordConfirm = "The two passwords do not match";
    }
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
        if (data.hasPassword) {
          // This used to say we do not store the password in a readable form.
          // That stopped being true when Jake asked to be able to read it back
          // (migration 0081), and a line about somebody's credentials is not a
          // line to leave wrong. It now says only what the client can observe:
          // the funnel never sends it back to them.
          state.banner = { tone: "info", text:
            "Welcome back. Your password is not shown back to you here, so if you go to step 3 you will need to type it twice again." };
        }
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
           esc(f.placeholder || "") + '" value="' + esc(typeof val === "string" ? val : "") + '"' +
           (f.type === "password" ? ' autocomplete="new-password"' : "") + ">";
    }

    if (err) h += '<p class="hm-err">' + esc(err) + "</p>";
    else if (f.help) h += '<p class="hm-help">' + f.help + "</p>";

    return h + "</div>";
  }

  function reviewHtml() {
    var h = "";
    STEPS.slice(0, LAST_INPUT_STEP).forEach(function (s) {
      var rows = fieldsFor(s.n).map(function (f) {
        var v = state.answers[f.key];
        if (f.type === "checkbox") return v === true ? { l: f.label, v: "Yes" } : null;
        if (f.type === "password") return null; // never shown back
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
      // Normally nobody reads this: the submit handler sends them straight to the
      // calendar. It is what they see if that navigation is blocked or slow, so
      // it has to carry the same next step under its own steam.
      slot.innerHTML = '<div class="hm-final"><div class="hm-final-mark">&#10003;</div>' +
        "<h2>That is everything, thank you</h2>" +
        (HM_CONFIG.nextUrl
          ? "<p>One thing left: pick a time for your onboarding call.</p>" +
            '<p style="margin-top:18px"><a class="hm-btn hm-btn-primary" href="' +
            esc(HM_CONFIG.nextUrl) + '">Book your call</a></p>'
          : "<p>We have got what we need and we are setting your account up now. You will hear from us shortly with your login and the next steps.</p>") +
        "</div>";
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
    h += '<p class="hm-sub">' + esc(step.blurb) + "</p>";

    if (onReview) {
      h += '<div style="margin-top:28px">' + reviewHtml() + "</div>";
    } else {
      h += '<div class="hm-body">' + fieldsFor(state.step).map(fieldHtml).join("") + "</div>";
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

        // The login email follows the contact email until it is edited itself.
        if (key === "contactEmail" && !state.answers.__loginTouched) {
          state.answers.loginEmail = el.value;
        }
        if (key === "loginEmail") state.answers.__loginTouched = true;

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
        // Step 2 is a page of its own, so the hand-off is a navigation. Fired
        // AFTER the render on purpose: the confirmation is already painted, so a
        // browser that blocks or delays the move leaves them on a screen that
        // tells them what to do next rather than on a filled-in form.
        if (submitting && HM_CONFIG.nextUrl) {
          try { window.top.location.assign(HM_CONFIG.nextUrl); }
          catch (e) { window.location.assign(HM_CONFIG.nextUrl); }
        }
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
