import { describe, expect, it } from "vitest";
import { buildFacts, factOrder, factsSummary, renderText } from "./callFacts";
import type { PlaybookItem, PlaybookRowKind } from "../../functions/lib/salesPlaybook";
import type { ValueFormat } from "../../functions/lib/callFormula";

// Jake's actual discovery, in miniature: ask the numbers early, read them back
// on the timeline line without retyping any of them.

let n = 0;
function item(
  partial: Partial<PlaybookItem> & { kind?: PlaybookRowKind; format?: ValueFormat },
): PlaybookItem {
  n += 1;
  return {
    id: partial.id ?? `i${n}`,
    section: "discovery",
    categoryId: null,
    kind: partial.kind ?? "question",
    prompt: partial.prompt ?? "A question",
    hint: "",
    answerKey: partial.answerKey ?? null,
    formula: partial.formula ?? "",
    format: partial.format ?? "number",
    sortOrder: partial.sortOrder ?? n,
    archivedAt: partial.archivedAt ?? null,
    ...partial,
  } as PlaybookItem;
}

const SEED = { name: "Mike", first_name: "Mike", business: "Novi Heating", phone: "5551234567" };

// The three questions and the two sums the timeline line is built out of.
function playbook(): PlaybookItem[] {
  return [
    item({ id: "q_installs", prompt: "How many jobs did you run last month?", answerKey: "installs" }),
    item({ id: "q_ticket", prompt: "What's your average ticket on a replacement?", answerKey: "avg_ticket" }),
    item({ id: "q_goal", prompt: "Where would you like to be?", answerKey: "goal" }),
    item({ id: "q_margin", prompt: "Margin", answerKey: "margin" }),
    item({
      id: "c_rev",
      kind: "calc",
      prompt: "Extra revenue a month",
      answerKey: "gap_revenue",
      formula: "(goal - installs) * avg_ticket",
      format: "money",
    }),
    item({
      id: "c_profit",
      kind: "calc",
      prompt: "Extra profit a month",
      answerKey: "gap_profit",
      formula: "gap_revenue * margin",
      format: "money",
    }),
  ];
}

describe("buildFacts", () => {
  it("fills the booking's own keys without anyone typing", () => {
    const facts = buildFacts({ items: [], notes: {}, seed: SEED });
    expect(facts.get("name")?.display).toBe("Mike");
    expect(facts.get("business")?.display).toBe("Novi Heating");
  });

  it("carries a typed answer under its key", () => {
    const facts = buildFacts({ items: playbook(), notes: { q_installs: "12" }, seed: SEED });
    expect(facts.get("installs")?.display).toBe("12");
    expect(facts.get("installs")?.number).toBe(12);
  });

  it("works the timeline numbers out of three typed answers", () => {
    const facts = buildFacts({
      items: playbook(),
      notes: { q_installs: "12", q_ticket: "$9,500", q_goal: "30", q_margin: "0.35" },
      seed: SEED,
    });
    expect(facts.get("gap_revenue")?.display).toBe("$171,000");
    expect(facts.get("gap_profit")?.display).toBe("$59,850");
  });

  it("leaves a sum blank while any of its answers is blank", () => {
    const facts = buildFacts({
      items: playbook(),
      notes: { q_installs: "12", q_goal: "30" },
      seed: SEED,
    });
    expect(facts.get("gap_revenue")?.display).toBe("");
    expect(facts.get("gap_revenue")?.number).toBeNull();
    // And the sum built on that sum stays blank too, rather than reading zero.
    expect(facts.get("gap_profit")?.display).toBe("");
  });

  it("keeps a key whose question is unanswered, so the strip can show the blank", () => {
    const facts = buildFacts({ items: playbook(), notes: {}, seed: SEED });
    expect(facts.has("avg_ticket")).toBe(true);
    expect(facts.get("avg_ticket")?.display).toBe("");
  });

  it("drops a retired question's key", () => {
    const items = playbook().map((i) =>
      i.id === "q_goal" ? { ...i, archivedAt: "2026-08-01T00:00:00Z" } : i,
    );
    const facts = buildFacts({ items, notes: { q_goal: "30" }, seed: SEED });
    expect(facts.has("goal")).toBe(false);
  });

  it("survives a formula that reaches itself", () => {
    // A dash, not a hang and not a stack overflow.
    const items = [
      item({ id: "a", kind: "calc", answerKey: "a", formula: "b + 1" }),
      item({ id: "b", kind: "calc", answerKey: "b", formula: "a + 1" }),
    ];
    const facts = buildFacts({ items, notes: {}, seed: SEED });
    expect(facts.get("a")?.display).toBe("");
    expect(facts.get("b")?.display).toBe("");
  });

  it("survives a formula that will not compile", () => {
    const items = [item({ id: "a", kind: "calc", answerKey: "gap", formula: "goal *" })];
    const facts = buildFacts({ items, notes: {}, seed: SEED });
    expect(facts.get("gap")?.display).toBe("");
  });

  it("lets the booking win a key a question tried to shadow", () => {
    const items = [item({ id: "q", prompt: "Their name again", answerKey: "name" })];
    const facts = buildFacts({ items, notes: { q: "Somebody else" }, seed: SEED });
    expect(facts.get("name")?.display).toBe("Mike");
  });
});

describe("renderText", () => {
  const facts = () =>
    buildFacts({
      items: playbook(),
      notes: { q_installs: "12", q_ticket: "$9,500", q_goal: "30", q_margin: "0.35" },
      seed: SEED,
    });

  it("puts the answers into the timeline line", () => {
    const parts = renderText(
      "So for you, hitting {goal} installs/month, and adding {gap_profit}/month in profit",
      facts(),
    );
    expect(parts.map((p) => p.value).join("")).toBe(
      "So for you, hitting 30 installs/month, and adding $59,850/month in profit",
    );
    expect(parts.filter((p) => p.t === "token").every((p) => p.filled)).toBe(true);
  });

  it("marks an unanswered token so the page can grey it", () => {
    const parts = renderText("You're in {city}", buildFacts({ items: [], notes: {}, seed: SEED }));
    const token = parts.find((p) => p.t === "token");
    expect(token?.filled).toBe(false);
    // Reads as the key name, never as a stray {city} said out loud.
    expect(token?.value).toBe("city");
  });

  it("leaves text that only looks like a token alone", () => {
    const parts = renderText("Costs {A LOT} more", facts());
    expect(parts).toHaveLength(1);
    expect(parts[0].t).toBe("text");
  });
});

describe("factsSummary", () => {
  it("writes only what was answered, in call order", () => {
    const items = playbook();
    const facts = buildFacts({
      items,
      notes: { q_installs: "12", q_ticket: "$9,500", q_goal: "30", q_margin: "0.35" },
      seed: SEED,
    });
    const summary = factsSummary(facts, factOrder(items));
    expect(summary).toBe(
      [
        "installs: 12",
        "avg_ticket: $9,500",
        "goal: 30",
        "margin: 0.35",
        "gap_revenue: $171,000",
        "gap_profit: $59,850",
      ].join("\n"),
    );
  });

  it("leaves out the blanks and the booking's own fields", () => {
    const items = playbook();
    const facts = buildFacts({ items, notes: { q_installs: "12" }, seed: SEED });
    expect(factsSummary(facts, factOrder(items))).toBe("installs: 12");
  });

  it("is empty when nothing was typed", () => {
    const items = playbook();
    expect(factsSummary(buildFacts({ items, notes: {}, seed: SEED }), factOrder(items))).toBe("");
  });
});
