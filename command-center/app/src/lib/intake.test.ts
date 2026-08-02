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
    addressStreet: "123 Ford Rd",
    addressCity: "Garden City",
    addressState: "MI",
    addressZip: "48135",
    ...overrides,
  };
}

function step3(overrides: IntakeAnswers = {}): IntakeAnswers {
  return {
    loginEmail: "jim@willisexteriors.com",
    // Satisfies the funnel's rule: upper, lower, number, symbol, 12+.
    password: "Roofing-Rules9",
    passwordConfirm: "Roofing-Rules9",
    ...overrides,
  };
}

function step4(overrides: IntakeAnswers = {}): IntakeAnswers {
  return {
    targetZips: "48135, 48150, 48154",
    areaCallout: "Metro Detroit",
    ...overrides,
  };
}

function step5(overrides: IntakeAnswers = {}): IntakeAnswers {
  return { service1: "Paver patios", service2: "Retaining walls", ...overrides };
}

// Everything required, across every input step. The baseline for completeness.
function fullAnswers(): IntakeAnswers {
  return { ...step1(), ...step2(), ...step3(), ...step4(), ...step5() };
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

  it("keeps every question from the source form that still earns its place", () => {
    const keys = new Set(INTAKE_FIELDS.map((f) => f.key));
    const fromSourceForm = [
      "contactName",
      "contactEmail",
      "contactPhone",
      "timezone",
      "taxId",
      "areaCallout",
      "usp",
      "headshotUrl",
      "pastWorkUrl",
      "whySignedUp",
      "notes",
    ];
    for (const key of fromSourceForm) {
      expect(keys.has(key), `${key} is missing from the funnel`).toBe(true);
    }
  });

  // Five questions the form used to ask and no longer does. Asserted by key
  // rather than by count, because each was dropped for its own reason and a
  // reappearance would be someone reinstating it without knowing why it went.
  //
  //   businessAddress / targetAreas - replaced by fields that ask for the parts
  //     we actually use (street/city/state/zip, and zip codes to target).
  //   notifyPreference - leads reach a client by SMS and in the app. There is
  //     no other setting to honour, so there is no question to ask.
  //   calendarAvailability - one free-text box became seven day fields.
  //   leadConnectorInstalled - clients do not need that app.
  it("no longer asks the five questions that were cut", () => {
    const keys = new Set(INTAKE_FIELDS.map((f) => f.key));
    for (const key of [
      "businessAddress",
      "targetAreas",
      "notifyPreference",
      "calendarAvailability",
      "leadConnectorInstalled",
    ]) {
      expect(keys.has(key), `${key} was cut and must stay off the funnel`).toBe(false);
    }
  });

  // A single address box came back as "Garden City" as often as it came back as
  // an address, and A2P registration needs the pieces separately.
  it("asks for the address in parts, and needs all of them but the suite", () => {
    const required = (key: string): boolean =>
      INTAKE_FIELDS.find((f) => f.key === key)?.required ?? false;
    for (const key of ["addressStreet", "addressCity", "addressState", "addressZip"]) {
      expect(required(key), `${key} should be required`).toBe(true);
    }
    expect(required("addressUnit")).toBe(false);
  });

  it("asks for zip codes to target, and will not move on without them", () => {
    const field = INTAKE_FIELDS.find((f) => f.key === "targetZips");
    expect(field?.required).toBe(true);
    expect(field?.label.toLowerCase()).toContain("zip");
  });

  // Every day, in week order, and none of them required: these are the hours a
  // client would LIKE to be booked in, so a blank day is a day off rather than
  // an unfinished form.
  it("asks for hours a day at a time, Monday to Sunday, none required", () => {
    const days = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    const hours = INTAKE_FIELDS.filter((f) => f.key.startsWith("hours"));
    expect(hours.map((f) => f.label)).toEqual(days);
    for (const field of hours) {
      expect(field.required ?? false, `${field.key} must not be required`).toBe(false);
    }
  });

  // One box per service, not one box listing them all: a comma-separated
  // sentence has to be split by hand and the split is a guess.
  it("asks for services one at a time, with room for six", () => {
    const services = INTAKE_FIELDS.filter((f) => f.key.startsWith("service"));
    expect(services).toHaveLength(6);
    expect(services.map((f) => f.label)).toEqual([
      "Service 1",
      "Service 2",
      "Service 3",
      "Service 4",
      "Service 5",
      "Service 6",
    ]);
    for (const field of services) {
      expect(field.type, `${field.key} should be a single text box`).toBe("text");
    }
    // Two required: every business has at least a couple, and nobody has six.
    expect(services.filter((f) => f.required).map((f) => f.key)).toEqual(["service1", "service2"]);
  });

  // The password rule is keyed to "step 3" by number in this file AND in the
  // funnel's own copy, so a step inserted before the login step would silently
  // move it out from under that check.
  it("keeps the login on step 3, which the password rule is keyed to", () => {
    for (const key of ["loginEmail", "password", "passwordConfirm"]) {
      expect(INTAKE_FIELDS.find((f) => f.key === key)?.step, `${key} must stay on step 3`).toBe(3);
    }
  });

  // A contractor who has never shared a Drive folder must still be able to
  // finish. The help says to ask Jake; the schema must not contradict it.
  it("never blocks the form on an asset link", () => {
    for (const key of ["logoUrl", "headshotUrl", "pastWorkUrl"]) {
      expect(INTAKE_FIELDS.find((f) => f.key === key)?.required ?? false).toBe(false);
    }
  });

  // The A2P block. Carriers will not register a business texting number without
  // all four, and collecting them by email after the fact is what held texting
  // up last time. Asserted as a set so removing one quietly is a failing test
  // rather than a client who cannot be registered.
  it("asks for everything A2P brand registration needs", () => {
    const keys = new Set(INTAKE_FIELDS.map((f) => f.key));
    for (const key of ["legalName", "taxId", "entityType", "contactTitle"]) {
      expect(keys.has(key), `${key} is missing from the funnel`).toBe(true);
    }
  });

  // Optional on purpose. A client who does not know their EIN off-hand must
  // still reach the end of the form; the gap is caught by the A2P item on their
  // setup checklist, not by a submit button that will not move.
  it("never blocks the form on a legal detail", () => {
    for (const key of ["legalName", "taxId", "entityType", "contactTitle"]) {
      expect(INTAKE_FIELDS.find((f) => f.key === key)?.required ?? false).toBe(false);
    }
  });

  // The admin record renders help through React, which escapes it. Markup in a
  // shared help string would reach Jake as visible tags, so the link that
  // explains A2P lives only in the funnel's own copy of the schema.
  it("keeps markup out of every help string", () => {
    for (const field of INTAKE_FIELDS) {
      expect(field.help ?? "", `${field.key} help must be plain text`).not.toMatch(/[<>]/);
    }
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
    expect(missingRequired(1, step1()).map((f) => f.key)).not.toContain("websiteUrl");
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

  it("enforces the same password rule as the API", () => {
    const weak = "short7";
    const result = validateStep(3, step3({ password: weak, passwordConfirm: weak }));
    expect(result.ok).toBe(false);
    expect(result.errors.password).toBeTruthy();
  });

  it("accepts a password that satisfies every rule", () => {
    const good = "Roofing-Rules9";
    const result = validateStep(3, step3({ password: good, passwordConfirm: good }));
    expect(result.ok).toBe(true);
  });

  // Each rule on its own, so a change to one is a named failing test rather
  // than "the password test broke".
  it("names the one rule that is broken, and only that one", () => {
    const bad = (pw: string): string | undefined =>
      validateStep(3, step3({ password: pw, passwordConfirm: pw })).errors.password;

    expect(bad("roofing-rules9")).toMatch(/upper and lower/i);
    expect(bad("RoofingRulesNine")).toMatch(/symbol and one number/i);
    expect(bad("Roof-9")).toMatch(/12 characters/i);
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
    expect(completeness({ ...fullAnswers(), websiteUrl: "", usp: "" })).toBe(100);
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
