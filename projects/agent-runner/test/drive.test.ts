import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedSince, driveAgent, pullDrive, pushChanged, snapshotFiles } from "../src/drive.ts";

function recorder() {
  const calls: string[][] = [];
  const exec = async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    return "";
  };
  return { calls, exec };
}

const noDelete = (calls: string[][]) => {
  for (const c of calls) {
    expect(c).not.toContain("sync");
    expect(c).not.toContain("delete");
    expect(c.some((a) => a.startsWith("--delete"))).toBe(false);
    expect(c.some((a) => a.startsWith("--max-delete"))).toBe(false);
  }
};

describe("drive mirror", () => {
  it("pulls the agency folder with a copy, small files only, docs as text", async () => {
    const r = recorder();
    await pullDrive({ remote: "gdrive:Hauck", localRoot: "/opt/data/drive", exec: r.exec });
    expect(r.calls).toEqual([
      ["rclone", "copy", "gdrive:Hauck", "/opt/data/drive", "--max-size", "20M", "--drive-export-formats", "txt,csv"],
    ]);
    noDelete(r.calls);
  });

  it("finds only the files a turn created or changed", () => {
    const dir = mkdtempSync(join(tmpdir(), "drive-"));
    writeFileSync(join(dir, "old.txt"), "x");
    writeFileSync(join(dir, "edited.md"), "x");
    utimesSync(join(dir, "edited.md"), 1000, 1000);
    const before = snapshotFiles(dir);
    mkdirSync(join(dir, "Reports"));
    writeFileSync(join(dir, "Reports", "October.md"), "report");
    writeFileSync(join(dir, "edited.md"), "y");
    utimesSync(join(dir, "edited.md"), 2000, 2000);
    expect(changedSince(dir, before).sort()).toEqual(["Reports/October.md", "edited.md"]);
  });

  it("uploads each changed file one by one, never deleting", async () => {
    const r = recorder();
    const sent = await pushChanged(
      { remote: "gdrive:Hauck", localRoot: "/opt/data/drive", exec: r.exec },
      "/opt/data/drive/W Willis Windows",
      ["Reports/October.md"],
    );
    expect(sent).toEqual(["Reports/October.md"]);
    expect(r.calls).toEqual([
      ["rclone", "copyto", "/opt/data/drive/W Willis Windows/Reports/October.md", "gdrive:Hauck/W Willis Windows/Reports/October.md"],
    ]);
    noDelete(r.calls);
  });

  it("is for the CSM and Research only", () => {
    expect((["manager", "csm", "research", "ads", "ghl"] as const).filter(driveAgent)).toEqual(["csm", "research"]);
  });
});
