import { describe, expect, it } from "vitest";
import {
  INTAKE_FIELDS,
  INTAKE_STEPS,
  JOB_SLOTS,
  LAST_INPUT_STEP,
  REVIEW_STEP,
  SERVICE_SLOTS,
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
    ...overrides,
  };
}

function targeting(overrides: IntakeAnswers = {}): IntakeAnswers {
  return {
    targetZips: "48135, 48150, 48154",
    areaCallout: "Metro Detroit",
    ...overrides,
  };
}

function services(overrides: IntakeAnswers = {}): IntakeAnswers {
  return { service1: "Paver patios", ...overrides };
}

function numbers(overrides: IntakeAnswers = {}): IntakeAnswers {
  return { jobType1: "Paver patio", jobTicket1: "$18,000", jobMargin1: "35%", closeRate: "4", ...overrides };
}

// Everything required, across every input step. The baseline for completeness.
// Working hours, story and assets have nothing required.
function fullAnswers(): IntakeAnswers {
  return { ...step1(), ...step2(), ...targeting(), ...services(), ...numbers() };
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

  // Jake's list (2026-10-27), heading by heading, and nothing else.
  it("asks exactly Jake's questions, under his headings, in his order", () => {
    const jobs = Array.from({ length: JOB_SLOTS }, (_, i) => [
      `Job type ${i + 1}`,
      `Job ${i + 1} average ticket`,
      `Job ${i + 1} margin`,
    ]).flat();
    expect(INTAKE_STEPS.map((s) => [s.label, fieldsForStep(s.n).map((f) => f.label)])).toEqual([
      ["Business", ["Business name", "What do you do?", "Website"]],
      ["Contact", ["Owner name", "Email", "Phone", "Timezone"]],
      ["Targeting", ["Zip codes", "Area call-out"]],
      ["Working hours", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]],
      ["Services", ["Service 1", "Service 2", "Service 3", "Service 4", "Service 5", "Service 6"]],
      ["Numbers", [...jobs, "Estimated close rate"]],
      [
        "Story",
        ["Local competitors", "Past offers", "What makes your company unique?", "Why did you sign up?", "Anything else?"],
      ],
      ["Assets", ["Logo", "Headshot", "Past work photos"]],
    ]);
  });

  // No sub-text under a heading (Jake's rule). Assets is the exception he
  // asked for: a client without their photos to hand should send the form
  // anyway rather than stall on it.
  it("puts no line under any step heading except Assets, which points to the onboarding call", () => {
    for (const step of INTAKE_STEPS.filter((s) => s.key !== "assets")) {
      expect(step.blurb, `${step.label} should have no sub-text`).toBe("");
    }
    expect(INTAKE_STEPS.find((s) => s.key === "assets")?.blurb).toMatch(/submit the form.*onboarding call/i);
  });

  it("keeps every question from the source form that still earns its place", () => {
    const keys = new Set(INTAKE_FIELDS.map((f) => f.key));
    const fromSourceForm = [
      "contactName",
      "contactEmail",
      "contactPhone",
      "timezone",
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
  //   bestCustomer - not on Jake's 2026-10-27 list of exact questions.
  //   address parts - Jake, 2026-10-27: "we dont need that".
  it("no longer asks the questions that were cut", () => {
    const keys = new Set(INTAKE_FIELDS.map((f) => f.key));
    for (const key of [
      "businessAddress",
      "targetAreas",
      "notifyPreference",
      "calendarAvailability",
      "leadConnectorInstalled",
      "bestCustomer",
      "addressStreet",
      "addressUnit",
      "addressCity",
      "addressState",
      "addressZip",
    ]) {
      expect(keys.has(key), `${key} was cut and must stay off the funnel`).toBe(false);
    }
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
  // sentence has to be split by hand and the split is a guess. Only the first
  // is required; the funnel opens the rest one at a time ("Add another
  // service"), up to SERVICE_SLOTS.
  it("asks for services one at a time, with room for six, needing only the first", () => {
    expect(SERVICE_SLOTS).toBe(6);
    const services = INTAKE_FIELDS.filter((f) => f.key.startsWith("service"));
    expect(services).toHaveLength(SERVICE_SLOTS);
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
    expect(services.filter((f) => f.required).map((f) => f.key)).toEqual(["service1"]);
  });

  // One row per job: what it is, its average ticket and the margin on it. The
  // first row is required because the KPI targets are built from it; the
  // funnel opens the rest one at a time.
  it("asks for each job type with its average ticket and margin, room for five", () => {
    expect(JOB_SLOTS).toBe(5);
    const jobs = INTAKE_FIELDS.filter((f) => /^job(Type|Ticket|Margin)\d$/.test(f.key));
    expect(jobs.map((f) => f.key)).toEqual(
      Array.from({ length: JOB_SLOTS }, (_, i) => [`jobType${i + 1}`, `jobTicket${i + 1}`, `jobMargin${i + 1}`]).flat(),
    );
    const numbersStep = INTAKE_STEPS.find((s) => s.key === "numbers")?.n;
    for (const field of jobs) {
      expect(field.step, `${field.key} belongs on the numbers step`).toBe(numbersStep);
    }
    expect(jobs.filter((f) => f.required).map((f) => f.key)).toEqual(["jobType1", "jobTicket1", "jobMargin1"]);
  });

  it("asks their estimated close rate, as a pick from 0 to 10 out of 10", () => {
    const field = INTAKE_FIELDS.find((f) => f.key === "closeRate");
    expect(field?.required).toBe(true);
    expect(field?.step).toBe(INTAKE_STEPS.find((s) => s.key === "numbers")?.n);
    expect(field?.options?.map((o) => o.value)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(field?.options?.[4].label).toBe("4 out of 10");
  });

  // Not every client has run an offer or can name their competitors, and a box
  // they cannot fill stalls the form. So nothing on the story step is required.
  it("never blocks the form on the story step", () => {
    const story = INTAKE_STEPS.find((s) => s.key === "story")!;
    expect(fieldsForStep(story.n).map((f) => f.key)).toEqual(
      expect.arrayContaining(["competitors", "pastOffers", "usp", "whySignedUp", "notes"]),
    );
    expect(missingRequired(story.n, {})).toEqual([]);
  });

  // Clients do not choose a password (Jake, 2026-10-27): one is made for them
  // when they send the form, and they sign in with the Email on Contact.
  it("never asks the client for a password or a separate login email", () => {
    for (const key of ["loginEmail", "password", "passwordConfirm"]) {
      expect(clientAnswerable(key), `${key} must not be on the funnel`).toBe(false);
    }
    expect(INTAKE_FIELDS.some((f) => f.type === "password")).toBe(false);
  });

  // A contractor who has never shared a Drive folder must still be able to
  // finish. The help says to ask Jake; the schema must not contradict it.
  it("never blocks the form on an asset link", () => {
    for (const key of ["logoUrl", "headshotUrl", "pastWorkUrl"]) {
      expect(INTAKE_FIELDS.find((f) => f.key === key)?.required ?? false).toBe(false);
    }
  });

  // The admin record renders help through React, which escapes it. Markup in a
  // shared help string would reach Jake as visible tags, so the link that
  // explains a field lives only in the funnel's own copy of the schema.
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
