import { describe, expect, it } from "vitest";
import { DISPOSITION_STATUSES } from "./salesDisposition";
import { planCardMove, resolveFormRoute, type FormRouteOk } from "./salesFormRoute";

// The Hauck sub-account on 2026-10-13, with PIF and Deposit taken off Sales
// (Jake: closes move to Onboarding).
const LIVE = [
  { id: "cold", name: "Cold SMS ", stages: [{ id: "c1", name: "📨 SMS Sent" }] },
  {
    id: "sales",
    name: "Sales ",
    stages: [
      { id: "s-hot", name: "🔥 Hot Lead" },
      { id: "s-booked", name: "✅ Call Booked" },
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

const route = (k: Parameters<typeof resolveFormRoute>[0]) => {
  const r = resolveFormRoute(k, LIVE);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("resolveFormRoute", () => {
  it("has a column for every answer", () => {
    for (const s of DISPOSITION_STATUSES) expect(resolveFormRoute(s.key, LIVE).ok, s.key).toBe(true);
  });

  it("sends each answer to its own column", () => {
    expect(route("pif").target).toEqual({ pipelineId: "onb", stageId: "o-pif" });
    expect(route("deposit").target).toEqual({ pipelineId: "onb", stageId: "o-dep" });
    expect(route("noclose").target).toEqual({ pipelineId: "sales", stageId: "s-nc" });
    expect(route("noshow").target.stageId).toBe("s-ns");
    expect(route("followup").target.stageId).toBe("s-fu");
    expect(route("unqualified").target.stageId).toBe("s-unq");
    expect(route("cancelled").target.stageId).toBe("s-can");
  });

  it("says which column is missing instead of guessing", () => {
    const noFollowUp = LIVE.map((p) =>
      p.id === "sales" ? { ...p, stages: p.stages.filter((s) => s.id !== "s-fu") } : p,
    );
    expect(resolveFormRoute("followup", noFollowUp)).toEqual({ ok: false, error: "Sales pipeline has no Follow Up stage" });
  });

  it("fails a close when there is no Onboarding pipeline", () => {
    const noOnb = LIVE.filter((p) => p.id !== "onb");
    expect(resolveFormRoute("pif", noOnb)).toEqual({ ok: false, error: "No Onboarding pipeline" });
    expect(resolveFormRoute("noshow", noOnb).ok).toBe(true);
  });
});

describe("planCardMove", () => {
  const pif: FormRouteOk = route("pif");
  const fu: FormRouteOk = route("followup");

  it("moves the Sales card to Onboarding on a close", () => {
    expect(planCardMove(pif, [{ id: "a", stageId: "s-booked" }], [], null)).toEqual({ kind: "move", opportunityId: "a" });
  });

  it("creates an Onboarding card when there is no card at all", () => {
    expect(planCardMove(pif, [], [], null)).toEqual({ kind: "create" });
  });

  it("switches PIF to Deposit on the Onboarding card", () => {
    expect(planCardMove(route("deposit"), [], [{ id: "a", stageId: "o-pif" }], null)).toEqual({ kind: "move", opportunityId: "a" });
  });

  it("never drags a client back from Being Setup", () => {
    expect(planCardMove(pif, [], [{ id: "a", stageId: "o-setup" }], null)).toEqual({ kind: "none", opportunityId: "a" });
    expect(planCardMove(fu, [], [{ id: "a", stageId: "o-active" }], null)).toEqual({ kind: "create" });
  });

  it("brings a corrected close back to Sales", () => {
    expect(planCardMove(fu, [], [{ id: "a", stageId: "o-dep" }], null)).toEqual({ kind: "move", opportunityId: "a" });
  });

  it("prefers the card this meeting moved last", () => {
    const cards = [{ id: "a", stageId: "s-hot" }, { id: "b", stageId: "s-booked" }];
    expect(planCardMove(fu, cards, [], "b")).toEqual({ kind: "move", opportunityId: "b" });
  });

  it("does nothing when the card is already there", () => {
    expect(planCardMove(fu, [{ id: "a", stageId: "s-fu" }], [], null)).toEqual({ kind: "none", opportunityId: "a" });
  });
});
