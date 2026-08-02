import type { Env } from "./env";
import { DriveNotConnectedError, FOLDER_MIME, isValidFileId, type DriveFile } from "./driveDirect";

// Google Drive reads for the SOP Hub, brokered by Composio instead of a raw
// OAuth grant of our own.
//
// WHY, since driveDirect.ts already does this: the direct grant runs on an OAuth
// client in the agency's own Google Cloud project, and that project's consent
// screen is in Testing. Google refuses anyone not on the tester list, and expires
// refresh tokens after 7 days even once they are on it. The Drive scope is
// restricted, so publishing the app means going through Google verification.
// Composio's Google app is already verified, so its grant has no tester list, no
// 7-day expiry and nothing to verify. The agency account is connected there
// already.
//
// This deliberately does NOT touch driveDirect.ts. The Assets hub streams file
// bytes through it (uploads, downloads, deletes), and that is exactly what
// Composio could not do: migration 0015 records its file-staging store failing
// with "Missing presigned URL", which is why the direct grant exists at all.
//
// The SOP Hub is different because it needs no byte transfer. It lists folders
// and exports Docs as markup, and Composio's raw proxy passes both straight
// through from Google, verified against the real folder on 2026-07-29. So Assets
// keeps the direct grant and the SOP Hub takes this path. Neither is a fallback
// for the other; they do different things.

const BASE = "https://backend.composio.dev/api/v3";
// The Composio toolkit holding the agency Google account's Drive grant.
const TOOLKIT = "googledrive";
// Composio scopes credentials by user_id. The agency has one Google account, so
// there is one id, matching the value 0014 wrote into drive_connection.
const AGENCY_USER_ID = "hauck-agency";

interface ConnectedAccount {
  id: string;
  status: string;
  toolkit?: { slug?: string };
}

interface AuthConfig {
  id: string;
  status?: string;
  toolkit?: { slug?: string };
}

// Composio's proxy answers HTTP 200 whatever Google said, carrying the upstream
// status in the envelope. `data` is Google's body: an object for JSON endpoints,
// a raw string for an export.
interface ProxyEnvelope {
  data: unknown;
  status?: number;
  headers?: Record<string, string>;
}

export function composioDriveConfigured(env: Env): boolean {
  return Boolean(env.COMPOSIO_API_KEY);
}

// Composio meters tool executions against a quota shared with every other
// customer on managed auth, so a throttle is a normal event rather than a fault:
// it means "ask again shortly", and the only wrong response is to give up on the
// first one and put the raw envelope on Jake's screen.
//
// Three attempts, not more: past that the burst is the problem, not the pacing,
// and a Worker holding a request open for ten seconds to find that out helps
// nobody. Retries stay cheap because `init.body` is always a string here, never
// a stream, so the same init replays safely.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 600;
const MAX_BACKOFF_MS = 5_000;

