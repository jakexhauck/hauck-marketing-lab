import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { METAOPS_SCRIPT } from "../src/config.ts";

// bin/metaops.mjs refuses before it reads a secret or touches the network, so
// these never reach Doppler or the app.
function run(args: string[], env: Record<string, string>) {
  const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" };
  return spawnSync(process.execPath, [METAOPS_SCRIPT, ...args], { env: { ...base, ...env }, encoding: "utf8" });
}

describe("bin/metaops.mjs", () => {
  it("lives in the runner's bin folder", () => {
    expect(METAOPS_SCRIPT.endsWith("/bin/metaops.mjs")).toBe(true);
    expect(METAOPS_SCRIPT).not.toContain("\\");
  });

  it("refuses an op that is not on the list, deletes and new campaigns included", () => {
    for (const op of ["delete", "createCampaign", "createAdSet", "write.customValue"]) {
      const r = run([op], { AGENT_TENANT_ID: "t", AGENT_MESSAGE_ID: "m" });
      expect(r.status, op).toBe(1);
      expect(r.stderr).toContain("op must be one of");
    }
  });

  it("refuses args that are not one JSON object", () => {
    const r = run(["pause", "[1,2]"], { AGENT_TENANT_ID: "t", AGENT_MESSAGE_ID: "m" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("one JSON object");
  });

  it("needs the client and the turn from the environment, with no flag to stand in", () => {
    expect(run(["read.structure"], { AGENT_MESSAGE_ID: "m" }).stderr).toContain("no client");
    expect(run(["read.structure", "--tenant", "x"], { AGENT_MESSAGE_ID: "m" }).status).toBe(1);
    expect(run(["read.structure"], { AGENT_TENANT_ID: "t" }).stderr).toContain("no turn id");
  });
});
