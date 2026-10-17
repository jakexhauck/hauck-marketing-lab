import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileBriefNotes } from "../src/notes.ts";

describe("fileBriefNotes", () => {
  it("keeps a note per chat until it is cleared", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "notes-")), "brief-notes");
    const notes = fileBriefNotes(dir);
    expect(notes.get("c1")).toBeNull();
    notes.set("c1", "Jake edited it");
    expect(fileBriefNotes(dir).get("c1")).toBe("Jake edited it");
    notes.clear("c1");
    expect(notes.get("c1")).toBeNull();
  });

  it("never turns a chat id into a path", () => {
    const root = mkdtempSync(join(tmpdir(), "notes-"));
    const notes = fileBriefNotes(join(root, "brief-notes"));
    notes.set("../escape", "x");
    notes.set("a/b", "x");
    expect(existsSync(join(root, "escape.txt"))).toBe(false);
    expect(existsSync(join(root, "brief-notes")) ? readdirSync(join(root, "brief-notes")) : []).toEqual([]);
    expect(notes.get("../escape")).toBeNull();
  });
});
