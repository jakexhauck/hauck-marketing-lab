import {
  type CalendarItem,
  type CalendarSource,
  minutesToLabel,
} from "./calendarModel";

// Hand-authored preview data for the unified calendar, July 2026 (Willis Windows),
// so the demo/preview always reads as a full company schedule. Real sessions never
// see this; the merge hook only reaches for it under demoMode(). Appointments +
// jobs also exist in the live/GHL paths later; social + campaigns are demo-only
// until those backends land.
export const DEMO_CALENDAR_MONTH = { year: 2026, month: 6 };

// Small builder to keep entries terse and consistent.
function mk(
  source: CalendarSource,
  id: string,
  title: string,
  subtitle: string,
  date: string,
  startMinutes: number | null,
  extra: Partial<CalendarItem> = {},
): CalendarItem {
  return {
    id: `${source}:${id}`,
    source,
    title,
    subtitle,
    date,
    startMinutes,
    endMinutes: extra.endMinutes ?? null,
    timeLabel: startMinutes == null ? "" : minutesToLabel(startMinutes),
    status: extra.status ?? "",
    amount: extra.amount ?? null,
    location: extra.location ?? "",
    meetingUrl: extra.meetingUrl ?? "",
    contactId: extra.contactId ?? "",
  };
}

export const DEMO_APPOINTMENTS: CalendarItem[] = [
  mk("appointment", "a1", "Intro call", "Marcus Cho", "2026-07-01", 9 * 60 + 30, { status: "confirmed", endMinutes: 10 * 60, meetingUrl: "https://zoom.us/j/demo", contactId: "c-cho" }),
  mk("appointment", "a2", "Estimate visit", "Elena Diaz", "2026-07-02", 10 * 60, { status: "booked", endMinutes: 11 * 60, location: "Troy, 48083", contactId: "c-diaz" }),
  mk("appointment", "a3", "Intro call", "Sam Patel", "2026-06-30", 11 * 60, { status: "confirmed", endMinutes: 11 * 60 + 30, contactId: "c-patel" }),
  mk("appointment", "a4", "Estimate visit", "Rachel Kaur", "2026-07-06", 11 * 60, { status: "booked", location: "Warren, 48091", contactId: "c-kaur" }),
  mk("appointment", "a5", "Estimate visit", "Owen Ito", "2026-07-09", 10 * 60, { status: "booked", location: "Berkley, 48072", contactId: "c-ito" }),
  mk("appointment", "a6", "Intro call", "Nadia Voss", "2026-07-23", 11 * 60, { status: "confirmed", contactId: "c-voss" }),
];

export const DEMO_SOCIAL: CalendarItem[] = [
  mk("social", "s1", "Before/after post", "Instagram + Facebook", "2026-07-01", 16 * 60, { status: "scheduled" }),
  mk("social", "s2", "Customer testimonial", "Instagram", "2026-07-03", 12 * 60, { status: "scheduled" }),
  mk("social", "s3", "Streak-free reel", "Instagram", "2026-06-28", 10 * 60, { status: "scheduled" }),
  mk("social", "s4", "Window-care tips carousel", "Facebook", "2026-07-15", 11 * 60, { status: "scheduled" }),
  mk("social", "s5", "Holiday weekend post", "Instagram + Facebook", "2026-07-04", 9 * 60, { status: "scheduled" }),
];

export const DEMO_CAMPAIGNS: CalendarItem[] = [
  mk("campaign", "cm1", "Summer refresh email", "Email blast, 1,240 contacts", "2026-06-29", 8 * 60, { status: "scheduled" }),
  mk("campaign", "cm2", "Book-now SMS blast", "SMS, 480 contacts", "2026-07-03", 8 * 60, { status: "scheduled" }),
  mk("campaign", "cm3", "Review request", "Email, recent jobs", "2026-07-10", 8 * 60, { status: "scheduled" }),
  mk("campaign", "cm4", "Monthly newsletter", "Email, all contacts", "2026-07-15", 8 * 60, { status: "scheduled" }),
];
