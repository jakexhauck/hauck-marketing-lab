import { describe, expect, it } from "vitest";
import { closeAnswers, onboardingLink } from "./closeClient";

describe("closeAnswers", () => {
  it("prefills the business, the person and how to reach them", () => {
    expect(
      closeAnswers(
        { fullName: " Bill Willis ", businessName: "Willis Windows" },
        { email: "bill@willis.com", phone: "3135550101" },
      ),
    ).toEqual({
      name: "Willis Windows",
      contactName: "Bill Willis",
      contactEmail: "bill@willis.com",
      contactPhone: "3135550101",
    });
  });

  it("leaves blanks out so the form asks for them", () => {
    expect(closeAnswers({ fullName: "", businessName: "AAG" }, { email: null, phone: "" })).toEqual({ name: "AAG" });
  });
});

describe("onboardingLink", () => {
  it("adds the resume token the funnel reads as ?r=", () => {
    expect(onboardingLink("https://hauckmarketing.com/onboarding-form", "abc_-1")).toBe(
      "https://hauckmarketing.com/onboarding-form?r=abc_-1",
    );
  });

  it("keeps any query the form link already has", () => {
    expect(onboardingLink("https://hauckmarketing.com/onboarding-form?src=x", "t")).toBe(
      "https://hauckmarketing.com/onboarding-form?src=x&r=t",
    );
  });

  it("is null while the form is not published", () => {
    expect(onboardingLink(null, "t")).toBeNull();
  });
});
