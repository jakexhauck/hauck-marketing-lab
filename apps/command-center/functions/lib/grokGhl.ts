import { agencyToken, loadAgencyInstall } from "./ghlApp";
import { getGhlContextForTenant, isPlaceholder } from "./tenantGhl";
import { audited, botName, findClient, listClients, type GrokDeps, type ToolDef } from "./grokMcp";

// The GHL connector: the whole GoHighLevel API for every client, through the
// agency's Marketplace app (Jake, 2026-10-26: "Everything"). A sub-account
// call uses that client's location token, minted by the app; an agency call
// uses the agency token. Nothing is held back by path or method.
//
// What stays is the log and the host:
//   - every call that is not a GET is an admin_audit_log row `grok:<tool>`
//     before it is sent (lib/grokMcp.ts audited);
//   - the token only ever goes to services.leadconnectorhq.com: a path is a
//     path, never a URL, and the built URL's origin is checked.

type Row = Record<string, unknown>;

export const GHL_ORIGIN = "https://services.leadconnectorhq.com";
export const GHL_VERSION = "2021-07-28";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];
const TIMEOUT_MS = 25_000;

/** The full GHL URL for a path and query, or an error the bot can act on. */
export function ghlUrl(path: unknown, query: unknown): URL {
  if (typeof path !== "string" || !/^\/[^/\\]/.test(path) || /[\s\\]/.test(path)) {
    throw new Error('path is a GHL API path starting with "/", e.g. /locations/{locationId}/customValues');
  }
  const url = new URL(GHL_ORIGIN + path);
  if (url.origin !== GHL_ORIGIN) throw new Error("path must stay on the GHL API");
  if (query !== undefined && query !== null) {
    if (typeof query !== "object" || Array.isArray(query)) throw new Error("query is an object of name: value");
    for (const [k, v] of Object.entries(query as Row)) {
      for (const one of Array.isArray(v) ? v : [v]) {
        if (one !== undefined && one !== null) url.searchParams.append(k, String(one));
      }
    }
  }
  return url;
}

export function ghlMethod(v: unknown): Method {
  const m = typeof v === "string" ? v.toUpperCase() : "GET";
  if (!(METHODS as readonly string[]).includes(m)) throw new Error(`method is one of ${METHODS.join(", ")}`);
  return m as Method;
}

async function send(token: string, method: Method, url: URL, body: unknown, version: unknown): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Version: typeof version === "string" && version.trim() ? version.trim() : GHL_VERSION,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body !== undefined && body !== null && method !== "GET") {
    headers["content-type"] = "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(url.href, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`GHL ${method} ${url.pathname} returned ${res.status}: ${text.slice(0, 2000)}`);
  return text || `${res.status} OK`;
}

const call = {
  method: { type: "string", enum: [...METHODS], description: "Default GET." },
  path: { type: "string", description: "GHL API v2 path, e.g. /contacts/{contactId} or /locations/{locationId}/customValues." },
  query: { type: "object", description: "Query string as name: value." },
  body: { type: "object", description: "JSON body for POST, PUT and PATCH." },
  version: { type: "string", description: `GHL Version header. Default ${GHL_VERSION}.` },
  bot: { type: "string", description: "Your name, for the change log." },
};

const ghlClients: ToolDef<GrokDeps> = {
  name: "ghl_clients",
  description: "Every client with its GHL sub-account (locationId), and the agency's companyId.",
  inputSchema: { type: "object", properties: {}, required: [] },
  run: async (d) => {
    const [clients, rows, agency] = await Promise.all([
      listClients(d.client),
      d.client.from("tenants").select("id, ghl_location_id, ghl_token"),
      loadAgencyInstall(d.client).catch(() => null),
    ]);
    if (rows.error) throw new Error(`clients: ${rows.error.message}`);
    const byId = new Map(((rows.data ?? []) as Row[]).map((r) => [String(r.id), r]));
    const out = clients.map((c) => {
      const t = byId.get(c.id) ?? {};
      const loc = t.ghl_location_id as string | null;
      const connected = !isPlaceholder(loc) && !isPlaceholder(t.ghl_token as string | null);
      return { client: c.name, locationId: isPlaceholder(loc) ? null : loc, connected };
    });
    return JSON.stringify({ companyId: agency?.company_id ?? null, clients: out }, null, 1);
  },
};

const ghlRequest: ToolDef<GrokDeps> = {
  name: "ghl_request",
  description: "Any GHL API v2 call in one client's sub-account, with that sub-account's token. Anything but GET is logged before it is sent.",
  inputSchema: { type: "object", properties: { client: { type: "string", description: "Client name or slug." }, ...call }, required: ["client", "path"] },
  run: async (d, a) => {
    const method = ghlMethod(a.method);
    const url = ghlUrl(a.path, a.query);
    const c = await findClient(d.client, a.client);
    const ctx = await getGhlContextForTenant(d.env, c.id);
    if (method === "GET") return send(ctx.token, method, url, undefined, a.version);
    const payload = { bot: botName(a.bot), method, path: a.path, query: a.query ?? null, body: a.body ?? null };
    return audited(d.client, "ghl_request", c.id, payload, () => send(ctx.token, method, url, a.body, a.version));
  },
};

const ghlAgencyRequest: ToolDef<GrokDeps> = {
  name: "ghl_agency_request",
  description: "Any GHL API v2 call at the agency level (companyId from ghl_clients), with the agency token. Anything but GET is logged before it is sent.",
  inputSchema: { type: "object", properties: call, required: ["path"] },
  run: async (d, a) => {
    const method = ghlMethod(a.method);
    const url = ghlUrl(a.path, a.query);
    const agency = await agencyToken(d.client, d.env);
    if (!agency) throw new Error("The GHL app is not installed at the agency, or its token needs a reinstall.");
    if (method === "GET") return send(agency.token, method, url, undefined, a.version);
    const payload = { bot: botName(a.bot), method, path: a.path, query: a.query ?? null, body: a.body ?? null };
    return audited(d.client, "ghl_agency_request", null, payload, () => send(agency.token, method, url, a.body, a.version));
  },
};

export const GHL_TOOLS: ToolDef<GrokDeps>[] = [ghlClients, ghlRequest, ghlAgencyRequest];
