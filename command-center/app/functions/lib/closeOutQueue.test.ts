import { describe, it, expect } from "vitest";
import { resolveJobCompletedStage } from "./closeOutQueue";

// Willis's live Sales pipeline, pulled 2026-07-16.
const LIVE = [
  {
    id: "6o9Gx6e0TXRFJdln5d01",
    name: "Sales",
    stages: [
      { id: "s0", name: "New Lead 🔔" },
      { id: "s1", name: "Hot Lead 🔥" },
      { id: "s2", name: "Phone Appointment Booked  📞" },
      { id: "s3", name: "Estimate Scheduled 📋" },
      { id: "s4", name: "Job Booked 💼" },
      { id: "s5", name: "Job Completed ✅" },
      { id: "s6", name: "Long Term Nurture 🌱" },
    ],
  },
  {
    id: "XYjBgpRZ5mTiTfJNQP8M",
    name: "Customers",
    stages: [
      { id: "c0", name: "One-Time Customer 1️⃣" },
      { id: "c1", name: "Recurring Customer 🔁" },
    ],
  },
];

describe("resolveJobCompletedStage", () => {
  it("finds the live Job Completed stage despite its emoji", () => {
    expect(resolveJobCompletedStage(LIVE)).toEqual({
      pipelineId: "6o9Gx6e0TXRFJdln5d01",
      stageId: "s5",
    });
  });

  it("does not mistake Job Booked for Job Completed", () => {
    // Both start "Job". Matching on "job" alone would put the close-out badge on
    // every booked job that has not happened yet.
    expect(resolveJobCompletedStage(LIVE)?.stageId).not.toBe("s4");
  });

  it("returns null when the tenant has no Sales pipeline", () => {
    expect(resolveJobCompletedStage([LIVE[1]])).toBeNull();
  });

  it("returns null when Sales has no completed stage, rather than guessing", () => {
    const noStage = [{ id: "p", name: "Sales", stages: [{ id: "x", name: "New Lead" }] }];
    expect(resolveJobCompletedStage(noStage)).toBeNull();
  });

  it("survives a rename that still says completed", () => {
    const renamed = [
      { id: "p", name: "Sales", stages: [{ id: "x", name: "Work Completed ✅" }] },
    ];
    expect(resolveJobCompletedStage(renamed)?.stageId).toBe("x");
  });

  it("ignores a Completed stage that lives in some other pipeline", () => {
    // Only the Sales pipeline feeds the close-out queue.
    const other = [
      { id: "p1", name: "Reactivation", stages: [{ id: "r", name: "Job Completed ✅" }] },
      { id: "p2", name: "Sales", stages: [{ id: "s", name: "New Lead 🔔" }] },
    ];
    expect(resolveJobCompletedStage(other)).toBeNull();
  });
});
