import { MIN_SECRET_LENGTH } from "./adsCron";

// The Hauck Brain: one MCP server that every Grok Bot reaches through a single
// custom connector (docs/build-plans/grok-bot-connector.md).
//
// Grok Bot connectors are account-level, so every bot sees every tool. That is
// why the tools in lib/grokTools.ts read and never write, with one exception:
// save_note, which only adds a row to grok_notes.
//
// The gate is a capability URL, a sibling of lib/agentRunner.ts in spirit:
//
//   - The key is the last path segment, /api/grok/mcp/<GROK_MCP_KEY>. Grok's
//     custom connectors connected with no auth header in the 2026-10-26 spike,
//     so the secret has to travel in the URL itself.
//   - EXACT pathname, never a prefix. Unset or short key means CLOSED.
//   - A pass never sets ctx.data.admin. The key buys this one route.
//
// The protocol is MCP Streamable HTTP, stateless, JSON responses only. That is
// the shape Grok accepted in the spike: initialize, tools/list, tools/call.

export const GROK_MCP_BASE = "/api/grok/mcp/";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * May this request skip the session gate? GET and DELETE pass too: Grok's
 * connector manager probes with both, and the route answers 405 rather than a
 * 401 that would read as "this server needs a login".
 */
export function isGrokMcpRequest(method: string, pathname: string, key: string | undefined): boolean {
  if (method !== "POST" && method !== "GET" && method !== "DELETE") return false;
  if (!key || key.length < MIN_SECRET_LENGTH) return false;
  if (!pathname.startsWith(GROK_MCP_BASE)) return false;
  return timingSafeEqual(pathname.slice(GROK_MCP_BASE.length), key);
}

export interface ToolDef<D> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(deps: D, args: Record<string, unknown>): Promise<string>;
}

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = Record<string, unknown>;

// A long answer costs the bot context it needs for the job; past this it is cut
// with a note saying so.
export const MAX_TOOL_TEXT = 60_000;

const PROTOCOL_FALLBACK = "2025-06-18";

/** One JSON-RPC message in, one reply out (null for a notification). */
export async function handleRpc<D>(msg: Msg, tools: ToolDef<D>[], deps: D): Promise<Reply | null> {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: { name: "hauck-brain", version: "1.0.0" },
        instructions:
          "Hauck Marketing's business data. Call get_rules with your bot id at the start of every new task, and get_client before any client work.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return ok({ content: [{ type: "text", text: `Unknown tool: ${String(params?.name)}` }], isError: true });
      const args = params?.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
      try {
        let text = await tool.run(deps, args);
        if (text.length > MAX_TOOL_TEXT) text = `${text.slice(0, MAX_TOOL_TEXT)}\n\n[Cut at ${MAX_TOOL_TEXT} characters. Ask for less, for example fewer days.]`;
        return ok({ content: [{ type: "text", text }] });
      } catch (err) {
        return ok({ content: [{ type: "text", text: (err as Error).message }], isError: true });
      }
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(method)}` } };
  }
}

/** A POST body: one message or a batch. Null means nothing to send back (202). */
export async function handleBody<D>(body: unknown, tools: ToolDef<D>[], deps: D): Promise<Reply | Reply[] | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m as Msg, tools, deps)))).filter((r): r is Reply => r !== null);
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  return handleRpc(body as Msg, tools, deps);
}

export interface ClientRef {
  id: string;
  name: string;
  slug: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * "Willis", "willis-windows" or "Willis Windows" all find Willis Windows.
 * Exact name or slug first, then a unique partial match. Anything else is an
 * error naming the options, never a guess.
 */
export function matchClient(clients: ClientRef[], query: unknown): ClientRef {
  const q = typeof query === "string" ? norm(query) : "";
  if (!q) throw new Error(`client is required. Clients: ${clients.map((c) => c.name).join(", ")}`);
  const exact = clients.find((c) => norm(c.name) === q || norm(c.slug) === q);
  if (exact) return exact;
  const partial = clients.filter((c) => norm(c.name).includes(q) || norm(c.slug).includes(q) || q.includes(norm(c.name)));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`"${String(query)}" matches ${partial.map((c) => c.name).join(", ")}. Say which.`);
  throw new Error(`No client called "${String(query)}". Clients: ${clients.map((c) => c.name).join(", ")}`);
}

/** The vault folder for a client: same normalized name, or one contains the other. */
export function vaultKeyFor(folders: string[], clientName: string): string | null {
  const n = norm(clientName);
  return folders.find((f) => norm(f) === n) ?? folders.find((f) => norm(f).includes(n) || n.includes(norm(f))) ?? null;
}

export const NOTE_MAX = 500;
export const NOTES_PER_DAY = 100;

/** A note as it will be stored, or an error the bot can act on. */
export function cleanNote(note: unknown): string {
  if (typeof note !== "string" || !note.trim()) throw new Error("note is required: one plain fact.");
  const t = note
    .replace(new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, "g"), ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > NOTE_MAX) throw new Error(`note is ${t.length} characters; keep it under ${NOTE_MAX}, one fact per note.`);
  return t;
}
