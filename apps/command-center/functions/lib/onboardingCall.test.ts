import { describe, it, expect } from "vitest";
import type { Env } from "./env";
import {
  DEFAULT_ONBOARDING_CALENDAR_ID,
  bookingProblems,
  onboardingCalendarId,
  onboardingCallTitle,
} from "./onboardingCall";

describe("onboardingCalendarId", () => {
  it("falls back to the calendar the funnel already books", () => {
    expect(onboardingCalendarId({} as unknown as Env)).toBe(DEFAULT_ONBOARDING_CALENDAR_ID);
    expect(onboardingCalendarId({ ONBOARDING_CALENDAR_ID: "  " } as unknown as Env)).toBe(
      DEFAULT_ONBOARDING_CALENDAR_ID,
    );
  });

  it("uses the configured calendar when there is one", () => {
    expect(onboardingCalendarId({ ONBOARDING_CALENDAR_ID: "cal_9" } as unknown as Env)).toBe("cal_9");
  });
});

describe("onboardingCallTitle", () => {
  it("names the business and the person", () => {
    expect(onboardingCallTitle("Willis Windows", "Dave Willis")).toBe(
      "Onboarding call - Willis Windows (Dave Willis)",
    );
  });

  it("copes with only one of them", () => {
    expect(onboardingCallTitle("Willis Windows", "")).toBe("Onboarding call - Willis Windows");
    expect(onboardingCallTitle("", "Dave Willis")).toBe("Onboarding call - Dave Willis");
    expect(onboardingCallTitle("  ", "  ")).toBe("Onboarding call");
  });
});

describe("bookingProblems", () => {
  const good = {
    businessName: "Willis Windows",
    contactName: "Dave Willis",
    email: "dave@williswindows.com",
    phone: "",
    startTime: "2026-08-04T15:00:00Z",
    endTime: "2026-08-04T15:30:00Z",
  };

  it("passes a complete booking", () => {
    expect(bookingProblems(good)).toEqual([]);
  });

  it("needs someone to call", () => {
    expect(bookingProblems({ ...good, contactName: " " }).map((p) => p.field)).toContain(
      "contactName",
    );
  });

  // GHL sends the reminders for this call and cannot send them to nobody.
  it("needs one way to reach them, and does not mind which", () => {
    expect(bookingProblems({ ...good, email: "", phone: "" }).map((p) => p.field)).toContain(
      "email",
    );
    expect(bookingProblems({ ...good, email: "", phone: "+13135551234" })).toEqual([]);
  });

  it("catches a mistyped email", () => {
    expect(bookingProblems({ ...good, email: "dave-at-willis" }).map((p) => p.field)).toContain(
      "email",
    );
  });

  it("needs a real time on both ends", () => {
    expect(bookingProblems({ ...good, startTime: "" }).map((p) => p.field)).toContain("startTime");
    expect(bookingProblems({ ...good, endTime: "soon" }).map((p) => p.field)).toContain("endTime");
  });
});
