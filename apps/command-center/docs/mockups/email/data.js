// Shared demo data for the Email Campaigns mockups. Both tracks are fully
// specified so every layout variant renders identical content and only the
// LAYOUT differs. Home-services client (plumbing/HVAC), matching the Social demo.
// Golden rule note: this is demo/preview data only; a real client sees zeros + a
// "not connected" notice until GHL email sending is wired.
//
// Each track carries data for ALL FIVE pages:
//   overview: headline, kpis, upNext, recent, ideas, callout
//   ideas:    ideasFull (the full Ideas page grid)
//   calendar: month + events (the Calendar page)
//   campaigns: every campaign sent/scheduled (the Campaigns page)
//   insights: summary stats + topPerformers + a takeaway (What's working)

window.EMAIL_DATA = {
  customers: {
    label: "Customers",
    audienceWord: "Customers",
    audience: "Showing emails to your existing customers.",
    audienceChip: "To: Your customers",
    headline: { value: "9", unit: "jobs booked", sub: "from email this month" },
    kpis: [
      { label: "Emails sent", value: "4" },
      { label: "Opened", value: "41%" },
      { label: "Clicked", value: "142" },
      { label: "Jobs booked", value: "9", brand: true },
    ],
    upNext: [
      { title: "Summer AC tune-up reminder", meta: "Sat 9:00 AM · 1,420 customers", tone: "brand", status: "Scheduled" },
      { title: "Refer a friend, get $25 off", meta: "Mon 8:00 AM · 1,420 customers", tone: "brand", status: "Scheduled" },
      { title: "Garcia 5★ — thank-you + review ask", meta: "Needs your approval", tone: "warning", status: "Draft" },
    ],
    recent: [
      { title: "Spring drain-cleaning special", meta: "Jun 12 · 1,380 sent", metric: "7 jobs", sub: "41% opened" },
      { title: "Meet your technician", meta: "Jun 5 · 1,360 sent", metric: "3 jobs", sub: "44% opened" },
    ],
    ideas: [
      { kind: "Seasonal", title: "AC tune-up reminder before the heat wave" },
      { kind: "Win-back", title: "The Hendersons haven't booked in a year — win them back" },
      { kind: "Review", title: "Turn the Garcia 5★ into a thank-you email" },
    ],
    callout: { tone: "warning", text: "Your spring special booked 7 jobs.", strong: "Send it again next month?" },

    ideasFull: [
      { kind: "Seasonal", title: "AC tune-up reminder before the heat wave", why: "It's the hottest week of the year and tune-ups are top of mind." },
      { kind: "Win-back", title: "The Hendersons haven't booked in a year", why: "12 customers are overdue. A friendly nudge usually wins a few back." },
      { kind: "Review", title: "Turn the Garcia 5★ into a thank-you email", why: "Happy customers refer. Thank them and ask for one more review." },
      { kind: "Promo", title: "$25 off drain cleaning this month", why: "Fills slow mid-week slots with quick, profitable jobs." },
      { kind: "Referral", title: "Refer a friend, you both get $25", why: "Your best new customers come from the ones you already have." },
      { kind: "Maintenance", title: "Annual water-heater flush reminder", why: "Easy upsell that keeps you front of mind for the next emergency." },
    ],
    calendar: {
      month: "June 2026",
      events: [
        { dom: 5, title: "Meet your technician", time: "8:00 AM", tone: "neutral", status: "Sent" },
        { dom: 12, title: "Spring drain-cleaning special", time: "9:00 AM", tone: "neutral", status: "Sent" },
        { dom: 28, title: "Summer AC tune-up reminder", time: "9:00 AM", tone: "brand", status: "Scheduled" },
        { dom: 30, title: "Refer a friend, get $25 off", time: "8:00 AM", tone: "brand", status: "Scheduled" },
      ],
    },
    campaigns: [
      { title: "Summer AC tune-up reminder", when: "Jun 28", sent: "—", opened: "—", result: "—", tone: "brand", status: "Scheduled" },
      { title: "Refer a friend, get $25 off", when: "Jun 30", sent: "—", opened: "—", result: "—", tone: "brand", status: "Scheduled" },
      { title: "Garcia 5★ — thank-you + review ask", when: "Draft", sent: "—", opened: "—", result: "—", tone: "warning", status: "Draft" },
      { title: "Spring drain-cleaning special", when: "Jun 12", sent: "1,380", opened: "41%", result: "7 jobs", tone: "positive", status: "Sent" },
      { title: "Meet your technician", when: "Jun 5", sent: "1,360", opened: "44%", result: "3 jobs", tone: "positive", status: "Sent" },
      { title: "May newsletter: 3 spring plumbing tips", when: "May 20", sent: "1,340", opened: "39%", result: "2 jobs", tone: "positive", status: "Sent" },
    ],
    insights: {
      summary: [
        { label: "Emails sent", value: "4" },
        { label: "Open rate", value: "41%" },
        { label: "Click rate", value: "12%" },
        { label: "Jobs booked", value: "9", brand: true },
      ],
      topPerformers: [
        { title: "Spring drain-cleaning special", metric: "7 jobs", sub: "41% opened · 1,380 sent" },
        { title: "Meet your technician", metric: "3 jobs", sub: "44% opened · 1,360 sent" },
        { title: "May newsletter: spring tips", metric: "2 jobs", sub: "39% opened · 1,340 sent" },
      ],
      takeaway: "Emails sent Friday mornings get opened the most. We'll keep sending then.",
    },
  },

  commercial: {
    label: "Commercial Outreach",
    audienceWord: "Prospects",
    audience: "Showing automated outreach to commercial businesses.",
    audienceChip: "To: Commercial prospects",
    headline: { value: "6", unit: "meetings booked", sub: "from outreach this month" },
    kpis: [
      { label: "Prospects emailed", value: "320" },
      { label: "Opened", value: "58%" },
      { label: "Replied", value: "24" },
      { label: "Meetings booked", value: "6", brand: true },
    ],
    upNext: [
      { title: "Intro: commercial plumbing for property managers", meta: "Tue 7:30 AM · 80 prospects", tone: "brand", status: "Scheduled" },
      { title: "Case study: 24-hr restaurant kitchen fix", meta: "Thu 7:30 AM · 60 prospects", tone: "brand", status: "Scheduled" },
      { title: "Follow-up: still worth a 10-min call?", meta: "Needs your approval", tone: "warning", status: "Draft" },
    ],
    recent: [
      { title: "Preferred vendor for your buildings?", meta: "Jun 11 · 120 sent", metric: "9 replies", sub: "3 meetings" },
      { title: "We handle after-hours emergencies", meta: "Jun 4 · 140 sent", metric: "6 replies", sub: "2 meetings" },
    ],
    ideas: [
      { kind: "Intro", title: "Reach out to 40 new property-management firms" },
      { kind: "Case study", title: "Send the restaurant-kitchen save to local restaurants" },
      { kind: "Follow-up", title: "Nudge the 18 prospects who opened but didn't reply" },
    ],
    callout: { tone: "brand", text: "18 prospects opened but didn't reply.", strong: "Send a follow-up?" },

    ideasFull: [
      { kind: "Intro", title: "Reach out to 40 new property-management firms", why: "Property managers own dozens of buildings: one yes is recurring work." },
      { kind: "Case study", title: "Send the restaurant-kitchen save to local restaurants", why: "A 24-hour fix story sells your emergency response better than any pitch." },
      { kind: "Follow-up", title: "Nudge the 18 prospects who opened but didn't reply", why: "They're interested. A short second email turns opens into calls." },
      { kind: "Offer", title: "Free 20-point plumbing audit for new accounts", why: "A no-risk first step gets you in the door with bigger buildings." },
      { kind: "Seasonal", title: "Winterize-your-building outreach to property managers", why: "Burst-pipe season is the easiest time to win a preferred-vendor spot." },
      { kind: "Referral", title: "Ask current commercial clients for an intro", why: "Your happiest building managers know other building managers." },
    ],
    calendar: {
      month: "June 2026",
      events: [
        { dom: 4, title: "We handle after-hours emergencies", time: "7:30 AM", tone: "neutral", status: "Sent" },
        { dom: 11, title: "Preferred vendor for your buildings?", time: "7:30 AM", tone: "neutral", status: "Sent" },
        { dom: 24, title: "Intro: property managers", time: "7:30 AM", tone: "brand", status: "Scheduled" },
        { dom: 26, title: "Case study: restaurant kitchen", time: "7:30 AM", tone: "brand", status: "Scheduled" },
      ],
    },
    campaigns: [
      { title: "Intro: commercial plumbing for property managers", when: "Jun 24", sent: "—", opened: "—", result: "—", tone: "brand", status: "Scheduled" },
      { title: "Case study: 24-hr restaurant kitchen fix", when: "Jun 26", sent: "—", opened: "—", result: "—", tone: "brand", status: "Scheduled" },
      { title: "Follow-up: still worth a 10-min call?", when: "Draft", sent: "—", opened: "—", result: "—", tone: "warning", status: "Draft" },
      { title: "Preferred vendor for your buildings?", when: "Jun 11", sent: "120", opened: "58%", result: "9 replies", tone: "positive", status: "Sent" },
      { title: "We handle after-hours emergencies", when: "Jun 4", sent: "140", opened: "52%", result: "6 replies", tone: "positive", status: "Sent" },
      { title: "Intro to local restaurant groups", when: "May 22", sent: "95", opened: "49%", result: "4 replies", tone: "positive", status: "Sent" },
    ],
    insights: {
      summary: [
        { label: "Prospects emailed", value: "320" },
        { label: "Open rate", value: "58%" },
        { label: "Reply rate", value: "7.5%" },
        { label: "Meetings booked", value: "6", brand: true },
      ],
      topPerformers: [
        { title: "Preferred vendor for your buildings?", metric: "3 meetings", sub: "9 replies · 120 sent" },
        { title: "We handle after-hours emergencies", metric: "2 meetings", sub: "6 replies · 140 sent" },
        { title: "Intro to local restaurant groups", metric: "1 meeting", sub: "4 replies · 95 sent" },
      ],
      takeaway: "Tuesday 7:30 AM sends get the most replies. We'll keep leading the week with outreach.",
    },
  },
};

// Inline SVG icon set (lucide paths) so mockups need no icon dependency.
window.ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  star: '<polygon points="12 2 15 9 22 9.3 17 14 18.5 21 12 17.3 5.5 21 7 14 2 9.3 9 9"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20M2 12h20"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>',
  layout: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/>',
  sparkles: '<path d="m12 3-1.9 5.8L4 11l6.1 2.2L12 19l1.9-5.8L20 11l-6.1-2.2z"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  bar: '<path d="M3 3v18h18"/><rect width="4" height="7" x="7" y="10"/><rect width="4" height="11" x="15" y="6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrowsm: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};

window.icon = function (name, size) {
  size = size || 17;
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
    '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    (window.ICONS[name] || "") + "</svg>";
};
