import type { AdminLead } from "../lib/api";

// Demo leads for the Cold Call stage pages.
//
// The lead book is empty and the GHL pipeline holds no opportunities yet, so
// every stage page would render blank and the format would be impossible to
// judge. These rows fill the pages until real leads land. They are never mixed
// with real ones: the surface uses this set only when the book comes back empty,
// and it shows a "Demo data" badge whenever it does. Editing is off in that
// mode, so nothing here can ever be written anywhere.

// Dates are relative to a fixed anchor rather than "now", so a screenshot taken
// today and one taken next month look the same and no test depends on the clock.
const ANCHOR = "2026-07-26";

function daysBefore(days: number): string {
  const d = new Date(`${ANCHOR}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysAfter(days: number): string {
  return daysBefore(-days);
}

interface DemoSeed {
  first: string;
  last: string;
  phone: string;
  status: AdminLead["status"];
  source: string;
  firstContact: number; // days before the anchor
  lastContact: number;
  noAnswer: number;
  followUp?: number; // days after the anchor
  appointment?: number;
  notes: string;
  email?: string;
}

const SEEDS: DemoSeed[] = [
  // New Lead: sourced, never dialed.
  { first: "Marcus", last: "Bell", phone: "(313) 555-0182", status: "New Lead", source: "Scraper", firstContact: 0, lastContact: 0, noAnswer: 0, notes: "Roofing, 8 trucks. Runs no ads." },
  { first: "Danielle", last: "Ortega", phone: "(248) 555-0147", status: "New Lead", source: "Scraper", firstContact: 0, lastContact: 0, noAnswer: 0, notes: "HVAC, Troy. Site is a one-pager." },
  { first: "Priya", last: "Raman", phone: "(734) 555-0119", status: "New Lead", source: "Apollo", firstContact: 0, lastContact: 0, noAnswer: 0, notes: "Landscaping, 40 reviews, no offer on site." },
  { first: "Terrence", last: "Wu", phone: "(586) 555-0163", status: "New Lead", source: "Scraper", firstContact: 0, lastContact: 0, noAnswer: 0, notes: "Pressure washing. Boosting posts only." },

  // 1st Dial: dialed once, no answer.
  { first: "Sofia", last: "Novak", phone: "(248) 555-0171", status: "1st Dial (Day 1)", source: "Scraper", firstContact: 1, lastContact: 1, noAnswer: 1, followUp: 0, notes: "Rang out, no voicemail set up." },
  { first: "Andre", last: "Whitfield", phone: "(313) 555-0104", status: "1st Dial (Day 1)", source: "GMB", firstContact: 1, lastContact: 1, noAnswer: 1, followUp: 0, notes: "Left a voicemail. Gatekeeper answered first." },

  // 2nd Dial: dialed twice, still nothing.
  { first: "Lena", last: "Hargrove", phone: "(734) 555-0138", status: "2nd Dial (Day 2)", source: "Scraper", firstContact: 3, lastContact: 1, noAnswer: 2, followUp: 1, notes: "Two rings, no pickup. Try before 9am." },
  { first: "Ray", last: "Castellano", phone: "(586) 555-0195", status: "2nd Dial (Day 2)", source: "Apollo", firstContact: 4, lastContact: 2, noAnswer: 2, followUp: 1, notes: "Mobile goes straight to voicemail." },

  // Brushed Off: picked up, would not engage.
  { first: "Tom", last: "Hale", phone: "(313) 555-0126", status: "Brushed Off", source: "Scraper", firstContact: 6, lastContact: 2, noAnswer: 1, followUp: 12, notes: "\"Send me an email.\" Worth one more angle in 2 weeks." },
  { first: "Gwen", last: "Ibrahim", phone: "(248) 555-0158", status: "Brushed Off", source: "GMB", firstContact: 5, lastContact: 3, noAnswer: 0, followUp: 10, notes: "Busy on a job site, would not book a time." },

  // Call Back: asked to be called at a set time.
  { first: "Victor", last: "Amaya", phone: "(734) 555-0177", status: "Call Back", source: "Scraper", firstContact: 4, lastContact: 1, noAnswer: 1, followUp: 1, notes: "Call Tuesday after 4pm, off the truck by then." },
  { first: "Nadia", last: "Brooks", phone: "(313) 555-0143", status: "Call Back", source: "Apollo", firstContact: 7, lastContact: 2, noAnswer: 0, followUp: 2, notes: "Interested but wants the partner on the call." },

  // Booked: demo on the calendar.
  { first: "Colin", last: "Reyes", phone: "(586) 555-0110", status: "Booked", source: "Scraper", firstContact: 9, lastContact: 1, noAnswer: 1, appointment: 2, notes: "Demo booked. Pulling their FB page before the call.", email: "colin@reyesexteriors.com" },
  { first: "Amara", last: "Diallo", phone: "(248) 555-0189", status: "Booked", source: "GMB", firstContact: 11, lastContact: 0, noAnswer: 0, appointment: 4, notes: "Wants lead-gen numbers for her market.", email: "amara@dialloclean.com" },

  // Not Interested: a hard no.
  { first: "Doug", last: "Prentiss", phone: "(734) 555-0152", status: "Not Interested", source: "Scraper", firstContact: 8, lastContact: 5, noAnswer: 0, notes: "Has an in-house marketer. Do not call again." },
  { first: "Bianca", last: "Stroud", phone: "(313) 555-0167", status: "Not Interested", source: "Apollo", firstContact: 10, lastContact: 6, noAnswer: 1, notes: "Burned by an agency last year." },
];

export const COLD_CALL_DEMO_LEADS: AdminLead[] = SEEDS.map((seed, i) => ({
  id: `demo-${i + 1}`,
  firstName: seed.first,
  lastName: seed.last,
  phone: seed.phone,
  timezone: "ET",
  status: seed.status,
  firstContactDate: daysBefore(seed.firstContact),
  source: seed.source,
  appointmentDate: seed.appointment === undefined ? null : daysAfter(seed.appointment),
  noAnswer: seed.noAnswer,
  lastContact: daysBefore(seed.lastContact),
  followUpDate: seed.followUp === undefined ? null : daysAfter(seed.followUp),
  email: seed.email ?? "",
  notes: seed.notes,
  createdAt: `${daysBefore(seed.firstContact)}T14:00:00.000Z`,
}));