function isTransient(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function backoffMs(res: Response, attempt: number): number {
  // Composio sends Retry-After on some throttles. Its own number beats ours.
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_BACKOFF_MS);
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function callComposio<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
  attempt = 1,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // Lowercase, per the OpenAPI securityScheme.
      "x-api-key": env.COMPOSIO_API_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    if (isTransient(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(res, attempt));
      return callComposio<T>(env, path, init, attempt + 1);
    }
    // A throttle that outlives its retries is stated in English, because this
    // string is rendered on the SOPs tab. The raw JSON envelope told Jake
    // nothing he could act on.
    if (res.status === 429) {
      throw new Error(
        "Google Drive is rate limited through Composio right now. It usually clears within a minute.",
      );
    }
    throw new Error(`composio ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * The connected account id for the agency's Drive grant.
 *
 * Filtered in code rather than by query param: an EXPIRED grant sits alongside
 * the live one (a previous connect that lapsed), and picking the first row back
 * would read Drive through a dead token roughly at random.
 */
export async function resolveDriveAccount(env: Env): Promise<string> {
  if (!composioDriveConfigured(env)) {
    throw new DriveNotConnectedError("Composio is not configured (missing COMPOSIO_API_KEY).");
  }
  const qs = new URLSearchParams({ user_ids: AGENCY_USER_ID, toolkit_slugs: TOOLKIT });
  const body = await callComposio<{ items?: ConnectedAccount[] }>(env, `/connected_accounts?${qs}`);
  const items = body.items ?? [];
  const active = items.find((a) => a.status === "ACTIVE");
  if (active) return active.id;
  if (items.length > 0) {
    throw new DriveNotConnectedError(
      "The Google Drive connection has expired. Reconnect the agency account.",
    );
  }
  throw new DriveNotConnectedError("Google Drive is not connected yet.");
}

/** The auth config that a reconnect must be started against. */
export async function resolveDriveAuthConfig(env: Env): Promise<string> {
  const body = await callComposio<{ items?: AuthConfig[] }>(env, "/auth_configs");
  const match = (body.items ?? []).find(
    (a) => a.toolkit?.slug === TOOLKIT && (a.status ?? "ENABLED") === "ENABLED",
  );
  if (!match) throw new Error("No enabled Google Drive auth config exists in Composio.");
  return match.id;
}

/** Begin (or repair) the agency Drive grant. Returns Composio's consent URL. */
export async function startDriveConnect(
  env: Env,
  callbackUrl: string,
): Promise<{ redirectUrl: string; connectedAccountId: string }> {
  const authConfigId = await resolveDriveAuthConfig(env);
  const body = await callComposio<{ redirect_url: string; connected_account_id: string }>(
    env,
    // POST /connected_accounts returns 400 for Composio-managed OAuth2; /link is
    // the supported path (see composio.ts, which hit the same wall).
    "/connected_accounts/link",
    {
      method: "POST",
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: AGENCY_USER_ID,
        callback_url: callbackUrl,
      }),
    },
  );
  return { redirectUrl: body.redirect_url, connectedAccountId: body.connected_account_id };
}

/**
 * One Google Drive API call through Composio's managed token.
 *
 * `endpoint` is relative to the toolkit's base URL, which Composio prepends. It
 * already ends in /drive/v3, so this takes "/files?..." and NOT
 * "/drive/v3/files?...": passing the full path yields a Google 404 for
 * /drive/v3/drive/v3/files, which reads like a missing file rather than a
 * doubled prefix.
 */
async function proxyGet(env: Env, accountId: string, endpoint: string): Promise<unknown> {
  const body = await callComposio<ProxyEnvelope>(env, "/tools/execute/proxy", {
    method: "POST",
    body: JSON.stringify({ connected_account_id: accountId, endpoint, method: "GET" }),
  });
  const status = body.status ?? 200;
  if (status >= 400) throw driveError(endpoint, status, stringify(body.data));
  return body.data;
}

/**
 * The same proxy, writing.
 *
 * Composio takes a method and a body on the same execute call, so this is
 * proxyGet with two more keys rather than a second transport. Kept separate
 * anyway: every caller of proxyGet is a read, and a helper that silently
 * accepts a body is a helper that eventually writes by accident.
 *
 * Only metadata goes through here. Composio still cannot move file BYTES (see
 * the note at the top of this file), so creating a folder works and uploading a
 * logo does not.
 */
async function proxyPost(
  env: Env,
  accountId: string,
  endpoint: string,
  body: unknown,
): Promise<unknown> {
  const envelope = await callComposio<ProxyEnvelope>(env, "/tools/execute/proxy", {
    method: "POST",
    body: JSON.stringify({
      connected_account_id: accountId,
      endpoint,
      method: "POST",
      body,
    }),
  });
  const status = envelope.status ?? 200;
  if (status >= 400) throw driveError(endpoint, status, stringify(envelope.data));
  return envelope.data;
}

/** Create a folder inside `parentId`. Returns what Drive says it made. */
export async function createDriveFolder(
  env: Env,
  accountId: string,
  parentId: string,
  name: string,
): Promise<{ id: string; name: string; webViewLink: string | null }> {
  if (!isValidFileId(parentId)) throw new Error(`invalid parent folder id: ${parentId}`);
  const clean = name.trim();
  if (!clean) throw new Error("a folder name is required");

  const params = new URLSearchParams({
    fields: "id,name,webViewLink",
    supportsAllDrives: "true",
  });
  const data = asObject(
    await proxyPost(env, accountId, `/files?${params}`, {
      name: clean,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
    "create",
  );
  const id = typeof data.id === "string" ? data.id : "";
  if (!id) throw new Error("Drive created a folder but returned no id.");
  return {
    id,
    name: typeof data.name === "string" ? data.name : clean,
    webViewLink: typeof data.webViewLink === "string" ? data.webViewLink : null,
  };
}

// `parents` rides along because the batched read below asks for several folders
// at once and Drive answers with one flat list; the parent is the only thing
// that says which folder a file came back for.
const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,parents,webViewLink,iconLink,thumbnailLink,modifiedTime,size)";

interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  size?: string;
}

function normalize(f: RawFile): DriveFile {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === FOLDER_MIME,
    webViewLink: f.webViewLink ?? null,
    iconLink: f.iconLink ?? null,
    thumbnailLink: f.thumbnailLink ?? null,
    modifiedTime: f.modifiedTime ?? null,
    size: f.size ?? null,
  };
}

// How many folders go into one `q`. Drive takes an arbitrary number of `in
// parents` clauses but the query is a URL parameter, so this keeps it to roughly
// 1.5 KB. Well inside any limit, and the real folder never fills one chunk.
const PARENTS_PER_QUERY = 25;
// Drive's ceiling. Asking for the maximum is what keeps a whole level to a single
// call: 25 folders of children still arrive in one page.
const PAGE_SIZE = "1000";

/**
 * The children of MANY folders, in as few Drive calls as possible.
 *
 * Deliberately plural. The SOP folder is 32 folders across five levels, and
 * reading them one at a time meant 32 sequential calls through Composio on every
 * load of the tab. Composio meters against a quota shared with all its customers,
 * and that burst is what was answering 429. Drive will take every folder on a
 * level in one query (`'a' in parents or 'b' in parents`), which turns the walk
 * into one call per LEVEL: six instead of thirty-two.
 *
 * Returns a map keyed by the folder ids that were asked for, always with an entry
 * for each, so a caller never has to distinguish "empty" from "missing". A file
 * with two parents lands under both, matching what a per-folder read would have
 * said about each of them.
 */
export async function listChildrenOfMany(
  env: Env,
  accountId: string,
  folderIds: string[],
): Promise<Map<string, DriveFile[]>> {
  const out = new Map<string, DriveFile[]>();
  for (const id of folderIds) {
    if (!isValidFileId(id)) throw new Error(`invalid folder id: ${id}`);
    out.set(id, []);
  }
  if (out.size === 0) return out;

  const ids = [...out.keys()];
  for (let i = 0; i < ids.length; i += PARENTS_PER_QUERY) {
    const chunk = ids.slice(i, i + PARENTS_PER_QUERY);
    const clause = chunk.map((id) => `'${id}' in parents`).join(" or ");
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `(${clause}) and trashed = false`,
        fields: LIST_FIELDS,
        orderBy: "folder,name",
        pageSize: PAGE_SIZE,
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const data = asObject(await proxyGet(env, accountId, `/files?${params}`), "list");
      const parsed = data as { files?: RawFile[]; nextPageToken?: string };
      for (const f of parsed.files ?? []) {
        for (const parent of f.parents ?? []) {
          // Drive can name a parent outside the chunk (a shared file reachable
          // from elsewhere); only the folders we asked about get a bucket.
          out.get(parent)?.push(normalize(f));
        }
      }
      pageToken = parsed.nextPageToken;
    } while (pageToken);
  }
  return out;
}

/**
 * The SUB-FOLDERS of one folder, for a folder picker.
 *
 * Separate from listChildrenOfMany because a picker wants one level, folders
 * only, and never the files: a creatives folder with 300 images in it would
 * otherwise send 300 rows down the wire to draw a list of four folders.
 *
 * `parentId` accepts Drive's "root" alias, which is how the picker starts at My
 * Drive without having to look its id up first.
 */
export async function listFolders(
  env: Env,
  accountId: string,
  parentId: string,
): Promise<{ id: string; name: string }[]> {
  if (!isValidFileId(parentId)) throw new Error(`invalid folder id: ${parentId}`);

  const out: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: "nextPageToken,files(id,name)",
      orderBy: "name",
      pageSize: PAGE_SIZE,
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = asObject(await proxyGet(env, accountId, `/files?${params}`), "list folders");
    const parsed = data as { files?: { id: string; name: string }[]; nextPageToken?: string };
    for (const f of parsed.files ?? []) out.push({ id: f.id, name: f.name });
    pageToken = parsed.nextPageToken;
  } while (pageToken);

  return out;
}

