import { describe, expect, it } from "vitest";
import { extractCitations, parseAgentOutput } from "../src/output.ts";

const EM = "\u2014";
const F = "```";

describe("parseAgentOutput", () => {
  it("takes a task block as key | state | proof lines, bad lines dropped", () => {
    const text = ["On it.", `${F}task`, "ghl:a2p-submitted | doing", "- ghl:local-number-bought | done | Bought (313) 555-0101", "nonsense", "ghl:x | todo", F].join("\n");
    const out = parseAgentOutput(text);
    expect(out.reply).toBe("On it.");
    expect(out.tasks).toEqual([
      { key: "ghl:a2p-submitted", state: "doing" },
      { key: "ghl:local-number-bought", state: "done", evidence: "Bought (313) 555-0101" },
    ]);
  });

  it("no longer reads a tick block: no ticks, nothing to post", () => {
    const out = parseAgentOutput(["Done.", `${F}tick`, "Ads LIVE", F].join("\n"));
    expect("ticks" in out).toBe(false);
  });

  it("takes a brief block as the agent's whole new section, markdown kept", () => {
    const text = ["Updated the brief.", "", `${F}brief`, "- Top pain: door fails in the cold", `- Angles: before/after ${EM} proof`, "", F].join("\n");
    const out = parseAgentOutput(text);
    expect(out.reply).toBe("Updated the brief.");
    expect(out.brief).toBe("- Top pain: door fails in the cold\n- Angles: before/after, proof");
  });

  it("keeps the last brief block when there are two, and an empty one means no change", () => {
    expect(parseAgentOutput(`${F}brief\nfirst\n${F}\n${F}brief\nsecond\n${F}`).brief).toBe("second");
    expect(parseAgentOutput(`${F}brief\n\n${F}`).brief).toBeNull();
  });

  it("pulls all three blocks out and leaves the reply clean", () => {
    const text = [
      "CPL is down 12% this week.",
      "",
      `${F}lessons`,
      "- Before/after photos beat quotes at Willis",
      "agent: Lead forms with 3 questions convert better than 5",
      "",
      F,
      `${F}item`,
      '{"kind":"ad_plan","title":"Winter ads","status":"needs_ok","payload":{"plan":["A","B"]}}',
      F,
      `${F}request`,
      '{"toAgent":"ghl","title":"Add page to funnel","body":"The page is ready.","plan":["Add step"]}',
      F,
    ].join("\n");
    const out = parseAgentOutput(text);
    expect(out.reply).toBe("CPL is down 12% this week.");
    expect(out.lessons).toEqual([
      "Before/after photos beat quotes at Willis",
      "agent: Lead forms with 3 questions convert better than 5",
    ]);
    expect(out.items).toEqual([
      { kind: "ad_plan", title: "Winter ads", status: "needs_ok", payload: { plan: ["A", "B"] } },
    ]);
    expect(out.requests).toEqual([
      { toAgent: "ghl", title: "Add page to funnel", body: "The page is ready.", plan: ["Add step"] },
    ]);
  });

  it("returns the text as the reply when there are no blocks", () => {
    const out = parseAgentOutput("Just an answer.\n");
    expect(out).toEqual({ reply: "Just an answer.", lessons: [], items: [], requests: [], brief: null, tasks: [] });
  });

  it("drops malformed JSON and keeps the reply", () => {
    const text = `Here you go.\n${F}item\n{not json\n${F}\n${F}request\n{"toAgent":"nobody","title":"x","body":"y"}\n${F}`;
    const out = parseAgentOutput(text);
    expect(out.reply).toBe("Here you go.");
    expect(out.items).toEqual([]);
    expect(out.requests).toEqual([]);
  });

  it("accepts an array of items and fills a missing plan", () => {
    const text =
      `ok\n${F}item\n[{"kind":"a","title":"One"},{"title":"no kind"}]\n${F}\n` +
      `${F}request\n{"toAgent":"ads","title":"t","body":"b"}\n${F}`;
    const out = parseAgentOutput(text);
    expect(out.items).toEqual([{ kind: "a", title: "One" }]);
    expect(out.requests).toEqual([{ toAgent: "ads", title: "t", body: "b", plan: [] }]);
  });

  it("drops a request to the agency Manager or a retired agent: neither works inside a client", () => {
    for (const to of ["manager", "creative", "landing", "reporting"]) {
      expect(parseAgentOutput(`${F}request
{"toAgent":"${to}","title":"t","body":"b"}
${F}`).requests, to).toEqual([]);
    }
  });

  it("strips em dashes from the reply and the lessons", () => {
    const out = parseAgentOutput(`Spend is up ${EM} watch it.\n${F}lessons\nQuotes ${EM} weak\n${F}`);
    expect(out.reply).toBe("Spend is up, watch it.");
    expect(out.lessons).toEqual(["Quotes, weak"]);
  });
});

describe("item ids", () => {
  it("keeps a uuid id and drops anything else", () => {
    const ok = "00000001-0000-4000-8000-000000000000";
    const text = ["Done.", "```item", JSON.stringify([
      { id: ok, kind: "plan", title: "A" },
      { id: "../../../bin", kind: "plan", title: "B" },
      { id: `${ok}/..`, kind: "plan", title: "C" },
    ]), "```"].join("\n");
    const out = parseAgentOutput(text);
    expect(out.items.map((i) => i.id)).toEqual([ok, undefined, undefined]);
  });
});

describe("extractCitations", () => {
  it("lifts cited lesson ids out of the reply", () => {
    const out = extractCitations("Lead with before/after [l-3fa9c021], it won before [l-0000beef].");
    expect(out.ids).toEqual(["l-3fa9c021", "l-0000beef"]);
    expect(out.reply).toBe("Lead with before/after, it won before.");
  });
});
