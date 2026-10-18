import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_SECRET_LENGTH } from "./adsCron";
import { isAgentId } from "../../src/lib/agents";
import type { AgentId } from "../../src/lib/agents";
import type {
  AgentLesson,
  AgentMessage,
  ClaimChat,
  ClaimResponse,
  ClaimTenant,
  Grant,
  GrantKind,
  HeartbeatBody,
  HeartbeatResponse,
  LessonEdit,
  LessonsBody,
  MessageRole,
  MessageStatus,
  ReplyBody,
} from "../../src/lib/agentWire";

// The app half of the agent runner wire (docs/build-plans/agents.md, Task 3).
//
// The Agents section is answered by `claude -p` on Jake's PC. The PC runner
// (projects/agent-runner) polls this app over HTTP: it claims a queued message,
// posts its progress and reply, files Building cards and requests, and keeps
// the app's mirror of the vault brains current. None of that can carry an
// admin cookie, so /api/agent-runner/* sits behind its own secret.
//
// The gate is a sibling of lib/adsCron.ts and is written to be read beside it:
//
//   - EXACT pathnames from two fixed lists, one per method. Not a prefix. A
//     prefix rule under /api/agent-runner/ is one careless file away from
//     opening something new.
//   - Unset or short secret means CLOSED.
//   - A pass never sets ctx.data.admin. The secret buys these routes and
//     nothing else; it is not an admin and cannot become one.
//
// What a holder of the secret can do, in full: read and write the agents'
// own tables (0166), file an approved landing page into Conversion Assets
// (file-asset, which re-checks the approval itself), read the client list,
// read each client's numbers for a startup check, READ Meta insights, and run
// the GHL Agent's allowlisted ops (writes only on Jake's ask or Approve,
// checked in lib/agentGhlOps.ts), and rewrite the claimed agent's OWN Client
// Brief section at the version it read (lib/clientBriefs.ts), tick the boxes
// of the sections that agent owns (lib/briefTicks.ts), and make the
// Ads Agent's allowlisted Ads Manager changes (meta-ops), each only under an
// approved card with that exact change on it (lib/agentMetaOps.ts). The
// insights reads stay write-free by construction: api/agent-runner/meta.ts
// imports only the Graph GET helpers, and a test scans that file to keep it so.

const BASE = "/api/agent-runner/";

/** Routes the runner may POST. Compared with includes(), never a prefix. */
export const AGENT_RUNNER_POST_PATHS: readonly string[] = [
  "claim",
  "reply",
  "heartbeat",
  "item",
  "lessons",
  "auto-chat",
  "file-asset",
  // The GHL Agent's ops. Writes are gated inside (lib/agentGhlOps.ts).
  "ghl",
  // The Ads Agent's Ads Manager changes, only on an approved card
  // (lib/agentMetaOps.ts).
  "meta-ops",
  // Creative Agent (Phase 3): each checks the claimed message itself.
  "upload-url",
  "read-url",
  "file-creative",
  // An agent rewrites its own Client Brief section (lib/clientBriefs.ts).
  "brief",
  // An agent ticks boxes in its own brief section(s) (lib/briefTicks.ts).
  "tick",
  // An approved request's reply, back to the agent that asked (lib/agentItems.ts postAnswer).
  "answer",
].map((p) => BASE + p);

/** Routes the runner may GET. */
export const AGENT_RUNNER_GET_PATHS: readonly string[] = ["snapshot", "meta", "tenants"].map((p) => BASE + p);

/** The header the runner sends the shared secret in. */
export const AGENT_RUNNER_HEADER = "x-agent-runner-secret";

/** A running message with no write for this long belongs to a dead runner. */
export const STALE_SECONDS = 600;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * May this request skip the admin session gate?
 *
 * Every condition has to hold. A `false` falls through to the normal gate,
 * which answers 401, so a wrong secret is indistinguishable from no secret.
 */
export function isAgentRunnerRequest(
  method: string,
  pathname: string,
  header: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const expected = (secret ?? "").trim();
  if (expected.length < MIN_SECRET_LENGTH) return false;
  const paths = method === "POST" ? AGENT_RUNNER_POST_PATHS : method === "GET" ? AGENT_RUNNER_GET_PATHS : null;
  if (!paths || !paths.includes(pathname)) return false;
  const presented = (header ?? "").trim();
  if (!presented) return false;
  return timingSafeEqual(presented, expected);
}

// House rule: no em dashes anywhere, agent output included. The runner strips
// them before it posts; this is the backstop, so a runner bug cannot put one
// on a page.
// Built from its code point so this file never carries the character itself.
const EM_DASH = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, "g");

