import { describe, it, expect } from "vitest";
import {
  ONBOARDING_FIELDS,
  buildProvisionPlan,
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
