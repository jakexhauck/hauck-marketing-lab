import { describe, expect, it } from "vitest";
import { driveAgent, pullDrive, pushChanged } from "../src/drive.ts";

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
      ["rclone", "copy", "gdrive:Hauck", "/opt/data/drive", "--max-size", "20M", "--drive-export-formats", "txt,csv", "--update"],
    ]);
    noDelete(r.calls);
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
