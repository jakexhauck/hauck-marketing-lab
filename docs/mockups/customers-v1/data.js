/* Shared sample data + render helpers for the Customers mockups.
   Willis Windows flavour (window cleaning). A "customer" = a contact who has
   booked or paid at least one job. `type` is recurring (has an active schedule)
   or onetime. Recurring rows carry cadence + weekday + nextVisit; in the real
   build these come from the app-owned customer_recurrence table. Money is in
   whole dollars. `jobs` is the per-customer history (used by the detail variant). */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* cadence label + short form */
const CADENCE = {
  weekly:   { label: "Weekly",        short: "1w" },
  biweekly: { label: "Every 2 weeks", short: "2w" },
  every4:   { label: "Every 4 weeks", short: "4w" },
};

const CUSTOMERS = [
  { name: "Aaron Webb",        biz: "Ferndale Cafe",       email: "aaron@ferndalecafe.com",   phone: "(248) 555-0121", city: "Ferndale",         type: "recurring", cadence: "every4",   weekday: 1, next: "Jul 6",  service: "Storefront glass + entry",     price: 240, ltv: 2880, jobs: 12, last: "Jun 8"  },
  { name: "Sofia Russo",       biz: null,                  email: "sofia.russo@gmail.com",    phone: "(248) 555-0177", city: "Bloomfield",       type: "recurring", cadence: "every4",   weekday: 4, next: "Jul 9",  service: "2-story full house + skylights", price: 675, ltv: 4050, jobs: 6,  last: "Jun 11" },
  { name: "Aaron Delgado",     biz: "Royal Oak Dental",    email: "office@rodental.com",      phone: "(248) 555-0158", city: "Royal Oak",        type: "recurring", cadence: "biweekly", weekday: 2, next: "Jul 7",  service: "Office exterior, ground floor", price: 180, ltv: 3240, jobs: 18, last: "Jun 24" },
  { name: "Lena Cho",          biz: null,                  email: "lena.cho@gmail.com",       phone: "(248) 555-0166", city: "Berkley",          type: "recurring", cadence: "biweekly", weekday: 5, next: "Jul 10", service: "Exterior + screen wipe-down",   price: 160, ltv: 1920, jobs: 12, last: "Jun 27" },
  { name: "Priya Nair",        biz: null,                  email: "priya.nair@gmail.com",     phone: "(248) 555-0151", city: "Rochester Hills",  type: "recurring", cadence: "every4",   weekday: 1, next: "Jul 6",  service: "Full house exterior",           price: 470, ltv: 2350, jobs: 5,  last: "Jun 9"  },
  { name: "Marcus Bell",       biz: "Bell & Co Realty",    email: "marcus@bellco.com",        phone: "(248) 555-0112", city: "Troy",             type: "recurring", cadence: "weekly",   weekday: 3, next: "Jul 8",  service: "Showroom front, weekly",        price: 120, ltv: 5760, jobs: 48, last: "Jul 1"  },
  { name: "Olivia Grant",      biz: null,                  email: "olivia.grant@gmail.com",   phone: "(248) 555-0145", city: "Clawson",          type: "recurring", cadence: "every4",   weekday: 2, next: "Jul 14", service: "Full exterior + gutters",       price: 410, ltv: 1640, jobs: 4,  last: "Jun 16" },

  { name: "Dana Park",         biz: null,                  email: "dana.park@gmail.com",      phone: "(586) 555-0148", city: "Warren",           type: "onetime",   cadence: null, weekday: null, next: null,    service: "Full exterior + screens",       price: 520, ltv: 520,  jobs: 1,  last: "Jun 30" },
  { name: "Greg Olsen",        biz: null,                  email: "greg.olsen@gmail.com",     phone: "(586) 555-0193", city: "Sterling Heights", type: "onetime",   cadence: null, weekday: null, next: null,    service: "Exterior windows, 1-story",     price: 410, ltv: 410,  jobs: 1,  last: "Jul 1"  },
  { name: "Kevin Lee",         biz: null,                  email: "kevin.lee@icloud.com",     phone: "(248) 555-0139", city: "Birmingham",       type: "onetime",   cadence: null, weekday: null, next: null,    service: "2-story full house, in + out",  price: 600, ltv: 600,  jobs: 1,  last: "Jun 22" },
  { name: "Maria Santos",      biz: null,                  email: "maria.santos@gmail.com",   phone: "(248) 555-0158", city: "Royal Oak",        type: "onetime",   cadence: null, weekday: null, next: null,    service: "Exterior + gutter clear",       price: 380, ltv: 760,  jobs: 2,  last: "May 30" },
  { name: "Carl Jensen",       biz: null,                  email: "carl.jensen@yahoo.com",    phone: "(248) 555-0173", city: "Madison Heights",  type: "onetime",   cadence: null, weekday: null, next: null,    service: "Exterior, single story",        price: 290, ltv: 290,  jobs: 1,  last: "Jun 3"  },
  { name: "Nina Patel",        biz: null,                  email: "nina.patel@gmail.com",     phone: "(248) 555-0168", city: "Bloomfield",       type: "onetime",   cadence: null, weekday: null, next: null,    service: "2-story exterior + skylights",  price: 540, ltv: 540,  jobs: 1,  last: "May 18" },
  { name: "Dana Whitfield",    biz: "Whitfield Interiors", email: "hello@whitfield.co",       phone: "(248) 555-0190", city: "Birmingham",       type: "onetime",   cadence: null, weekday: null, next: null,    service: "Showroom deep clean",           price: 620, ltv: 1240, jobs: 2,  last: "Apr 28" },
];

