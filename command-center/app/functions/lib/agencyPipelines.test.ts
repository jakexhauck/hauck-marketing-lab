import { describe, it, expect } from "vitest";
import { groupByStage, shapeOpportunity, type PipelineCard } from "./agencyPipelines";

const stages = [
  { id: "s1", name: "New Lead" },
  { id: "s2", name: "1st Dial (Day 1)" },
];

function card(over: Partial<PipelineCard> = {}): PipelineCard {
  return {
    id: "o1",
    name: "Marcus Bell",
    stageId: "s1",
    status: "open",
    value: null,
    contactId: "c1",
    phone: "",
    email: "",
    tags: [],
    updatedAt: null,
    ...over,
  };
}

describe("shapeOpportunity", () => {
  it("takes the opportunity's own name first", () => {
    const shaped = shapeOpportunity({
      id: "o1",
      name: "Bell Roofing",
      contact: { id: "c1", name: "Marcus Bell" },
    });
    expect(shaped.name).toBe("Bell Roofing");
    expect(shaped.contactId).toBe("c1");
  });

  it("falls back to the contact's name, then to something readable", () => {
    expect(shapeOpportunity({ id: "o1", contact: { name: "Marcus Bell" } }).name).toBe(
      "Marcus Bell",
    );
    expect(shapeOpportunity({ id: "o1", name: "   " }).name).toBe("Unnamed");
    expect(shapeOpportunity({ id: "o1" }).name).toBe("Unnamed");
  });

  it("survives an opportunity with no contact attached", () => {
    const shaped = shapeOpportunity({ id: "o1", contact: null });
    expect(shaped.contactId).toBeNull();
    expect(shaped.phone).toBe("");
    expect(shaped.tags).toEqual([]);
  });

  it("treats a zero value as no value rather than $0", () => {
    expect(shapeOpportunity({ id: "o1", monetaryValue: 0 }).value).toBeNull();
    expect(shapeOpportunity({ id: "o1", monetaryValue: 2500 }).value).toBe(2500);
  });

  it("dates the card by its last movement, falling back to creation", () => {
    expect(shapeOpportunity({ id: "o1", updatedAt: "b", createdAt: "a" }).updatedAt).toBe("b");
    expect(shapeOpportunity({ id: "o1", createdAt: "a" }).updatedAt).toBe("a");
    expect(shapeOpportunity({ id: "o1" }).updatedAt).toBeNull();
  });
});

describe("groupByStage", () => {
  it("puts each card under its stage, in pipeline order", () => {
    const columns = groupByStage(stages, [card(), card({ id: "o2", stageId: "s2" })]);
    expect(columns.map((c) => c.name)).toEqual(["New Lead", "1st Dial (Day 1)"]);
    expect(columns[0].cards.map((c) => c.id)).toEqual(["o1"]);
    expect(columns[1].cards.map((c) => c.id)).toEqual(["o2"]);
  });

  it("keeps an empty stage as a column, so the board is the whole pipeline", () => {
    const columns = groupByStage(stages, []);
    expect(columns).toHaveLength(2);
    expect(columns.every((c) => c.cards.length === 0)).toBe(true);
  });

  it("never loses a card whose stage is gone", () => {
    const columns = groupByStage(stages, [card({ id: "orphan", stageId: "deleted" })]);
    expect(columns[columns.length - 1]).toMatchObject({
      name: "Not in a stage",
      cards: [expect.objectContaining({ id: "orphan" })],
    });
  });

  it("adds no extra column when every card is placed", () => {
    const columns = groupByStage(stages, [card()]);
    expect(columns.map((c) => c.id)).toEqual(["s1", "s2"]);
  });
});