export function stripEmDash(s: string): string {
  return s.replace(EM_DASH, ", ");
}

type Row = Record<string, unknown>;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const GRANT_KINDS = ["deploy", "spend", "ghl", "file", "meta"];

function grantOf(v: unknown): Grant | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Row;
  if (typeof g.itemId !== "string" || !GRANT_KINDS.includes(g.kind as string)) return null;
  return { itemId: g.itemId, kind: g.kind as GrantKind, limit: typeof g.limit === "number" ? g.limit : null };
}

export function messageFromRow(r: Row): AgentMessage {
  const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Row;
  const from = str(meta.fromAgent);
  return {
    id: r.id as string,
    chatId: r.chat_id as string,
    role: r.role as MessageRole,
    body: (r.body as string) ?? "",
    status: r.status as MessageStatus,
    tools: strings(meta.tools),
    used: strings(meta.used),
    learned: strings(meta.learned),
    itemId: str(meta.itemId),
    fromAgent: from && isAgentId(from) ? from : null,
    followUpOf: str(meta.followUpOf),
    grant: grantOf(meta.grant),
    answerOf: str(meta.answerOf),
    error: str(r.error),
    createdAt: r.created_at as string,
  };
}

function chatFromRow(r: Row): ClaimChat {
  return {
    id: r.id as string,
    tenantId: (r.tenant_id as string | null) ?? null,
    agent: r.agent as AgentId,
    title: r.title as string,
    claudeSessionId: r.claude_session_id as string,
    started: r.started === true,
  };
}

export function tenantFromRow(r: Row): ClaimTenant {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    metaAdAccountId: str(r.meta_ad_account_id),
  };
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/**
 * This host's `running` messages that have not been written for staleSeconds
 * go back to `queued`, so the next claim re-runs them in the same chat (and
 * so the same Claude session). Returns how many.
 *
 * Scoped to this host on purpose, as in the lead scraper's stranded_runs: a
 * message another machine is working is that machine's business. updated_at
 * is trigger-stamped (0166), and every progress post touches the row (see
 * applyReply), so "has not moved in ten minutes" means the runner is gone.
 */
export async function reclaimStale(
  client: SupabaseClient,
  host: string,
  staleSeconds: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - staleSeconds * 1000).toISOString();
  const { data, error } = await client
    .from("agent_messages")
    .update({ status: "queued" })
    .in("role", RUNNABLE_ROLES)
    .eq("status", "running")
    .eq("host", host)
    .lt("updated_at", cutoff)
    .select("id");
  fail("reclaim", error);
  return (data ?? []).length;
}

// The claim before the client's brief is added (clientBriefs.withBrief, in the
// handler), so this file and the brief store do not import each other.
export type ClaimCore = Omit<ClaimResponse, "brief">;

// What the runner works: Jake's messages, and another agent's answer to a
// request (postAnswer). A request card's own message is written done, so it
// is never queued and never claimed.
const RUNNABLE_ROLES = ["me", "request"];

function runnable(r: Row): boolean {
  return r.role === "me" || (r.role === "request" && !!str((r.meta as Row | null)?.answerOf));
}

/**
 * Claim the oldest queued message for this host, or null.
 *
 * The lock is the status filter on the PATCH, exactly as in the lead scraper's
 * claim_next_run: if another poll got there first the row no longer says
 * queued, the update matches nothing, and this claim returns null rather than
 * running the same message twice. Nothing here looks at heartbeats, so a
 * message sent while the PC was off is claimed like any other.
 */
