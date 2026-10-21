import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startBridge, type AppTools, type Bridge } from "../src/mcpBridge.ts";

const TOKENS = { manager: "t-manager", csm: "t-csm", ghl: "t-ghl", research: "t-research" };

function fakeTools() {
  const calls: { tool: string; body: Record<string, unknown> }[] = [];
  const tools: AppTools = {
    async ghl(body) {
      calls.push({ tool: "ghl", body });
      return '{"ok":true}';
    },
    async meta(q) {
      calls.push({ tool: "meta", body: q });
      return '{"cpl":12}';
    },
  };
  return { calls, tools };
}

let bridge: Bridge | null = null;
afterEach(async () => {
  await bridge?.close();
  bridge = null;
});

async function start() {
  const f = fakeTools();
  bridge = await startBridge({ port: 0, tokens: TOKENS, tools: f.tools });
  return f;
}

async function rpc(token: string | null, method: string, params: unknown = {}) {
  const res = await fetch(`http://127.0.0.1:${bridge!.port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const call = async (token: string, name: string, args: Record<string, unknown>) =>
  (await rpc(token, "tools/call", { name, arguments: args })).body.result as { content: { text: string }[]; isError?: boolean };

const toolNames = (r: { body: any }) => r.body.result.tools.map((t: { name: string }) => t.name);

describe("startBridge", () => {
  it("answers initialize as an MCP server with tools", async () => {
    await start();
    const r = await rpc("t-csm", "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "hermes" } });
    expect(r.body.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "hauck" } });
  });

  it("refuses a missing or unknown token", async () => {
    await start();
    expect((await rpc(null, "tools/list")).status).toBe(401);
    expect((await rpc("t-nope", "tools/list")).status).toBe(401);
  });

  it("lists each agent's own tools only", async () => {
    await start();
    const files = ["list_files", "read_file", "write_file"];
    expect(toolNames(await rpc("t-csm", "tools/list"))).toEqual(["meta_insights", ...files]);
    expect(toolNames(await rpc("t-manager", "tools/list"))).toEqual(["meta_insights", ...files]);
    expect(toolNames(await rpc("t-research", "tools/list"))).toEqual(files);
    expect(toolNames(await rpc("t-ghl", "tools/list"))).toEqual(["ghl"]);
  });

  it("refuses a call while that agent has no turn running", async () => {
    const f = await start();
    const r = await call("t-ghl", "ghl", { turn: "M1", op: "read.pipelines" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no turn is running/i);
    expect(f.calls).toEqual([]);
  });

  it("takes the client and turn from the running turn, never from the arguments", async () => {
    const f = await start();
    bridge!.setTurn("ghl", { tenantId: "T1", messageId: "M1" });
    const r = await call("t-ghl", "ghl", { turn: "M1", op: "write.tag", args: { tag: "hot" }, tenantId: "T2", messageId: "M2" });
    expect(r).toEqual({ content: [{ type: "text", text: '{"ok":true}' }] });
    expect(f.calls).toEqual([{ tool: "ghl", body: { messageId: "M1", tenantId: "T1", op: "write.tag", args: { tag: "hot" } } }]);
  });

  // Hermes may still be running a turn the runner gave up on. Its late call
  // must not act under the next turn's client.
  it("refuses a call from an earlier turn, or one that names no turn", async () => {
    const f = await start();
    bridge!.setTurn("ghl", { tenantId: "T-B", messageId: "M-B" });
    expect((await call("t-ghl", "ghl", { turn: "M-A", op: "write.tag" })).content[0].text).toMatch(/not the one running now/);
    expect((await call("t-ghl", "ghl", { op: "write.tag" })).isError).toBe(true);
    expect(f.calls).toEqual([]);
  });

  it("refuses a tool that is not this agent's", async () => {
    const f = await start();
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M1" });
    expect((await call("t-csm", "ghl", { turn: "M1", op: "write.tag" })).isError).toBe(true);
    expect(f.calls).toEqual([]);
  });

  it("lets only the agency Manager pick a client for Meta numbers", async () => {
    const f = await start();
    bridge!.setTurn("manager", { tenantId: null, messageId: "M1" });
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M2" });
    await call("t-manager", "meta_insights", { turn: "M1", tenant: "T9", level: "campaign", days: 30 });
    await call("t-csm", "meta_insights", { turn: "M2", tenant: "T9" });
    expect(f.calls).toEqual([
      { tool: "meta", body: { tenant: "T9", level: "campaign", days: 30 } },
      { tool: "meta", body: { tenant: "T1", level: "account", days: 7 } },
    ]);
  });

  it("does not let a CSM in an agency chat pick a client", async () => {
    const f = await start();
    bridge!.setTurn("csm", { tenantId: null, messageId: "M1" });
    expect((await call("t-csm", "meta_insights", { turn: "M1", tenant: "T9" })).isError).toBe(true);
    expect(f.calls).toEqual([]);
  });

  it("refuses a GHL call with no client", async () => {
    const f = await start();
    bridge!.setTurn("ghl", { tenantId: null, messageId: "M1" });
    expect((await call("t-ghl", "ghl", { turn: "M1", op: "read.pipelines" })).isError).toBe(true);
    expect(f.calls).toEqual([]);
  });

  it("stops a call once the turn is over", async () => {
    const f = await start();
    bridge!.setTurn("ghl", { tenantId: "T1", messageId: "M1" });
    bridge!.setTurn("ghl", null);
    expect((await call("t-ghl", "ghl", { turn: "M1", op: "read.pipelines" })).isError).toBe(true);
    expect(f.calls).toEqual([]);
  });

  it("acknowledges notifications with no body", async () => {
    await start();
    const res = await fetch(`http://127.0.0.1:${bridge!.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t-csm" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(res.status).toBe(202);
  });
});

