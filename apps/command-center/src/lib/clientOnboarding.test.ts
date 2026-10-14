import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALUES,
  ONBOARDING_FIELDS,
  ONBOARDING_STEPS,
  SENSITIVE_KEYS,
  TIMEZONES,
  buildCreatePayload,
  deriveInitials,
  fieldsForStep,
  forRestore,
  isPristine,
  missingRequired,
  slugify,
  stripSensitive,
  validateStep,
  type DraftValues,
} from "./clientOnboarding";

// A step-1 form with every required field satisfied, so individual tests can
// knock out one field at a time and assert on that field alone.
function step1(overrides: DraftValues = {}): DraftValues {
  return {
    name: "Willis Exteriors",
    niche: "Roofing & Exteriors",
    subdomain: "willis",
    ...overrides,
  };
}

function step4(overrides: DraftValues = {}): DraftValues {
  return {
    contactName: "Jim Willis",
    contactEmail: "jim@willisexteriors.com",
    contactPhone: "313-555-0134",
    timezone: "America/Detroit",
    ...overrides,
  };
}

describe("the field schema", () => {
  it("gives every field a unique key", () => {
    const keys = ONBOARDING_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts every field on a declared step", () => {
    const steps = new Set(ONBOARDING_STEPS.map((s) => s.n));
    for (const field of ONBOARDING_FIELDS) {
      expect(steps.has(field.step)).toBe(true);
    }
  });

  it("leaves no step empty", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(fieldsForStep(step.n).length).toBeGreaterThan(0);
    }
  });

  it("gives every select and radio field its options", () => {
    for (const field of ONBOARDING_FIELDS) {
      if (field.type === "select" || field.type === "radio") {
        expect(field.options?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the three steps in order", () => {
    expect(ONBOARDING_STEPS.map((s) => s.n)).toEqual([1, 2, 3]);
  });

  // The client's own questions live on the funnel now (src/lib/intake.ts).
  // Asking them here too would be two forms drifting apart, and the answers
  // would land in the wrong half of the onboarding record.
  it("asks nothing the client should be answering themselves", () => {
    const keys = ONBOARDING_FIELDS.map((f) => f.key);
    for (const clientKey of ["contactName", "targetZips", "usp", "timezone", "headshotUrl"]) {
      expect(keys).not.toContain(clientKey);
    }
  });

  it("offers America/Detroit, since the first client is in Michigan", () => {
    expect(TIMEZONES.some((t) => t.value === "America/Detroit")).toBe(true);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Willis Exteriors")).toBe("willis-exteriors");
  });

  it("drops punctuation", () => {
    expect(slugify("A&B Roofing!!")).toBe("a-b-roofing");
  });

  it("collapses repeated separators", () => {
    expect(slugify("Foo   ---  Bar")).toBe("foo-bar");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  -Willis-  ")).toBe("willis");
  });

  it("returns an empty string for empty input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("deriveInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(deriveInitials("Willis Exteriors")).toBe("WE");
  });

  it("takes the first two letters of a single word", () => {
    expect(deriveInitials("Willis")).toBe("WI");
  });

  it("ignores words beyond the second", () => {
    expect(deriveInitials("a b c d")).toBe("AB");
  });

  it("returns an empty string for empty input", () => {
    expect(deriveInitials("")).toBe("");
    expect(deriveInitials("   ")).toBe("");
  });
});

describe("missingRequired", () => {
  it("names every unfilled required field on the step", () => {
    const missing = missingRequired(1, {}).map((f) => f.key);
    expect(missing).toContain("name");
    expect(missing).toContain("niche");
    expect(missing).toContain("subdomain");
  });

  it("ignores optional fields", () => {
    const missing = missingRequired(1, {}).map((f) => f.key);
    expect(missing).not.toContain("websiteUrl");
    expect(missing).not.toContain("appName");
  });

  it("treats whitespace as unfilled", () => {
    const missing = missingRequired(1, step1({ name: "   " })).map((f) => f.key);
    expect(missing).toEqual(["name"]);
  });

  it("returns nothing once the step is filled", () => {
    expect(missingRequired(1, step1())).toEqual([]);
    expect(missingRequired(4, step4())).toEqual([]);
  });
});

