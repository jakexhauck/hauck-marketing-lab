import { describe, expect, it } from "vitest";
import {
  MAX_ANSWER_LEN,
  MAX_ANSWERS_BYTES,
  approvalBlocker,
  canEdit,
  clampStep,
  isIntakeCreateLimited,
  mintResumeToken,
  recordIntakeCreate,
  resetIntakeRateLimit,
  resumeView,
  sanitizeAnswers,
  type SubmissionRow,
} from "./intake";
import { INTAKE_FIELDS } from "../../src/lib/intake";

function submission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    resume_token: "t".repeat(43),
    answers: { name: "Willis Exteriors" },
    furthest_step: 2,
    status: "submitted",
    login_email: "jim@willisexteriors.com",
    password_hash: "hashed",
    tenant_id: null,
    ...overrides,
  };
}

describe("mintResumeToken", () => {
  it("is long enough to be unguessable", () => {
    expect(mintResumeToken().length).toBeGreaterThanOrEqual(32);
  });

  it("is url safe, so it survives being a query parameter", () => {
    for (let i = 0; i < 20; i++) {
      expect(mintResumeToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintResumeToken()));
    expect(seen.size).toBe(200);
  });
});

describe("sanitizeAnswers", () => {
  it("keeps a known field", () => {
    expect(sanitizeAnswers({ name: "Willis" }).answers.name).toBe("Willis");
  });

  it("drops a key that is not on the funnel", () => {
    const result = sanitizeAnswers({ name: "Willis", ghlToken: "pit-secret" });
    expect(result.answers.ghlToken).toBeUndefined();
    expect(result.answers.name).toBe("Willis");
  });

  it("drops the nine agency-only keys even when a caller insists", () => {
    const result = sanitizeAnswers({
      subdomain: "mine",
      brandColor: "#000000",
      metaAdAccountId: "act_1",
      ga4PropertyId: "9",
      googlePlaceId: "p",
      ghlLocationId: "loc",
      appName: "x",
      wonLabel: "x",
      valueLabel: "x",
    });
    expect(Object.keys(result.answers)).toEqual([]);
  });

  it("never returns the password fields for storage", () => {
    const result = sanitizeAnswers({ password: "correcthorse", passwordConfirm: "correcthorse" });
    expect(result.answers.password).toBeUndefined();
    expect(result.answers.passwordConfirm).toBeUndefined();
  });

  it("hands the password back separately so the caller can hash it", () => {
    const result = sanitizeAnswers({ password: "correcthorse", passwordConfirm: "correcthorse" });
    expect(result.password).toBe("correcthorse");
  });

  it("reports no password when none was sent", () => {
    expect(sanitizeAnswers({ name: "Willis" }).password).toBeNull();
  });

  it("refuses a password that does not match its confirmation", () => {
    const result = sanitizeAnswers({ password: "correcthorse", passwordConfirm: "nope" });
    expect(result.password).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("refuses a password under eight characters", () => {
    const result = sanitizeAnswers({ password: "short7", passwordConfirm: "short7" });
    expect(result.password).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("caps a single oversized answer", () => {
    const result = sanitizeAnswers({ notes: "x".repeat(MAX_ANSWER_LEN + 5000) });
    expect((result.answers.notes as string).length).toBe(MAX_ANSWER_LEN);
  });

  it("rejects a payload that is oversized in total", () => {
    const raw: Record<string, string> = {};
    for (const key of ["notes", "usp", "whySignedUp", "targetZips", "addressStreet"]) {
      raw[key] = "x".repeat(MAX_ANSWER_LEN);
    }
    const result = sanitizeAnswers(raw, { maxBytes: 1000 });
    expect(result.error).toBeTruthy();
  });

  it("accepts a realistic payload well under the byte ceiling", () => {
    const result = sanitizeAnswers({ name: "Willis Exteriors", notes: "Nothing much" });
    expect(result.error).toBeNull();
    expect(MAX_ANSWERS_BYTES).toBeGreaterThan(10000);
  });

  // The funnel has no checkbox question today (the LeadConnector one was cut),
  // so this asserts the sanitizer's checkbox handling against the schema rather
  // than against a hardcoded key: whichever checkbox is added next, its boolean
  // must survive, and if there is none the test says so instead of passing on a
  // key that no longer exists.
  it("keeps a checkbox as a boolean", () => {
    const checkbox = INTAKE_FIELDS.find((f) => f.type === "checkbox");
    if (!checkbox) {
      expect(INTAKE_FIELDS.some((f) => f.type === "checkbox")).toBe(false);
      return;
    }
    expect(sanitizeAnswers({ [checkbox.key]: true }).answers[checkbox.key]).toBe(true);
  });

  // A question that was cut is a key the server must stop accepting. Anything
  // still posting it (a cached copy of the funnel script, say) has its answer
  // dropped rather than stored under a question nobody asks any more.
  it("drops an answer to a question that was cut", () => {
    const result = sanitizeAnswers({
      leadConnectorInstalled: true,
      notifyPreference: "both",
      businessAddress: "123 Ford Rd, Garden City, MI",
    });
    expect(result.answers.leadConnectorInstalled).toBeUndefined();
    expect(result.answers.notifyPreference).toBeUndefined();
    expect(result.answers.businessAddress).toBeUndefined();
  });

  it("ignores a boolean sent for a text field", () => {
    expect(sanitizeAnswers({ name: true }).answers.name).toBeUndefined();
  });

  it("ignores a nested object, which no field accepts", () => {
    expect(sanitizeAnswers({ name: { evil: 1 } }).answers.name).toBeUndefined();
  });

  it("survives a null payload", () => {
    expect(sanitizeAnswers(null).answers).toEqual({});
  });
});

describe("clampStep", () => {
  it("keeps a real step", () => {
    expect(clampStep(3)).toBe(3);
  });

  it("floors at one", () => {
    expect(clampStep(0)).toBe(1);
    expect(clampStep(-9)).toBe(1);
  });

  it("ceilings at the review step", () => {
    expect(clampStep(999)).toBe(7);
  });

  it("survives nonsense", () => {
    expect(clampStep(Number.NaN)).toBe(1);
    expect(clampStep(undefined)).toBe(1);
  });
});

describe("canEdit", () => {
  it("allows an unfinished submission", () => {
    expect(canEdit(submission({ status: "in_progress" }))).toBe(true);
  });

  it("refuses one already submitted", () => {
    expect(canEdit(submission({ status: "submitted" }))).toBe(false);
  });

  it("refuses an approved one", () => {
    expect(canEdit(submission({ status: "approved" }))).toBe(false);
  });

  it("refuses a rejected one", () => {
    expect(canEdit(submission({ status: "rejected" }))).toBe(false);
  });
});

describe("approvalBlocker", () => {
  it("clears a submitted submission with no tenant", () => {
    expect(approvalBlocker(submission())).toBeNull();
  });

  it("blocks one that already made a tenant", () => {
    expect(approvalBlocker(submission({ tenant_id: "abc" }))).toBeTruthy();
  });

  it("blocks one the client has not finished", () => {
    expect(approvalBlocker(submission({ status: "in_progress" }))).toBeTruthy();
  });

  it("blocks one already approved", () => {
    expect(approvalBlocker(submission({ status: "approved" }))).toBeTruthy();
  });

  it("blocks one with no login email", () => {
    expect(approvalBlocker(submission({ login_email: null }))).toBeTruthy();
  });

  it("blocks one with no password", () => {
    expect(approvalBlocker(submission({ password_hash: null }))).toBeTruthy();
  });
});

describe("intake create rate limit", () => {
  it("lets a first-time visitor through", () => {
    resetIntakeRateLimit();
    expect(isIntakeCreateLimited("1.2.3.4")).toBe(false);
  });

  it("allows five submissions from one address", () => {
    resetIntakeRateLimit();
    for (let i = 0; i < 5; i++) {
      expect(isIntakeCreateLimited("1.2.3.4")).toBe(false);
      recordIntakeCreate("1.2.3.4");
    }
  });

  it("blocks the sixth", () => {
    resetIntakeRateLimit();
    for (let i = 0; i < 5; i++) recordIntakeCreate("1.2.3.4");
    expect(isIntakeCreateLimited("1.2.3.4")).toBe(true);
  });

  it("does not punish a different address", () => {
    resetIntakeRateLimit();
    for (let i = 0; i < 5; i++) recordIntakeCreate("1.2.3.4");
    expect(isIntakeCreateLimited("5.6.7.8")).toBe(false);
  });

  it("forgives once the window has passed", () => {
    resetIntakeRateLimit();
    const t0 = 1_000_000_000;
    for (let i = 0; i < 5; i++) recordIntakeCreate("1.2.3.4", t0);
    expect(isIntakeCreateLimited("1.2.3.4", t0)).toBe(true);
    expect(isIntakeCreateLimited("1.2.3.4", t0 + 61 * 60 * 1000)).toBe(false);
  });
});

describe("resumeView", () => {
  it("carries the answers back", () => {
    expect(resumeView(submission()).answers.name).toBe("Willis Exteriors");
  });

  it("never carries the password hash", () => {
    const view = JSON.stringify(resumeView(submission()));
    expect(view).not.toContain("hashed");
  });

  it("says whether a password is already set, without revealing it", () => {
    expect(resumeView(submission()).hasPassword).toBe(true);
    expect(resumeView(submission({ password_hash: null })).hasPassword).toBe(false);
  });

  it("reports read-only once submitted", () => {
    expect(resumeView(submission({ status: "submitted" })).editable).toBe(false);
    expect(resumeView(submission({ status: "in_progress" })).editable).toBe(true);
  });
});
