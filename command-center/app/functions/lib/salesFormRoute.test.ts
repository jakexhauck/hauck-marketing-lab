import { describe, expect, it } from "vitest";
import { DISPOSITION_STATUSES } from "./salesDisposition";
import { onboardingMove, resolveFormRoute } from "./salesFormRoute";

// The Hauck sub-account on 2026-10-13, emoji and all.
const LIVE = [
  { id: "cold", name: "Cold SMS ", stages: [{ id: "c1", name: "📨 SMS Sent" }] },
  {
    id: "sales",
    name: "Sales ",
    stages: [
      { id: "s-hot", name: "🔥 Hot Lead" },
      { id: "s-booked", name: "✅ Call Booked" },
      { id: "s-pif", name: "💰 PIF" },
      { id: "s-dep", name: "💵 Deposit" },
      { id: "s-fu", name: "🔁 Follow Up" },
      { id: "s-can", name: "❌ Cancelled (needs reschedule)" },
      { id: "s-unq", name: "👎 Unqualified" },
      { id: "s-ns", name: "👻 No-Show" },
      { id: "s-nc", name: "🚫 No-Close" },
    ],
  },
  {
    id: "onb",
    name: "Onboarding ",
    stages: [
      { id: "o-pif", name: "💰 PIF" },
      { id: "o-dep", name: "💵 Deposit" },
      { id: "o-setup", name: "🛠️ Being Setup" },
      { id: "o-active", name: "✅ Active Client" },
    ],
  },
];

describe("resolveFormRoute", () => {
  it("finds a Sales stage for every answer on the live board", () => {
    for (const s of DISPOSITION_STATUSES) {
      const r = resolveFormRoute(s.key, LIVE);
      expect(r.ok, s.key).toBe(true);
    }
  });

  it("sends each answer to its own column", () => {
    const stage = (k: Parameters<typeof resolveFormRoute>[0]) => {
      const r = resolveFormRoute(k, LIVE);
      return r.ok ? r.sales.stageId : null;
    };
    expect(stage("pif")).toBe("s-pif");
    expect(stage("deposit")).toBe("s-dep");
    expect(stage("noclose")).toBe("s-nc");
    expect(stage("noshow")).toBe("s-ns");
    expect(stage("followup")).toBe("s-fu");
    expect(stage("unqualified")).toBe("s-unq");
    expect(stage("cancelled")).toBe("s-can");
  });

  it("adds PIF and Deposit to Onboarding, nothing else", () => {
    const pif = resolveFormRoute("pif", LIVE);
    const dep = resolveFormRoute("deposit", LIVE);
    const nc = resolveFormRoute("noclose", LIVE);
    expect(pif.ok && pif.onboarding).toEqual({ pipelineId: "onb", stageId: "o-pif", closeStageIds: ["o-pif", "o-dep"] });
    expect(dep.ok && dep.onboarding?.stageId).toBe("o-dep");
    expect(nc.ok && nc.onboarding).toBeNull();
  });

  it("says which column is missing instead of guessing", () => {
    const noFollowUp = LIVE.map((p) =>
      p.id === "sales" ? { ...p, stages: p.stages.filter((s) => s.id !== "s-fu") } : p,
    );
    const r = resolveFormRoute("followup", noFollowUp);
    expect(r).toEqual({ ok: false, error: "Sales pipeline has no Follow Up stage" });
  });

  it("fails when there is no Onboarding pipeline for a close", () => {
    const r = resolveFormRoute("pif", LIVE.filter((p) => p.id !== "onb"));
    expect(r).toEqual({ ok: false, error: "No Onboarding pipeline" });
  });
});

describe("onboardingMove", () => {
  const target = { pipelineId: "onb", stageId: "o-dep", closeStageIds: ["o-pif", "o-dep"] };

  it("creates a card when the contact has none", () => {
    expect(onboardingMove(target, [])).toEqual({ kind: "create" });
  });

  it("switches a card between PIF and Deposit", () => {
    expect(onboardingMove(target, [{ id: "op1", stageId: "o-pif" }])).toEqual({ kind: "move", opportunityId: "op1" });
  });

  it("leaves a card that is already further along", () => {
    expect(onboardingMove(target, [{ id: "op1", stageId: "o-active" }])).toEqual({ kind: "none" });
  });

  it("does nothing when it is already there", () => {
    expect(onboardingMove(target, [{ id: "op1", stageId: "o-dep" }])).toEqual({ kind: "none" });
  });
});
