import { afterEach, describe, expect, it } from "vitest";
import { startBridge, type AppTools, type Bridge } from "../src/mcpBridge.ts";

const TOKENS = { manager: "t-manager", csm: "t-csm", ghl: "t-ghl" };

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
    expect(toolNames(await rpc("t-csm", "tools/list"))).toEqual(["meta_insights"]);
    expect(toolNames(await rpc("t-manager", "tools/list"))).toEqual(["meta_insights"]);
    expect(toolNames(await rpc("t-ghl", "tools/list"))).toEqual(["ghl"]);
  });

  it("refuses a call while that agent has no turn running", async () => {
    const f = await start();
    const r = await rpc("t-ghl", "tools/call", { name: "ghl", arguments: { op: "read.pipelines" } });
    expect(r.body.result.isError).toBe(true);
    expect(r.body.result.content[0].text).toMatch(/no turn is running/i);
    expect(f.calls).toEqual([]);
  });

  it("takes the client and turn from the running turn, never from the arguments", async () => {
    const f = await start();
    bridge!.setTurn("ghl", { tenantId: "T1", messageId: "M1" });
    const r = await rpc("t-ghl", "tools/call", {
      name: "ghl",
      arguments: { op: "write.tag", args: { tag: "hot" }, tenantId: "T2", messageId: "M2" },
    });
    expect(r.body.result).toEqual({ content: [{ type: "text", text: '{"ok":true}' }] });
    expect(f.calls).toEqual([{ tool: "ghl", body: { messageId: "M1", tenantId: "T1", op: "write.tag", args: { tag: "hot" } } }]);
  });

  it("refuses a tool that is not this agent's", async () => {
    const f = await start();
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M1" });
    const r = await rpc("t-csm", "tools/call", { name: "ghl", arguments: { op: "write.tag" } });
    expect(r.body.result.isError).toBe(true);
    expect(f.calls).toEqual([]);
  });

  it("lets only the agency Manager pick a client for Meta numbers", async () => {
    const f = await start();
    bridge!.setTurn("manager", { tenantId: null, messageId: "M1" });
    bridge!.setTurn("csm", { tenantId: "T1", messageId: "M2" });
    await rpc("t-manager", "tools/call", { name: "meta_insights", arguments: { tenant: "T9", level: "campaign", days: 30 } });
    await rpc("t-csm", "tools/call", { name: "meta_insights", arguments: { tenant: "T9" } });
    expect(f.calls).toEqual([
      { tool: "meta", body: { tenant: "T9", level: "campaign", days: 30 } },
      { tool: "meta", body: { tenant: "T1", level: "account", days: 7 } },
    ]);
  });

  it("refuses a GHL call with no client", async () => {
    const f = await start();
    bridge!.setTurn("ghl", { tenantId: null, messageId: "M1" });
    const r = await rpc("t-ghl", "tools/call", { name: "ghl", arguments: { op: "read.pipelines" } });
    expect(r.body.result.isError).toBe(true);
    expect(f.calls).toEqual([]);
  });

  it("stops a call once the turn is over", async () => {
    const f = await start();
    bridge!.setTurn("ghl", { tenantId: "T1", messageId: "M1" });
    bridge!.setTurn("ghl", null);
    const r = await rpc("t-ghl", "tools/call", { name: "ghl", arguments: { op: "read.pipelines" } });
    expect(r.body.result.isError).toBe(true);
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
