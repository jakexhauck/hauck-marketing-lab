import { describe, expect, it } from "vitest";
import {
  INTAKE_FIELDS,
  INTAKE_STEPS,
  LAST_INPUT_STEP,
  REVIEW_STEP,
  clientAnswerable,
  completeness,
  fieldsForStep,
  missingRequired,
  validateStep,
  type IntakeAnswers,
} from "./intake";

// Nine fields the client can neither answer nor should ever see. Named here so
// the test fails loudly if one of them ever creeps onto the funnel.
const AGENCY_ONLY = [
  "subdomain",
  "appName",
  "brandColor",
  "brandInitials",
  "wonLabel",
  "valueLabel",
  "ghlLocationId",
  "ghlToken",
  "metaAdAccountId",
  "ga4PropertyId",
  "googlePlaceId",
];

function step1(overrides: IntakeAnswers = {}): IntakeAnswers {
  return { name: "Willis Exteriors", niche: "Roofing & Exteriors", ...overrides };
}

function step2(overrides: IntakeAnswers = {}): IntakeAnswers {
  return {
    contactName: "Jim Willis",
    contactEmail: "jim@willisexteriors.com",
    contactPhone: "313-555-0134",
    timezone: "America/Detroit",
    businessAddress: "123 Ford Rd, Garden City, MI",
    ...overrides,
  };
}

function step3(overrides: IntakeAnswers = {}): IntakeAnswers {
  return {
    loginEmail: "jim@willisexteriors.com",
    password: "correcthorse",
    passwordConfirm: "correcthorse",
    ...overrides,
  };
}

function step4(overrides: IntakeAnswers = {}): IntakeAnswers {
  return {
    targetAreas: "48135, Wayne County, Garden City",
    areaCallout: "Detroit area",
    ...overrides,
  };
}

// Everything required, across every input step. The baseline for completeness.
function fullAnswers(): IntakeAnswers {
  return { ...step1(), ...step2(), ...step3(), ...step4() };
}

describe("the schema itself", () => {
  it("gives every field a unique key", () => {
    const keys = INTAKE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts every field on a real input step", () => {
    for (const field of INTAKE_FIELDS) {
      expect(field.step).toBeGreaterThanOrEqual(1);
      expect(field.step).toBeLessThanOrEqual(LAST_INPUT_STEP);
    }
  });

  it("leaves no input step empty", () => {
    for (const step of INTAKE_STEPS) {
      expect(fieldsForStep(step.n).length).toBeGreaterThan(0);
    }
  });

  it("puts review immediately after the last input step", () => {
    expect(REVIEW_STEP).toBe(LAST_INPUT_STEP + 1);
  });

  it("keeps every agency-only field off the funnel", () => {
    const keys = new Set(INTAKE_FIELDS.map((f) => f.key));
    for (const key of AGENCY_ONLY) {
      expect(clientAnswerable(key), `${key} must not be on the funnel`).toBe(false);
      expect(keys.has(key), `${key} must not be on the funnel`).toBe(false);
    }
  });

  it("keeps all sixteen questions from the source form", () => {
    const keys = new Set(INTAKE_FIELDS.map((f) => f.key));
    const fromSourceForm = [
      "contactName",
      "contactEmail",
      "contactPhone",
      "timezone",
      "businessAddress",
      "taxId",
      "targetAreas",
      "areaCallout",
      "notifyPreference",
      "calendarAvailability",
      "leadConnectorInstalled",
      "usp",
      "headshotUrl",
      "pastWorkUrl",
      "whySignedUp",
      "notes",
    ];
    expect(fromSourceForm).toHaveLength(16);
    for (const key of fromSourceForm) {
      expect(keys.has(key), `${key} is missing from the funnel`).toBe(true);
    }
  });

  it("offers Both as a notification preference, not just text and email", () => {
    const field = INTAKE_FIELDS.find((f) => f.key === "notifyPreference");
    expect(field?.options?.map((o) => o.value)).toEqual(["text", "email", "both"]);
  });
});

