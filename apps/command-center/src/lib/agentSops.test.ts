import { describe, expect, it } from "vitest";
import { CLIENT_AGENTS } from "./agents";
import { AGENT_SOPS, frameSize, getAgentSop, layoutEdges, nodeBox, port, route, sopMapPath } from "./agentSops";
import { mapStages } from "./sopPrompt";
import { SOP_LISTS } from "./sopChecklists";

describe("Client Fulfillment map", () => {
  const map = () => getAgentSop("fulfillment")!;

  it("comes first", () => {
    expect(AGENT_SOPS[0].id).toBe("fulfillment");
  });

  it("is where a missing or unknown map lands", () => {
    expect(sopMapPath(undefined)).toBe("/admin/sops/fulfillment");
    expect(sopMapPath("director")).toBe("/admin/sops/fulfillment");
    expect(sopMapPath("ghl")).toBe("/admin/sops/ghl");
  });

  it("runs the phases paid to live, in order", () => {
    const m = map();
    const main = mapStages(m).flatMap((s) => s.tasks).map((t) => t.name);
    const order = ["paid", "onboard", "ghl", "follow", "adsbuild", "check", "launch", "live"].map(
      (id) => m.nodes.find((n) => n.id === id)!.t,
    );
    expect(main.filter((n) => order.includes(n))).toEqual(order);
  });

  it("carries every item of Jake's three setup checklists", () => {
    const steps = map().nodes.flatMap((n) => n.steps ?? []).join("\n").toLowerCase();
    for (const list of Object.values(SOP_LISTS))
      for (const s of list.sections)
        for (const g of s.groups)
          for (const i of g.items) expect(steps, `${list.id}: ${i.label}`).toContain(i.label.toLowerCase());
  });
});

describe("agent SOP maps", () => {
  it("has one map per client agent, plus Client Fulfillment, and none for the agency Manager", () => {
    expect(AGENT_SOPS.map((a) => a.id)).toEqual(["fulfillment", "csm", "ghl", "ads", "research"]);
    expect(AGENT_SOPS.map((a) => a.id).sort()).toEqual([...CLIENT_AGENTS.map((a) => a.id), "fulfillment"].sort());
  });

  it("names no retired agent and no conversion asset anywhere", () => {
    const retired = /conversion asset|recent work|owner story|unique mechanism|creative agent|landing page agent|reporting agent/i;
    for (const m of AGENT_SOPS)
      for (const n of m.nodes) for (const line of [n.t, ...(n.d ?? []), ...(n.steps ?? [])]) expect(line, `${m.id}/${n.id}`).not.toMatch(retired);
  });

  it("hands Market Research to Ads only", () => {
    const links = getAgentSop("research")!.nodes.filter((n) => n.link).map((n) => n.link);
    expect(links).toEqual(["ads"]);
  });

  it("every edge joins two boxes on its own map, and box ids are unique", () => {
    for (const map of AGENT_SOPS) {
      const ids = map.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [a, b] of map.edges) {
        expect(ids, `${map.id}: ${a}`).toContain(a);
        expect(ids, `${map.id}: ${b}`).toContain(b);
      }
    }
  });

  it("every handoff opens a real map", () => {
    for (const map of AGENT_SOPS)
      for (const n of map.nodes) if (n.link) expect(getAgentSop(n.link), `${map.id}: ${n.id}`).not.toBeNull();
  });

  it("no em dashes in any text", () => {
    expect(JSON.stringify(AGENT_SOPS)).not.toContain("—");
  });

  it("draws every edge with finite coordinates", () => {
    for (const map of AGENT_SOPS)
      for (const e of layoutEdges(map)) expect(e.d, `${map.id}: ${e.key}`).not.toMatch(/NaN|Infinity/);
  });

  it("no edge label sits on a box on the Client Fulfillment map", () => {
    const m = getAgentSop("fulfillment")!;
    for (const e of layoutEdges(m)) {
      if (!e.label) continue;
      const w = e.label.text.length * 5.2, h = 12; // 10px label text
      const l = { x: e.label.x - w / 2, y: e.label.y - 10, w, h };
      for (const n of m.nodes) {
        const b = nodeBox(n);
        const hit = l.x < b.x + b.w && l.x + l.w > b.x && l.y < b.y + b.h && l.y + l.h > b.y;
        expect(hit, `${e.key} label on ${n.id}`).toBe(false);
      }
    }
  });

  it("frame is at least 1100 wide", () => {
    for (const map of AGENT_SOPS) expect(frameSize(map).w).toBeGreaterThanOrEqual(1100);
  });
});

describe("route", () => {
  const node = { id: "x", c: 0, r: 0, k: "agent" as const, t: "x" };

  it("same row runs straight", () => {
    const a = port(node, "r:0.5");
    const b = port({ ...node, c: 1 }, "l:0.5");
    expect(route(a, b)).toHaveLength(2);
  });

  it("a row wrap runs its cross leg just above the next row", () => {
    const a = port({ ...node, c: 3 }, "b:0.5");
    const b = port({ ...node, r: 2 }, "t:0.3");
    const pts = route(a, b, "gap");
    expect(pts[1].y).toBe(b.y - 16);
    expect(pts[2]).toEqual({ x: b.x, y: b.y - 16 });
  });
});
