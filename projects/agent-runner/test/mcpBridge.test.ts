import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Higgsfield } from "../src/higgsfield.ts";
import { startBridge, type AppTools, type Bridge } from "../src/mcpBridge.ts";

const TOKENS = { manager: "t-manager", csm: "t-csm", ghl: "t-ghl", research: "t-research", ads: "t-ads" };

// Higgsfield's own list has more than the bridge serves (upscale_image here).
const HF_LIST = ["balance", "ads_studio_quote", "generate_image", "generate_video", "jobs_wait", "upscale_image"].map((name) => ({
  name,
  description: name,
  inputSchema: {
    type: "object",
    properties: { prompt: { type: "string" }, ...(name === "generate_video" ? { max_credits: { type: "number" } } : {}) },
    required: name === "generate_image" ? ["prompt"] : [],
  },
}));

function fakeTools(signedIn = true) {
  const calls: { tool: string; body: Record<string, unknown> }[] = [];
  // Each generate costs 8 credits.
  let credits = 100;
  const higgsfield: Higgsfield = {
    ready: () => signedIn,
    listTools: async () => HF_LIST,
    async call(name, args) {
      calls.push({ tool: `hf:${name}`, body: args });
      if (name.startsWith("generate")) credits -= 8;
      return { text: `{"credits":${credits}}`, isError: false };
    },
  };
  const tools: AppTools = {
    higgsfield,
    async metaOps(body) {
      calls.push({ tool: "metaOps", body });
      return '{"ok":true}';
    },
    async ghl(body) {
      calls.push({ tool: "ghl", body });
      return '{"ok":true}';
    },
    async meta(q) {
      calls.push({ tool: "meta", body: q });
      return '{"cpl":12}';
    },
    async brief(tenant) {
      calls.push({ tool: "brief", body: { tenant } });
      return '{"pages":[]}';
    },
  };
  return { calls, tools };
}

let bridge: Bridge | null = null;
afterEach(async () => {
  await bridge?.close();
  bridge = null;
});

