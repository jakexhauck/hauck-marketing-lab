// The app's tools for the Hermes agents: one small MCP server inside the
// runner (docs/build-plans/hermes-agents.md, Task 4).
//
// On the PC, claude reaches the app through bin/ghl.mjs and bin/meta.mjs, and
// those scripts read the runner secret from Doppler. A Hermes profile has no
// shell at all (no terminal toolset, by design), so it gets the same two
// commands as MCP tools served from here, over HTTP on the VPS's Docker
// network. The secret never leaves this process.
//
// Files too. Hermes's own file tools read anything its user can, and that
// includes every profile's keys and tokens, so no profile gets them. The
// read_file, write_file and list_files here reach only the turn's folders:
// its work folder and its client's Drive folder, written to only by the
// agents whose job is writing. What an agent writes is recorded, so the
// runner uploads exactly that to Drive after the turn (drive.ts).
//
// Each profile's MCP entry carries its own bearer token, so the token says
// which agent is calling. The client and the turn come from the turn this
// runner is working for that agent (setTurn), never from the tool's
// arguments, exactly as the scripts take them from the environment only. With
// no turn running for that agent, every call is refused.
//
// Every call also names its turn (the message id the runner put in the
// prompt). Hermes may still be running a turn the runner gave up on (a
// timeout, a dropped stream); a late call from it carries the old id and is
// refused, so it can never act under the next turn's client. The app still
// makes every decision that matters (lib/agentGhlOps.ts): this is a messenger.
//
// Streamable HTTP, JSON answers only: initialize, tools/list, tools/call and
// ping, which is all Hermes's MCP client sends a tool server.

import { mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { composioAllowed } from "./composioTools.ts";
import type { Higgsfield, HfTool } from "./higgsfield.ts";
import { HF_AFTER, HF_GENERATE, HF_QUOTE, parseBalance } from "./spend.ts";
import type { AgentId } from "./wire.ts";

export interface AppTools {
  // POST /api/agent-runner/ghl. Returns the app's answer as text.
  ghl(body: { messageId: string; tenantId: string; op: string; args: Record<string, unknown> }): Promise<string>;
  // GET /api/agent-runner/meta. Read-only by construction on the app's side.
  meta(q: { tenant: string; level: string; days: number }): Promise<string>;
  // POST /api/agent-runner/meta-ops: the Ads Agent's Ads Manager ops. A change
  // goes through only under Jake's Approve of a card listing it (the app's call).
  metaOps(body: { messageId: string; tenantId: string; op: string; args: Record<string, unknown> }): Promise<string>;
  // GET /api/agent-runner/brief: one client's whole brief (notes, pages,
  // tasks), read only. The Manager's weekly review. Unset: no tool.
  brief?(tenant: string): Promise<string>;
  // The runner's own Higgsfield login (higgsfield.ts). Unset or not signed in:
  // the Ads Agent has no Higgsfield tools.
  higgsfield?: Higgsfield;
  // The web for the agents (webTools.ts): a page as clean Markdown, and the
  // Agent Reach channels that need no login. Unset: no web tools.
  readPage?(url: string, part?: number): Promise<string>;
  reach?(channel: string, target: string): Promise<string>;
  // A Composio tool from the agent's allowlist (composioTools.ts). Unset (no
  // COMPOSIO_API_KEY): no Composio tool.
  composio?(agent: AgentId, slug: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }>;
  // Google Places search and reviews (placesTools.ts). Unset (no
  // GOOGLE_PLACES_API_KEY): no places tool.
  places?(action: string, target: string): Promise<string>;
}

export interface Root {
  dir: string;
  write: boolean;
}

export interface Turn {
  tenantId: string | null;
  messageId: string;
  // The folders this turn's file tools reach. The first is where a relative
  // path lands.
  roots?: Root[];
  // The credits Jake approved for this turn (spend.ts spendLimit), or null.
  // Higgsfield generate tools answer only when it is set.
  spend?: number | null;
}

export interface Bridge {
  port: number;
  setTurn(agent: AgentId, turn: Turn | null): void;
  // The files this agent wrote during its current turn, absolute paths.
  written(agent: AgentId): string[];
  close(): Promise<void>;
}

// The same agents as the scripts: Meta numbers for the three whose job needs
// them, GHL for the GHL Agent, Ads Manager ops and Higgsfield for the Ads Agent.
const META_AGENTS: AgentId[] = ["manager", "csm", "ads", "research"];
// GHL reads for the CSM (its client) and the agency Manager (any client, by
// tenant); the app refuses them every write (agentGhlOps.ts).
const GHL_READ_AGENTS: AgentId[] = ["csm", "manager"];
// Higgsfield: the Ads Agent makes things; the CSM and Market Research only
// price them and look at models, so a plan can carry a real cost.
const HF_PRICE_AGENTS: AgentId[] = ["csm", "research"];
// The GHL Agent works in GHL only; it never had file tools.
const FILE_AGENTS: AgentId[] = ["manager", "csm", "research", "ads"];
// Reading the web: everyone who researches or writes. Agent Reach's channels
// for the two whose job is finding things out.
const PAGE_AGENTS: AgentId[] = ["manager", "csm", "research", "ads"];
const REACH_AGENTS: AgentId[] = ["research", "ads"];

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

const MAX_READ = 1_000_000;
const MAX_WRITE = 2_000_000;

const TURN = { type: "string", description: "The turn id given in this turn's message. Required on every call." };

const META_TOOL = {
  name: "meta_insights",
  description:
    "Meta Ads numbers for the client, read-only. level is account, campaign or ad; days is 1 to 90. Only the agency Manager passes tenant (a client's tenant id); everyone else always gets their chat's client.",
  inputSchema: {
    type: "object",
    properties: {
      turn: TURN,
      level: { type: "string", enum: ["account", "campaign", "ad"] },
      days: { type: "integer", minimum: 1, maximum: 90 },
      tenant: { type: "string" },
    },
    required: ["turn"],
  },
};

const GHL_TOOL = {
  name: "ghl",
  description:
    "An allowlisted op in this client's sub-account. Reads always work; a write goes through only when Jake asked for it in this chat, approved a card, or the Director task acts live. The app decides and says why when it refuses.",
  inputSchema: {
    type: "object",
    properties: { turn: TURN, op: { type: "string", enum: GHL_OPS }, args: { type: "object" } },
    required: ["turn", "op"],
  },
};

const GHL_READ_TOOL = {
  name: "ghl",
  description:
    "Read the client's GHL sub-account: pipelines, custom values, custom fields, calendars. Read only; changes are the GHL Agent's (send it a request). The agency Manager passes tenant, a client's tenant id; everyone else gets their chat's client.",
  inputSchema: {
    type: "object",
    properties: { turn: TURN, op: { type: "string", enum: GHL_OPS.filter((o) => o.startsWith("read.")) }, args: { type: "object" }, tenant: { type: "string" } },
    required: ["turn", "op"],
  },
};

const PLACES_TOOL = {
  name: "places",
  description:
    "Google Places. action search: target is a search like 'window replacement Ann Arbor MI', gives up to 10 businesses with rating, review count, website and id. action reviews: target is an id from a search, gives the rating and the reviews Google shows (5 at most).",
  inputSchema: {
    type: "object",
    properties: { turn: TURN, action: { type: "string", enum: ["search", "reviews"] }, target: { type: "string" } },
    required: ["turn", "action", "target"],
  },
};

const BRIEF_TOOL = {
  name: "client_brief",
  description: "One client's whole Mission Control brief, read only: the notes, the Market Research and Ads pages, and the setup tasks. tenant is the client's tenant id from your client list.",
  inputSchema: { type: "object", properties: { turn: TURN, tenant: { type: "string" } }, required: ["turn", "tenant"] },
};

// Mirrors META_OPS in apps/command-center/functions/lib/agentMetaOps.ts. The
// app's list is the one that counts.
const META_OPS = ["read.structure", "read.creatives", "read.library", "read.destination", "pause", "resume", "dailyBudget", "createAd"];

const META_OPS_TOOL = {
  name: "meta_ops",
  description:
    "An allowlisted op in this client's Meta ad account. Reads always work; a change goes through only when this turn answers Jake's Approve of a card listing exactly that change. The app decides and says why when it refuses.",
  inputSchema: {
    type: "object",
    properties: { turn: TURN, op: { type: "string", enum: META_OPS }, args: { type: "object" } },
    required: ["turn", "op"],
  },
};

// The Higgsfield tools the bridge serves, by name: quotes always, generate
// only under a spend grant. Everything else Higgsfield sells is never listed.
const HF_SERVED = new Set([...HF_QUOTE, ...HF_GENERATE, ...HF_AFTER]);
const HF_PAID = new Set([...HF_GENERATE, ...HF_AFTER]);
const HF_SPENDS = new Set(HF_GENERATE);

function withTurn(t: HfTool) {
  const schema = (t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object" }) as Record<string, unknown>;
  const props = (schema.properties && typeof schema.properties === "object" ? schema.properties : {}) as Record<string, unknown>;
  const req = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const paid = HF_PAID.has(t.name) ? " Paid: works only on the turn that answers Jake's Approve of a spend card." : "";
  return {
    name: t.name,
    description: `Higgsfield: ${t.description ?? t.name}${paid}`,
    inputSchema: { ...schema, type: "object", properties: { ...props, turn: TURN }, required: [...new Set([...req, "turn"])] },
  };
}

const PAGE_TOOL = {
  name: "read_page",
  description:
    "Read a web page as clean Markdown (Defuddle): the article only, no menus, ads or footers. Use it instead of any other way of reading a page. Public http(s) pages only.",
  inputSchema: {
    type: "object",
    properties: { turn: TURN, url: { type: "string" }, part: { type: "integer", minimum: 1, description: "A long page comes in parts; 1 is the start." } },
    required: ["turn", "url"],
  },
};

const REACH_TOOL = {
  name: "reach",
  description:
    "Agent Reach, no login: youtube_transcript (target = a YouTube link), github_repo (owner/repo or link: summary + README), github_search (search words), rss (a feed URL: latest entries). Reddit and X are not available yet.",
  inputSchema: {
    type: "object",
    properties: {
      turn: TURN,
      channel: { type: "string", enum: ["youtube_transcript", "github_repo", "github_search", "rss"] },
      target: { type: "string" },
    },
    required: ["turn", "channel", "target"],
  },
};

function composioTool(agent: AgentId) {
  const slugs = composioAllowed(agent);
  return {
    name: "composio",
    description: `A Composio app tool, read or draft only. tool is one of: ${slugs.join(", ")}. args is that tool's own arguments as Composio documents them. Nothing is sent: an email is a draft Jake sends himself.`,
    inputSchema: {
      type: "object",
      properties: { turn: TURN, tool: { type: "string", enum: slugs }, args: { type: "object" } },
      required: ["turn", "tool"],
    },
  };
}

const FILE_TOOLS = [
  {
    name: "list_files",
    description: "List a folder in your work folder or the client's Drive folder. No path lists your work folder.",
    inputSchema: { type: "object", properties: { turn: TURN, path: { type: "string" } }, required: ["turn"] },
  },
  {
    name: "read_file",
    description: "Read a text file from your work folder or the client's Drive folder.",
    inputSchema: { type: "object", properties: { turn: TURN, path: { type: "string" } }, required: ["turn", "path"] },
  },
  {
    name: "write_file",
    description: "Write a text file (whole content) in your work folder or the client's Drive folder, if your job writes files.",
    inputSchema: {
      type: "object",
      properties: { turn: TURN, path: { type: "string" }, content: { type: "string" } },
      required: ["turn", "path", "content"],
    },
  },
];

// The web and Composio tools are listed only when this runner has them set up,
// so an agent is never offered a tool that can only fail.
function toolsFor(agent: AgentId, tools?: AppTools) {
  return [
    ...(tools?.readPage && PAGE_AGENTS.includes(agent) ? [PAGE_TOOL] : []),
    ...(tools?.reach && REACH_AGENTS.includes(agent) ? [REACH_TOOL] : []),
    ...(tools?.composio && composioAllowed(agent).length ? [composioTool(agent)] : []),
    ...(META_AGENTS.includes(agent) ? [META_TOOL] : []),
    ...(agent === "ghl" ? [GHL_TOOL] : []),
    ...(GHL_READ_AGENTS.includes(agent) ? [GHL_READ_TOOL] : []),
    ...(tools?.places && agent === "research" ? [PLACES_TOOL] : []),
    ...(agent === "manager" ? [BRIEF_TOOL] : []),
    ...(agent === "ads" ? [META_OPS_TOOL] : []),
    ...(FILE_AGENTS.includes(agent) ? FILE_TOOLS : []),
  ];
}

// The Ads Agent's Higgsfield tools, from Higgsfield's own list. A runner that
// is not signed in, or a list that fails, leaves them out rather than failing
// the agent's whole tool list.
// The Higgsfield tools one agent is served: everything for Ads, prices only
// for the CSM and Market Research, none for the rest.
function hfServedFor(agent: AgentId): Set<string> {
  if (agent === "ads") return HF_SERVED;
  return HF_PRICE_AGENTS.includes(agent) ? new Set(HF_QUOTE) : new Set();
}

async function higgsfieldTools(agent: AgentId, tools: AppTools) {
  const served = hfServedFor(agent);
  if (!served.size || !tools.higgsfield?.ready()) return [];
  try {
    return (await tools.higgsfield.listTools()).filter((t) => served.has(t.name)).map(withTurn);
  } catch {
    return [];
  }
}

const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

// The deepest existing folder at or above p, resolved through any symlink, so
// a link inside a root cannot lead out of it.
function realOrParent(p: string): string {
  let cur = p;
  for (;;) {
    try {
      return resolve(realpathSync(cur), relative(cur, p));
    } catch {
      const up = dirname(cur);
      if (up === cur) return p;
      cur = up;
    }
  }
}

const inside = (dir: string, p: string) => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep);

// Which root a path is in, or null. Relative paths are from the first root.
export function placePath(roots: Root[], raw: string): { path: string; root: Root } | null {
  if (!roots.length) return null;
  const want = realOrParent(isAbsolute(raw) ? resolve(raw) : resolve(roots[0].dir, raw));
  for (const root of roots) {
    if (inside(realOrParent(resolve(root.dir)), want)) return { path: want, root };
  }
  return null;
}

// The balance when the turn's first paid call was made, per agent.
type Spent = Map<AgentId, number>;

// One generate call at a time per agent, check and call together, so two
// calls Hermes makes at once cannot both pass the same balance check.
const paidLocks = new Map<AgentId, Promise<unknown>>();
function oneAtATime<T>(agent: AgentId, fn: () => Promise<T>): Promise<T> {
  const run = (paidLocks.get(agent) ?? Promise.resolve()).then(fn, fn);
  paidLocks.set(agent, run.catch(() => null));
  return run;
}

// A tool that takes a credit ceiling gets one: what is left of the grant.
async function withCeiling(h: Higgsfield, name: string, args: Record<string, unknown>, left: number): Promise<Record<string, unknown>> {
  const tool = (await h.listTools().catch(() => [])).find((t) => t.name === name);
  const props = (tool?.inputSchema?.properties ?? {}) as Record<string, unknown>;
  if (!("max_credits" in props)) return args;
  const asked = typeof args.max_credits === "number" ? args.max_credits : left;
  return { ...args, max_credits: Math.min(asked, left) };
}

async function callTool(
  agent: AgentId,
  turn: Turn | null,
  name: string,
  a: Record<string, unknown>,
  tools: AppTools,
  written: Set<string>,
  startBalance: Spent,
) {
  const hf = hfServedFor(agent).has(name) && !!tools.higgsfield;
  if (!hf && !toolsFor(agent, tools).some((t) => t.name === name)) return text(`${name} is not one of your tools`, true);
  if (!turn) return text("No turn is running for you right now, so this call was not made.", true);
  if (a.turn !== turn.messageId) return text("This call names a turn that is not the one running now, so it was not made.", true);
  try {
    if (hf) {
      if (!turn.tenantId) return text("Higgsfield works only inside a client's chat", true);
      // Jake's rule (spend.ts): nothing that costs credits without his Approve
      // of the price, and only on the turn that answers it.
      if (HF_PAID.has(name) && !(typeof turn.spend === "number" && turn.spend > 0)) {
        return text("No spend is approved on this turn, so nothing that costs credits can run. Quote it and file a spend card.", true);
      }
      const { turn: _t, ...args } = a;
      const h = tools.higgsfield!;
      if (!HF_SPENDS.has(name)) {
        const r = await h.call(name, args);
        return text(r.text, r.isError);
      }
      // And no more than Jake approved: the balance is read before every
      // generate call and compared with where the turn started, and the call
      // carries what is left as its ceiling where the tool takes one.
      return oneAtATime(agent, async () => {
        const now = parseBalance((await h.call("balance", {})).text);
        if (now === null) return text("Could not read the Higgsfield balance, so nothing that costs credits was run.", true);
        const start = startBalance.get(agent) ?? now;
        startBalance.set(agent, start);
        const left = turn.spend! - (start - now);
        if (left <= 0) {
          return text(`The ${turn.spend} credits Jake approved are used up (${start - now} spent this turn). Nothing more can be generated; tell Jake.`, true);
        }
        const r = await h.call(name, await withCeiling(h, name, args, left));
        return text(r.text, r.isError);
      });
    }
    if (name === "places") {
      return text(await tools.places!(typeof a.action === "string" ? a.action : "", typeof a.target === "string" ? a.target : ""));
    }
    if (name === "read_page") {
      const url = typeof a.url === "string" ? a.url.trim() : "";
      if (!url) return text("url is required", true);
      return text(await tools.readPage!(url, typeof a.part === "number" ? a.part : 1));
    }
    if (name === "reach") {
      return text(await tools.reach!(typeof a.channel === "string" ? a.channel : "", typeof a.target === "string" ? a.target : ""));
    }
    if (name === "composio") {
      const slug = typeof a.tool === "string" ? a.tool : "";
      const args = a.args && typeof a.args === "object" && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};
      const r = await tools.composio!(agent, slug, args);
      return text(r.text, r.isError);
    }
    if (name === "meta_ops") {
      const op = typeof a.op === "string" ? a.op : "";
      if (!META_OPS.includes(op)) return text(`op must be one of: ${META_OPS.join(", ")}`, true);
      if (!turn.tenantId) return text("no client: Ads Manager ops only happen inside a client's chat", true);
      const args = a.args && typeof a.args === "object" && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};
      return text(await tools.metaOps({ messageId: turn.messageId, tenantId: turn.tenantId, op, args }));
    }
    if (name === "meta_insights") {
      const level = typeof a.level === "string" ? a.level : "account";
      const days = typeof a.days === "number" ? a.days : 7;
      if (!["account", "campaign", "ad"].includes(level)) return text("level must be account, campaign or ad", true);
      if (!Number.isInteger(days) || days < 1 || days > 90) return text("days must be a whole number from 1 to 90", true);
      // At a client the chat decides; only the agency Manager picks one.
      const tenant = turn.tenantId ?? (agent === "manager" && typeof a.tenant === "string" ? a.tenant : "");
      if (!tenant) return text("no client: only the agency Manager passes tenant", true);
      return text(await tools.meta({ tenant, level, days }));
    }
    if (name === "client_brief") {
      const tenant = typeof a.tenant === "string" ? a.tenant.trim() : "";
      if (!tenant) return text("tenant is required", true);
      if (!tools.brief) return text("The brief cannot be read from this runner.", true);
      return text(await tools.brief(tenant));
    }
    if (name === "ghl") {
      const op = typeof a.op === "string" ? a.op : "";
      if (!GHL_OPS.includes(op)) return text(`op must be one of: ${GHL_OPS.join(", ")}`, true);
      // Only the GHL Agent changes anything; the app checks this too.
      if (agent !== "ghl" && !op.startsWith("read.")) return text("Only the GHL Agent changes GHL. Send it a request.", true);
      const tenant = turn.tenantId ?? (agent === "manager" && typeof a.tenant === "string" ? a.tenant.trim() : "");
      if (!tenant) return text(agent === "manager" ? "tenant is required: a client's tenant id from your client list" : "no client: GHL only works inside a client's chat", true);
      const args = a.args && typeof a.args === "object" && !Array.isArray(a.args) ? (a.args as Record<string, unknown>) : {};
      return text(await tools.ghl({ messageId: turn.messageId, tenantId: tenant, op, args }));
    }

    const roots = turn.roots ?? [];
    const raw = typeof a.path === "string" && a.path.trim() ? a.path.trim() : name === "list_files" ? "." : "";
    if (!raw) return text("path is required", true);
    const at = placePath(roots, raw);
    if (!at) return text(`${raw} is outside your folders: ${roots.map((r) => r.dir).join(", ") || "none this turn"}`, true);
    if (name === "list_files") {
      const names = readdirSync(at.path, { withFileTypes: true })
        .filter((e) => !e.name.startsWith("."))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort();
      return text(names.join("\n") || "(empty)");
    }
    if (name === "read_file") {
      if (statSync(at.path).size > MAX_READ) return text("file is over 1 MB; not read", true);
      return text(readFileSync(at.path, "utf8"));
    }
    if (!at.root.write) return text(`you cannot write in ${at.root.dir}`, true);
    const content = typeof a.content === "string" ? a.content : null;
    if (content === null) return text("content is required", true);
    if (content.length > MAX_WRITE) return text("content is over 2 MB; not written", true);
    mkdirSync(dirname(at.path), { recursive: true });
    writeFileSync(at.path, content);
    written.add(at.path);
    return text(`wrote ${at.path}`);
  } catch (e) {
    return text((e as Error).message, true);
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 4_000_000) throw new Error("body too large");
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
  const writes = new Map<AgentId, Set<string>>();
  const startBalance: Spent = new Map();

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
          return ok({ tools: [...toolsFor(agent, o.tools), ...(await higgsfieldTools(agent, o.tools))] });
        case "tools/call": {
          const args = msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {};
          if (!writes.has(agent)) writes.set(agent, new Set());
          return ok(await callTool(agent, turns.get(agent) ?? null, String(msg.params?.name ?? ""), args, o.tools, writes.get(agent)!, startBalance));
        }
        default:
          return send(res, 200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } });
      }
    } catch (e) {
      if (!res.headersSent) send(res, 500, { error: (e as Error).message });
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(o.port, o.host ?? "0.0.0.0", () => {
      resolvePromise({
        port: (server.address() as AddressInfo).port,
        setTurn(agent, turn) {
          // A new turn starts with nothing written; the last one's list is
          // the caller's to read before it ends the turn.
          startBalance.delete(agent);
          if (turn) {
            turns.set(agent, turn);
            writes.set(agent, new Set());
          } else {
            turns.delete(agent);
          }
        },
        written: (agent) => [...(writes.get(agent) ?? [])],
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
