import { describe, expect, it } from "vitest";
import type { LeadQuestion } from "../../functions/lib/adLeadForms";
import {
  childrenOf,
  insertFollowUp,
  isFollowUp,
  moveQuestion,
  nextQuestionId,
  removeSubtree,
  subtreeIds,
  topLevel,
  treeOrder,
} from "./leadFormTree";

function q(id: string, fields: Partial<LeadQuestion> = {}): LeadQuestion {
  return {
    id,
    kind: "short",
    label: id,
    fieldName: "",
    prefill: "",
    optional: false,
    multiSelect: false,
    minLength: 0,
    maxLength: 0,
    inlineContext: "",
    options: [],
    showIf: null,
    ...fields,
  };
}

const choice = (id: string, labels: string[]) =>
  q(id, { kind: "choice", options: labels.map((label) => ({ label, disqualify: false })) });

const under = (id: string, parent: string, option: string) =>
  q(id, { showIf: { questionId: parent, optionLabel: option } });

// A choice with a follow-up on each of its two answers, plus a plain question
// after it. The shape almost every real form has.
const forked = (): LeadQuestion[] => [
  choice("q1", ["Windows", "Siding"]),
  under("q2", "q1", "Windows"),
  under("q3", "q1", "Siding"),
  q("q4"),
];

describe("topLevel and isFollowUp", () => {
  it("counts a question with a live rule as a follow-up", () => {
    const list = forked();
    expect(topLevel(list).map((x) => x.id)).toEqual(["q1", "q4"]);
    expect(isFollowUp(list[1], list)).toBe(true);
    expect(isFollowUp(list[3], list)).toBe(false);
  });

  it("treats a rule naming an answer that no longer exists as top level", () => {
    // Otherwise the question is nested under an answer that never draws, which
    // is a question that has vanished from the editor.
    const list = [choice("q1", ["Windows"]), under("q2", "q1", "Gutters")];
    expect(topLevel(list).map((x) => x.id)).toEqual(["q1", "q2"]);
  });
});

describe("subtreeIds", () => {
  it("collects a question and everything hanging off it", () => {
    const list = [...forked(), under("q5", "q2", "anything")];
    expect(subtreeIds(list, "q1").sort()).toEqual(["q1", "q2", "q3", "q5"]);
  });

  it("terminates on a rule that points in a circle", () => {
    const list = [
      q("q1", { showIf: { questionId: "q2", optionLabel: "x" } }),
      q("q2", { showIf: { questionId: "q1", optionLabel: "x" } }),
    ];
    expect(subtreeIds(list, "q1").sort()).toEqual(["q1", "q2"]);
  });
});

describe("treeOrder", () => {
  it("puts every follow-up directly after the answer that reveals it", () => {
    const scrambled = [q("q4"), under("q3", "q1", "Siding"), choice("q1", ["Windows", "Siding"]), under("q2", "q1", "Windows")];
    expect(treeOrder(scrambled).map((x) => x.id)).toEqual(["q4", "q1", "q2", "q3"]);
  });

  it("keeps a question whose rule points in a circle rather than dropping it", () => {
    const list = [
      q("q1", { showIf: { questionId: "q2", optionLabel: "x" } }),
      choice("q2", ["x"]),
    ];
    expect(treeOrder(list).map((x) => x.id).sort()).toEqual(["q1", "q2"]);
  });
});

describe("moveQuestion", () => {
  it("takes the follow-ups with it, so a rule is never left pointing forward", () => {
    const moved = moveQuestion(forked(), "q1", 1);
    expect(moved.map((x) => x.id)).toEqual(["q4", "q1", "q2", "q3"]);
  });

  it("moves a follow-up among its siblings only", () => {
    const list = [choice("q1", ["Windows"]), under("q2", "q1", "Windows"), under("q3", "q1", "Windows")];
    expect(moveQuestion(list, "q3", -1).map((x) => x.id)).toEqual(["q1", "q3", "q2"]);
  });

  it("does nothing at the ends", () => {
    const list = forked();
    expect(moveQuestion(list, "q1", -1)).toBe(list);
    expect(moveQuestion(list, "q4", 1)).toBe(list);
  });

  it("does nothing for a question that is not there", () => {
    const list = forked();
    expect(moveQuestion(list, "nope", 1)).toBe(list);
  });
});

describe("removeSubtree", () => {
  it("takes the follow-ups with it", () => {
    // A follow-up whose parent is gone can never be asked, so leaving it behind
    // would leave a question on screen the preview refuses to draw.
    expect(removeSubtree(forked(), "q1").map((x) => x.id)).toEqual(["q4"]);
  });
});

describe("insertFollowUp", () => {
  it("puts the first follow-up straight after its parent", () => {
    const list = [choice("q1", ["Windows"]), q("q4")];
    const next = insertFollowUp(list, "q1", "Windows", under("q5", "q1", "Windows"));
    expect(next.map((x) => x.id)).toEqual(["q1", "q5", "q4"]);
  });

  it("puts the next one after the last follow-up already on that answer", () => {
    const list = [choice("q1", ["Windows"]), under("q2", "q1", "Windows"), q("q4")];
    const next = insertFollowUp(list, "q1", "Windows", under("q5", "q1", "Windows"));
    expect(next.map((x) => x.id)).toEqual(["q1", "q2", "q5", "q4"]);
  });

  it("clears the whole subtree of the question it lands behind", () => {
    // Landing between q2 and its own follow-up would put a sibling inside
    // somebody else's branch.
    const list = [
      choice("q1", ["Windows"]),
      choice("q2", ["Wood"], ),
      under("q3", "q2", "Wood"),
    ];
    list[1].showIf = { questionId: "q1", optionLabel: "Windows" };
    const next = insertFollowUp(list, "q1", "Windows", under("q9", "q1", "Windows"));
    expect(next.map((x) => x.id)).toEqual(["q1", "q2", "q3", "q9"]);
  });

  it("appends when the parent is not in the list at all", () => {
    const list = [q("q1")];
    const next = insertFollowUp(list, "missing", "x", q("q9"));
    expect(next.map((x) => x.id)).toEqual(["q1", "q9"]);
  });
});

describe("childrenOf and nextQuestionId", () => {
  it("returns only the questions one answer reveals", () => {
    expect(childrenOf(forked(), "q1", "Windows").map((x) => x.id)).toEqual(["q2"]);
  });

  it("never hands out an id already taken", () => {
    const list = [q("q1"), q("q2"), q("q3"), q("q4")];
    expect(list.map((x) => x.id)).not.toContain(nextQuestionId(list));
  });
});
