import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminAction } from "./adminAuth";
import { AD_CREATIVES_BUCKET } from "./adCreativeFiles";
import { GHL_OPS, GhlOpRefused, isSecretValue } from "./agentGhlOps";
import { writeOpenHours } from "./ghlCalendarWrite";
import { summariseOpenHours, toOpenHours, type DayHours, type GhlOpenHours } from "./calendarHours";
import { getGhlContextForTenant } from "./tenantGhl";
import { resolveMetaToken } from "./metaToken";
import { patchTask, readTasks } from "./clientTasks";
import { readPages, savePage } from "./briefPagesStore";
import { CLIENT_FOLDER_PREFIX, clientDriveRoot, clientFolderName, ensureClientFolder, matchClientFolder } from "./clientDriveFolder";
import { composioDriveConfigured, listFolders, resolveDriveAccount } from "./driveComposio";
import { parsePage, type AdsPage, type BriefPageId } from "../../src/lib/briefPages";
import type { TaskOwner } from "../../src/lib/clientTasks";
import { BuildRefused, buildCtx, createAd, createAdset, createCampaign, NO_PLAN_CAP_USD, planDailySpend, type BuildCtx } from "./grokMetaBuild";
import { findClient, GROK_TOOLS, type GrokDeps } from "./grokTools";
import { botName, type ClientRef, type ToolDef } from "./grokMcp";

// The Hauck Brain's write tools. The read tools live in grokTools.ts, which
// writes nothing but grok_notes.
//
// Tools, not lanes (Jake, 2026-10-26): any bot may use any tool; who does
// what is in the instructions Jake writes in Grok. No daily cap either. What
// stays is safety, not behaviour:
//   - every write goes through `write()`: an admin_audit_log row
//     `grok:<tool>`, naming the bot, BEFORE anything is sent. No row, no write.
//     A check_only call reads and asks Meta to validate, changes nothing, and
//     is not logged;
//   - no money: Meta objects are created only, always PAUSED, budgets capped
//     (grokMetaBuild.ts), and nothing touches billing, invoices or payments;
//   - GHL through the existing GHL_OPS (credential and app-owned values
//     refused, before the audit row so a token never lands in it);
//   - Jake's and the client's own Mission Control tasks are theirs to tick.

type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

const schema = (props: Record<string, unknown>, required: string[]) => ({ type: "object", properties: props, required });
const base = {
  client: { type: "string", description: "Client name or slug." },
  bot: { type: "string", description: "Your name, for the change log." },
};
const checkOnly = { check_only: { type: "boolean", description: "true: Meta validates it, nothing is created." } };

const botOf = (a: Args): string => botName(a.bot);

async function ownerAdmin(client: SupabaseClient): Promise<string> {
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

/** Log, then do. Refusals come back as plain words for the bot. */
async function write(d: GrokDeps, tool: string, c: ClientRef, bot: string, args: Args, run: () => Promise<unknown>): Promise<string> {
  const admin = await ownerAdmin(d.client);
  const logged = await logAdminAction(d.client, admin, `grok:${tool}`, c.id, { bot, args });
  if (!logged) throw new Error("could not record the change, so it was not made");
  try {
    return JSON.stringify(await run(), null, 1);
  } catch (err) {
    await logAdminAction(d.client, admin, "grok:failed", c.id, { bot, tool, error: (err as Error).message });
    throw err;
  }
}

/** Plain refusals stay plain; anything else reads as the platform saying no. */
async function said<T>(platform: string, p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof BuildRefused || err instanceof GhlOpRefused) throw new Error(err.message);
    throw new Error(`${platform} said no: ${(err as Error).message}`);
  }
}

// ---------- Meta ----------

async function meta(d: GrokDeps, c: ClientRef): Promise<BuildCtx> {
  const token = await resolveMetaToken(d.env);
  if (!token) throw new Error("Meta is not connected for the agency.");
  return said(
    "Meta",
    buildCtx(d.client, c.id, token, async (path) => {
      const { data, error } = await d.client.storage.from(AD_CREATIVES_BUCKET).download(path);
      if (error || !data) throw new Error(`could not read the Creatives file: ${error?.message ?? "missing"}`);
      return data;
    }),
  );
}

