import { describe, it, expect } from "vitest";
import { SEED_MAP, firstName, seedOnboardingFields } from "./onboardingSeed";
import { ONBOARDING_FIELDS } from "../../src/lib/onboarding";

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Dave Willis")).toBe("Dave");
    expect(firstName("  Mary  Anne  Willis ")).toBe("Mary");
    expect(firstName("Cher")).toBe("Cher");
    expect(firstName("")).toBe("");
  });
});

describe("the map itself", () => {
  // The provisioner writes only the keys it knows. A typo here would look like
  // a value that saved and did not, so it is a test rather than a comment.
  it("only ever targets keys the provisioner recognises", () => {
    const known = new Set(ONBOARDING_FIELDS.map((f) => f.key));
    const targets = [
      ...Object.values(SEED_MAP).flat(),
      "user_first_name",
      "from_name",
      "notif_from_name",
    ];
    for (const key of targets) expect(known).toContain(key);
  });
});

describe("seedOnboardingFields", () => {
  const answers = {
    name: "Willis Windows",
    contactName: "Dave Willis",
    contactEmail: "dave@williswindows.com",
    contactPhone: "+13135551234",
    // Not seeded anywhere: an intake answer with no GHL counterpart.
    usp: "Streak-free or it is free",
  };

  it("copies the answers that have a GHL counterpart", () => {
    const fields = seedOnboardingFields(answers);
    expect(fields.company_name).toBe("Willis Windows");
    expect(fields.user_full_name).toBe("Dave Willis");
    expect(fields.user_first_name).toBe("Dave");
    expect(fields.company_phone).toBe("+13135551234");
    expect(fields.to_custom_number).toBe("+13135551234");
    expect(fields.to_custom_email).toBe("dave@williswindows.com");
    expect(fields.from_name).toBe("Willis Windows");
  });

  it("leaves everything else alone", () => {
    const fields = seedOnboardingFields(answers);
    expect(fields.usp).toBeUndefined();
    expect(fields.review_google_url).toBeUndefined();
    expect(fields.intro_call_calendar).toBeUndefined();
  });

  it("skips blanks rather than writing empty values", () => {
    const fields = seedOnboardingFields({ name: "  ", contactPhone: "" });
    expect(fields).toEqual({});
  });

  it("ignores non-string answers", () => {
    const fields = seedOnboardingFields({ name: 42, contactName: null, contactPhone: true });
    expect(fields).toEqual({});
  });

  it("never overwrites a value that is already there", () => {
    const fields = seedOnboardingFields(answers, { company_name: "Willis Exteriors" });
    expect(fields.company_name).toBe("Willis Exteriors");
    // The rest still seed around it.
    expect(fields.user_full_name).toBe("Dave Willis");
  });

  it("treats a whitespace-only existing value as empty", () => {
    const fields = seedOnboardingFields(answers, { company_name: "   " });
    expect(fields.company_name).toBe("Willis Windows");
  });

  it("trims what it copies", () => {
    const fields = seedOnboardingFields({ name: "  Willis Windows  " });
    expect(fields.company_name).toBe("Willis Windows");
  });
});