describe("validateStep", () => {
  it("fails a step with a missing required field", () => {
    const result = validateStep(1, step1({ niche: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors.niche).toBeTruthy();
  });

  it("passes a filled step", () => {
    expect(validateStep(1, step1()).ok).toBe(true);
  });

  it("passes step 3 with nothing filled in, since it is all optional", () => {
    expect(validateStep(3, {}).ok).toBe(true);
  });

  it("rejects an owner email with no password", () => {
    const result = validateStep(3, { ownerEmail: "jim@willis.com" });
    expect(result.ok).toBe(false);
    expect(result.errors.ownerPassword).toBeTruthy();
  });

  it("rejects an owner password with no email", () => {
    const result = validateStep(3, { ownerPassword: "hunter2hunter2" });
    expect(result.ok).toBe(false);
    expect(result.errors.ownerEmail).toBeTruthy();
  });

  it("rejects an owner password under eight characters", () => {
    const result = validateStep(3, {
      ownerEmail: "jim@willis.com",
      ownerPassword: "short",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.ownerPassword).toBeTruthy();
  });

  it("accepts a complete owner login", () => {
    const result = validateStep(3, {
      ownerEmail: "jim@willis.com",
      ownerPassword: "hunter2hunter2",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = validateStep(3, {
      ownerEmail: "jim-at-willis",
      ownerPassword: "hunter2hunter2",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.ownerEmail).toBeTruthy();
  });

  it("rejects a subdomain that is not slug-shaped", () => {
    const result = validateStep(1, step1({ subdomain: "Willis Exteriors!" }));
    expect(result.ok).toBe(false);
    expect(result.errors.subdomain).toBeTruthy();
  });
});

// A draft is only worth saving, and only worth telling the user about, if it
// holds something they actually typed. Without this the wizard writes an empty
// draft on mount and then greets every later visit with "restored an unfinished
// draft" when nothing was ever entered.
describe("isPristine", () => {
  it("treats a form at its defaults as untouched", () => {
    expect(isPristine(DEFAULT_VALUES)).toBe(true);
  });

  it("treats an empty form as untouched", () => {
    expect(isPristine({})).toBe(true);
  });

  it("treats whitespace as untouched", () => {
    expect(isPristine({ ...DEFAULT_VALUES, name: "   " })).toBe(true);
  });

  it("notices a filled field", () => {
    expect(isPristine({ ...DEFAULT_VALUES, name: "Willis Exteriors" })).toBe(false);
  });

  it("notices a changed default", () => {
    expect(isPristine({ ...DEFAULT_VALUES, brandColor: "#000000" })).toBe(false);
  });

  it("notices an edited field", () => {
    expect(isPristine({ ...DEFAULT_VALUES, ghlLocationId: "loc_123" })).toBe(false);
  });

  it("ignores keys that are not onboarding fields", () => {
    expect(isPristine({ ...DEFAULT_VALUES, strayKey: "noise" })).toBe(true);
  });
});

describe("forRestore", () => {
  it("drops the owner email, whose password can never be restored with it", () => {
    const restored = forRestore({ name: "Redford", ownerEmail: "dana@redford.com" });
    expect(restored.ownerEmail).toBeUndefined();
    expect(restored.name).toBe("Redford");
  });

  it("leaves a restored draft able to pass step 3", () => {
    const saved = stripSensitive({
      ownerEmail: "dana@redford.com",
      ownerPassword: "hunter2hunter2",
    });
    // Without forRestore this is the bug: the email comes back alone and the
    // pairing rule blocks the step on every resume.
    expect(validateStep(3, saved).ok).toBe(false);
    expect(validateStep(3, forRestore(saved)).ok).toBe(true);
  });

  it("does not mutate the input", () => {
    const original: DraftValues = { ownerEmail: "dana@redford.com" };
    forRestore(original);
    expect(original.ownerEmail).toBe("dana@redford.com");
  });
});

describe("stripSensitive", () => {
  const filled: DraftValues = {
    name: "Willis Exteriors",
    ownerPassword: "hunter2hunter2",
    ghlToken: "pit-abc123",
    taxId: "12-3456789",
    contactEmail: "jim@willis.com",
  };

  it("removes the password and the GHL token", () => {
    const stripped = stripSensitive(filled);
    expect(stripped.ownerPassword).toBeUndefined();
    expect(stripped.ghlToken).toBeUndefined();
  });

  it("keeps everything else", () => {
    const stripped = stripSensitive(filled);
    expect(stripped.name).toBe("Willis Exteriors");
    expect(stripped.contactEmail).toBe("jim@willis.com");
  });

  it("does not mutate the input", () => {
    stripSensitive(filled);
    expect(filled.ownerPassword).toBe("hunter2hunter2");
  });

  it("strips exactly the keys it declares", () => {
    const all: DraftValues = {};
    for (const field of ONBOARDING_FIELDS) all[field.key] = "x";
    const stripped = stripSensitive(all);
    const removed = Object.keys(all).filter((k) => !(k in stripped));
    expect(removed.sort()).toEqual([...SENSITIVE_KEYS].sort());
  });
});

describe("buildCreatePayload", () => {
  const filled: DraftValues = {
    name: "  Willis Windows  ",
    niche: "Window Cleaning",
    subdomain: "williswindows",
    appName: "Willis Windows",
    brandColor: "#1d6fb8",
    brandInitials: "WW",
    websiteUrl: "https://williswindows.com",
    ownerName: "Dave Willis",
    ownerEmail: "dave@williswindows.com",
    ownerPassword: "hunter2hunter2",
    ghlLocationId: "loc_123",
    ghlToken: "pit-abc123",
    metaAdAccountId: "act_123456789",
  };

  it("sends the shell the API asks for", () => {
    const payload = buildCreatePayload(filled);
    expect(payload.name).toBe("Willis Windows");
    expect(payload.niche).toBe("Window Cleaning");
    // The API calls it slug; the wizard asks for it as the subdomain.
    expect(payload.slug).toBe("williswindows");
    expect(payload.websiteUrl).toBe("https://williswindows.com");
    expect(payload.ownerEmail).toBe("dave@williswindows.com");
    expect(payload.ghlToken).toBe("pit-abc123");
    expect(payload.metaAdAccountId).toBe("act_123456789");
  });

  it("carries every field the form still asks for", () => {
    const every: DraftValues = {};
    for (const field of ONBOARDING_FIELDS) every[field.key] = "x";
    const payload = buildCreatePayload(every) as unknown as Record<string, unknown>;
    for (const field of ONBOARDING_FIELDS) {
      // subdomain travels as slug; everything else keeps its own name.
      const key = field.key === "subdomain" ? "slug" : field.key;
      expect(payload[key], `${field.key} was dropped on the way to the API`).toBe("x");
    }
  });

  it("omits what was never answered instead of sending blanks", () => {
    const payload = buildCreatePayload({ name: "Willis Windows", niche: "", subdomain: "ww" });
    expect(payload.ownerEmail).toBeUndefined();
    expect(payload.ghlLocationId).toBeUndefined();
    // The three the API requires are always present, even when empty, so a
    // missing name is the API's 400 rather than a silently absent key.
    expect(payload.niche).toBe("");
  });

  it("trims what it sends", () => {
    expect(buildCreatePayload({ name: "  Willis  " }).name).toBe("Willis");
  });
});