/** A Meta build: check_only runs straight through; a real one goes through write(). */
function metaTool(name: string, description: string, props: Record<string, unknown>, required: string[], build: (ctx: BuildCtx, a: Args, check: boolean) => Promise<Row>): ToolDef<GrokDeps> {
  return {
    name,
    description,
    inputSchema: schema({ ...base, ...props, ...checkOnly }, ["client", ...required]),
    run: async (d, a) => {
      const bot = botOf(a);
      const c = await findClient(d, a);
      const ctx = await meta(d, c);
      const check = a.check_only === true;
      if (check) return JSON.stringify(await said("Meta", build(ctx, a, true)), null, 1);
      return write(d, name, c, bot, a, () => said("Meta", build(ctx, a, false)));
    },
  };
}

const metaCreateCampaign = metaTool(
  "meta_create_campaign",
  "Create a PAUSED Leads campaign with a campaign budget (CBO). daily_budget_usd is at most the Ads plan's daily spend (or $100 with no plan). Name it to the account's pattern, e.g. \"LF | $300 Off | 10/21/26\".",
  { name: { type: "string" }, daily_budget_usd: { type: "number" } },
  ["name", "daily_budget_usd"],
  createCampaign,
);

const metaCreateAdset = metaTool(
  "meta_create_adset",
  "Create a PAUSED ad set in a Leads campaign to Jake's spec: Instant Forms, maximise leads, the client's zip codes (max 20), ages 18 to 65+, Facebook and Instagram feeds, stories and reels only, starts the next midnight in the account's time zone.",
  { campaign_id: { type: "string" }, name: { type: "string" }, zips: { type: "array", items: { type: "string" } } },
  ["campaign_id", "name", "zips"],
  createAdset,
);

const metaCreateAd = metaTool(
  "meta_create_ad",
  "Create a PAUSED lead form ad: an image from the app's Creatives (file_id) or a ready video in the Meta library (video_id), both from get_ad_assets; Creative's primary text and headline; the lead form; creative enhancements off; a UTM string (default set for you). cta defaults to GET_QUOTE.",
  {
    adset_id: { type: "string" },
    name: { type: "string" },
    lead_form_id: { type: "string" },
    file_id: { type: "string" },
    video_id: { type: "string" },
    primary_text: { type: "string" },
    headline: { type: "string" },
    description: { type: "string" },
    cta: { type: "string", enum: ["GET_QUOTE", "SIGN_UP", "LEARN_MORE", "APPLY_NOW", "CONTACT_US", "BOOK_NOW"] },
    url_tags: { type: "string" },
  },
  ["adset_id", "name", "lead_form_id", "primary_text", "headline"],
  createAd,
);

// ---------- GHL ----------

type GhlRun = (g: Awaited<ReturnType<typeof getGhlContextForTenant>>, args: Row) => Promise<unknown>;
const ghlOp = (op: keyof typeof GHL_OPS) => GHL_OPS[op] as unknown as { parse(a: Row): { ok: true; args: Row } | { ok: false; error: string }; run: GhlRun };

async function ghlCtx(d: GrokDeps, c: ClientRef) {
  try {
    return await getGhlContextForTenant(d.env, c.id);
  } catch (err) {
    throw new Error(`${c.name}: ${(err as Error).message}`);
  }
}

function ghlTool(name: string, op: "write.customValue" | "write.customField", description: string, props: Record<string, unknown>, required: string[], toOpArgs: (a: Args) => Row): ToolDef<GrokDeps> {
  return {
    name,
    description,
    inputSchema: schema({ ...base, ...props }, ["client", ...required]),
    run: async (d, a) => {
      const bot = botOf(a);
      const c = await findClient(d, a);
      const parsed = ghlOp(op).parse(toOpArgs(a));
      if (!parsed.ok) throw new Error(parsed.error);
      // The op refuses credentials too, but only after write() has logged the
      // args: a token must never reach the audit row.
      if (op === "write.customValue" && isSecretValue(String(parsed.args.key), String(parsed.args.value))) {
        throw new Error(`${String(parsed.args.key)} holds a credential; Jake sets it himself`);
      }
      const g = await ghlCtx(d, c);
      return write(d, name, c, bot, a, () => said("The CRM", ghlOp(op).run(g, parsed.args)));
    },
  };
}

