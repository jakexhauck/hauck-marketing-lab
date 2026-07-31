import { describe, expect, it } from "vitest";
import {
  MAX_HINT,
  MAX_PROMPT,
  PLAYBOOK_SECTIONS,
  cleanHint,
  cleanPrompt,
  isPlaybookSection,
  itemsForSection,
  playbookSection,
  swapTargets,
  type PlaybookItem,
} from "./salesPlaybook";

function item(over: Partial<PlaybookItem> = {}): PlaybookItem {
  return {
    id: "i1",
    section: "discovery",
    prompt: "Ask them something",
    hint: "",
    sortOrder: 0,
    archivedAt: null,
    ...over,
  };
}

describe("the sections", () => {
  it("runs discovery, then pitch, then objections", () => {
    expect(PLAYBOOK_SECTIONS.map((s) => s.id)).toEqual(["discovery", "pitch", "objections"]);
  });

  it("gives every section a heading, a blurb and an answer placeholder", () => {
    for (const s of PLAYBOOK_SECTIONS) {
      expect(s.label).not.toBe("");
      expect(s.blurb).not.toBe("");
      expect(s.placeholder).not.toBe("");
    }
  });

  it("accepts the three ids and rejects everything else", () => {
    expect(isPlaybookSection("discovery")).toBe(true);
    expect(isPlaybookSection("objections")).toBe(true);
    expect(isPlaybookSection("closing")).toBe(false);
    expect(isPlaybookSection(null)).toBe(false);
    expect(isPlaybookSection(7)).toBe(false);
  });

  it("looks a section up, and returns null for one that is not there", () => {
    expect(playbookSection("pitch")?.label).toBe("Pitch");
    expect(playbookSection("nonsense")).toBeNull();
  });
});

describe("cleanPrompt / cleanHint", () => {
  it("trims and collapses run-together whitespace", () => {
    expect(cleanPrompt("  What   is   broken?  ")).toBe("What is broken?");
  });

  it("flattens a pasted multi-line prompt into one line", () => {
    expect(cleanPrompt("What is broken?\nAnd since when?")).toBe("What is broken? And since when?");
    expect(cleanPrompt("tabbed\there")).toBe("tabbed here");
  });

  it("flattens control characters rather than storing them", () => {
    // A NUL and a DEL, the two that would survive a naive \s+ collapse.
    expect(cleanPrompt("a\u0000b\u007Fc")).toBe("a b c");
  });

  it("returns an empty string for anything that is not a string", () => {
    expect(cleanPrompt(undefined)).toBe("");
    expect(cleanPrompt(null)).toBe("");
    expect(cleanPrompt(12)).toBe("");
    expect(cleanHint({})).toBe("");
  });

  it("treats a whitespace-only prompt as nothing, so the handler can refuse it", () => {
    expect(cleanPrompt("   \n\t  ")).toBe("");
  });

  it("caps the length rather than refusing a long paste", () => {
    expect(cleanPrompt("x".repeat(MAX_PROMPT + 50))).toHaveLength(MAX_PROMPT);
    expect(cleanHint("y".repeat(MAX_HINT + 50))).toHaveLength(MAX_HINT);
  });
});

describe("itemsForSection", () => {
  const items = [
    item({ id: "b", sortOrder: 1 }),
    item({ id: "a", sortOrder: 0 }),
    item({ id: "p", section: "pitch", sortOrder: 0 }),
    item({ id: "gone", sortOrder: 2, archivedAt: "2026-07-31T00:00:00Z" }),
  ];

  it("returns one section's live items in Jake's order", () => {
    expect(itemsForSection(items, "discovery").map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("leaves the other sections alone", () => {
    expect(itemsForSection(items, "pitch").map((i) => i.id)).toEqual(["p"]);
    expect(itemsForSection(items, "objections")).toEqual([]);
  });

  it("breaks a tied sort order on id so the list is stable", () => {
    const tied = [item({ id: "z", sortOrder: 0 }), item({ id: "y", sortOrder: 0 })];
    expect(itemsForSection(tied, "discovery").map((i) => i.id)).toEqual(["y", "z"]);
  });

  it("does not mutate what it was given", () => {
    const input = [item({ id: "b", sortOrder: 1 }), item({ id: "a", sortOrder: 0 })];
    itemsForSection(input, "discovery");
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("swapTargets", () => {
  const ordered = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];

  it("pairs a row with the one above it", () => {
    const hit = swapTargets(ordered, "b", -1);
    expect([hit?.a.id, hit?.b.id]).toEqual(["b", "a"]);
  });

  it("pairs a row with the one below it", () => {
    const hit = swapTargets(ordered, "b", 1);
    expect([hit?.a.id, hit?.b.id]).toEqual(["b", "c"]);
  });

  it("refuses a move off either end", () => {
    expect(swapTargets(ordered, "a", -1)).toBeNull();
    expect(swapTargets(ordered, "c", 1)).toBeNull();
  });

  it("refuses a row that is not in the list", () => {
    expect(swapTargets(ordered, "nope", 1)).toBeNull();
  });
});
