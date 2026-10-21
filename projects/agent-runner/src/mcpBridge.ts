// The app's tools for the Hermes agents: one small MCP server inside the
// runner (docs/build-plans/hermes-agents.md, Task 4).
//
// On the PC, claude reaches the app through bin/ghl.mjs and bin/meta.mjs, and
// those scripts read the runner secret from Doppler. A Hermes profile has no
// shell at all (no terminal toolset, by design), so it gets the same two
// commands as MCP tools served from here, over HTTP on the VPS's Docker
// network. The secret never leaves this process.
//
// Each profile's MCP entry carries its own bearer token, so the token says
// which agent is calling. The client and the turn come from the turn this
// runner is working for that agent (setTurn), never from the tool's
// arguments, exactly as the scripts take them from the environment only. With
// no turn running for that agent, every call is refused. The app still makes
// every decision that matters (lib/agentGhlOps.ts): this is a messenger.
//
// Streamable HTTP, JSON answers only: initialize, tools/list, tools/call and
// ping, which is all Hermes's MCP client sends a tool server.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AgentId } from "./wire.ts";

export interface AppTools {
  // POST /api/agent-runner/ghl. Returns the app's answer as text.
  ghl(body: { messageId: string; tenantId: string; op: string; args: Record<string, unknown> }): Promise<string>;
  // GET /api/agent-runner/meta. Read-only by construction on the app's side.
  meta(q: { tenant: string; level: string; days: number }): Promise<string>;
}

export interface Turn {
  tenantId: string | null;
  messageId: string;
}

export interface Bridge {
  port: number;
  setTurn(agent: AgentId, turn: Turn | null): void;
  close(): Promise<void>;
}

// The same agents as the scripts: Meta numbers for the three whose job needs
// them, GHL for the GHL Agent. The Ads Agent's Ads Manager changes are not
// here: Ads stays on the PC engine until Phase 2.
const META_AGENTS: AgentId[] = ["manager", "csm", "ads"];

// Mirrors GHL_OPS in apps/command-center/functions/lib/agentGhlOps.ts, as
// bin/ghl.mjs does. The app's list is the one that counts.
const GHL_OPS = [
  "read.pipelines",
  "read.customValues",
  "read.customFields",
  "read.calendars",
  "write.customValue",
  "write.customField",
  "write.tag",
  "write.moveOpportunity",
];

const META_TOOL = {
  name: "meta_insights",
  description:
    "Meta Ads numbers for the client, read-only. level is account, campaign or ad; days is 1 to 90. Only the agency Manager passes tenant (a client's tenant id); everyone else always gets their chat's client.",
  inputSchema: {
    type: "object",
    properties: {
      level: { type: "string", enum: ["account", "campaign", "ad"] },
      days: { type: "integer", minimum: 1, maximum: 90 },
      tenant: { type: "string" },
    },
  },
};

const GHL_TOOL = {
  name: "ghl",
  description:
    "An allowlisted op in this client's sub-account. Reads always work; a write goes through only when Jake asked for it in this chat, approved a card, or the Director task acts live. The app decides and says why when it refuses.",
  inputSchema: {
    type: "object",
    properties: {
      op: { type: "string", enum: GHL_OPS },
      args: { type: "object" },
    },
    required: ["op"],
  },
};

function toolsFor(agent: AgentId) {
  return [...(META_AGENTS.includes(agent) ? [META_TOOL] : []), ...(agent === "ghl" ? [GHL_TOOL] : [])];
}

const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

async function callTool(agent: AgentId, turn: Turn | null, name: string, a: Record<string, unknown>, tools: AppTools) {
  if (!toolsFor(agent).some((t) => t.name === name)) return text(`${name} is not one of your tools`, true);
  if (!turn) return text("No turn is running for you right now, so this call was not made.", true);
  try {
    if (name === "meta_insights") {
      const level = typeof a.level === "string" ? a.level : "account";
      const days = typeof a.days === "number" ? a.days : 7;
      if (!["account", "campaign", "ad"].includes(level)) return text("level must be account, campaign or ad", true);
      if (!Number.isInteger(days) || days < 1 || days > 90) return text("days must be a whole number from 1 to 90", true);
      // At a client the chat decides; only the agency Manager (no client) picks.
      const tenant = turn.tenantId ?? (typeof a.tenant === "string" ? a.tenant : "");
      if (!tenant) return text("no client: pass tenant with a client's tenant id", true);
      return text(await tools.meta({ tenant, level, days }));
    }
    const op = typeof a.op === "string" ? a.op : "";
    if (!GHL_OPS.includes(op)) return text(`op must be one of: ${GHL_OPS.join(", ")}`, true);
    if (!turn.tenantId) return text("no client: the GHL Agent only works inside a client's chat", true);
    const args = a.args && typeof a.args === "object" && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};
    return text(await tools.ghl({ messageId: turn.messageId, tenantId: turn.tenantId, op, args }));
  } catch (e) {
    return text((e as Error).message, true);
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 1_000_000) throw new Error("body too large");
  }
  return s;
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, body === undefined ? {} : { "content-type": "application/json" });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

export function startBridge(o: { port: number; host?: string; tokens: Partial<Record<AgentId, string>>; tools: AppTools }): Promise<Bridge> {
  const byToken = new Map(Object.entries(o.tokens).filter(([, t]) => t).map(([a, t]) => [t as string, a as AgentId]));
  const turns = new Map<AgentId, Turn>();

  const server = createServer(async (req, res) => {
    try {
      if (req.url?.split("?")[0] !== "/mcp") return send(res, 404);
      if (req.method !== "POST") return send(res, 405);
      const auth = req.headers.authorization ?? "";
      const agent = auth.startsWith("Bearer ") ? byToken.get(auth.slice(7).trim()) : undefined;
      if (!agent) return send(res, 401, { error: "unauthorized" });

      let msg: any;
      try {
        msg = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      }
      // A notification (no id) wants no answer.
      if (msg?.id === undefined || msg?.id === null) return send(res, 202);
      const ok = (result: unknown) => send(res, 200, { jsonrpc: "2.0", id: msg.id, result });

      switch (msg.method) {
        case "initialize":
          return ok({
            protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "hauck", version: "1.0.0" },
          });
        case "ping":
          return ok({});
        case "tools/list":
          return ok({ tools: toolsFor(agent) });
        case "tools/call": {
          const args = msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {};
          return ok(await callTool(agent, turns.get(agent) ?? null, String(msg.params?.name ?? ""), args, o.tools));
        }
        default:
          return send(res, 200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } });
      }
    } catch (e) {
      if (!res.headersSent) send(res, 500, { error: (e as Error).message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, o.host ?? "0.0.0.0", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        setTurn(agent, turn) {
          if (turn) turns.set(agent, turn);
          else turns.delete(agent);
        },
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