const ghlSetCustomValue = ghlTool(
  "ghl_set_custom_value",
  "write.customValue",
  "Set one custom value in the client's CRM sub-account (updates it, or adds it if new). Refused for values the app writes and for anything holding a token or key: Jake sets those.",
  { name: { type: "string", description: "The custom value's name as the CRM shows it." }, value: { type: "string" } },
  ["name", "value"],
  (a) => ({ key: a.name, value: a.value }),
);

const ghlCreateCustomField = ghlTool(
  "ghl_create_custom_field",
  "write.customField",
  "Add a custom field to the client's CRM sub-account. type: TEXT, LARGE_TEXT, NUMERICAL, PHONE, MONETORY or DATE. model: contact (default) or opportunity.",
  { name: { type: "string" }, type: { type: "string", enum: ["TEXT", "LARGE_TEXT", "NUMERICAL", "PHONE", "MONETORY", "DATE"] }, model: { type: "string", enum: ["contact", "opportunity"] } },
  ["name", "type"],
  (a) => ({ name: a.name, type: a.type, ...(a.model ? { model: a.model } : {}) }),
);

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** [{ day: "Mon", open: "08:00", close: "17:00" }] -> the calendar's week. A day not listed is closed. */
export function weekFrom(hours: unknown): GhlOpenHours[] {
  if (!Array.isArray(hours) || !hours.length) throw new Error("hours is a list of { day, open, close }");
  const days: DayHours[] = DAY_NAMES.map((_, day) => ({ day, ranges: [] }));
  for (const h of hours as Row[]) {
    const day = DAY_NAMES.indexOf(String(h?.day ?? "").slice(0, 3).toLowerCase());
    if (day < 0) throw new Error(`day "${String(h?.day)}" is a weekday name, like Mon`);
    days[day].ranges.push({ open: String(h.open ?? ""), close: String(h.close ?? "") });
  }
  const week = toOpenHours(days);
  if (!week) throw new Error("times are 24-hour HH:MM and each close is after its open");
  return week;
}

const ghlSetCalendarHours: ToolDef<GrokDeps> = {
  name: "ghl_set_calendar_hours",
  description:
    "Set a CRM calendar's bookable hours to the owner's real hours. Every other setting (slot length, buffers) is kept. Days you do not list are closed. hours: [{ day: \"Mon\", open: \"08:00\", close: \"17:00\" }].",
  inputSchema: schema(
    {
      ...base,
      calendar: { type: "string", description: "The calendar's name as get_ghl_setup shows it, e.g. Home Estimate." },
      hours: { type: "array", items: { type: "object", properties: { day: { type: "string" }, open: { type: "string" }, close: { type: "string" } } } },
    },
    ["client", "calendar", "hours"],
  ),
  run: async (d, a) => {
    const bot = botOf(a);
    const c = await findClient(d, a);
    const week = weekFrom(a.hours);
    const g = await ghlCtx(d, c);
    const cals = (await said("The CRM", ghlOp("read.calendars").run(g, {}))) as { id: string; name: string | null }[];
    const want = String(a.calendar ?? "").trim().toLowerCase();
    const hits = cals.filter((x) => String(x.name ?? "").trim().toLowerCase() === want);
    if (hits.length !== 1) throw new Error(`no single calendar called "${String(a.calendar)}". Calendars: ${cals.map((x) => x.name).join(", ")}`);
    return write(d, "ghl_set_calendar_hours", c, bot, a, async () => {
      await said("The CRM", writeOpenHours(g, hits[0].id, week));
      return { updated: "calendar hours", calendar: hits[0].name, hours: summariseOpenHours(week) };
    });
  },
};

