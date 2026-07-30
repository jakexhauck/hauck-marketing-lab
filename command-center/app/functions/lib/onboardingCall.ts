import type { Env } from "./env";

// The onboarding call: which calendar it lands on, and what a booking is called.
//
// One calendar, on the agency's own GoHighLevel account. The client can book it
// themselves at step 2 of the intake funnel, and Jake can book it for them from
// the Add a client page. Both land in the same place, which is the point: the
// call exists once, however it got there.

/**
 * The calendar id, overridable but not required.
 *
 * The default is the calendar the funnel's own booking page already embeds
 * (Client Onboarding Funnel/02-book-your-call.html), so the two cannot drift by
 * omission: with nothing configured they are the same calendar. The env var is
 * there for the day that calendar is replaced, so swapping it is a settings
 * change rather than a code change in two files.
 */
export const DEFAULT_ONBOARDING_CALENDAR_ID = "NK53JD0np0dfOaRpmUWh";

export function onboardingCalendarId(env: Env): string {
  return (env.ONBOARDING_CALENDAR_ID ?? "").trim() || DEFAULT_ONBOARDING_CALENDAR_ID;
}

/** What the appointment is called in GHL, so it reads as itself in the calendar. */
export function onboardingCallTitle(businessName: string, contactName: string): string {
  const business = businessName.trim();
  const person = contactName.trim();
  if (business && person) return `Onboarding call - ${business} (${person})`;
  if (business) return `Onboarding call - ${business}`;
  if (person) return `Onboarding call - ${person}`;
  return "Onboarding call";
}

export interface BookCallInput {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  startTime: string;
  endTime: string;
}

export interface BookCallProblem {
  field: "contactName" | "email" | "phone" | "startTime" | "endTime";
  message: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What is wrong with this booking, or [] when nothing is.
 *
 * A name and one way to reach them is the floor: GHL sends the reminders for
 * this call, and it cannot send them to nobody. Which of email or phone is
 * present is left open, because the answer differs by client and either works.
 */
export function bookingProblems(input: Partial<BookCallInput>): BookCallProblem[] {
  const problems: BookCallProblem[] = [];
  const name = (input.contactName ?? "").trim();
  const email = (input.email ?? "").trim();
  const phone = (input.phone ?? "").trim();

  if (!name) problems.push({ field: "contactName", message: "Who is the call with?" });
  if (!email && !phone) {
    problems.push({
      field: "email",
      message: "An email or a phone number, so they get the reminders",
    });
  }
  if (email && !EMAIL.test(email)) {
    problems.push({ field: "email", message: "That does not look like an email address" });
  }
  if (!ISO.test(input.startTime ?? "")) {
    problems.push({ field: "startTime", message: "Pick a time" });
  }
  if (!ISO.test(input.endTime ?? "")) {
    problems.push({ field: "endTime", message: "Pick a time" });
  }
  return problems;
}
