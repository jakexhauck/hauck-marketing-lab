/* Shared sample data + render helpers for the Leads mockups.
   One page merges the three old Sales channels: Paid Ads, Estimate Forms,
   and Chat Widget. Every lead carries a `source`; the "New" bucket = unworked
   leads; "All" = the full history. Home-services flavour (Willis-style). */

const SOURCES = {
  ad:   { cls: "src-ad",   glyph: "AD",  icon: "megaphone", label: "Paid Ad",       short: "Ad",   accent: "#4f46e5" },
  form: { cls: "src-form", glyph: "F",   icon: "inbox",     label: "Estimate Form", short: "Form", accent: "#0f766e" },
  chat: { cls: "src-chat", glyph: "C",   icon: "msg",       label: "Chat Widget",   short: "Chat", accent: "#d97706" },
};

/* status drives the pill + whether a lead sits in the New bucket.
   `new` = unworked (shows in New). Everything else = worked (All only). */
const STATUS = {
  new:     { cls: "pill-new",     label: "New",     worked: false },
  working: { cls: "pill-working", label: "Working", worked: true },
  booked:  { cls: "pill-booked",  label: "Booked",  worked: true },
  won:     { cls: "pill-won",     label: "Won",     worked: true },
  cold:    { cls: "pill-cold",    label: "Parked",  worked: true },
};

/* The real per-source follow-up automations. Paid Ads and Estimate Forms each
   run their OWN sequence (Paid Ad's Pipeline vs Organic Pipeline); Chat has no
   dedicated sequence yet. Structure mirrors src/lib/automations.ts (channel +
   label + timing). STEPS ARE PLACEHOLDERS — confirm against the live workflows.
   `fu.sent` = how many steps have gone out; `fu.respondedAt` = the step where the
   lead replied (0 = no reply yet); `fu.outcome` = where they landed. */
const SEQ = {
  // Paid Ads: SMS nurture on lead-form leads, worked to an intro call.
  ad: [
    { channel: "sms",   label: "Instant text", delay: "within 1 min" },
    { channel: "sms",   label: "Follow-up 1",  delay: "+1 hour" },
    { channel: "sms",   label: "Follow-up 2",  delay: "+1 day" },
    { channel: "sms",   label: "Follow-up 3",  delay: "+3 days" },
  ],
  // Estimate Forms: auto email + SMS on submit, then reminders.
  form: [
    { channel: "email", label: "Auto-reply",   delay: "instant" },
    { channel: "sms",   label: "Instant text", delay: "within 1 min" },
    { channel: "sms",   label: "Follow-up 1",  delay: "+1 day" },
    { channel: "email", label: "Follow-up 2",  delay: "+3 days" },
  ],
};
function seqFor(l) { return SEQ[l.source] || []; }
function chIcon(ch) { return ch === "email" ? IC.mail : ch === "call" ? IC.phone : IC.msg; }
const FU_OUTCOME = {
  replied:    { label: "Replied",        tone: "positive" },
  awaiting:   { label: "Awaiting reply", tone: "warning" },
  noresponse: { label: "No response",    tone: "faint" },
  booked:     { label: "Call booked",    tone: "booked" },
  won:        { label: "Won",            tone: "positive" },
};

/* Every lead is one person from one source, with the last inbound message and
   a short thread. Paid-ad leads are cold (worked to an intro call); form + chat
   leads are warm (worked to a quote on the phone). */