export async function claimNext(
  client: SupabaseClient,
  host: string,
  now: Date = new Date(),
): Promise<ClaimCore | null> {
  await reclaimStale(client, host, STALE_SECONDS, now);

  const { data: queued, error: qErr } = await client
    .from("agent_messages")
    .select("*")
    .in("role", RUNNABLE_ROLES)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  fail("queued", qErr);
  const next = (queued ?? [])[0] as Row | undefined;
  if (!next) return null;

  const { data: claimed, error: cErr } = await client
    .from("agent_messages")
    .update({ status: "running", host, started_at: now.toISOString(), error: null })
    .eq("id", next.id as string)
    .eq("status", "queued")
    .select("*");
  fail("claim", cErr);
  const row = (claimed ?? [])[0] as Row | undefined;
  if (!row) return null;

  const { data: chatRow, error: chErr } = await client
    .from("agent_chats")
    .select("*")
    .eq("id", row.chat_id as string)
    .maybeSingle();
  fail("chat", chErr);
  if (!chatRow) {
    // The chat was deleted between send and claim (cascade normally takes the
    // message with it). Park the message rather than claim it forever.
    await client.from("agent_messages").update({ status: "error", error: "chat not found" }).eq("id", row.id as string);
    return null;
  }
  const chat = chatFromRow(chatRow as Row);

  const { data: earlier, error: hErr } = await client
    .from("agent_messages")
    .select("*")
    .eq("chat_id", chat.id)
    .lt("created_at", row.created_at as string)
    .order("created_at", { ascending: true });
  fail("history", hErr);

  let tenant: ClaimTenant | null = null;
  if (chat.tenantId) {
    const { data: t, error: tErr } = await client
      .from("tenants")
      .select("id, name, slug, meta_ad_account_id")
      .eq("id", chat.tenantId)
      .maybeSingle();
    fail("tenant", tErr);
    tenant = t ? tenantFromRow(t as Row) : null;
  }

  return {
    message: messageFromRow(row),
    chat,
    history: ((earlier ?? []) as Row[]).map(messageFromRow),
    tenant,
  };
}

/**
 * The runner's progress and its reply to one claimed message.
 *
 * The `ai` message is found by meta.replyTo, so the first post creates it and
 * every later one (progress, then done) rewrites the same row, and a re-run
 * after a reclaim reuses it too. The `me` row is written on every post as
 * well, which is what keeps its updated_at fresh for reclaimStale.
 */
export async function applyReply(
  client: SupabaseClient,
  body: ReplyBody,
  now: Date = new Date(),
): Promise<{ ok: true } | { error: 400 | 404 }> {
  if (!body.messageId || !["running", "done", "error"].includes(body.status)) return { error: 400 };

  const { data: me, error: meErr } = await client
    .from("agent_messages")
    .select("id, chat_id, role, status, meta")
    .eq("id", body.messageId)
    .maybeSingle();
  fail("message", meErr);
  if (!me || !runnable(me as Row)) return { error: 404 };
  const chatId = (me as Row).chat_id as string;
  // Progress posts are fire-and-forget on the runner, so one can land after
  // the reply. A finished message never goes back to running.
  const settled = (me as Row).status === "done" || (me as Row).status === "error";
  if (settled && body.status === "running") return { ok: true };

  const finished = body.status === "running" ? null : now.toISOString();
  const errorText = body.status === "error" ? (body.error ?? "runner error").slice(0, 2000) : null;

  const { error: upErr } = await client
    .from("agent_messages")
    .update({ status: body.status, finished_at: finished, error: errorText })
    .eq("id", body.messageId);
  fail("message status", upErr);

  const meta = {
    replyTo: body.messageId,
    tools: strings(body.tools),
    used: strings(body.used).map(stripEmDash),
    learned: strings(body.learned).map(stripEmDash),
  };
  const aiRow = {
    body: stripEmDash(body.aiBody ?? ""),
    meta,
    status: body.status,
    error: errorText,
    finished_at: finished,
  };
  const { data: existing, error: exErr } = await client
    .from("agent_messages")
    .select("id")
    .eq("chat_id", chatId)
    .eq("role", "ai")
    .eq("meta->>replyTo", body.messageId)
    .limit(1);
  fail("ai lookup", exErr);
  const aiId = ((existing ?? [])[0] as Row | undefined)?.id as string | undefined;
  if (aiId) {
    const { error } = await client.from("agent_messages").update(aiRow).eq("id", aiId);
    fail("ai update", error);
  } else {
    const { error } = await client
      .from("agent_messages")
      .insert({ chat_id: chatId, role: "ai", started_at: now.toISOString(), ...aiRow });
    fail("ai insert", error);
  }

  // Touch the chat on every post so the list sorts by activity; `started`
  // flips on the first one, which tells the runner --resume from now on. A
  // title only lands on a chat still called the default, so an Auto chat or
  // one Jake renamed keeps its own.
  const { data: chatRow } = await client.from("agent_chats").select("title").eq("id", chatId).maybeSingle();
  const patch: Row = { started: true };
  const title = stripEmDash((body.title ?? "").trim()).slice(0, 120);
  if (title && (chatRow as Row | null)?.title === "New chat") patch.title = title;
  const { error: chErr } = await client.from("agent_chats").update(patch).eq("id", chatId);
  fail("chat", chErr);
  return { ok: true };
}

/**
 * Record that this host is alive (and, with monitored, that it just ran the
 * startup check), then hand back what the runner needs at start: when any
 * host last monitored, and the lesson edits Jake queued in the app.
 */
