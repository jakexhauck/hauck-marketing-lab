import { describe, it, expect } from "vitest";
import { SOP_LISTS, sopKeys, sopTaskKey } from "./sopChecklists";

describe("sopChecklists", () => {
  it("gives every item in every list its own key", () => {
    const all = Object.values(SOP_LISTS).flatMap((l) => sopKeys(l));
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps repeated labels apart by section", () => {
    expect(sopTaskKey("full-setup", "GHL Follow Ups", "Follow Ups")).not.toBe(
      sopTaskKey("launch-call", "Before The Call", "Follow Ups"),
    );
  });

  it("builds stable, prefixed keys", () => {
    expect(sopTaskKey("full-setup", "Phone", "Appointment Outcome # Bought")).toBe(
      "sop:full-setup:phone:appointment-outcome-bought",
    );
  });

  it("counts the doc's items", () => {
    expect(sopKeys(SOP_LISTS["full-setup"])).toHaveLength(33);
    expect(sopKeys(SOP_LISTS["onboarding-call"])).toHaveLength(14);
    expect(sopKeys(SOP_LISTS["launch-call"])).toHaveLength(11);
  });
});
