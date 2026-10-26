import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { connectorOf, handleBody, isGrokMcpRequest } from "../../../lib/grokMcp";
import { CONNECTORS } from "../../../lib/grokConnectors";

// The Grok Bot connectors (lib/grokMcp.ts), one per system: /api/grok/ghl/<key>,
// /api/grok/meta/<key> and /api/grok/software/<key>. The middleware already checked the key; checking
// again here means a future middleware edit cannot open this route by accident.

const notAllowed = () => new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

export const onRequest: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const name = connectorOf(url.pathname);
  if (!name || !isGrokMcpRequest(ctx.request.method, url.pathname, ctx.env.GROK_MCP_KEY)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (ctx.request.method !== "POST") return notAllowed();

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { server, tools } = CONNECTORS[name];
  const out = await handleBody(body, server, tools, { client, env: ctx.env, origin: url.origin });
  if (out === null) return new Response(null, { status: 202 });
  return Response.json(out);
};