const LEADS = [
  {
    id: "l1", name: "Marcus Webb", source: "ad", status: "new",
    intent: "Water heater leaking, needs it looked at today",
    preview: "Hey, saw your ad. My water heater's leaking bad, can someone come today?",
    when: "8m", wait: "8 min", phone: "(614) 555-0142", location: "Hilliard", zip: "43026",
    ad: "Emergency Plumbing · Facebook",
    fu: { sent: 1, respondedAt: 1, outcome: "replied" },
    msgs: [
      { dir: "out", from: "Auto", auto: true, at: "8m", body: "Thanks for reaching out to Willis Plumbing! What's going on and where are you located?" },
      { dir: "in",  from: "Marcus", at: "8m", body: "Hey, saw your ad. My water heater's leaking bad, can someone come today?" },
    ],
    emails: [
      { dir: "out", from: "Willis Plumbing", at: "8m", body: "Hi Marcus, thanks for reaching out. We can get a tech out today. What's your address and a good callback number?" },
    ],
  },
  {
    id: "l2", name: "Priya Nair", source: "form", status: "new",
    intent: "Furnace replacement estimate",
    preview: "Filled out the form for a furnace quote. It's 18 years old and short-cycling.",
    when: "22m", wait: "22 min", phone: "(614) 555-0188", location: "Dublin", zip: "43017",
    ad: "Website · Estimate form",
    fu: { sent: 2, respondedAt: 2, outcome: "replied" },
    msgs: [
      { dir: "in",  from: "Priya", at: "22m", body: "Filled out the form for a furnace quote. It's 18 years old and short-cycling." },
      { dir: "out", from: "Auto", auto: true, at: "22m", body: "Thanks Priya! We'll call shortly. Roughly what size is the home?" },
      { dir: "in",  from: "Priya", at: "19m", body: "About 2,400 sq ft, two story." },
    ],
    emails: [
      { dir: "in",  from: "Priya Nair", at: "22m", body: "Submitted the estimate form on your site. Furnace is 18 years old and short-cycling. Prefer email during the day, thanks!" },
      { dir: "out", from: "Willis Plumbing", auto: true, at: "22m", body: "Thanks Priya! We received your furnace estimate request and will be in touch shortly to schedule a time." },
    ],
  },
  {
    id: "l3", name: "Kyle Brenner", source: "chat", status: "new",
    intent: "Sump pump not kicking on",
    preview: "is this thing on? my sump pump stopped working and it's supposed to storm",
    when: "34m", wait: "34 min", phone: "(614) 555-0155", location: "Westerville", zip: "43081",
    ad: "Website · Chat widget",
    msgs: [
      { dir: "in",  from: "Kyle", at: "34m", body: "is this thing on? my sump pump stopped working and it's supposed to storm tonight" },
      { dir: "out", from: "Auto", auto: true, at: "34m", body: "You're in the right place. What's the best number to reach you?" },
    ],
  },
  {
    id: "l4", name: "Aisha Rahman", source: "form", status: "new",
    intent: "Water softener install quote",
    preview: "Looking for a quote on a whole-home water softener.",
    when: "1h", wait: "1 hr", phone: "(614) 555-0134", location: "Gahanna", zip: "43230",
    ad: "Website · Estimate form",
    fu: { sent: 2, respondedAt: 0, outcome: "awaiting" },
    msgs: [
      { dir: "out", from: "Auto", auto: true, at: "1h", body: "Thanks Aisha! We got your water softener request and will reach out shortly." },
      { dir: "in", from: "Aisha", at: "1h", body: "Looking for a quote on a whole-home water softener. Water's really hard here." },
    ],
  },
  {
    id: "l5", name: "Devon Clarke", source: "ad", status: "new",
    intent: "Drain keeps backing up",
    preview: "Auto follow-up 2 sent · no reply yet",
    when: "2h", wait: "2 hr", phone: "(614) 555-0148", location: "Grove City", zip: "43123",
    ad: "$79 Drain Special · Facebook",
    fu: { sent: 2, respondedAt: 0, outcome: "awaiting" },
    msgs: [
      { dir: "out", from: "Auto", auto: true, at: "2h", body: "Hi Devon, thanks for your interest in the $79 drain special! When works for a quick call?" },
      { dir: "out", from: "Auto", auto: true, at: "1h", body: "Just following up, Devon. Still want to grab that drain special before it ends?" },
    ],
  },
  {
    id: "l11", name: "Grant Whitfield", source: "ad", status: "new",
    intent: "Repipe estimate from Facebook ad",
    preview: "Auto follow-up 3 sent · no reply yet",
    when: "1d", wait: "1 day", phone: "(380) 555-0161", location: "Dublin", zip: "43017",
    ad: "Whole-Home Repipe · Facebook",
    fu: { sent: 3, respondedAt: 0, outcome: "awaiting" },
    msgs: [
      { dir: "out", from: "Auto", auto: true, at: "1d", body: "Hi Grant! Saw you were interested in a repipe estimate. What's the best time to reach you?" },
      { dir: "out", from: "Auto", auto: true, at: "20h", body: "Following up on your repipe estimate, Grant. Happy to answer any questions." },
      { dir: "out", from: "Auto", auto: true, at: "4h", body: "Last check-in, Grant. Want me to hold a spot for your free estimate this week?" },
    ],
  },
  {
    id: "l6", name: "Dana Liu", source: "ad", status: "booked",
    intent: "AC tune-up before summer",
    preview: "Sounds good, I'll take the 2pm Thursday slot.",
    when: "3h", wait: "—", phone: "(614) 555-0197", location: "Powell", zip: "43065",
    ad: "AC Tune-Up · Facebook",
    fu: { sent: 2, respondedAt: 2, outcome: "booked" },
    msgs: [
      { dir: "in",  from: "Dana", at: "3h", body: "Interested in the AC tune-up before it gets hot." },
      { dir: "out", from: "You", at: "3h", body: "Great! I can get you booked for a quick intro call to go over it. Does Thursday 2pm work?" },
      { dir: "in",  from: "Dana", at: "2h", body: "Sounds good, I'll take the 2pm Thursday slot." },
    ],
  },
  {
    id: "l7", name: "Rachel Simmons", source: "form", status: "working",
    intent: "Water heater replacement",
    preview: "Yes please call me after 4, I'm free then.",
    when: "5h", wait: "—", phone: "(380) 555-0175", location: "Hilliard", zip: "43026",
    ad: "Website · Estimate form",
    fu: { sent: 2, respondedAt: 2, outcome: "replied" },
    msgs: [
      { dir: "in",  from: "Rachel", at: "5h", body: "Need a new water heater, old one finally died." },
      { dir: "out", from: "You", at: "5h", body: "Sorry to hear it! Best time to call you with a quote?" },
      { dir: "in",  from: "Rachel", at: "4h", body: "Yes please call me after 4, I'm free then." },
    ],
  },
  {
    id: "l8", name: "The Garcia Family", source: "chat", status: "booked",
    intent: "Burst pipe, emergency",
    preview: "Perfect, see the tech at 9am. Thank you!",
    when: "Yest", wait: "—", phone: "(380) 555-0116", location: "Dublin", zip: "43017",
    ad: "Website · Chat widget",
    msgs: [
      { dir: "in",  from: "Rosa", at: "Yest", body: "Pipe burst under the sink, water everywhere!!" },
      { dir: "out", from: "You", at: "Yest", body: "We'll get someone out first thing. Booked you for 9am tomorrow." },
      { dir: "in",  from: "Rosa", at: "Yest", body: "Perfect, see the tech at 9am. Thank you!" },
    ],
  },
  {
    id: "l9", name: "Tom Halloran", source: "ad", status: "won",
    intent: "Drain cleaning",
    preview: "Paid, thanks for the fast work.",
    when: "2d", wait: "—", phone: "(614) 555-0173", location: "Westerville", zip: "43081",
    ad: "$79 Drain Special · Facebook",
    fu: { sent: 1, respondedAt: 1, outcome: "won" },
    msgs: [
      { dir: "in", from: "Tom", at: "2d", body: "Paid, thanks for the fast work." },
    ],
  },
  {
    id: "l10", name: "Bianca Moreno", source: "chat", status: "cold",
    intent: "Asked about pricing, went quiet",
    preview: "No reply after 3 follow-ups.",
    when: "3d", wait: "—", phone: "(614) 555-0121", location: "Grove City", zip: "43123",
    ad: "Website · Chat widget",
    msgs: [
      { dir: "in", from: "Bianca", at: "3d", body: "how much for a toilet install?" },
    ],
  },
  {
    id: "l12", name: "Carl Jennings", source: "ad", status: "cold",
    intent: "Sewer line inspection from ad",
    preview: "All 4 follow-ups sent · never replied",
    when: "5d", wait: "—", phone: "(614) 555-0104", location: "Hilliard", zip: "43026",
    ad: "Sewer Inspection · Facebook",
    fu: { sent: 4, respondedAt: 0, outcome: "noresponse" },
    msgs: [
      { dir: "out", from: "Auto", auto: true, at: "5d", body: "Hi Carl! Thanks for your interest in a sewer line inspection. When can we reach you?" },
      { dir: "out", from: "Auto", auto: true, at: "4d", body: "Following up, Carl. Still want that inspection scheduled?" },
      { dir: "out", from: "Auto", auto: true, at: "3d", body: "Checking in one more time, Carl." },
      { dir: "out", from: "Auto", auto: true, at: "2d", body: "We'll leave it here for now, Carl. Reply any time and we'll pick right back up." },
    ],
  },
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
function sourceBadge(src, opts) {
  const s = SOURCES[src];
  const showLabel = !opts || opts.label !== false;
  return `<span class="src ${s.cls}"><span class="glyph">${IC[s.icon]}</span>${showLabel ? s.label : ""}</span>`;
}
function statusPill(st) {
  const s = STATUS[st];
  return `<span class="pill ${s.cls}"><span class="led"></span>${s.label}</span>`;
}
/* new = unworked; used by every variant to size the New bucket */
function isNew(l) { return !STATUS[l.status].worked; }
function newCount(src) {
  return LEADS.filter((l) => isNew(l) && (!src || l.source === src)).length;
}
function bySource(src) { return LEADS.filter((l) => l.source === src); }

/* map a follow-up outcome tone to a CSS colour var */
function toneVar(tone) {
  return { positive: "var(--positive)", warning: "var(--warning)", faint: "var(--faint)",
           booked: "#0284c7", brand: "var(--brand-text)" }[tone] || "var(--muted)";
}

/* compact progress dots for the list: one per sequence step, filled = sent,
   green = where the lead replied. At-a-glance "how far has the automation run". */
function fuDots(l) {
  const seq = seqFor(l);
  if (!l.fu || !seq.length) return "";
  const sent = l.fu.sent, rAt = l.fu.respondedAt;
  const dots = seq.map((_, i) => {
    const replied = rAt && i === rAt - 1;
    return `<span class="fud ${replied ? "rep" : i < sent ? "on" : ""}"></span>`;
  }).join("");
  return `<span class="fudots">${dots}</span>`;
}

/* the follow-up chip: "Replied", "Awaiting reply", etc. */
function fuChip(l) {
  if (!l.fu) return "";
  const o = FU_OUTCOME[l.fu.outcome];
  return `<span class="fuchip" style="--fc:${toneVar(o.tone)}"><span class="d"></span>${o.label}</span>`;
}

/* horizontal follow-up tracker for the detail pane: left-to-right steps with a
   connecting line, filled to where the sequence has run, green where they replied.
   Each step shows its channel (SMS/email/call) so the client sees the real mix. */
function fuTrackH(l) {
  const seq = seqFor(l);
  if (!l.fu || !seq.length) return "";
  const sent = l.fu.sent, rAt = l.fu.respondedAt;
  const steps = seq.map((s, i) => {
    const done = i < sent, replied = rAt && i === rAt - 1;
    const state = replied ? "rep" : done ? "on" : "";
    const sub = replied ? "replied here" : done ? "sent · " + s.delay : s.delay;
    return `<div class="fstep ${state}"><span class="node">${(done || replied) ? IC.check : chIcon(s.channel)}</span><span class="lb">${s.label}</span><span class="fsub">${sub}</span></div>`;
  }).join("");
  return `<div class="futrack-h">${steps}</div>`;
}

/* Contextual next-step actions (shown inside the Next-step popup). Cold ad leads
   are worked to an intro call; warm form/chat leads are called + quoted. There is
   no manual "Confirm call": confirmation is fully automatic (the confirm link
   logs it and flips the calendar), so it lives in the tracker as a status. */
function nextSteps(src) {
  if (src === "ad") {
    return [
      { icon: "phone",    title: "Call now",        desc: "Ring them now. Opens the call console.", primary: true },
      { icon: "calendar", title: "Book intro call", desc: "Pick a time to talk.",
        auto: "Pauses the follow-ups and sends a confirm text. When they confirm, it logs itself and the calendar updates automatically." },
      { icon: "more",     title: "Not a fit",       desc: "No answer, not qualified, or park for later." },
    ];
  }
  return [
    { icon: "phone",    title: "Call now",             desc: "Ring them and quote on the phone.", primary: true },
    { icon: "calendar", title: "Schedule a call",      desc: "Book a time to call them back.",
      auto: "Pauses the follow-ups until the callback time." },
    { icon: "calRange", title: "Book in-person visit", desc: "Schedule an on-site estimate." },
    { icon: "more",     title: "Not a fit",            desc: "Not qualified, out of area, or no answer." },
  ];
}

/* One-line automation status under the follow-up tracker, so the client always
   knows what the system is doing on its own right now. */
function automationNote(l) {
  if (!l.fu) return "";
  const o = l.fu.outcome;
  if (o === "replied")    return "Lead replied, so the auto follow-ups paused. Your turn to reach out.";
  if (o === "awaiting")   return "Auto follow-ups are sending on schedule. No reply yet.";
  if (o === "booked")     return l.source === "ad"
      ? "Intro call booked, so the follow-ups paused. The confirm text went out automatically."
      : "Booked, so the follow-ups paused.";
  if (o === "won")        return "Won. The sequence is complete.";
  if (o === "noresponse") return "All follow-ups sent with no reply. The sequence ended on its own.";
  return "";
}

/* inline lucide-style icons */
const IC = {
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  msg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  megaphone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  calRange: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
};

/* quick-action row (call / text / open) */
function quickActions(l) {
  const tel = l.phone.replace(/[^0-9]/g, "");
  return `<div class="qa" onclick="event.stopPropagation()">
    <a href="tel:${tel}" title="Call">${IC.phone}</a>
    <a href="sms:${tel}" title="Text">${IC.msg}</a>
  </div>`;
}

/* shared sidebar rail markup — Sales section now has one "Leads" item */
function railHTML() {
  const item = (label, icon, on) => `<div class="nav-i${on ? " on" : ""}">${IC[icon] || `<span class="dot"></span>`}${label}</div>`;
  return `<aside class="rail">
    <div class="brand"><div class="mark grad-brand">W</div><div class="name">Willis</div></div>
    ${item("Home", "zap")}
    <div class="nav-sec">Company</div>
    ${item("Inbox", "msg")}
    ${item("Contacts", "inbox")}
    ${item("Calendar", "calendar")}
    <div class="nav-sec">Sales</div>
    ${item("Leads", "zap", true)}
    ${item("Jobs", "calendar")}
    ${item("Reactivation", "send")}
    <div class="nav-sec">Marketing</div>
    ${item("Paid Ads", "megaphone")}
    ${item("Reviews", "check")}
  </aside>`;
}

/* theme toggle + variant switcher (mockup chrome) */
function chromeHTML(current) {
  const link = (id, label) => `<a href="variant-${id}.html" class="${current === id ? "on" : ""}">${label}</a>`;
  return `<div class="vswitch">
    ${link("a-split-inbox", "A · Split Inbox")}
    ${link("b-triage-board", "B · Triage Board")}
    ${link("c-focus-queue", "C · Focus Queue")}
  </div>
  <button class="themebtn" onclick="(function(h){var d=h.dataset;d.theme=d.theme==='dark'?'light':'dark'})(document.documentElement)">Toggle theme</button>`;
}
