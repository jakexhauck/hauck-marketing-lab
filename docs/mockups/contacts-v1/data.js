/* Shared sample data + tiny render helpers for the Contacts mockups.
   Home-services flavour (Willis-style plumbing/HVAC). "stage" is DERIVED
   from tags/source in the real build; here it is hard-coded for the mockup. */

const SOURCES = {
  fb:       { cls: "src-fb",       glyph: "f",  label: "Facebook Ad" },
  google:   { cls: "src-google",   glyph: "G",  label: "Google" },
  web:      { cls: "src-web",      glyph: "W",  label: "Website form" },
  referral: { cls: "src-referral", glyph: "R",  label: "Referral" },
  manual:   { cls: "src-manual",   glyph: "+",  label: "Added manually" },
};

const STAGES = {
  new:      { cls: "pill-new",      label: "New lead" },
  touch:    { cls: "pill-touch",    label: "In touch" },
  customer: { cls: "pill-customer", label: "Customer" },
  repeat:   { cls: "pill-repeat",   label: "Repeat" },
  lapsed:   { cls: "pill-lapsed",   label: "Lapsed" },
};

const CONTACTS = [
  { name: "Marcus Webb",     email: "marcus.webb@gmail.com",     phone: "(614) 555-0142", src: "fb",       stage: "new",      tags: ["Same-day", "Water heater"],        when: "12m ago" },
  { name: "Dana Liu",        email: "dana.liu@outlook.com",      phone: "(614) 555-0197", src: "google",   stage: "touch",    tags: ["AC tune-up", "Quote sent"],        when: "2h ago" },
  { name: "The Garcia Family", email: "r.garcia@gmail.com",      phone: "(380) 555-0116", src: "referral", stage: "customer", tags: ["Burst pipe", "Emergency", "Paid"], when: "Yesterday" },
  { name: "Priya Nair",      email: "priya.nair@gmail.com",      phone: "(614) 555-0188", src: "web",      stage: "new",      tags: ["Furnace", "Estimate"],             when: "3h ago" },
  { name: "Tom Halloran",    email: "thalloran@yahoo.com",       phone: "(614) 555-0173", src: "google",   stage: "customer", tags: ["Drain cleaning", "Paid"],          when: "2d ago" },
  { name: "Sandra Okafor",   email: "sandra.okafor@gmail.com",   phone: "(380) 555-0129", src: "referral", stage: "repeat",   tags: ["Maintenance plan", "VIP"],         when: "4d ago" },
  { name: "Kyle Brenner",    email: "kyle.b@proton.me",          phone: "(614) 555-0155", src: "fb",       stage: "touch",    tags: ["Sump pump", "Callback"],           when: "5h ago" },
  { name: "Aisha Rahman",    email: "aisha.rahman@gmail.com",    phone: "(614) 555-0134", src: "web",      stage: "new",      tags: ["Water softener"],                  when: "6h ago" },
  { name: "Grant Whitfield", email: "gwhitfield@icloud.com",     phone: "(380) 555-0161", src: "manual",   stage: "customer", tags: ["Repipe", "Financing", "Paid"],     when: "1w ago" },
  { name: "Nadia Petrov",    email: "nadia.petrov@gmail.com",    phone: "(614) 555-0109", src: "google",   stage: "repeat",   tags: ["Maintenance plan", "AC + Furnace"], when: "1w ago" },
  { name: "Devon Clarke",    email: "devon.clarke@gmail.com",    phone: "(614) 555-0148", src: "fb",       stage: "lapsed",   tags: ["Old estimate"],                    when: "2mo ago" },
  { name: "Rachel Simmons",  email: "rsimmons@gmail.com",        phone: "(380) 555-0175", src: "referral", stage: "touch",    tags: ["Water heater", "Quote sent"],      when: "1d ago" },
  { name: "Owen Fitzgerald", email: "owen.fitz@gmail.com",       phone: "(614) 555-0192", src: "web",      stage: "customer", tags: ["Toilet install", "Paid"],          when: "3d ago" },
  { name: "Bianca Moreno",   email: "bianca.moreno@gmail.com",   phone: "(614) 555-0121", src: "manual",   stage: "lapsed",   tags: ["No-show"],                         when: "3mo ago" },
];

/* deterministic avatar gradient per name */
const AV_GRADS = [
  "linear-gradient(135deg,#4f46e5,#7c73f0)",
  "linear-gradient(135deg,#0ea5e9,#22d3ee)",
  "linear-gradient(135deg,#f59e0b,#f97316)",
  "linear-gradient(135deg,#ec4899,#f472b6)",
  "linear-gradient(135deg,#10b981,#34d399)",
  "linear-gradient(135deg,#8b5cf6,#a78bfa)",
  "linear-gradient(135deg,#ef4444,#f87171)",
];
function initials(name) {
  const p = name.replace(/^The\s+/, "").split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase();
}
function avGrad(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AV_GRADS.length;
  return AV_GRADS[h];
}
function avatar(name, size) {
  const s = size || 38;
  return `<div class="av" style="width:${s}px;height:${s}px;background:${avGrad(name)}">${initials(name)}</div>`;
}
function sourceBadge(src) {
  const s = SOURCES[src];
  return `<span class="src ${s.cls}"><span class="glyph">${s.glyph}</span>${s.label}</span>`;
}
function stagePill(stage) {
  const s = STAGES[stage];
  return `<span class="pill ${s.cls}"><span class="led"></span>${s.label}</span>`;
}
function tagPills(tags, max) {
  const m = max || 2;
  const shown = tags.slice(0, m).map((t) => `<span class="tag">${t}</span>`).join("");
  const extra = tags.length - m;
  return `<div class="tagwrap">${shown}${extra > 0 ? `<span class="tag more">+${extra}</span>` : ""}</div>`;
}
function quickActions(c) {
  const tel = c.phone.replace(/[^0-9]/g, "");
  return `<div class="qa" onclick="event.stopPropagation()">
    <a href="tel:${tel}" title="Call" aria-label="Call ${c.name}">${IC.phone}</a>
    <a href="sms:${tel}" title="Text" aria-label="Text ${c.name}">${IC.msg}</a>
    <a href="mailto:${c.email}" title="Email" aria-label="Email ${c.name}">${IC.mail}</a>
  </div>`;
}

/* inline lucide-style icons */
const IC = {
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  msg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

/* shared sidebar rail markup */
function railHTML(active) {
  const item = (label, on) => `<div class="nav-i${on ? " on" : ""}"><span class="dot"></span>${label}</div>`;
  return `<aside class="rail">
    <div class="brand"><div class="mark grad-brand">W</div><div class="name">Willis</div></div>
    ${item("Home")}
    <div class="nav-sec">Company</div>
    ${item("Inbox")}
    ${item("Contacts", active === "contacts")}
    ${item("Calendar")}
    ${item("Revenue")}
    <div class="nav-sec">Marketing</div>
    ${item("Paid Ads")}
    ${item("Google Reviews")}
    ${item("Website")}
  </aside>`;
}

/* theme toggle + variant switcher (mockup chrome) */
function chromeHTML(current) {
  const link = (id, label) => `<a href="variant-${id}.html" class="${current === id ? "on" : ""}">${label}</a>`;
  return `<div class="vswitch">
    ${link("a-segmented-table", "A · Table")}
    ${link("b-roster-rail", "B · Rail")}
    ${link("c-lifecycle-groups", "C · Lifecycle")}
  </div>
  <button class="themebtn" onclick="(function(h){var d=h.dataset;d.theme=d.theme==='dark'?'light':'dark'})(document.documentElement)">Toggle theme</button>`;
}
