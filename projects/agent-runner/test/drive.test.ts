import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { driveAgent, pullDrive, pushChanged } from "../src/drive.ts";

function recorder(lsf = "") {
  const calls: string[][] = [];
  const exec = async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    return args[0] === "lsf" ? lsf : "";
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
      ["rclone", "copy", "gdrive:Hauck", "/opt/data/drive", "--max-size", "20M", "--drive-export-formats", "txt,csv", "--update"],
      ["rclone", "lsf", "gdrive:Hauck", "-R", "--files-only", "--min-size", "20M"],
    ]);
    noDelete(r.calls);
  });

  it("leaves an empty stand-in for each big photo or video, and never overwrites a real file", async () => {
    const root = mkdtempSync(join(tmpdir(), "drive-"));
    mkdirSync(join(root, "AAG"), { recursive: true });
    writeFileSync(join(root, "AAG", "have.mp4"), "real");
    const r = recorder("AAG/raw/clip one.MOV\nAAG/have.mp4\nAAG/big.zip\n../escape.mp4\n");
    await pullDrive({ remote: "gdrive:Hauck", localRoot: root, exec: r.exec });
    expect(statSync(join(root, "AAG", "raw", "clip one.MOV")).size).toBe(0);
    expect(readFileSync(join(root, "AAG", "have.mp4"), "utf8")).toBe("real");
    expect(existsSync(join(root, "AAG", "big.zip"))).toBe(false);
    expect(existsSync(join(root, "..", "escape.mp4"))).toBe(false);
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
