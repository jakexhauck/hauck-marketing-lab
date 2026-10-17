import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { GHL_SCRIPT } from "../src/config.ts";

// bin/ghl.mjs refuses before it reads a secret or touches the network, so
// these never reach Doppler or the app.
function run(args: string[], env: Record<string, string>) {
  const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" };
  return spawnSync(process.execPath, [GHL_SCRIPT, ...args], { env: { ...base, ...env }, encoding: "utf8" });
}

describe("bin/ghl.mjs", () => {
  it("lives in the runner's bin folder", () => {
    expect(GHL_SCRIPT.endsWith("/bin/ghl.mjs")).toBe(true);
    expect(GHL_SCRIPT).not.toContain("\\");
  });

  it("refuses an op that is not on the list", () => {
    const r = run(["write.deleteContact"], { AGENT_TENANT_ID: "t", AGENT_MESSAGE_ID: "m" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("op must be one of");
  });

  it("refuses args that are not one JSON object", () => {
    const r = run(["write.customValue", "[1,2]"], { AGENT_TENANT_ID: "t", AGENT_MESSAGE_ID: "m" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("one JSON object");
  });

  it("needs the client and the turn from the environment, with no flag to stand in", () => {
    expect(run(["read.pipelines"], { AGENT_MESSAGE_ID: "m" }).stderr).toContain("no client");
    expect(run(["read.pipelines", "--tenant", "x"], { AGENT_MESSAGE_ID: "m" }).status).toBe(1);
    expect(run(["read.pipelines"], { AGENT_TENANT_ID: "t" }).stderr).toContain("no turn id");
  });
});
