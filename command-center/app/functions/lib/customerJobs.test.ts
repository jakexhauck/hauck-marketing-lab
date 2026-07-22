import { describe, it, expect } from "vitest";
import { validateJobFields } from "./customerJobs";

const TODAY = new Date("2026-07-16T12:00:00.000Z");

const good = { description: "Gutter clean", valueCents: 120_000, completedOn: "2026-06-01" };

describe("validateJobFields", () => {
  it("accepts a real job", () => {
    expect(validateJobFields(good, TODAY)).toBeNull();
  });

  it("requires a description", () => {
    expect(validateJobFields({ ...good, description: "  " }, TODAY)).toBe("description_required");
  });

  it("allows a zero-value job: a warranty callback is real work", () => {
    expect(validateJobFields({ ...good, valueCents: 0 }, TODAY)).toBeNull();
  });

  it("rejects a negative value", () => {
    expect(validateJobFields({ ...good, valueCents: -5 }, TODAY)).toBe("negative_value");
  });

  it("rejects a non-numeric value", () => {
    expect(validateJobFields({ ...good, valueCents: Number.NaN }, TODAY)).toBe("negative_value");
  });

  it("rejects a completion date in the future", () => {
    expect(validateJobFields({ ...good, completedOn: "2026-07-17" }, TODAY)).toBe("future_date");
  });

  it("accepts a job completed today", () => {
    expect(validateJobFields({ ...good, completedOn: "2026-07-16" }, TODAY)).toBeNull();
  });

  it("accepts a backfilled job from years ago", () => {
    expect(validateJobFields({ ...good, completedOn: "2023-02-11" }, TODAY)).toBeNull();
  });

  it("rejects a malformed date", () => {
    expect(validateJobFields({ ...good, completedOn: "01/05/2026" }, TODAY)).toBe("invalid_date");
    expect(validateJobFields({ ...good, completedOn: "" }, TODAY)).toBe("invalid_date");
  });
});