describe("missingRequired", () => {
  it("names every unfilled required field on the step", () => {
    const missing = missingRequired(1, {}).map((f) => f.key);
    expect(missing).toContain("name");
    expect(missing).toContain("niche");
  });

  it("names nothing when the step is satisfied", () => {
    expect(missingRequired(1, step1())).toEqual([]);
  });

  it("treats whitespace as empty", () => {
    const missing = missingRequired(1, step1({ name: "   " })).map((f) => f.key);
    expect(missing).toContain("name");
  });

  it("never treats an optional field as missing", () => {
    expect(missingRequired(2, step2()).map((f) => f.key)).not.toContain("taxId");
  });
});

describe("validateStep", () => {
  it("passes a satisfied step", () => {
    expect(validateStep(1, step1()).ok).toBe(true);
  });

  it("blocks on a missing required field", () => {
    const result = validateStep(1, step1({ niche: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.niche).toBeTruthy();
  });

  it("rejects a malformed email", () => {
    const result = validateStep(2, step2({ contactEmail: "jim-at-willis" }));
    expect(result.ok).toBe(false);
    expect(result.errors.contactEmail).toBeTruthy();
  });

  it("accepts an ordinary email", () => {
    expect(validateStep(2, step2()).ok).toBe(true);
  });

  it("rejects a url field that is not a url", () => {
    const result = validateStep(1, step1({ websiteUrl: "willisexteriors" }));
    expect(result.ok).toBe(false);
    expect(result.errors.websiteUrl).toBeTruthy();
  });

  it("accepts a well formed url", () => {
    expect(validateStep(1, step1({ websiteUrl: "https://willisexteriors.com" })).ok).toBe(true);
  });

  it("leaves an empty optional url alone", () => {
    expect(validateStep(1, step1({ websiteUrl: "" })).ok).toBe(true);
  });
});

describe("step 3, the login they choose", () => {
  it("passes a matched pair", () => {
    expect(validateStep(3, step3()).ok).toBe(true);
  });

  it("blocks when the confirmation does not match", () => {
    const result = validateStep(3, step3({ passwordConfirm: "correcthorsE" }));
    expect(result.ok).toBe(false);
    expect(result.errors.passwordConfirm).toBeTruthy();
  });

  it("enforces the same eight character floor as the API", () => {
    const result = validateStep(3, step3({ password: "short7", passwordConfirm: "short7" }));
    expect(result.ok).toBe(false);
    expect(result.errors.password).toBeTruthy();
  });

  it("accepts exactly eight characters", () => {
    const result = validateStep(3, step3({ password: "eightchr", passwordConfirm: "eightchr" }));
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed login email", () => {
    const result = validateStep(3, step3({ loginEmail: "not-an-email" }));
    expect(result.ok).toBe(false);
    expect(result.errors.loginEmail).toBeTruthy();
  });

  it("requires the login email", () => {
    const result = validateStep(3, step3({ loginEmail: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.loginEmail).toBeTruthy();
  });
});

describe("completeness", () => {
  it("is zero for an untouched form", () => {
    expect(completeness({})).toBe(0);
  });

  it("is one hundred when every required field is answered", () => {
    expect(completeness(fullAnswers())).toBe(100);
  });

  it("stays at one hundred when optional fields are left blank", () => {
    expect(completeness({ ...fullAnswers(), taxId: "", usp: "" })).toBe(100);
  });

  it("rises as required fields are filled", () => {
    const partial = completeness(step1());
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(100);
  });

  it("never counts a whitespace-only answer", () => {
    const blank = Object.fromEntries(
      Object.keys(fullAnswers()).map((k) => [k, "   "]),
    ) as IntakeAnswers;
    expect(completeness(blank)).toBe(0);
  });

  it("reports a whole number", () => {
    expect(Number.isInteger(completeness(step1()))).toBe(true);
  });
});
