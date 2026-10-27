import { agencyToken, loadAgencyInstall, locationToken } from "./ghlApp";
import { getGhlContextForTenant, isPlaceholder } from "./tenantGhl";
import { audited, botName, listClients, matchClient, type ClientRef, type GrokDeps, type ToolDef } from "./grokMcp";

// The GHL connector: the whole GoHighLevel API for every sub-account, through
// the agency's Marketplace app (Jake, 2026-10-26: "Everything"; 2026-10-27:
// full access, the Test Account too). A client's call uses that client's
// token; any other sub-account in the agency (Test Account, Hauck Marketing)
// is reached by locationId with a token minted by the app; an agency call uses
// the agency token. Nothing is held back by path or method, and the app asks
// GHL for every scope ticked in the developer portal (ghlScopes.ts).
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

/** A GHL locationId, or an error naming both ways to pick a sub-account. */
export function locationIdOf(v: unknown): string {
  const id = typeof v === "string" ? v.trim() : "";
  if (!/^[A-Za-z0-9]{8,40}$/.test(id)) {
    throw new Error("Give client (a client's name or slug) or locationId (any sub-account in ghl_clients).");
  }
  return id;
}

export interface SubAccount {
  name: string;
  locationId: string;
}

/**
 * A client, or a sub-account that is not a client, by name. The bots ask for
 * the Test Account and Hauck Marketing by name as well (2026-10-27: a bot read
 * "No client called Test Account" as "not linked" and stopped). Same rules as
 * matchClient: exact first, then a unique part, never a guess.
 */
export function pickSubAccount(clients: ClientRef[], others: SubAccount[], query: unknown): { tenantId: string } | { locationId: string } {
  // A blank name would be "part" of every query.
  const named = others.filter((s) => /[a-z0-9]/i.test(s.name));
  const at = new Map(named.map((s) => [{ id: s.locationId, name: s.name, slug: "" }, s.locationId]));
  const hit = matchClient([...clients, ...at.keys()], query);
  const locationId = at.get(hit);
  return locationId ? { locationId } : { tenantId: hit.id };
}

async function mintedToken(d: GrokDeps, id: string): Promise<string> {
  const token = await locationToken(d.client, d.env, id);
  if (!token) throw new Error(`No GHL token for sub-account ${id}: it is not under the agency, or the app is not installed there.`);
  return token;
}

// A client goes through its own connection, the same one the app uses. Any
// other sub-account is minted from the agency install, which GHL only allows
// for locations under this agency with the app installed. The sub-account list
// is only fetched when no single client answers to the name.
async function subAccountToken(d: GrokDeps, a: Row): Promise<{ token: string; tenantId: string | null; locationId: string | null }> {
  if (typeof a.client === "string" && a.client.trim()) {
    const clients = await listClients(d.client);
    let target: { tenantId: string } | { locationId: string };
    try {
      target = { tenantId: matchClient(clients, a.client).id };
    } catch {
      target = pickSubAccount(clients, await otherSubAccounts(d, clients).catch(() => []), a.client);
    }
    if ("locationId" in target) return { token: await mintedToken(d, target.locationId), tenantId: null, locationId: target.locationId };
    return { token: (await getGhlContextForTenant(d.env, target.tenantId)).token, tenantId: target.tenantId, locationId: null };
  }
  const id = locationIdOf(a.locationId);
  return { token: await mintedToken(d, id), tenantId: null, locationId: id };
}

/** Every sub-account under the agency, straight from GHL. */
async function agencyLocations(d: GrokDeps): Promise<SubAccount[]> {
  const agency = await agencyToken(d.client, d.env);
  if (!agency) throw new Error("The GHL app is not installed at the agency, or its token needs a reinstall.");
  const url = ghlUrl("/locations/search", { companyId: agency.companyId, limit: 100 });
  const found = JSON.parse(await send(agency.token, "GET", url, undefined, undefined)) as { locations?: Row[] };
  return (found.locations ?? []).map((l) => ({ name: String(l.name ?? ""), locationId: String(l.id ?? "") }));
}

/**
 * The sub-accounts no client holds: the Test Account, Hauck Marketing. Only a
 * client's row counts; the agency's own tenant row holds Hauck Marketing's
 * location but is not a client.
 */
export function notClientSubAccounts(all: SubAccount[], tenants: Row[], clients: ClientRef[]): SubAccount[] {
  const ids = new Set(clients.map((c) => c.id));
  const held = new Set(tenants.filter((t) => ids.has(String(t.id))).map((t) => t.ghl_location_id));
  return all.filter((s) => !held.has(s.locationId));
}

async function otherSubAccounts(d: GrokDeps, clients: ClientRef[]): Promise<SubAccount[]> {
  const [all, rows] = await Promise.all([agencyLocations(d), d.client.from("tenants").select("id, ghl_location_id")]);
  if (rows.error) throw new Error(`clients: ${rows.error.message}`);
  return notClientSubAccounts(all, (rows.data ?? []) as Row[], clients);
}

// Every sub-account under the agency, so the bots see the ones that are not
// clients in the app as well. An error here is reported in place rather than
// hiding the client list.
async function agencySubAccounts(d: GrokDeps, clients: { client: string; locationId: string | null }[]): Promise<Row[] | string> {
  try {
    const clientAt = new Map(clients.map((c) => [c.locationId, c.client]));
    return (await agencyLocations(d)).map((l) => ({ ...l, client: clientAt.get(l.locationId) ?? null }));
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
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
  description: "Every client with its GHL sub-account (locationId), every sub-account in the agency (subAccounts, including ones that are not clients, like the Test Account), and the agency's companyId.",
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
    const subAccounts = await agencySubAccounts(d, out);
    return JSON.stringify({ companyId: agency?.company_id ?? null, clients: out, subAccounts }, null, 1);
  },
};

const ghlRequest: ToolDef<GrokDeps> = {
  name: "ghl_request",
  description:
    "Any GHL API v2 call in one sub-account, with that sub-account's token: a client by name, or any other sub-account in ghl_clients (the Test Account, Hauck Marketing) by name or locationId. Anything but GET is logged before it is sent.",
  inputSchema: {
    type: "object",
    properties: {
      client: { type: "string", description: "Client name or slug, or the name of any other sub-account in ghl_clients, e.g. Test Account." },
      locationId: { type: "string", description: "Any sub-account's locationId from ghl_clients subAccounts, for one that is not a client. Give client or locationId." },
      ...call,
    },
    required: ["path"],
  },
  run: async (d, a) => {
    const method = ghlMethod(a.method);
    const url = ghlUrl(a.path, a.query);
    const { token, tenantId, locationId } = await subAccountToken(d, a);
    if (method === "GET") return send(token, method, url, undefined, a.version);
    const payload = { bot: botName(a.bot), method, path: a.path, locationId, query: a.query ?? null, body: a.body ?? null };
    return audited(d.client, "ghl_request", tenantId, payload, () => send(token, method, url, a.body, a.version));
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
