import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendLessons, applyEdits, readLessons } from "../src/brain.ts";

function tempFile(body?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-"));
  const file = join(dir, "Brain.md");
  if (body !== undefined) writeFileSync(file, body);
  return file;
}

const HEAD = "---\nagent: ads\n---\n\n# Ads Brain\n\n## Lessons\n";

describe("brain files", () => {
  it("appends lessons in the block id format and reads them back", () => {
    const file = tempFile(HEAD);
    const added = appendLessons(file, "ads", "Willis Windows, chat 1a2b", ["Before/after beats quotes"], "2026-10-17");
    expect(added).toHaveLength(1);
    expect(added[0].id).toMatch(/^l-[0-9a-f]{8}$/);
    const body = readFileSync(file, "utf8");
    expect(body).toContain(
      `- [2026-10-17] (ads, Willis Windows, chat 1a2b) Before/after beats quotes ^${added[0].id}\n`,
    );
    const read = readLessons(file, { scope: "client", tenantId: "t1" });
    expect(read).toEqual([
      {
        id: added[0].id,
        scope: "client",
        tenantId: "t1",
        agent: "ads",
        text: "Before/after beats quotes",
        source: "Willis Windows, chat 1a2b",
        learnedOn: "2026-10-17",
        kind: "lesson",
        replacedBy: null,
      },
    ]);
  });

  it("creates a missing file with a Lessons heading", () => {
    const file = tempFile();
    appendLessons(file, "research", "chat x", ["One"], "2026-10-17");
    expect(readFileSync(file, "utf8")).toContain("## Lessons");
    expect(readLessons(file)).toHaveLength(1);
  });

  it("keeps lesson text on one line and out of the id syntax", () => {
    const file = tempFile(HEAD);
    const [l] = appendLessons(file, "ads", "chat (a)", ["two\nlines ^l-deadbeef"], "2026-10-17");
    expect(l.text).toBe("two lines");
    expect(readLessons(file)).toHaveLength(1);
  });

  it("deletes by id after another line was appended (edit queued earlier)", () => {
    const file = tempFile(HEAD);
    const [first] = appendLessons(file, "ads", "chat a", ["Keep me?"], "2026-10-16");
    // The delete was queued in the app here; then the runner appended more.
    appendLessons(file, "ads", "chat b", ["Newer lesson"], "2026-10-17");
    const applied = applyEdits(file, [{ id: "e1", lessonId: first.id, action: "delete", text: null }]);
    expect(applied).toEqual(["e1"]);
    expect(readLessons(file).map((l) => l.text)).toEqual(["Newer lesson"]);
  });

  it("replaces on edit: the old line is kept and marked, the new wording is Jake's", () => {
    const file = tempFile(HEAD);
    const [a] = appendLessons(file, "ads", "chat a", ["Old text"], "2026-10-16");
    const applied = applyEdits(
      file,
      [
        { id: "e2", lessonId: a.id, action: "edit", text: "New text" },
        { id: "e3", lessonId: "l-ffffffff", action: "delete", text: null },
      ],
      "2026-10-22",
    );
    expect(applied).toEqual(["e2"]);
    const [old, now] = readLessons(file);
    expect(old).toMatchObject({ id: a.id, text: "Old text", learnedOn: "2026-10-16", source: "chat a" });
    expect(old.replacedBy).toBe(now.id);
    expect(now).toMatchObject({ text: "New text", source: "Jake", learnedOn: "2026-10-22", replacedBy: null, kind: "lesson" });
  });

  it("reads a kind off the line and keeps it through an edit", () => {
    const file = tempFile(HEAD);
    const [a] = appendLessons(file, "csm", "chat a", ["[decision] Willis runs the $500 off offer"], "2026-10-16");
    expect(a).toMatchObject({ kind: "decision", text: "Willis runs the $500 off offer" });
    applyEdits(file, [{ id: "e1", lessonId: a.id, action: "edit", text: "Willis runs $600 off" }], "2026-10-22");
    const now = readLessons(file).find((l) => !l.replacedBy)!;
    expect(now).toMatchObject({ kind: "decision", text: "Willis runs $600 off" });
  });

  it("does not edit a line that was already replaced, and says so", () => {
    const file = tempFile(HEAD);
    const [a] = appendLessons(file, "ads", "chat a", ["One"], "2026-10-16");
    applyEdits(file, [{ id: "e1", lessonId: a.id, action: "edit", text: "Two" }], "2026-10-17");
    // Reported done (so it never waits forever), but the history is untouched.
    expect(applyEdits(file, [{ id: "e2", lessonId: a.id, action: "edit", text: "Three" }])).toEqual(["e2"]);
    expect(readLessons(file)).toHaveLength(2);
  });

  it("ignores lines that only mention an id mid-text", () => {
    const file = tempFile(HEAD + "- a note about ^l-12345678 in the middle\n");
    expect(applyEdits(file, [{ id: "e4", lessonId: "l-12345678", action: "delete", text: null }])).toEqual([]);
  });
});