/**
 * Folders anywhere in the account whose name matches, for the picker's search.
 *
 * Drive has no "search within this subtree" operator, so this is account-wide by
 * necessity. That is the useful behaviour anyway: the reason to type a name is
 * that you do not want to walk to it.
 */
export async function searchFolders(
  env: Env,
  accountId: string,
  query: string,
): Promise<{ id: string; name: string }[]> {
  const clean = query.trim();
  if (!clean) return [];
  // Escaping matters: an apostrophe in a folder name would otherwise close the
  // quoted literal and make Drive reject the whole query as malformed.
  const escaped = clean.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const params = new URLSearchParams({
    q: `name contains '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id,name)",
    orderBy: "name",
    // One page only. A picker showing 200 same-named folders has not helped
    // anyone; typing more letters has.
    pageSize: "50",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const data = asObject(await proxyGet(env, accountId, `/files?${params}`), "search folders");
  return ((data as { files?: { id: string; name: string }[] }).files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
  }));
}

export async function getFileMeta(
  env: Env,
  accountId: string,
  fileId: string,
  fields = "id,name,mimeType,modifiedTime,webViewLink",
): Promise<{ id: string; name: string; mimeType: string; modifiedTime?: string } | null> {
  if (!isValidFileId(fileId)) throw new Error(`invalid file id: ${fileId}`);
  const params = new URLSearchParams({ fields, supportsAllDrives: "true" });
  try {
    const data = asObject(await proxyGet(env, accountId, `/files/${fileId}?${params}`), "get");
    return data as { id: string; name: string; mimeType: string; modifiedTime?: string };
  } catch (err) {
    if (err instanceof Error && /\(404\)/.test(err.message)) return null;
    throw err;
  }
}

/**
 * A Google Doc exported as HTML, for rendering in-app.
 *
 * The export comes back as a string, so it is returned verbatim for the caller
 * to sanitize (sopHtml.ts). Identical markup to the direct path's export, which
 * is what lets that sanitizer stay untouched by this swap.
 */
export async function exportDocHtml(env: Env, accountId: string, fileId: string): Promise<string> {
  if (!isValidFileId(fileId)) throw new Error(`invalid file id: ${fileId}`);
  const data = await proxyGet(
    env,
    accountId,
    `/files/${fileId}/export?mimeType=${encodeURIComponent("text/html")}`,
  );
  if (typeof data !== "string") {
    // Google answers an export with markup. An object here means Composio
    // reshaped the response, which would silently render as "[object Object]".
    throw new Error(`Drive export returned ${typeof data}, expected HTML markup.`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Google Docs tabs
//
// A Doc can hold several tabs, each its own document with its own title, and
// they nest. Eight of the forty SOPs use them: 67 tabs in total.
//
// Drive's plain export concatenates every tab into one stream with no titles and
// no boundaries, which is how five separate cold-call scripts were rendering as
// one 90-paragraph wall. Nothing was missing; nothing was separable either, and
// a reader ran from the end of Variation 1 into the start of Variation 2 with no
// signal that the script had changed. That is worse than an omission, because it
// looks complete.
//
// The Drive API's export ignores a tabId (measured: byte-identical output for
// three different tab ids). docs.google.com's own export honours `?tab=`, so
// that is what these use. The structure comes from the Docs API, which the same
// Drive-scoped grant can read.
// ---------------------------------------------------------------------------

const DOCS_API = "https://docs.googleapis.com/v1/documents";
const DOCS_EXPORT = "https://docs.google.com/document/d";

export interface DocTab {
  id: string;
  title: string;
  // Nesting level, 0 for a top-level tab. Sub-tabs are flattened into order
  // with their depth kept, so the reader can indent without walking a tree.
  depth: number;
}

interface RawTab {
  tabProperties?: { tabId?: string; title?: string };
  childTabs?: RawTab[];
}

/**
 * A Doc's tabs in reading order, or [] when it has none worth splitting on.
 *
 * Asks for tab PROPERTIES only. Requesting content would pull every tab's full
 * body as JSON purely to count them, and the bodies are fetched as markup below.
 */
export async function listDocTabs(env: Env, accountId: string, fileId: string): Promise<DocTab[]> {
  if (!isValidFileId(fileId)) throw new Error(`invalid file id: ${fileId}`);
  const fields = "tabs(tabProperties,childTabs(tabProperties,childTabs(tabProperties)))";
  const data = asObject(
    await proxyGet(
      env,
      accountId,
      `${DOCS_API}/${fileId}?includeTabsContent=true&fields=${encodeURIComponent(fields)}`,
    ),
    "docs tabs",
  );

  const out: DocTab[] = [];
  const walk = (tabs: RawTab[] | undefined, depth: number): void => {
    for (const t of tabs ?? []) {
      const id = t.tabProperties?.tabId;
      if (id) out.push({ id, title: (t.tabProperties?.title ?? "").trim() || "Untitled tab", depth });
      walk(t.childTabs, depth + 1);
    }
  };
  walk((data as { tabs?: RawTab[] }).tabs, 0);

  // One tab is just a document. Splitting it would add a heading nobody wrote.
  return out.length > 1 ? out : [];
}

/** One tab of a Doc, exported as HTML. Caller sanitizes; see sopHtml.ts. */
export async function exportDocTabHtml(
  env: Env,
  accountId: string,
  fileId: string,
  tabId: string,
): Promise<string> {
  if (!isValidFileId(fileId)) throw new Error(`invalid file id: ${fileId}`);
  // Tab ids are Google-generated ("t.0", "t.eu0nvu4492ww"). Anything else is not
  // ours to pass into a URL.
  if (!/^[A-Za-z0-9._-]+$/.test(tabId)) throw new Error(`invalid tab id: ${tabId}`);
  const data = await proxyGet(
    env,
    accountId,
    `${DOCS_EXPORT}/${fileId}/export?format=html&tab=${encodeURIComponent(tabId)}`,
  );
  if (typeof data !== "string") {
    throw new Error(`Drive tab export returned ${typeof data}, expected HTML markup.`);
  }
  return data;
}

/** Which Google account the grant belongs to. Display only. */
export async function connectedEmail(env: Env, accountId: string): Promise<string | null> {
  try {
    const data = asObject(
      await proxyGet(env, accountId, `/about?fields=${encodeURIComponent("user(emailAddress)")}`),
      "about",
    );
    return (data as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
  } catch {
    // Cosmetic: never fail a read over the label on it.
    return null;
  }
}

function asObject(data: unknown, what: string): Record<string, unknown> {
  if (data && typeof data === "object") return data as Record<string, unknown>;
  throw new Error(`Drive ${what} returned ${typeof data}, expected JSON.`);
}

function stringify(data: unknown): string {
  if (typeof data === "string") return data.slice(0, 300);
  try {
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return "";
  }
}

function driveError(endpoint: string, status: number, body: string): Error {
  if (status === 401) {
    return new DriveNotConnectedError("Google access expired. Reconnect the agency account.");
  }
  if (status === 403) {
    return new Error(
      `Drive denied the request (403). Check the connected account has access to this folder. ${body}`,
    );
  }
  if (status === 404) return new Error(`Drive ${endpoint}: not found (404).`);
  return new Error(`Drive ${endpoint} failed (${status}): ${body}`);
}
