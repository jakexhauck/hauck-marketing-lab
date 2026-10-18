import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_SOPS, type SopNode } from "./agentSops";

// docs/ghl-client-setup-checklist.md is the GHL map written out (Jake,
// 2026-10-18): one section per box on the main line, in order, each line the
// box's step word for word. Change one and this fails until the other matches.

const DOC = new URL("../../../../docs/ghl-client-setup-checklist.md", import.meta.url);

// The main line, start box onward, following solid edges and stopping at the
// handoff back to the Manager.
function mainLine(): SopNode[] {
  const map = AGENT_SOPS.find((m) => m.id === "ghl")!;
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const out: SopNode[] = [];
  let cur = map.nodes.find((n) => n.k === "start");
  while (cur && cur.k !== "done") {
    out.push(cur);
    const next = map.edges.find(([from, , , kind]) => from === cur!.id && (kind ?? "main") === "main");
    cur = next ? byId.get(next[1]) : undefined;
  }
  return out;
}

function docSections(): { title: string; items: string[] }[] {
  const out: { title: string; items: string[] }[] = [];
  for (const line of readFileSync(DOC, "utf8").split(/\r?\n/)) {
    const h = line.match(/^## \d+\. (.+)$/);
    if (h) out.push({ title: h[1].trim(), items: [] });
    const item = line.match(/^- \[ \] (.+)$/);
    if (item && out.length) out[out.length - 1].items.push(item[1].trim());
  }
  return out;
}

describe("GHL setup checklist doc", () => {
  it("has one section per GHL box, in the map's order, with the box's steps word for word", () => {
    const boxes = mainLine();
    expect(boxes.length).toBeGreaterThan(5);
    expect(docSections()).toEqual(boxes.map((n) => ({ title: expect.stringMatching(new RegExp(`^${n.t.replace(/[+]/g, "\\+")}$`, "i")), items: n.steps ?? [] })));
  });
});