// ---------- Client Drive folder ----------

// The brand word a business name starts with: "clear" in "Clear Choice
// Windows". Trade words ("garage", "windows") come later and are shared by
// clients, so they never count.
const brandWord = (name: string): string =>
  name
    .replace(CLIENT_FOLDER_PREFIX.trim(), "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "the")[0] ?? "";

/**
 * Client folders in the root that start with this client's brand word but are
 * not its exact folder: "🤝 | Clear Choice Owensboro" for "Clear Choice
 * Windows". ensureClientFolder would not link those, it would make a twin, so
 * the tool stops and names them. Refusing too often is the safe mistake.
 */
export function lookalikeFolders(clientName: string, folderNames: string[]): string[] {
  const exact = clientFolderName(clientName);
  const mine = brandWord(clientName);
  if (mine.length < 2) return [];
  return folderNames.filter((f) => f.startsWith(CLIENT_FOLDER_PREFIX.trim()) && f.trim() !== exact && brandWord(f) === mine);
}

const createClientFolderTool: ToolDef<GrokDeps> = {
  name: "create_client_folder",
  description:
    "The client's Google Drive folder (\"🤝 | Name\" with Finished Creatives and a copy of every Client Setup doc, the Mission Control doc among them). Links the folder if it already exists. If a folder that looks like this client's exists under another name, it stops and names it: ask Jake to link that one, and pass new_folder_ok: true only when he says to make a new one.",
  inputSchema: schema({ ...base, new_folder_ok: { type: "boolean", description: "Only after Jake says the look-alike folder is not this client's." } }, ["client"]),
  run: async (d, a) => {
    const bot = botOf(a);
    const c = await findClient(d, a);
    const { data: linked, error } = await d.client.from("client_folders").select("folder_id").eq("tenant_id", c.id).limit(1).maybeSingle();
    if (error) throw new Error(`folders: ${error.message}`);
    if (!linked && a.new_folder_ok !== true && composioDriveConfigured(d.env)) {
      const names = (await said("Drive", resolveDriveAccount(d.env).then((acct) => listFolders(d.env, acct, clientDriveRoot(d.env))))).map((f) => f.name);
      // A tidy-name match ("Made Better LC") is the one ensureClientFolder links,
      // so only a folder it would NOT link can turn into a twin.
      if (!matchClientFolder(names.map((name) => ({ name })), c.name)) {
        const like = lookalikeFolders(c.name, names);
        if (like.length) {
          throw new Error(`${c.name} has no folder linked, and ${like.join(", ")} looks like it could be theirs. Ask Jake: link that one in the app, or say to make a new folder.`);
        }
      }
    }
    return write(d, "create_client_folder", c, bot, { new_folder_ok: a.new_folder_ok === true }, async () => {
      const out = await ensureClientFolder(d.env, d.client, c.id, c.name, null);
      if (!out.folder) throw new Error(out.warning ?? "No Drive folder was made.");
      return { folder: out.folder.name, link: out.folder.webViewLink, ...(out.warning ? { warning: out.warning } : {}) };
    });
  },
};

// ---------- Mission Control plan pages ----------

/**
 * Why a bot may not save this Ads plan, or null. The campaign budget cap reads
 * the plan, so a bot never raises its own ceiling: no daily spend above the
 * saved plan's highest, or $100 when it has none. Raising it is Jake's.
 */
export function planSpendProblem(current: AdsPage | null, next: AdsPage): string | null {
  const was = planDailySpend(current) ?? NO_PLAN_CAP_USD;
  const now = planDailySpend(next);
  return now !== null && now > was ? `a daily spend of $${now} is over $${was}, the most a bot may plan; Jake raises it in the app` : null;
}

const savePlanPage: ToolDef<GrokDeps> = {
  name: "save_plan_page",
  description:
    "Write the client's Research page or Ads plan page in Mission Control. data is the whole page as JSON in the shape get_research or get_ads_plan shows; version is the number they showed (0 for a page never written). It replaces the page.",
  inputSchema: schema(
    {
      ...base,
      page: { type: "string", enum: ["research", "ads"] },
      version: { type: "number", description: "The version get_research or get_ads_plan showed." },
      data: { type: "object" },
    },
    ["client", "page", "version", "data"],
  ),
  run: async (d, a) => {
    const bot = botOf(a);
    const page = a.page as BriefPageId;
    if (page !== "research" && page !== "ads") throw new Error("page is research or ads");
    const c = await findClient(d, a);
    const parsed = parsePage(page, a.data);
    if (!parsed.ok) throw new Error(parsed.reason);
    if (page === "ads") {
      const current = (await readPages(d.client, c.id)).find((p) => p.page === "ads");
      const problem = planSpendProblem(current && current.version > 0 ? (current.data as AdsPage) : null, parsed.data as AdsPage);
      if (problem) throw new Error(problem);
    }
    return write(d, "save_plan_page", c, bot, { page, version: a.version }, async () => {
      const r = await savePage(d.client, { tenantId: c.id, page, data: a.data, version: Number(a.version), by: page });
      if ("error" in r) throw new Error(r.reason);
      if ("conflict" in r) throw new Error(`the page changed since you read it (now version ${r.conflict.version}); read it again and redo your change`);
      return { saved: `${page} page`, version: r.saved.version };
    });
  },
};

// ---------- Mission Control tasks ----------

// Jake's and the client's tasks are theirs to tick; any agent task is any bot's.
export const NOT_FOR_BOTS: TaskOwner[] = ["jake", "client"];

const updateTask: ToolDef<GrokDeps> = {
  name: "update_task",
  description:
    "Move a client's Mission Control task (key from get_tasks) to doing, or to done with proof (what was made or checked, with ids or names). Jake's and the client's own tasks are refused, and nothing goes back to to-do.",
  inputSchema: schema(
    { ...base, key: { type: "string" }, state: { type: "string", enum: ["doing", "done"] }, proof: { type: "string" }, note: { type: "string" } },
    ["client", "key", "state"],
  ),
  run: async (d, a) => {
    const bot = botOf(a);
    const c = await findClient(d, a);
    const state = a.state;
    if (state !== "doing" && state !== "done") throw new Error("state is doing or done");
    const proof = typeof a.proof === "string" ? a.proof.trim() : "";
    if (state === "done" && !proof) throw new Error("done needs proof: what you made or checked");
    const task = (await readTasks(d.client, c.id)).find((t) => t.key === a.key);
    if (!task) throw new Error(`no task with key "${String(a.key)}" for ${c.name}; read get_tasks`);
    if (NOT_FOR_BOTS.includes(task.owner)) throw new Error(`"${task.name}" is ${task.owner === "jake" ? "Jake's" : "the client's"} to tick`);
    if (task.state === "done" || task.state === "cut") throw new Error(`"${task.name}" is already ${task.state}; only Jake reopens it`);
    return write(d, "update_task", c, bot, a, async () => {
      const patch = { state, ...(proof ? { evidence: proof } : {}), ...(typeof a.note === "string" && a.note.trim() ? { note: a.note.trim() } : {}) } as const;
      const r = await patchTask(d.client, c.id, task.id, patch, `grok:${bot}`, { handoffs: false });
      if ("error" in r) throw new Error(r.reason);
      return { updated: "task", name: r.name, state: r.state };
    });
  },
};

export const GROK_WRITE_TOOLS: ToolDef<GrokDeps>[] = [
  metaCreateCampaign,
  metaCreateAdset,
  metaCreateAd,
  ghlSetCustomValue,
  ghlCreateCustomField,
  ghlSetCalendarHours,
  updateTask,
  savePlanPage,
  createClientFolderTool,
];

/** Everything the connector lists: the reads, then the writes. */
export const GROK_ALL_TOOLS: ToolDef<GrokDeps>[] = [...GROK_TOOLS, ...GROK_WRITE_TOOLS];
