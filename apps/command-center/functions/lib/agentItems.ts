import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTaskOps } from "../../src/lib/clientTasks";
import { applyTaskOps } from "./clientTasks";
import { isAgentId } from "../../src/lib/agents";
import type { AgentId } from "../../src/lib/agents";
import type {
  AgentItem,
  AgentLesson,
  AgentMessage,
  AnswerBody,
  AutoChatBody,
  ChatSummary,
  ItemBody,
  ItemStatus,
  LessonEdit,
  RunnerStatus,
  Grant,
  GrantKind,
} from "../../src/lib/agentWire";
import { messageFromRow, stripEmDash } from "./agentRunner";

// Chats, messages and Building cards for the Agents section (0166), shared by
// the admin API the page calls (api/admin/agents/*) and the runner API the PC
// calls (api/agent-runner/*). docs/build-plans/agents.md, Task 4.
//
// tenant_id null is the agency: the Manager on the agency rail. Every read and
// every "newest chat" lookup goes through scopeFilter, so a null tenant means
// `is null` and never "no filter", which would have shown the agency Manager
// every client's chats.

type Row = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}

/**
 * The ?tenant= value: "agency" is null (the agency Manager), a uuid is that
 * client, and anything else is undefined, which the handlers answer 400.
 */
export function parseTenantParam(s: string | null | undefined): string | null | undefined {
  if (s === "agency") return null;
  return isUuid(s) ? s : undefined;
}

export function scopeFilter(tenant: string): { column: "tenant_id"; op: "is" | "eq"; value: string | null } {
  return tenant === "agency"
    ? { column: "tenant_id", op: "is", value: null }
    : { column: "tenant_id", op: "eq", value: tenant };
}

// Apply scopeFilter to a query. Written once so no caller can drop the `is`.
// Unconstrained on purpose: supabase-js's builder types are too deep for TS
// to check against an interface, and every caller passes a plain
// from().select() chain, which has both methods.
interface Filterable<Q> {
  eq(column: string, value: string): Q;
  is(column: string, value: null): Q;
}
function scoped<Q>(q: Q, tenantId: string | null): Q {
  const f = scopeFilter(tenantId ?? "agency");
  const b = q as unknown as Filterable<Q>;
  return f.op === "is" ? b.is(f.column, null) : b.eq(f.column, f.value as string);
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const ITEM_STATUSES: ItemStatus[] = ["building", "needs_ok", "live", "done", "declined"];

// Keys sorted at every level, so the same payload always hashes the same.
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as Row).sort().map((k) => [k, stable((v as Row)[k])]));
  }
  return v;
}