async function start(signedIn = true) {
  const f = fakeTools(signedIn);
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
    expect(toolNames(await rpc("t-manager", "tools/list"))).toEqual(["meta_insights", "client_brief", ...files]);
    expect(toolNames(await rpc("t-research", "tools/list"))).toEqual(files);
    expect(toolNames(await rpc("t-ghl", "tools/list"))).toEqual(["ghl"]);
  });

  it("gives the Ads Agent Ads Manager ops and the served Higgsfield tools, each naming its turn", async () => {
    await start();
    const r = await rpc("t-ads", "tools/list");
    expect(toolNames(r)).toEqual(["meta_insights", "meta_ops", "list_files", "read_file", "write_file", "balance", "ads_studio_quote", "generate_image", "generate_video", "jobs_wait"]);
    const gen = r.body.result.tools.find((t: { name: string }) => t.name === "generate_image");
    expect(gen.inputSchema.required).toEqual(["prompt", "turn"]);
    expect(gen.inputSchema.properties).toHaveProperty("prompt");
    expect(gen.description).toMatch(/Paid/);
  });

  it("lists no Higgsfield tools while the runner is not signed in", async () => {
    await start(false);
    expect(toolNames(await rpc("t-ads", "tools/list"))).toEqual(["meta_insights", "meta_ops", "list_files", "read_file", "write_file"]);
  });

  it("sends Ads Manager ops with the running turn's client and message", async () => {
    const f = await start();
    bridge!.setTurn("ads", { tenantId: "T1", messageId: "M1" });
    await call("t-ads", "meta_ops", { turn: "M1", op: "pause", args: { level: "ad", id: "1" }, tenantId: "T2" });
    expect(f.calls).toEqual([{ tool: "metaOps", body: { messageId: "M1", tenantId: "T1", op: "pause", args: { level: "ad", id: "1" } } }]);
    expect((await call("t-ads", "meta_ops", { turn: "M1", op: "delete" })).isError).toBe(true);
    bridge!.setTurn("ads", { tenantId: null, messageId: "M2" });
    expect((await call("t-ads", "meta_ops", { turn: "M2", op: "read.structure" })).isError).toBe(true);
    expect(f.calls).toHaveLength(1);
  });

  // Jake's rule: nothing that costs credits without his Approve of the price.
  it("runs Higgsfield quotes any turn and generate only under a spend grant", async () => {
    const f = await start();
    bridge!.setTurn("ads", { tenantId: "T1", messageId: "M1", spend: null });
    expect((await call("t-ads", "balance", { turn: "M1" })).isError).toBeUndefined();
    const no = await call("t-ads", "generate_image", { turn: "M1", prompt: "door" });
    expect(no.isError).toBe(true);
    expect(no.content[0].text).toMatch(/no spend is approved/i);
    expect((await call("t-ads", "jobs_wait", { turn: "M1" })).isError).toBe(true);
    expect((await call("t-ads", "upscale_image", { turn: "M1" })).isError).toBe(true);

    bridge!.setTurn("ads", { tenantId: "T1", messageId: "M2", spend: 24 });
    expect((await call("t-ads", "generate_image", { turn: "M2", prompt: "door" })).isError).toBeUndefined();
    expect((await call("t-ads", "upscale_image", { turn: "M2" })).isError).toBe(true);
    expect(f.calls).toEqual([
      { tool: "hf:balance", body: {} },
      { tool: "hf:balance", body: {} },
      { tool: "hf:generate_image", body: { prompt: "door" } },
    ]);
  });

  it("checks two generate calls made at once one after the other, and caps a tool that takes a ceiling", async () => {
    const f = await start();
    bridge!.setTurn("ads", { tenantId: "T1", messageId: "M1", spend: 10 });
    const [a, b] = await Promise.all([
      call("t-ads", "generate_image", { turn: "M1", prompt: "a" }),
      call("t-ads", "generate_image", { turn: "M1", prompt: "b" }),
    ]);
    expect([a.isError, b.isError].filter(Boolean)).toHaveLength(0);
    // Each check sees the balance after the call before it, never the same one twice.
    expect(f.calls.map((x) => x.tool)).toEqual(["hf:balance", "hf:generate_image", "hf:balance", "hf:generate_image"]);
    // 16 of 10 spent now (an image takes no ceiling), so nothing more runs.
    const c = await call("t-ads", "generate_video", { turn: "M1", prompt: "v", max_credits: 50 });
    expect(c.isError).toBe(true);
    bridge!.setTurn("ads", { tenantId: "T1", messageId: "M2", spend: 30 });
    await call("t-ads", "generate_video", { turn: "M2", prompt: "v", max_credits: 50 });
    expect(f.calls.at(-1)).toEqual({ tool: "hf:generate_video", body: { prompt: "v", max_credits: 30 } });
  });

  it("stops generating once the approved credits are spent", async () => {
    const f = await start();
    bridge!.setTurn("ads", { tenantId: "T1", messageId: "M1", spend: 16 });
    expect((await call("t-ads", "generate_image", { turn: "M1", prompt: "a" })).isError).toBeUndefined();
    expect((await call("t-ads", "generate_image", { turn: "M1", prompt: "b" })).isError).toBeUndefined();
    const third = await call("t-ads", "generate_image", { turn: "M1", prompt: "c" });
    expect(third.content[0].text).toMatch(/16 credits Jake approved are used up \(16 spent/);
    expect(f.calls.filter((c) => c.tool === "hf:generate_image")).toHaveLength(2);
    // A new turn starts counting again.
    bridge!.setTurn("ads", { tenantId: "T1", messageId: "M2", spend: 8 });
    expect((await call("t-ads", "generate_image", { turn: "M2", prompt: "d" })).isError).toBeUndefined();
  });

  it("never lets another agent reach Higgsfield", async () => {
    const f = await start();
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M1", spend: 100 });
    expect((await call("t-csm", "balance", { turn: "M1" })).isError).toBe(true);
    expect((await call("t-csm", "meta_ops", { turn: "M1", op: "read.structure" })).isError).toBe(true);
    expect(f.calls).toEqual([]);
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

  it("gives only the Manager a client's brief to read", async () => {
    const f = await start();
    bridge!.setTurn("manager", { tenantId: null, messageId: "M1" });
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M2" });
    expect((await call("t-manager", "client_brief", { turn: "M1", tenant: "T9" })).isError).toBeFalsy();
    expect((await call("t-csm", "client_brief", { turn: "M2", tenant: "T9" })).isError).toBe(true);
    expect(f.calls).toEqual([{ tool: "brief", body: { tenant: "T9" } }]);
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