describe("file tools", () => {
  function folders() {
    const root = mkdtempSync(join(tmpdir(), "bridge-"));
    const work = join(root, "work", "csm-willis");
    const drive = join(root, "drive", "Willis Windows");
    const secret = join(root, "profiles", "ghl");
    for (const d of [work, drive, secret]) mkdirSync(d, { recursive: true });
    writeFileSync(join(drive, "Notes.txt"), "client notes");
    writeFileSync(join(secret, ".env"), "API_SERVER_KEY=secret");
    return { root, work, drive, secret };
  }

  it("reads, lists and writes inside the turn's folders, and records what it wrote", async () => {
    await start();
    const f = folders();
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M1", roots: [{ dir: f.work, write: true }, { dir: f.drive, write: true }] });
    expect((await call("t-csm", "read_file", { turn: "M1", path: join(f.drive, "Notes.txt") })).content[0].text).toBe("client notes");
    expect((await call("t-csm", "list_files", { turn: "M1", path: f.drive })).content[0].text).toBe("Notes.txt");
    const w = await call("t-csm", "write_file", { turn: "M1", path: join(f.drive, "Reports", "October.md"), content: "# October" });
    expect(w.isError).toBeUndefined();
    expect(readFileSync(join(f.drive, "Reports", "October.md"), "utf8")).toBe("# October");
    await call("t-csm", "write_file", { turn: "M1", path: "draft.md", content: "x" });
    expect(bridge!.written("csm").sort()).toEqual([join(f.drive, "Reports", "October.md"), join(f.work, "draft.md")].sort());
  });

  it("refuses anything outside the turn's folders, by path or by climbing", async () => {
    await start();
    const f = folders();
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M1", roots: [{ dir: f.work, write: true }] });
    for (const path of [join(f.secret, ".env"), "../../profiles/ghl/.env", "/etc/passwd"]) {
      const r = await call("t-csm", "read_file", { turn: "M1", path });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/outside your folders/);
    }
  });

  it("does not follow a link out of a folder", async () => {
    await start();
    const f = folders();
    try {
      symlinkSync(f.secret, join(f.work, "escape"), "junction");
    } catch {
      return; // no symlink rights on this machine; the VPS is Linux
    }
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M1", roots: [{ dir: f.work, write: true }] });
    expect((await call("t-csm", "read_file", { turn: "M1", path: join(f.work, "escape", ".env") })).isError).toBe(true);
  });

  it("refuses a write in a read-only folder", async () => {
    await start();
    const f = folders();
    bridge!.setTurn("manager", { tenantId: null, messageId: "M1", roots: [{ dir: f.work, write: false }] });
    const r = await call("t-manager", "write_file", { turn: "M1", path: "x.md", content: "x" });
    expect(r.content[0].text).toMatch(/cannot write/);
  });

  it("starts each turn with nothing written", async () => {
    await start();
    const f = folders();
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M1", roots: [{ dir: f.work, write: true }] });
    await call("t-csm", "write_file", { turn: "M1", path: "a.md", content: "x" });
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M2", roots: [{ dir: f.work, write: true }] });
    expect(bridge!.written("csm")).toEqual([]);
  });
});
