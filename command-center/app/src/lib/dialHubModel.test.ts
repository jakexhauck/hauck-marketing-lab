import { describe, it, expect } from "vitest";
import {
  addRow,
  addSection,
  removeRow,
  removeSection,
  rowKind,
  setRowLabel,
  setRowValue,
  setSectionNote,
  setSectionTitle,
} from "./dialHubModel";
import type { DialHub } from "./dialHubModel";

const HUB: DialHub = {
  sections: [
    {
      id: "s1",
      title: "Calendar",
      note: "",
      rows: [
        { id: "r1", label: "Estimate", value: "https://example.com/estimate" },
        { id: "r2", label: "Job", value: "" },
      ],
    },
    { id: "s2", title: "Tags", note: "n", rows: [{ id: "r3", label: "Day 1", value: "no answer" }] },
  ],
};

// rowKind is what removes the need for a per-row type dropdown: the value
// itself says whether the row is somewhere to go or something to paste.
describe("rowKind", () => {
  it("calls an http or https value a link", () => {
    expect(rowKind("https://calendar.google.com/x")).toBe("link");
    expect(rowKind("http://example.com")).toBe("link");
  });

  it("calls a tag string text, including ones that look almost like a host", () => {
    expect(rowKind("no answer day 1")).toBe("text");
    expect(rowKind("services-unqualified")).toBe("text");
    // No scheme, so not a link. Strict on purpose: guessing a scheme onto a
    // half-typed value would produce a button that navigates somewhere wrong.
    expect(rowKind("www.example.com")).toBe("text");
  });

  it("does not treat a non-web scheme as a link", () => {
    expect(rowKind("mailto:jake@example.com")).toBe("text");
    expect(rowKind("javascript:alert(1)")).toBe("text");
  });

  it("calls an empty or whitespace-only value blank", () => {
    expect(rowKind("")).toBe("blank");
    expect(rowKind("   ")).toBe("blank");
  });

  it("ignores surrounding whitespace when detecting a link", () => {
    expect(rowKind("  https://example.com  ")).toBe("link");
  });
});

describe("edit operations", () => {
  it("never mutates the document handed to them", () => {
    const before = JSON.stringify(HUB);
    setRowValue(HUB, "s1", "r2", "changed");
    setRowLabel(HUB, "s1", "r1", "changed");
    setSectionTitle(HUB, "s1", "changed");
    setSectionNote(HUB, "s1", "changed");
    addRow(HUB, "s1", "new");
    removeRow(HUB, "s1", "r1");
    addSection(HUB, "new");
    removeSection(HUB, "s1");
    expect(JSON.stringify(HUB)).toBe(before);
  });

  it("sets a row value", () => {
    const next = setRowValue(HUB, "s1", "r2", "https://example.com/job");
    expect(next.sections[0].rows[1].value).toBe("https://example.com/job");
    expect(next.sections[0].rows[0].value).toBe(HUB.sections[0].rows[0].value);
  });

  it("sets a row label", () => {
    expect(setRowLabel(HUB, "s2", "r3", "Day One").sections[1].rows[0].label).toBe("Day One");
  });

  it("sets a section title and note", () => {
    expect(setSectionTitle(HUB, "s2", "Dialing Tags").sections[1].title).toBe("Dialing Tags");
    expect(setSectionNote(HUB, "s2", "note").sections[1].note).toBe("note");
  });

  it("appends an empty row to the right section", () => {
    const next = addRow(HUB, "s1", "r9");
    expect(next.sections[0].rows).toHaveLength(3);
    expect(next.sections[0].rows[2]).toEqual({ id: "r9", label: "", value: "" });
    expect(next.sections[1].rows).toHaveLength(1);
  });

  it("removes a row and leaves its siblings", () => {
    const next = removeRow(HUB, "s1", "r1");
    expect(next.sections[0].rows.map((r) => r.id)).toEqual(["r2"]);
  });

  it("appends an empty section and removes a section with its rows", () => {
    const added = addSection(HUB, "s9");
    expect(added.sections).toHaveLength(3);
    expect(added.sections[2]).toEqual({ id: "s9", title: "", note: "", rows: [] });
    expect(removeSection(HUB, "s1").sections.map((s) => s.id)).toEqual(["s2"]);
  });

  it("returns the document untouched when the target id does not exist", () => {
    expect(setRowValue(HUB, "nope", "r1", "x")).toEqual(HUB);
    expect(setRowValue(HUB, "s1", "nope", "x")).toEqual(HUB);
    expect(removeRow(HUB, "s1", "nope")).toEqual(HUB);
    expect(removeSection(HUB, "nope")).toEqual(HUB);
  });
});
