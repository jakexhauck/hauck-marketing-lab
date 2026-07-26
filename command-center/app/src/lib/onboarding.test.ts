import { describe, it, expect } from "vitest";
import {
  CHECKLIST_TASKS,
  INTAKE_KEYS,
  ONBOARDING_FIELDS,
  buildProvisionPlan,
  checklistPhases,
  checklistProgress,
  intakeAnswered,
  intakeGroups,
  onboardingStage,
  summarizeReadiness,
} from "./onboarding";

const CVS = [
  { id: "cv1", name: "Company Name", value: "" },
  { id: "cv2", name: "From Email", value: "" },
  { id: "cv3", name: "Location API Token", value: "" },
];

describe("buildProvisionPlan", () => {
  it("maps entered fields to custom-value ids by name", () => {
    const plan = buildProvisionPlan(
      { company_name: "Willis Windows", from_email: "a@b.com" },
      CVS,
      "pit-xyz",
    );
    expect(plan.writes).toEqual(
      expect.arrayContaining([
        { id: "cv1", name: "Company Name", value: "Willis Windows" },
        { id: "cv2", name: "From Email", value: "a@b.com" },
      ]),
    );
  });

  it("always writes the token into the Location API Token custom value", () => {
    const plan = buildProvisionPlan({}, CVS, "pit-xyz");
    expect(plan.writes).toContainEqual({ id: "cv3", name: "Location API Token", value: "pit-xyz" });
  });

  it("reports custom values missing from the subaccount as notFound", () => {
    const plan = buildProvisionPlan({ company_phone: "555" }, CVS, "pit-xyz");
    expect(plan.notFound).toContain("Company Phone Number");
  });

  it("skips blank fields (does not overwrite with empty)", () => {
    const plan = buildProvisionPlan({ company_name: "" }, CVS, "pit-xyz");
    expect(plan.writes.find((w) => w.name === "Company Name")).toBeUndefined();
  });
});

describe("checklistPhases", () => {
  it("groups every task into phases without losing or duplicating one", () => {
    const phases = checklistPhases();
    const flat = phases.flatMap((p) => p.tasks);
    expect(flat).toHaveLength(CHECKLIST_TASKS.length);
    expect(flat.map((t) => t.key)).toEqual(CHECKLIST_TASKS.map((t) => t.key));
  });

  it("keeps each phase name once, in first-seen order", () => {
    const names = checklistPhases().map((p) => p.phase);
    expect(names).toEqual(["GHL Setup", "Connections", "Go Live"]);
  });
});

describe("checklistProgress", () => {
  it("counts nothing when no state is saved", () => {
    expect(checklistProgress([])).toEqual({
      done: 0,
      total: CHECKLIST_TASKS.length,
      pct: 0,
    });
  });

  it("counts only tasks marked done", () => {
    const progress = checklistProgress([
      { taskKey: "phone", done: true },
      { taskKey: "smoke-test", done: false },
    ]);
    expect(progress.done).toBe(1);
  });

  it("ignores saved rows for tasks that are no longer shipped", () => {
    const progress = checklistProgress([{ taskKey: "retired-task", done: true }]);
    expect(progress.done).toBe(0);
  });

  it("reports 100% when every task is done", () => {
    const all = CHECKLIST_TASKS.map((t) => ({ taskKey: t.key, done: true }));
    expect(checklistProgress(all).pct).toBe(100);
  });
});

describe("intake", () => {
  it("groups the client-answered wizard steps only", () => {
    const groups = intakeGroups();
    expect(groups.map((g) => g.key)).toEqual(["contact", "targeting", "story"]);
    expect(groups.every((g) => g.fields.length > 0)).toBe(true);
  });

  it("exposes every intake field key and no shell keys", () => {
    expect(INTAKE_KEYS).toContain("contactName");
    expect(INTAKE_KEYS).toContain("targetAreas");
    expect(INTAKE_KEYS).not.toContain("subdomain");
  });

  it("counts answered questions, treating whitespace as blank", () => {
    expect(intakeAnswered({ contactName: "Jim", contactEmail: "  " })).toBe(1);
  });
});

describe("onboardingStage", () => {
  it("reads as not started before any task is ticked", () => {
    expect(onboardingStage("draft", { done: 0, total: 9, pct: 0 })).toBe("Not started");
  });

  it("reads as complete only when every task is done", () => {
    expect(onboardingStage("draft", { done: 9, total: 9, pct: 100 })).toBe(
      "Onboarding complete",
    );
  });

  it("distinguishes a provisioned client mid-setup", () => {
    expect(onboardingStage("provisioned", { done: 3, total: 9, pct: 33 })).toBe(
      "Provisioned, finishing setup",
    );
  });
});

describe("summarizeReadiness", () => {
  it("fails the token check when token is invalid", () => {
    const checks = summarizeReadiness({ fields: {}, customValues: [], calendarIds: [], tokenValid: false });
    expect(checks.find((c) => c.key === "token")?.ok).toBe(false);
  });

  it("passes custom-values check only when all mapped values are non-empty in GHL", () => {
    const filled = ONBOARDING_FIELDS.filter((f) => f.customValue).map((f) => ({
      id: f.key, name: f.customValue as string, value: "x",
    }));
    const checks = summarizeReadiness({ fields: {}, customValues: filled, calendarIds: ["c"], tokenValid: true });
    expect(checks.find((c) => c.key === "custom_values")?.ok).toBe(true);
  });
});
