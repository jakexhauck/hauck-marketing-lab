import { describe, expect, it } from "vitest";
import {
  agentSopForPrompt,
  boardFor,
  cleanName,
  howLines,
  isTellSuggestion,
  moveOrder,
  taskSteps,
  type DirectorResponse,
  type DirectorTask,
} from "./director";

const task = (o: Partial<DirectorTask>): DirectorTask => ({
  id: "t",
  agent: "ghl",
  stageId: "s1",
  position: 0,
  name: "Task",
  owner: "agent",
  nodeId: null,
  how: null,
  howStatus: "set",
  removed: false,
  ...o,
});

const data: DirectorResponse = {
  stages: [
    { id: "s2", agent: "ghl", position: 1, name: "Compliance" },
    { id: "s1", agent: "ghl", position: 0, name: "Account" },
    { id: "x", agent: "ads", position: 0, name: "Setup" },
  ],
  tasks: [
    task({ id: "a", stageId: "s1", position: 1, name: "Add staff", nodeId: "staff" }),
    task({ id: "b", stageId: "s1", position: 0, name: "Create the sub-account", nodeId: "sub" }),
    task({ id: "c", stageId: "s2", position: 0, name: "Send a test lead", how: "1. Submit a test lead\n2. Check Sales" }),
    task({ id: "d", stageId: "s2", position: 1, name: "Drafted", how: "1. Something", howStatus: "draft" }),
    task({ id: "e", stageId: "s2", position: 2, name: "Gone", removed: true, nodeId: "a2p" }),
  ],
};

describe("boardFor", () => {
  it("orders stages and tasks and drops removed tasks and other agents", () => {
    const b = boardFor("ghl", data);
    expect(b.map((c) => c.stage.name)).toEqual(["Account", "Compliance"]);
    expect(b[0].tasks.map((t) => t.id)).toEqual(["b", "a"]);
    expect(b[1].tasks.map((t) => t.id)).toEqual(["c", "d"]);
  });
});

describe("taskSteps", () => {
  it("takes a linked task's steps from its graph box", () => {
    expect(taskSteps(task({ nodeId: "staff" }))).toEqual([
      "Add Jake as staff",
      "Add the owner as staff (email from the onboarding form) with their real cell number, the auto-calls ring it",
      "Owner connects their Google Calendar, two-way",
    ]);
  });
  it("reads an added task's approved steps, none for a draft", () => {
    expect(taskSteps(task({ how: "1. One\n2) Two\n\n- Three" }))).toEqual(["One", "Two", "Three"]);
    expect(taskSteps(task({ how: "1. One", howStatus: "draft" }))).toEqual([]);
  });
});

describe("agentSopForPrompt", () => {
  it("leaves drafts and removed tasks out of the agent's SOP", () => {
    const sop = agentSopForPrompt("ghl", data);
    expect(sop.map((s) => s.name)).toEqual(["Account", "Compliance"]);
    expect(sop[1].tasks.map((t) => t.name)).toEqual(["Send a test lead"]);
    expect(sop[1].tasks[0].steps).toEqual(["Submit a test lead", "Check Sales"]);
  });
  it("drops a stage with nothing approved in it", () => {
    const only = { ...data, tasks: data.tasks.filter((t) => t.id === "d") };
    expect(agentSopForPrompt("ghl", only)).toEqual([]);
  });
});

describe("moveOrder", () => {
  it("puts the task at the index, clamped", () => {
    expect(moveOrder(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveOrder(["a", "b"], "z", 0)).toEqual(["z", "a", "b"]);
    expect(moveOrder(["a", "b"], "z", 99)).toEqual(["a", "b", "z"]);
  });
});

describe("guards", () => {
  it("cleans names", () => {
    expect(cleanName("  Add   staff ")).toBe("Add staff");
    expect(cleanName("")).toBeNull();
    expect(cleanName("x".repeat(121))).toBeNull();
  });
  it("checks Claude's Tell answer", () => {
    expect(isTellSuggestion({ stage: 1, name: "X", owner: "agent", steps: ["a"] })).toBe(true);
    expect(isTellSuggestion({ stage: 1, name: "X", owner: "boss", steps: ["a"] })).toBe(false);
    expect(isTellSuggestion({ stage: 1, name: "X", owner: "agent", steps: [] })).toBe(false);
  });
  it("splits how text", () => {
    expect(howLines(null)).toEqual([]);
  });
});