/** SHA-256 hex of a card's payload: what Approve says Jake looked at. */
export async function payloadHash(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(payload)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function itemFromRow(r: Row): AgentItem {
  const from = typeof r.from_agent === "string" ? r.from_agent : null;
  return {
    id: r.id as string,
    tenantId: (r.tenant_id as string | null) ?? null,
    agent: r.agent as AgentId,
    chatId: (r.chat_id as string | null) ?? null,
    fromAgent: from && isAgentId(from) ? from : null,
    kind: (r.kind as string) ?? "work",
    title: (r.title as string) ?? "",
    status: r.status as ItemStatus,
    payload: (r.payload && typeof r.payload === "object" ? r.payload : {}) as Record<string, unknown>,
    approvedAt: (r.approved_at as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

function firstLine(s: string): string {
  const line = (s ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > 120 ? `${line.slice(0, 119)}...` : line;
}

// A request is still waiting while its card has not been decided.
const WAITING: ItemStatus[] = ["building", "needs_ok"];

/** The chat list for one agent at one tenant (null = agency), newest first. */
export async function chatSummaries(
  client: SupabaseClient,
  tenantId: string | null,
  agent: AgentId,
): Promise<ChatSummary[]> {
  const { data: chats, error } = await scoped(
    client.from("agent_chats").select("id, title, auto, updated_at").eq("agent", agent),
    tenantId,
  )
    .order("updated_at", { ascending: false })
    .limit(200);
  fail("chats", error);
  const rows = (chats ?? []) as Row[];
  if (!rows.length) return [];

  // One read for every chat's messages, newest first, rather than one per
  // chat: each Supabase call is a Worker subrequest and the cap is small.
  const { data: msgs, error: mErr } = await client
    .from("agent_messages")
    .select("chat_id, role, body, meta, created_at")
    .in("chat_id", rows.map((c) => c.id as string))
    .order("created_at", { ascending: false })
    .limit(5000);
  fail("messages", mErr);
  const last = new Map<string, string>();
  const requestItems = new Map<string, string[]>();
  for (const m of (msgs ?? []) as Row[]) {
    const chatId = m.chat_id as string;
    if (!last.has(chatId)) last.set(chatId, firstLine(m.body as string));
    const itemId = (m.meta as Row | null)?.itemId;
    if (m.role === "request" && typeof itemId === "string") {
      requestItems.set(chatId, [...(requestItems.get(chatId) ?? []), itemId]);
    }
  }

  const itemIds = [...new Set([...requestItems.values()].flat())];
  const waiting = new Set<string>();
  if (itemIds.length) {
    const { data: items, error: iErr } = await client.from("agent_items").select("id, status").in("id", itemIds);
    fail("items", iErr);
    for (const i of (items ?? []) as Row[]) {
      if (WAITING.includes(i.status as ItemStatus)) waiting.add(i.id as string);
    }
  }

  return rows.map((c) => ({
    id: c.id as string,
    title: c.title as string,
    auto: c.auto === true,
    hasRequest: (requestItems.get(c.id as string) ?? []).some((id) => waiting.has(id)),
    lastLine: last.get(c.id as string) ?? "",
    updatedAt: c.updated_at as string,
  }));
}

/** One chat's messages, oldest first. */
export async function chatMessages(client: SupabaseClient, chatId: string): Promise<AgentMessage[]> {
  const { data, error } = await client
    .from("agent_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  fail("messages", error);
  return ((data ?? []) as Row[]).map(messageFromRow);
}

export async function createChat(
  client: SupabaseClient,
  opts: { tenantId: string | null; agent: AgentId; title?: string; auto?: boolean; userId?: string | null },
): Promise<Row> {
  const { data, error } = await client
    .from("agent_chats")
    .insert({
      tenant_id: opts.tenantId,
      agent: opts.agent,
      title: stripEmDash((opts.title ?? "").trim()).slice(0, 120) || "New chat",
      auto: opts.auto === true,
      user_id: opts.userId ?? null,
    })
    .select("*")
    .maybeSingle();
  fail("new chat", error);
  if (!data) throw new Error("new chat: no row");
  return data as Row;
}

export function chatSummaryFromRow(r: Row, lastLine = ""): ChatSummary {
  return {
    id: r.id as string,
    title: r.title as string,
    auto: r.auto === true,
    hasRequest: false,
    lastLine,
    updatedAt: r.updated_at as string,
  };
}

const GRANT_KINDS: GrantKind[] = ["deploy", "spend", "ghl", "file", "meta"];

/**
 * The grant a card asks for, read from its payload (the runner puts it there
 * when it posts the card). Unknown kinds grant nothing; a limit that is not a
 * finite number becomes null, never a guess, and a spend needs a real one.
 */
export function grantFrom(item: Pick<AgentItem, "id" | "payload">): Grant | null {
  const g = item.payload?.grant as Row | undefined;
  if (!g || typeof g !== "object" || !GRANT_KINDS.includes(g.kind as GrantKind)) return null;
  const limit = typeof g.limit === "number" && Number.isFinite(g.limit) ? g.limit : null;
  // A spend with no usable number was never a price Jake saw, so it grants
  // nothing (the card showed no credits either: agentView reads this limit).
  if (g.kind === "spend" && (limit === null || !Number.isSafeInteger(limit) || limit <= 0)) return null;
  // Deploy and file cards are only ever made by the runner (upsertItem sets
  // runnerOwned from the post's origin). One the model wrote grants nothing.
  if ((g.kind === "deploy" || g.kind === "file") && item.payload?.runnerOwned !== true) return null;
  return { itemId: item.id, kind: g.kind as GrantKind, limit };
}

/**
 * Queue a `me` message: the job the PC runner claims. Touches the chat so it
 * rises to the top of the list.
 */
export async function queueMessage(
  client: SupabaseClient,
  chatId: string,
  body: string,
  meta: Row = {},
): Promise<AgentMessage> {
  const { data, error } = await client
    .from("agent_messages")
    .insert({ chat_id: chatId, role: "me", body, status: "queued", meta })
    .select("*")
    .maybeSingle();
  fail("queue message", error);
  if (!data) throw new Error("queue message: no row");
  await touchChat(client, chatId);
  return messageFromRow(data as Row);
}

// Raise a chat to the top of its list. The trigger stamps updated_at itself;
// the value here only gives PATCH a column to write.
async function touchChat(client: SupabaseClient, chatId: string): Promise<void> {
  await client.from("agent_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
}

async function newestChatId(client: SupabaseClient, tenantId: string | null, agent: AgentId): Promise<string | null> {
  const { data, error } = await scoped(client.from("agent_chats").select("id").eq("agent", agent), tenantId)
    .order("updated_at", { ascending: false })
    .limit(1);
  fail("newest chat", error);
  return (((data ?? [])[0] as Row | undefined)?.id as string | undefined) ?? null;
}

export class ItemInputError extends Error {}

/**
 * Create or rewrite a Building card from the runner.
 *
 * With fromAgent on a NEW card, it is a request from another agent: a Request
 * message goes into the receiving agent's newest chat at that tenant (a chat
 * is opened, titled from the card, when it has none) and the card is tied to
 * that chat. A rewrite never posts a second Request message.
 */
export async function upsertItem(client: SupabaseClient, body: ItemBody): Promise<AgentItem> {
  if (!isAgentId(body.agent)) throw new ItemInputError("unknown agent");
  if (body.fromAgent != null && !isAgentId(body.fromAgent)) throw new ItemInputError("unknown fromAgent");
  if (!ITEM_STATUSES.includes(body.status)) throw new ItemInputError("unknown status");
  if (body.tenantId !== null && !isUuid(body.tenantId)) throw new ItemInputError("bad tenantId");
  const title = stripEmDash((body.title ?? "").trim()).slice(0, 200);
  if (!title) throw new ItemInputError("title required");
  // runnerOwned is the server's to set, from origin, never the payload's.
  const payload: Row = body.payload && typeof body.payload === "object" ? { ...body.payload } : {};
  delete payload.runnerOwned;
  const byRunner = body.origin === "runner";
  if (byRunner) payload.runnerOwned = true;

  const fields: Row = {
    tenant_id: body.tenantId,
    agent: body.agent,
    kind: (body.kind ?? "").trim() || "work",
    title,
    status: body.status,
    payload,
  };
  if (body.chatId !== undefined) fields.chat_id = body.chatId;
  if (body.fromAgent !== undefined) fields.from_agent = body.fromAgent;

  if (body.id) {
    // The id comes from model output, so it is only trusted for a card this
    // agent owns at this client, in the chat it is working in, and only while
    // Jake has not decided it: a done or declined card reopened as needs_ok
    // would earn a second Approve.
    const { tenant_id: _t, agent: _a, ...changes } = fields;
    let q = client.from("agent_items").update(changes).eq("id", body.id).eq("agent", body.agent);
    q = body.tenantId === null ? q.is("tenant_id", null) : q.eq("tenant_id", body.tenantId);
    if (typeof body.chatId === "string") q = q.eq("chat_id", body.chatId);
    // A card the runner made (a staged final, a deployed preview) is the
    // runner's alone to rewrite: the model must not swap what it points at.
    if (!byRunner) q = q.is("payload->>runnerOwned", null);
    const { data, error } = await q.in("status", ["building", "needs_ok"]).select("*").maybeSingle();
    fail("item update", error);
    if (!data) throw new ItemInputError("item not found");
    return itemFromRow(data as Row);
  }

  let chatId = body.chatId ?? null;
  if (body.fromAgent && !chatId) {
    chatId = (await newestChatId(client, body.tenantId, body.agent)) ?? null;
    if (!chatId) chatId = (await createChat(client, { tenantId: body.tenantId, agent: body.agent, title })).id as string;
  }
  const { data, error } = await client
    .from("agent_items")
    .insert({ ...fields, chat_id: chatId })
    .select("*")
    .maybeSingle();
  fail("item insert", error);
  if (!data) throw new Error("item insert: no row");
  const item = itemFromRow(data as Row);

  if (body.fromAgent && chatId) {
    const ask = typeof payload.body === "string" && payload.body.trim() ? payload.body : title;
    const { error: rErr } = await client.from("agent_messages").insert({
      chat_id: chatId,
      role: "request",
      body: stripEmDash(ask),
      meta: { itemId: item.id, fromAgent: body.fromAgent },
      status: "done",
    });
    fail("request message", rErr);
    await touchChat(client, chatId);
  }
  return item;
}

/**
 * An approved request's reply, back to the agent that asked.
 *
 * Everything is looked up from the claimed message, never taken from the
 * runner: the message must be a running follow-up of a request card, the card
 * names who asked and the chat they asked from (the runner wrote fromChatId
 * when it filed the request), and that chat must be the asker's at the same
 * client. Only an Approve answers (the card is then done; a Decline or a
 * Change note is not an answer), and only once per card.
 *
 * The answer is queued as a `request` message with meta.answerOf, so the
 * runner works it like Jake's message, but it is never role "me": every
 * "Jake asked" check (agentGhlOps.writeAllowed, agentMetaOps.metaWriteAllowed)
 * stays shut for it.
 */
export async function postAnswer(
  client: SupabaseClient,
  body: AnswerBody,
): Promise<{ posted: boolean } | { error: 400 | 404 }> {
  const text = typeof body.body === "string" ? stripEmDash(body.body.trim()) : "";
  if (typeof body.messageId !== "string" || !body.messageId || !text) return { error: 400 };

  const { data: msg, error: mErr } = await client
    .from("agent_messages")
    .select("*")
    .eq("id", body.messageId)
    .maybeSingle();
  fail("message", mErr);
  const m = msg ? messageFromRow(msg as Row) : null;
  if (!m || m.role !== "me" || m.status !== "running" || !m.followUpOf) return { error: 404 };

  const { data: itemRow, error: iErr } = await client.from("agent_items").select("*").eq("id", m.followUpOf).maybeSingle();
  fail("item", iErr);
  const item = itemRow ? itemFromRow(itemRow as Row) : null;
  const fromChatId = item?.payload.fromChatId;
  if (!item || item.kind !== "request" || !item.fromAgent || item.chatId !== m.chatId || typeof fromChatId !== "string") {
    return { error: 404 };
  }

  const { data: chatRow, error: cErr } = await client.from("agent_chats").select("*").eq("id", fromChatId).maybeSingle();
  fail("asking chat", cErr);
  const asker = chatRow as Row | null;
  if (!asker || asker.agent !== item.fromAgent || ((asker.tenant_id as string | null) ?? null) !== item.tenantId) return { error: 404 };

  if (item.status !== "done") return { posted: false };
  const { data: already, error: aErr } = await client
    .from("agent_messages")
    .select("id")
    .eq("chat_id", fromChatId)
    .eq("meta->>answerOf", item.id)
    .limit(1);
  fail("answer lookup", aErr);
  if ((already ?? []).length) return { posted: false };

  const { error } = await client.from("agent_messages").insert({
    chat_id: fromChatId,
    role: "request",
    body: text,
    status: "queued",
    meta: { fromAgent: item.agent, answerOf: item.id },
  });
  fail("answer", error);
  await touchChat(client, fromChatId);
  return { posted: true };
}

/** Every card for one tenant (null = agency), optionally one agent, newest first. */
export async function listItems(
  client: SupabaseClient,
  tenantId: string | null,
  agent: AgentId | null,
): Promise<AgentItem[]> {
  let q = scoped(client.from("agent_items").select("*"), tenantId);
  if (agent) q = q.eq("agent", agent);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);
  fail("items", error);
  const items = ((data ?? []) as Row[]).map(itemFromRow);
  return Promise.all(items.map(async (i) => ({ ...i, payloadHash: await payloadHash(i.payload) })));
}

export type ItemAction = "approve" | "decline" | "change";

/**
 * What Jake's click on a card does. Pure: the endpoint carries it out.
 *
 *   approve  needs_ok -> done      follow-up "Approved: <title>"
 *   decline  needs_ok -> declined  follow-up "Declined: <title>"
 *   change   needs_ok -> needs_ok  follow-up is Jake's note
 *
 * Anything else is a 409. Approve lands on done rather than live: the card is
 * accepted, but nothing is live until the agent's follow-up turn files it and
 * says so, and "Live" on a card that is not would be a lie.
 */
export function transitionItem(
  item: { status: ItemStatus; title: string },
  action: ItemAction,
  note?: string,
): { next: ItemStatus; followUp: string | null } | { error: 409 } {
  if (item.status !== "needs_ok") return { error: 409 };
  if (action === "approve") return { next: "done", followUp: `Approved: ${item.title}` };
  if (action === "decline") return { next: "declined", followUp: `Declined: ${item.title}` };
  if (action === "change") {
    const text = (note ?? "").trim();
    return text ? { next: "needs_ok", followUp: text } : { error: 409 };
  }
  return { error: 409 };
}

/**
 * Carry out Jake's click. The update is filtered on the status that was read,
 * so of two clicks racing on one card only the first matches a row; the
 * second gets a 409 and queues nothing. That filter, not the read before it,
 * is what stops a double Approve sending the agent two follow-ups.
 */
export async function decideItem(
  client: SupabaseClient,
  itemId: string,
  action: ItemAction,
  note?: string,
  now: Date = new Date(),
  shownHash: string | null = null,
): Promise<{ item: AgentItem } | { error: 404 | 409; changed?: true } | { error: 422; reason: string }> {
  const { data: row, error } = await client.from("agent_items").select("*").eq("id", itemId).maybeSingle();
  fail("item", error);
  if (!row) return { error: 404 };
  const item = itemFromRow(row as Row);
  const t = transitionItem(item, action, note);
  if ("error" in t) return t;
  // Approve is for the payload Jake was shown. A rewrite since (a redraft,
  // new GHL ops) changes the hash, and he has to look again.
  if (action === "approve" && shownHash !== (await payloadHash(item.payload))) return { error: 409, changed: true };
  // The Manager's kickoff card (kind "tasks") edits the client's Director on
  // Approve. Checked before the card moves, so a malformed card stays waiting
  // rather than being approved and then doing nothing. Only the Manager's,
  // only at a client. Its ops sit under taskOps, never ops, so they can never
  // be read as GHL or Meta ops.
  const taskCard = action === "approve" && item.kind === "tasks" && item.agent === "manager" && !!item.tenantId;
  const taskOps = taskCard ? parseTaskOps(item.payload.taskOps) : null;
  if (taskOps && !taskOps.ok) return { error: 422, reason: taskOps.error };

  const patch: Row = { status: t.next };
  if (action === "approve") patch.approved_at = now.toISOString();
  let q = client.from("agent_items").update(patch).eq("id", itemId).eq("status", item.status);
  // And no rewrite between that read and this write: the trigger stamps
  // updated_at on every update, so a rewrite in between matches no row.
  const stamp = (row as Row).updated_at;
  if (typeof stamp === "string") q = q.eq("updated_at", stamp);
  const { data: moved, error: uErr } = await q.select("*");
  fail("item move", uErr);
  const after = ((moved ?? []) as Row[])[0];
  if (!after) return { error: 409 };

  let followUp = t.followUp;
  if (taskOps?.ok && item.tenantId) {
    const res = await applyTaskOps(client, item.tenantId, taskOps.ops, "jake");
    const missed = res.skipped.map((x) => `${"key" in x.op ? x.op.key : x.op.name} (${x.reason})`);
    followUp += `\nTasks applied: ${res.applied}.${missed.length ? ` Not applied: ${missed.join(", ")}.` : ""}`;
  }

  if (followUp) {
    let chatId = item.chatId ?? (await newestChatId(client, item.tenantId, item.agent));
    if (!chatId) chatId = (await createChat(client, { tenantId: item.tenantId, agent: item.agent, title: item.title })).id as string;
    // Every follow-up says which card it answers. Only an Approve carries the
    // card's grant, which is what switches a gated tool on for that one turn.
    const grant = action === "approve" ? grantFrom(item) : null;
    await queueMessage(client, chatId, followUp, grant ? { followUpOf: item.id, grant } : { followUpOf: item.id });
  }
  return { item: itemFromRow(after) };
}

/** A startup-check chat: Auto, titled, with its prompt already queued. */
export async function createAutoChat(client: SupabaseClient, body: AutoChatBody): Promise<string> {
  if (!isAgentId(body.agent)) throw new ItemInputError("unknown agent");
  if (body.tenantId !== null && !isUuid(body.tenantId)) throw new ItemInputError("bad tenantId");
  if (body.tenantId === null && body.agent !== "manager") throw new ItemInputError("only the Manager works at the agency");
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) throw new ItemInputError("prompt required");
  const chat = await createChat(client, { tenantId: body.tenantId, agent: body.agent, title: body.title, auto: true });
  await queueMessage(client, chat.id as string, prompt);
  return chat.id as string;
}

/** The rail footer: online while the newest heartbeat is under 90s old. */
export const ONLINE_SECONDS = 90;

export function runnerStatus(rows: { last_seen_at: string | null }[], now: Date): RunnerStatus {
  const stamps = rows
    .map((r) => r.last_seen_at)
    .filter((s): s is string => !!s)
    .sort();
  const lastSeenAt = stamps.length ? stamps[stamps.length - 1] : null;
  const age = lastSeenAt ? now.getTime() - Date.parse(lastSeenAt) : Infinity;
  return { online: age < ONLINE_SECONDS * 1000, lastSeenAt };
}

export function lessonFromRow(r: Row): AgentLesson {
  return {
    id: r.id as string,
    scope: r.scope as AgentLesson["scope"],
    tenantId: (r.tenant_id as string | null) ?? null,
    agent: r.agent as AgentId,
    text: (r.text as string) ?? "",
    source: (r.source as string) ?? "",
    learnedOn: (r.learned_on as string | null) ?? null,
  };
}

export type BrainScope = "client" | "agent" | "mega";

/**
 * The Brain tab's list. client = that client's brain file (none at the
 * agency), agent = that agent's brain file, mega = every lesson.
 *
 * pendingEditIds holds LESSON ids that still have a queued edit, which is what
 * the page needs to show "Saving" on the right row until the runner applies
 * the edit and the mirror catches up.
 */
export async function brainLessons(
  client: SupabaseClient,
  scope: BrainScope,
  tenantId: string | null,
  agent: AgentId,
): Promise<{ lessons: AgentLesson[]; pendingEditIds: string[] }> {
  if (scope === "client" && !tenantId) return { lessons: [], pendingEditIds: [] };
  let q = client.from("agent_lessons").select("*");
  if (scope === "client") q = q.eq("scope", "client").eq("tenant_id", tenantId as string);
  if (scope === "agent") q = q.eq("scope", "agent").eq("agent", agent);
  const { data, error } = await q.order("learned_on", { ascending: false }).limit(2000);
  fail("lessons", error);
  const lessons = ((data ?? []) as Row[]).map(lessonFromRow);

  const { data: edits, error: eErr } = await client
    .from("agent_lesson_edits")
    .select("lesson_id")
    .eq("status", "queued");
  fail("edits", eErr);
  const shown = new Set(lessons.map((l) => l.id));
  const pendingEditIds = [...new Set(((edits ?? []) as Row[]).map((e) => e.lesson_id as string))].filter((id) =>
    shown.has(id),
  );
  return { lessons, pendingEditIds };
}

/**
 * Queue Jake's edit or delete of one lesson. The app never writes the brain
 * itself: the PC runner is the only writer of the vault files, applies queued
 * edits by block id, and re-posts the mirror. null when the lesson is not in
 * the mirror.
 */
export async function queueLessonEdit(
  client: SupabaseClient,
  body: { lessonId: string; action: "edit" | "delete"; text?: string | null },
): Promise<LessonEdit | null> {
  const { data: lesson, error } = await client.from("agent_lessons").select("id").eq("id", body.lessonId).maybeSingle();
  fail("lesson", error);
  if (!lesson) return null;
  const text = body.action === "edit" ? stripEmDash((body.text ?? "").trim()) : null;
  const { data, error: iErr } = await client
    .from("agent_lesson_edits")
    .insert({ lesson_id: body.lessonId, action: body.action, text })
    .select("id, lesson_id, action, text")
    .maybeSingle();
  fail("lesson edit", iErr);
  if (!data) throw new Error("lesson edit: no row");
  const r = data as Row;
  return {
    id: r.id as string,
    lessonId: r.lesson_id as string,
    action: r.action as LessonEdit["action"],
    text: (r.text as string | null) ?? null,
  };
}
