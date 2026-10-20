import { describe, expect, it } from "vitest";
import { getAgentSop } from "./agentSops";
import { parseTaskOps, seedTasks, seedWithTicks, taskPhases, TASK_OWNERS } from "./clientTasks";
import { mainLine } from "./sopPrompt";
import { SOP_LISTS, sopTaskKey } from "./sopChecklists";

describe("seedTasks", () => {
  const seed = seedTasks();

  it("has one task per step of every main-line Client Fulfillment box", () => {
    const steps = mainLine(getAgentSop("fulfillment")!).flatMap((n) => n.steps ?? []);
    expect(seed).toHaveLength(steps.length);
  });

  it("keys are unique and read <box>:<name slug>", () => {
    expect(new Set(seed.map((t) => t.key)).size).toBe(seed.length);
    expect(seed.find((t) => t.name === "Setup Sub Account")!.key).toBe("onboard:setup-sub-account");
  });

  it("takes the owner from the step prefix and strips it from the name", () => {
    const t = seed.find((x) => x.key === "onboard:setup-sub-account")!;
    expect(t.owner).toBe("ghl");
    expect(seed.find((x) => x.name === "Connect Facebook To GHL")!.owner).toBe("jake");
    expect(seed.find((x) => x.name === "Conversion Assets Created/Placed Into Funnel")!.owner).toBe("landing");
    expect(seed.find((x) => x.name === "Reporting Agent starts the monthly cycle")!.owner).toBe("reporting");
  });

  it("falls back to the box owner, with the Manager owning review and agent boxes", () => {
    expect(seed.find((x) => x.name === "Invoice Paid")!.owner).toBe("client");
    expect(seed.find((x) => x.name === "Access Business Manager")!.owner).toBe("jake");
    expect(seed.find((x) => x.name === "Accounts page all green")!.owner).toBe("manager");
  });

  it("phases are the main line in order", () => {
    expect(taskPhases().map((p) => p.id)).toEqual(["paid", "onboard", "ghl", "follow", "adsbuild", "check", "launch", "live"]);
    for (const t of seed) expect(taskPhases().map((p) => p.id)).toContain(t.phase);
  });

  it("every item of Jake's three checklists is the sop key of some task", () => {
    const keys = new Set(seed.map((t) => t.sopKey));
    for (const list of Object.values(SOP_LISTS))
      for (const s of list.sections)
        for (const g of s.groups)
          for (const i of g.items) expect(keys, `${list.id}: ${i.label}`).toContain(sopTaskKey(list.id, s.title, i.label));
  });

  it("owners are all known and names carry no em dash", () => {
    for (const t of seed) {
      expect(TASK_OWNERS).toContain(t.owner);
      expect(t.name).not.toContain("—");
    }
  });
});

describe("seedWithTicks", () => {
  it("marks done the tasks whose old box was ticked, keeping who and when", () => {
    const seed = seedTasks();
    const t = seed.find((x) => x.name === "Invoice Paid")!;
    const out = seedWithTicks(seed, [
      { task_key: t.sopKey!, done: true, done_by: "agent:manager", done_at: "2026-10-01T00:00:00.000Z" },
      { task_key: "token-connected", done: true, done_by: null, done_at: null },
    ]);
    expect(out.find((x) => x.key === t.key)).toMatchObject({ state: "done", doneBy: "agent:manager", doneAt: "2026-10-01T00:00:00.000Z" });
    expect(out.filter((x) => x.state === "done")).toHaveLength(1);
  });

  it("an unticked row leaves the task to do", () => {
    const seed = seedTasks();
    const t = seed.find((x) => x.name === "Invoice Paid")!;
    expect(seedWithTicks(seed, [{ task_key: t.sopKey!, done: false, done_by: null, done_at: null }]).every((x) => x.state === "todo")).toBe(true);
  });
});

describe("parseTaskOps", () => {
  const ok = { op: "add", phase: "ghl", owner: "ghl", name: "Spanish ads", reason: "Client asked" };

  it("accepts add, change and cut", () => {
    const r = parseTaskOps([ok, { op: "change", key: "ghl:a2p-submitted", owner: "jake", reason: "Jake does A2P here" }, { op: "cut", key: "follow:job-reminders", reason: "No jobs booked in GHL" }]);
    expect(r.ok && r.ops).toHaveLength(3);
  });

  it.each([
    ["not a list", { ops: [] }],
    ["unknown op", [{ ...ok, op: "move" }]],
    ["unknown owner", [{ ...ok, owner: "intern" }]],
    ["unknown phase", [{ ...ok, phase: "nowhere" }]],
    ["empty reason", [{ ...ok, reason: " " }]],
    ["long name", [{ ...ok, name: "x".repeat(121) }]],
    ["change without key", [{ op: "change", reason: "x" }]],
    ["too many", Array.from({ length: 201 }, () => ok)],
  ])("rejects %s", (_, v) => {
    expect(parseTaskOps(v).ok).toBe(false);
  });
});
