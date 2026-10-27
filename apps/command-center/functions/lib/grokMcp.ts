import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { MIN_SECRET_LENGTH } from "./adsCron";
import { logAdminAction } from "./adminAuth";
import { isNotAClient } from "./retiredTenant";

// The Grok Bot connectors: one small MCP server per system the bots cannot
// connect inside Grok themselves (Jake, 2026-10-26: "i dont want hauck brain i
// just want all connectors the agents need that i cant connect thru grok bot
// itself"). Supabase, Drive and Gmail he connects in Grok. What each connector
// serves is in lib/grokConnectors.ts.
//
// The gate is a capability URL, a sibling of lib/agentRunner.ts in spirit:
//
//   - /api/grok/<connector>/<GROK_MCP_KEY>. Grok's custom connectors connected
//     with no auth header in the 2026-10-26 spike, so the secret has to travel
//     in the URL itself.
//   - EXACT pathname, a known connector name, never a prefix. Unset or short
//     key means CLOSED.
//   - A pass never sets ctx.data.admin. The key buys these routes only.
//
// The protocol is MCP Streamable HTTP, stateless, JSON responses only. That is
// the shape Grok accepted in the spike: initialize, tools/list, tools/call.

export const GROK_BASE = "/api/grok/";
export const GROK_CONNECTORS = ["ghl", "meta", "software"] as const;
export type GrokConnector = (typeof GROK_CONNECTORS)[number];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The connector a path names, or null. Says nothing about the key. */
export function connectorOf(pathname: string): GrokConnector | null {
  if (!pathname.startsWith(GROK_BASE)) return null;
  const name = pathname.slice(GROK_BASE.length).split("/")[0];
  return (GROK_CONNECTORS as readonly string[]).includes(name) ? (name as GrokConnector) : null;
}

/**
 * May this request skip the session gate? GET and DELETE pass too: Grok's
 * connector manager probes with both, and the route answers 405 rather than a
 * 401 that would read as "this server needs a login".
 */
export function isGrokMcpRequest(method: string, pathname: string, key: string | undefined): boolean {
  if (method !== "POST" && method !== "GET" && method !== "DELETE") return false;
  if (!key || key.length < MIN_SECRET_LENGTH) return false;
  const name = connectorOf(pathname);
  if (!name) return false;
  return timingSafeEqual(pathname.slice(`${GROK_BASE}${name}/`.length), key);
}

/** The path as it may appear in a log: the key never does. */
export function loggablePath(pathname: string): string {
  if (!pathname.startsWith(GROK_BASE)) return pathname;
  const name = pathname.slice(GROK_BASE.length).split("/")[0];
  return `${GROK_BASE}${name}/<key>`;
}

export interface GrokDeps {
  client: SupabaseClient;
  env: Env;
  /** The app's own origin, for the owner links a health check compares against. */
  origin: string;
}

export interface ToolDef<D> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(deps: D, args: Record<string, unknown>): Promise<string>;
}

export interface ServerInfo {
  name: string;
  instructions: string;
}

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = Record<string, unknown>;

// A long answer costs the bot context it needs for the job; past this it is cut
// with a note saying so.
export const MAX_TOOL_TEXT = 60_000;

const PROTOCOL_FALLBACK = "2025-06-18";

/** One JSON-RPC message in, one reply out (null for a notification). */
export async function handleRpc<D>(msg: Msg, server: ServerInfo, tools: ToolDef<D>[], deps: D): Promise<Reply | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: { name: server.name, version: "1.0.0" },
        // Tools only, no behaviour: Jake writes each bot's instructions in Grok (2026-10-26).
        instructions: server.instructions,
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
        if (text.length > MAX_TOOL_TEXT) text = `${text.slice(0, MAX_TOOL_TEXT)}\n\n[Cut at ${MAX_TOOL_TEXT} characters. Ask for less.]`;
        return ok({ content: [{ type: "text", text }] });
      } catch (err) {
        return ok({ content: [{ type: "text", text: (err as Error).message }], isError: true });
      }
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(method)}` } };
  }
}

// Grok sends one message per POST. A batch is allowed but small and run in
// order, so one request cannot fan out into a GHL rate-limit burn.
export const MAX_BATCH = 10;

/** A POST body: one message or a batch. Null means nothing to send back (202). */
export async function handleBody<D>(body: unknown, server: ServerInfo, tools: ToolDef<D>[], deps: D): Promise<Reply | Reply[] | null> {
  if (Array.isArray(body)) {
    if (body.length > MAX_BATCH) {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: `Batch of ${body.length}; at most ${MAX_BATCH}` } };
    }
    const out: Reply[] = [];
    for (const m of body) {
      const r = await handleRpc(m as Msg, server, tools, deps);
      if (r) out.push(r);
    }
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  return handleRpc(body as Msg, server, tools, deps);
}

// ---------- Clients ----------

export interface ClientRef {
  id: string;
  name: string;
  slug: string;
}

type Row = Record<string, unknown>;

export async function listClients(client: SupabaseClient): Promise<ClientRef[]> {
  const { data, error } = await client.from("tenants").select("id, name, slug").order("created_at", { ascending: true });
  if (error) throw new Error(`clients: ${error.message}`);
  return ((data ?? []) as Row[])
    .filter((t) => !isNotAClient(t as { name?: string; slug?: string }))
    .map((t) => ({ id: String(t.id), name: String(t.name ?? ""), slug: String(t.slug ?? "") }));
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

export const findClient = async (client: SupabaseClient, query: unknown) => matchClient(await listClients(client), query);

// ---------- The change log ----------

/** Who made a change, for the log. Bots name themselves; Jake names the bots, so any short text goes. */
export function botName(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return s || "grok";
}

/** The owner account a bot's change is filed under, and the admin software_request acts as. */
export async function ownerAdmin(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("admin_accounts")
    .select("id")
    .eq("role", "owner")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`owner: ${error.message}`);
  const id = ((data ?? [])[0] as Row | undefined)?.id;
  if (typeof id !== "string") throw new Error("no owner account to file the change under, so it was not made");
  return id;
}

/**
 * Log, then do. Every change a bot makes is an admin_audit_log row
 * `grok:<tool>`, naming the bot, written BEFORE anything is sent. No row, no
 * change. A failure gets its own row.
 */
export async function audited<T>(
  client: SupabaseClient,
  tool: string,
  tenantId: string | null,
  payload: Row,
  run: () => Promise<T>,
): Promise<T> {
  const admin = await ownerAdmin(client);
  const logged = await logAdminAction(client, admin, `grok:${tool}`, tenantId, payload);
  if (!logged) throw new Error("could not record the change, so it was not made");
  try {
    return await run();
  } catch (err) {
    await logAdminAction(client, admin, "grok:failed", tenantId, { tool, bot: payload.bot, error: (err as Error).message });
    throw err;
  }
}
