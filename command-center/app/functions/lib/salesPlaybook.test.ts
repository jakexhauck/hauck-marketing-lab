import { describe, expect, it } from "vitest";
import {
  MAX_CATEGORY,
  MAX_HINT,
  MAX_PROMPT,
  PLAYBOOK_SECTIONS,
  categoriesForSection,
  cleanCategory,
  cleanHint,
  cleanPrompt,
  groupItems,
  isPlaybookSection,
  itemsForSection,
  playbookSection,
  swapTargets,
  type PlaybookCategory,
  type PlaybookItem,
} from "./salesPlaybook";

function item(over: Partial<PlaybookItem> = {}): PlaybookItem {
  return {
    id: "i1",
    section: "discovery",
    categoryId: null,
    kind: "question",
    prompt: "Ask them something",
    hint: "",
    answerKey: null,
    formula: "",
    format: "number",
    sortOrder: 0,
    archivedAt: null,
    ...over,
  };
}

function category(over: Partial<PlaybookCategory> = {}): PlaybookCategory {
  return { id: "c1", section: "discovery", name: "The situation", sortOrder: 0, ...over };
}

describe("the sections", () => {
  it("runs discovery, then pitch", () => {
    expect(PLAYBOOK_SECTIONS.map((s) => s.id)).toEqual(["discovery", "pitch"]);
  });

  it("gives every section a heading, a blurb and an answer placeholder", () => {
    for (const s of PLAYBOOK_SECTIONS) {
      expect(s.label).not.toBe("");
      expect(s.blurb).not.toBe("");
      expect(s.placeholder).not.toBe("");
    }
  });

  it("accepts the two ids and rejects everything else", () => {
    expect(isPlaybookSection("discovery")).toBe(true);
    expect(isPlaybookSection("pitch")).toBe(true);
    // Cut in 0085. The column is gone, so the id must stop being valid: a row
    // posted under it would be stored and drawn nowhere.
    expect(isPlaybookSection("objections")).toBe(false);
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

  it("caps a heading much shorter, since it is drawn as a rule", () => {
    expect(MAX_CATEGORY).toBeLessThan(MAX_PROMPT);
    expect(cleanCategory("  The   money  ")).toBe("The money");
    expect(cleanCategory("z".repeat(MAX_CATEGORY + 20))).toHaveLength(MAX_CATEGORY);
    expect(cleanCategory("  ")).toBe("");
  });
});

describe("categoriesForSection", () => {
  const categories = [
    category({ id: "b", sortOrder: 1 }),
    category({ id: "a", sortOrder: 0 }),
    category({ id: "p", section: "pitch", sortOrder: 0 }),
  ];

  it("returns one column's headings in Jake's order", () => {
    expect(categoriesForSection(categories, "discovery").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps the columns' headings apart", () => {
    expect(categoriesForSection(categories, "pitch").map((c) => c.id)).toEqual(["p"]);
  });

  it("breaks a tied sort order on id so the list is stable", () => {
    const tied = [category({ id: "z" }), category({ id: "y" })];
    expect(categoriesForSection(tied, "discovery").map((c) => c.id)).toEqual(["y", "z"]);
  });
});

describe("groupItems", () => {
  const cats = [
    category({ id: "money", name: "The money", sortOrder: 1 }),
    category({ id: "situation", name: "The situation", sortOrder: 0 }),
  ];

  it("cuts a column into its headings, in heading order", () => {
    const items = [
      item({ id: "m1", categoryId: "money", sortOrder: 0 }),
      item({ id: "s1", categoryId: "situation", sortOrder: 1 }),
    ];
    const groups = groupItems(items, cats, "discovery");
    expect(groups.map((g) => g.category?.name)).toEqual(["The situation", "The money"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["s1"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["m1"]);
  });

  it("puts the unfiled prompts in a last block with no heading", () => {
    const items = [
      item({ id: "loose", categoryId: null, sortOrder: 0 }),
      item({ id: "s1", categoryId: "situation", sortOrder: 1 }),
    ];
    const groups = groupItems(items, cats, "discovery");
    expect(groups[groups.length - 1].category).toBeNull();
    expect(groups[groups.length - 1].items.map((i) => i.id)).toEqual(["loose"]);
  });

  it("omits the loose block entirely when everything is filed", () => {
    const items = [item({ id: "s1", categoryId: "situation" })];
    expect(groupItems(items, cats, "discovery").every((g) => g.category !== null)).toBe(true);
  });

  it("keeps a heading with nothing under it, since it was just created", () => {
    const groups = groupItems([], cats, "discovery");
    expect(groups.map((g) => g.category?.id)).toEqual(["situation", "money"]);
    expect(groups.every((g) => g.items.length === 0)).toBe(true);
  });

  it("drops a prompt loose rather than losing it when its heading is gone", () => {
    // What ON DELETE SET NULL leaves behind, and the belt to it: a categoryId
    // pointing at a heading in another column.
    const items = [
      item({ id: "orphan", categoryId: "deleted-heading" }),
      item({ id: "wrong-column", categoryId: "pitch-heading" }),
    ];
    const groups = groupItems(items, cats, "discovery");
    const loose = groups.find((g) => g.category === null);
    expect(loose?.items.map((i) => i.id).sort()).toEqual(["orphan", "wrong-column"]);
  });

  it("leaves retired prompts off every block", () => {
    const items = [item({ id: "gone", categoryId: "situation", archivedAt: "2026-07-31T00:00:00Z" })];
    expect(groupItems(items, cats, "discovery").flatMap((g) => g.items)).toEqual([]);
  });

  it("orders the prompts inside a heading by sort order", () => {
    const items = [
      item({ id: "second", categoryId: "situation", sortOrder: 5 }),
      item({ id: "first", categoryId: "situation", sortOrder: 1 }),
    ];
    expect(groupItems(items, cats, "discovery")[0].items.map((i) => i.id)).toEqual([
      "first",
      "second",
    ]);
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

  it("leaves the other section alone", () => {
    expect(itemsForSection(items, "pitch").map((i) => i.id)).toEqual(["p"]);
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

  it("reorders headings the same way it reorders prompts", () => {
    const cats = [category({ id: "a", sortOrder: 0 }), category({ id: "b", sortOrder: 1 })];
    const hit = swapTargets(cats, "b", -1);
    expect([hit?.a.id, hit?.b.id]).toEqual(["b", "a"]);
    expect([hit?.a.sortOrder, hit?.b.sortOrder]).toEqual([1, 0]);
  });
});