export async function heartbeat(
  client: SupabaseClient,
  body: HeartbeatBody,
  now: Date = new Date(),
): Promise<HeartbeatResponse> {
  const row: Row = { host: body.host, last_seen_at: now.toISOString() };
  if (body.monitored) row.last_monitor_at = now.toISOString();
  const { error } = await client.from("agent_runner_state").upsert(row, { onConflict: "host" });
  fail("heartbeat", error);

  // Newest across hosts: the six-hour gap is about the subscription, not the
  // machine, so a second PC must not re-run a check the first just did.
  const { data: states, error: sErr } = await client.from("agent_runner_state").select("last_monitor_at");
  fail("runner state", sErr);
  const stamps = ((states ?? []) as Row[])
    .map((s) => s.last_monitor_at as string | null)
    .filter((s): s is string => !!s)
    .sort();
  const lastMonitorAt = stamps.length ? stamps[stamps.length - 1] : null;

  const { data: edits, error: eErr } = await client
    .from("agent_lesson_edits")
    .select("id, lesson_id, action, text")
    .eq("status", "queued")
    .order("created_at", { ascending: true });
  fail("edits", eErr);
  const queuedEdits: LessonEdit[] = ((edits ?? []) as Row[]).map((e) => ({
    id: e.id as string,
    lessonId: e.lesson_id as string,
    action: e.action as LessonEdit["action"],
    text: (e.text as string | null) ?? null,
  }));
  return { lastMonitorAt, queuedEdits };
}

// A scope is one (scope, tenant, agent) slice of a brain FILE, and the runner
// re-reads a file and re-posts every slice of it together:
//   client   vault/Clients/<folder>/Brain.md: one slice per agent, so a client
//            brain arrives as seven scopes and tenant + agent decide.
//   agent    vault/Agents/<Agent>/Brain.md: that agent at every client, so
//            only the agent decides (its lessons may still carry the client
//            they came from).
//   manager  vault/Agents/Manager/Brain.md: the one Mega Brain notes file.
type Scope = LessonsBody["scopes"][number];

export function lessonInScope(l: Pick<AgentLesson, "scope" | "tenantId" | "agent">, s: Scope): boolean {
  if (l.scope !== s.scope) return false;
  if (s.scope === "client") return l.tenantId === s.tenantId && l.agent === s.agent;
  if (s.scope === "agent") return l.agent === s.agent;
  return true;
}

/**
 * Replace the mirror for each named brain file with what the runner read from
 * disk, and mark the edits it applied. A lesson outside every named scope is
 * dropped rather than saved, so a mislabelled post cannot plant a row that
 * the next replace of its real file would never clear.
 */
export async function replaceLessons(
  client: SupabaseClient,
  body: LessonsBody,
  now: Date = new Date(),
): Promise<{ ok: true; saved: number } | { error: 400 }> {
  const scopes = Array.isArray(body.scopes) ? body.scopes : [];
  for (const s of scopes) {
    if (!["client", "agent", "manager"].includes(s.scope)) return { error: 400 };
    if (s.scope === "client" && !s.tenantId) return { error: 400 };
    if (s.scope !== "manager" && !isAgentId(s.agent)) return { error: 400 };
  }

  for (const s of scopes) {
    let q = client.from("agent_lessons").delete().eq("scope", s.scope);
    if (s.scope === "client") q = q.eq("tenant_id", s.tenantId as string).eq("agent", s.agent);
    if (s.scope === "agent") q = q.eq("agent", s.agent);
    const { error } = await q;
    fail("lessons clear", error);
  }

  const keep = (Array.isArray(body.lessons) ? body.lessons : []).filter(
    (l) => typeof l.id === "string" && l.id && isAgentId(l.agent) && scopes.some((s) => lessonInScope(l, s)),
  );
  if (keep.length) {
    const rows = keep.map((l) => ({
      id: l.id,
      scope: l.scope,
      tenant_id: l.tenantId ?? null,
      agent: l.agent,
      text: stripEmDash(l.text ?? ""),
      source: l.source ?? "",
      learned_on: l.learnedOn ?? null,
      synced_at: now.toISOString(),
    }));
    const { error } = await client.from("agent_lessons").upsert(rows, { onConflict: "id" });
    fail("lessons save", error);
  }

  const applied = strings(body.appliedEditIds);
  if (applied.length) {
    const { error } = await client.from("agent_lesson_edits").update({ status: "applied" }).in("id", applied);
    fail("edits applied", error);
  }
  return { ok: true, saved: keep.length };
}