/* per-customer job history for the detail variant (most recent first) */
function historyFor(c) {
  const svc = c.service;
  const out = [];
  const monthsBack = ["Jun 24", "May 27", "Apr 29", "Apr 1", "Mar 4", "Feb 5"];
  const n = Math.min(c.jobs, 6);
  for (let i = 0; i < n; i++) {
    out.push({
      date: i === 0 ? c.last : monthsBack[Math.min(i, monthsBack.length - 1)],
      service: svc,
      amount: c.price,
      paid: !(i === 0 && c.type === "onetime" && c.name === "Maria Santos"),
      status: i === 0 && c.type === "recurring" ? "recent" : "completed",
    });
  }
  return out;
}

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
function money(n) { return "$" + n.toLocaleString("en-US"); }
function subtitle(c) { return c.biz ? c.biz + " · " + c.city : c.city; }

function typeBadge(c) {
  if (c.type === "recurring")
    return `<span class="type type-recurring">${IC.rotate}Recurring</span>`;
  return `<span class="type type-onetime">One-time</span>`;
}
function cadenceCell(c) {
  if (c.type !== "recurring") return `<span class="cadence none">—</span>`;
  return `<span class="cadence"><span class="rot">${IC.rotate}</span>${CADENCE[c.cadence].label} · ${WEEKDAYS[c.weekday]}</span>`;
}
function nextChip(c) {
  if (c.type !== "recurring") return `<span class="nextv dash">—</span>`;
  const soon = ["Jul 6", "Jul 7", "Jul 8"].includes(c.next);
  return `<span class="nextv ${soon ? "soon" : ""}"><span class="cal">${IC.cal}</span>${c.next}</span>`;
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
  rotate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  dollar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
};

/* shared sidebar rail markup (Customers active, sits before Revenue) */
function railHTML() {
  const item = (label, on) => `<div class="nav-i${on ? " on" : ""}"><span class="dot"></span>${label}</div>`;
  return `<aside class="rail">
    <div class="brand"><div class="mark grad-brand">W</div><div class="name">Willis</div></div>
    ${item("Home")}
    <div class="nav-sec">Company</div>
    ${item("Inbox")}
    ${item("Contacts")}
    ${item("Customers", true)}
    ${item("Calendar")}
    ${item("Revenue")}
    <div class="nav-sec">Marketing</div>
    ${item("Paid Ads")}
    ${item("Google Reviews")}
  </aside>`;
}

/* KPI strip shared by the list variants */
function kpisHTML() {
  const recurring = CUSTOMERS.filter((c) => c.type === "recurring");
  const mrr = recurring.reduce((s, c) => s + c.price * (c.cadence === "weekly" ? 4 : c.cadence === "biweekly" ? 2 : 1), 0);
  const ltv = CUSTOMERS.reduce((s, c) => s + c.ltv, 0);
  return `<div class="kpis">
    <div class="kpi"><div class="k-lab">${IC.users} Customers</div><div class="k-val">${CUSTOMERS.length}</div><div class="k-sub">${recurring.length} recurring · ${CUSTOMERS.length - recurring.length} one-time</div></div>
    <div class="kpi"><div class="k-lab">${IC.rotate} Recurring revenue</div><div class="k-val money">${money(mrr)}</div><div class="k-sub">expected this month</div></div>
    <div class="kpi"><div class="k-lab">${IC.cal} Next 7 days</div><div class="k-val">6</div><div class="k-sub">recurring visits scheduled</div></div>
    <div class="kpi"><div class="k-lab">${IC.dollar} Lifetime value</div><div class="k-val money">${money(ltv)}</div><div class="k-sub">across all customers</div></div>
  </div>`;
}

/* theme toggle (mockup chrome). Chosen direction: Master–Detail. */
function chromeHTML() {
  return `<button class="themebtn" onclick="(function(h){var d=h.dataset;d.theme=d.theme==='dark'?'light':'dark'})(document.documentElement)">Toggle theme</button>`;
}
