// What happens to one claimed message, from "running" to "done".
//
//   1. Tell the app it is running (the chat shows the agent working).
//   2. Build the agent's bundle and run `claude -p` in the chat's session,
//      pushing progress into the reply as it streams.
//   3. Read the protocol blocks off the end of the answer: lessons go into the
//      brain files (and are mirrored to the app, and committed), items and
//      requests are filed as Building cards.
//   4. Post the finished reply with its tool steps, the lessons it used and the
//      lessons it learned.
//
// Anything after step 2 that fails is logged and skipped rather than failing
// the message. Jake asked a question and got an answer; a mirror call that hit
// a blip is not a reason to show him an error instead of it.
//
// The runner is the only writer of the brain files from the app's side, which
// is also why queued Brain-tab edits are applied here (applyQueuedEdits).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AGENT_IDS, AGENTS, agentDef } from "./agents.ts";
import type { RunnerApi } from "./api.ts";
import { appendLessons, applyEdits, readLessons } from "./brain.ts";
import { agentBrainPath, buildBundle, clientBrainPath, type BundleEnv } from "./bundle.ts";
import type { RunOptions } from "./claude.ts";
import { tenantForFolder, vaultFolder } from "./clients.ts";
import { fileApproved, runVideoBlocks, takeVideoBlocks, type CreativeDeps, type CreativeTurn } from "./creative.ts";
import { checkSpend, spendLimit } from "./spend.ts";
import { extractCitations, parseAgentOutput, stripEmDashes } from "./output.ts";
import type { AgentId, AgentLesson, ClaimResponse, ClaimTenant, ItemStatus, LessonEdit, LessonScope, LessonsBody } from "./wire.ts";

export interface RunnerDeps {
  api: RunnerApi;
  env: BundleEnv;
  today: () => string;
  run: (o: RunOptions) => Promise<{ text: string; tools: string[] }>;
  commit: (paths: string[], summary: string) => Promise<boolean>;
  // What claude inherits: bin/meta.mjs needs the API base and the client's
  // tenant id. Never the secret: claude can run read-only shell commands like
  // echo, so anything in its environment is readable. The meta script reads
  // the secret from Doppler itself. Claude runs in the bundle's work folder.
  childEnv?: (tenant: ClaimTenant | null) => NodeJS.ProcessEnv;
  log?: (line: string) => void;
  // The Creative Agent's video pipeline, uploads and credit balance. Without
  // it a creative turn still answers; its ```video blocks are just not run.
  creative?: CreativeDeps;
}

// One brain file and whose lessons it holds. A client brain is shared by all
// seven agents (agent null); an agent brain belongs to one.
export interface BrainFile {
  path: string;
  scope: LessonScope;
  tenantId: string | null;
  agent: AgentId | null;
}

export function listBrainFiles(vaultDir: string, tenants: ClaimTenant[]): BrainFile[] {
  const files: BrainFile[] = [];
  const clientsDir = join(vaultDir, "Clients");
  if (existsSync(clientsDir)) {
    for (const folder of readdirSync(clientsDir).sort()) {
      const path = join(clientsDir, folder, "Brain.md");
      if (!existsSync(path)) continue;
      files.push({ path, scope: "client", tenantId: tenantForFolder(folder, tenants)?.id ?? null, agent: null });
    }
  }
  for (const a of AGENTS) {
    const path = agentBrainPath(vaultDir, a.id);
    if (!existsSync(path)) continue;
    files.push({ path, scope: a.id === "manager" ? "manager" : "agent", tenantId: null, agent: a.id });
  }
  return files;
}

// The mirror is replaced per (scope, tenant, agent). A client brain holds every
// agent's lessons for that client, so syncing it names all seven scopes; an
// agent's lessons that were all deleted then disappear from the mirror too.
function lessonsBody(files: BrainFile[], appliedEditIds: string[]): LessonsBody {
  const body: LessonsBody = { scopes: [], lessons: [], appliedEditIds };
  for (const f of files) {
    // A client folder with no tenant behind it has nowhere to go in the app.
    if (f.scope === "client" && !f.tenantId) continue;
    const agents = f.agent ? [f.agent] : AGENT_IDS;
    for (const agent of agents) body.scopes.push({ scope: f.scope, tenantId: f.tenantId, agent });
    body.lessons.push(...readLessons(f.path, { scope: f.scope, tenantId: f.tenantId }));
  }
  return body;
}

function allLessons(vaultDir: string): Map<string, AgentLesson> {
  const map = new Map<string, AgentLesson>();
  for (const f of listBrainFiles(vaultDir, [])) for (const l of readLessons(f.path)) map.set(l.id, l);
  return map;
}

// While the answer streams, the protocol blocks are not for Jake to read: show
// the prose up to the first block and nothing of a half-written one.
function preview(text: string): string {
  const cut = text.split(/```(?:lessons|item|request|video)/)[0];
  return extractCitations(stripEmDashes(cut)).reply.trim();
}

function titleFrom(body: string): string {
  const words = body.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}...` : words || "New chat";
}

function speaker(role: string, fromAgent: AgentId | null): string {
  if (role === "me") return "Jake";
  if (role === "request") return `Request from ${fromAgent ? agentDef(fromAgent).name : "another agent"}`;
  return "You";
}

// A session that is new (or lost, see below) has none of the chat in it, so it
// is handed what was said so far as plain text ahead of the new message.
function promptFor(claim: ClaimResponse, fresh: boolean): string {
  const earlier = claim.history.filter((m) => m.id !== claim.message.id && m.body.trim());
  if (!fresh || earlier.length === 0) return claim.message.body;
  const lines = earlier.map((m) => `${speaker(m.role, m.fromAgent)}: ${m.body}`);
  return `Earlier in this chat:\n\n${lines.join("\n\n")}\n\nJake now says:\n\n${claim.message.body}`;
}

const AGENT_PREFIX = /^agent:\s*/i;

export async function handleClaim(claim: ClaimResponse, d: RunnerDeps): Promise<void> {
  const log = d.log ?? (() => {});
  const { message, chat, tenant } = claim;
  const agent = chat.agent;
  const messageId = message.id;
  const clientName = tenant?.name ?? "agency";
  const chatRef = `chat ${chat.id.slice(0, 8)}`;

  // Progress posts go one after another, and the reply waits for the last of
  // them, so a slow progress post can never land after the finished reply.
  let progressPosts: Promise<unknown> = Promise.resolve();
  try {
    await d.api.reply({ messageId, status: "running" });
    const bundle = buildBundle(agent, tenant, d.env, claim.message.grant);
    const base = {
      sessionId: chat.claudeSessionId,
      bundle,
      cwd: bundle.workDir,
      env: d.childEnv?.(tenant),
      onProgress: (text: string, tools: string[]) => {
        progressPosts = progressPosts.then(() =>
          d.api.reply({ messageId, status: "running", aiBody: preview(text), tools }).catch((e) => log(`progress post failed: ${e.message}`)),
        );
      },
    };

    // Set by the video rounds as the reply grows, so a step shows under it.
    let shown = "";
    const creative: CreativeTurn | null =
      agent === "creative" && tenant && d.creative
        ? {
            deps: d.creative,
            runnerApi: d.api,
            messageId,
            chatId: chat.id,
            tenant,
            workDir: bundle.workDir,
            driveDir: bundle.addDirs[0] ?? null,
            vaultFolder: join(d.env.vaultDir, "Clients", vaultFolder(tenant)),
            say: (step) => base.onProgress(`${shown}\n\n_${step}..._`, []),
            log,
          }
        : null;

    // Approve on a file card: the runner files it first, and the agent's turn
    // starts by being told how that went.
    const grant = message.grant;
    let prompt = promptFor(claim, !chat.started);
    if (creative && grant?.kind === "file") prompt = `${await fileApproved(grant, creative)}\n\n${prompt}`;
    // An approved spend: read the balance either side of the turn.
    const limit = creative ? spendLimit(grant) : null;
    const before = limit !== null ? await creative!.deps.balance() : null;

    let result: { text: string; tools: string[] };
    try {
      result = await d.run({ ...base, resume: chat.started, prompt });
    } catch (e) {
      // The session lives in this PC's ~/.claude. If it is gone (a new PC, a
      // cleared profile) --resume fails outright; start it again from the
      // chat's own history instead of leaving the chat dead.
      if (!chat.started || !/no conversation found/i.test((e as Error).message)) throw e;
      log(`session ${chat.claudeSessionId} not found here; starting it fresh with the chat history`);
      result = await d.run({ ...base, resume: false, prompt: promptFor(claim, true) });
    }

    if (creative) result = await creativeRounds(result, creative, (p) => d.run({ ...base, resume: true, prompt: p }), (t) => (shown = preview(t)));
    let spendError: string | null = null;
    if (limit !== null) spendError = await spendCheck(before, await creative!.deps.balance(), limit, creative!, grant!.itemId);

    const out = parseAgentOutput(result.text);
    const cited = extractCitations(out.reply);
    const known = allLessons(d.env.vaultDir);
    const used = cited.ids.map((id) => known.get(id)?.text).filter((t): t is string => !!t);

    // Lessons. The Manager reads and writes the Mega Brain only, which on disk
    // is its own brain file. Everyone else writes to the client's brain unless
    // the line says "agent:", meaning craft knowledge for its own brain.
    const learned: string[] = [];
    const touched = new Map<string, BrainFile>();
    for (const line of out.lessons) {
      const own = AGENT_PREFIX.test(line);
      const text = line.replace(AGENT_PREFIX, "");
      let file: BrainFile;
      let source: string;
      if (agent === "manager") {
        file = { path: agentBrainPath(d.env.vaultDir, "manager"), scope: "manager", tenantId: null, agent: "manager" };
        source = `${clientName}, ${chatRef}`;
      } else if (own || !tenant) {
        file = { path: agentBrainPath(d.env.vaultDir, agent), scope: "agent", tenantId: null, agent };
        source = `${clientName}, ${chatRef}`;
      } else {
        file = { path: clientBrainPath(d.env.vaultDir, tenant), scope: "client", tenantId: tenant.id, agent: null };
        source = chatRef;
      }
      const added = appendLessons(file.path, agent, source, [text], d.today(), file);
      learned.push(...added.map((l) => l.text));
      if (added.length) touched.set(file.path, file);
    }
    if (touched.size) {
      const files = [...touched.values()];
      try {
        await d.api.lessons(lessonsBody(files, []));
      } catch (e) {
        log(`lesson mirror failed: ${(e as Error).message}`);
      }
      try {
        await d.commit(files.map((f) => f.path), `${learned.length} lessons (${agent}, ${clientName})`);
      } catch (e) {
        log(`brain commit failed: ${(e as Error).message}`);
      }
    }

    // Building cards. An agent may say a card is still building or needs
    // Jake's OK, never that it is live or done: going live is his click.
    for (const item of out.items) {
      const status: ItemStatus = item.status === "building" ? "building" : "needs_ok";
      try {
        await d.api.item({
          ...(item.id ? { id: item.id } : {}),
          tenantId: tenant?.id ?? null,
          agent,
          chatId: chat.id,
          fromAgent: null,
          kind: item.kind,
          title: item.title,
          status,
          payload: item.payload ?? {},
        });
      } catch (e) {
        log(`item post failed: ${(e as Error).message}`);
      }
    }

    // Requests to another agent at the same client. The sender does not wait.
    for (const req of out.requests) {
      if (req.toAgent === agent || !tenant) {
        log(`request to ${req.toAgent} dropped: ${req.toAgent === agent ? "to itself" : "no client"}`);
        continue;
      }
      try {
        await d.api.item({
          tenantId: tenant.id,
          agent: req.toAgent,
          chatId: null,
          fromAgent: agent,
          kind: "request",
          title: req.title,
          status: "needs_ok",
          payload: { body: req.body, plan: req.plan, fromChatId: chat.id },
        });
      } catch (e) {
        log(`request post failed: ${(e as Error).message}`);
      }
    }

    await progressPosts;
    await d.api.reply({
      messageId,
      status: spendError ? "error" : "done",
      ...(spendError ? { error: spendError } : {}),
      aiBody: cited.reply.trim(),
      tools: result.tools,
      used,
      learned,
      ...(!chat.started && chat.title === "New chat" ? { title: titleFrom(message.body) } : {}),
    });
  } catch (e) {
    const error = (e as Error).message || String(e);
    log(`message ${messageId} failed: ${error}`);
    await progressPosts;
    await d.api.reply({ messageId, status: "error", error }).catch((err) => log(`error post failed: ${err.message}`));
  }
}

// Edits and deletes queued from the Brain tab, matched by block id across every
// brain file. An edit whose lesson is nowhere (Jake already deleted it in
// Obsidian) is reported applied too: there is nothing left to do, and leaving
// it queued would retry it forever.
export async function applyQueuedEdits(edits: LessonEdit[], tenants: ClaimTenant[], d: RunnerDeps): Promise<string[]> {
  if (edits.length === 0) return [];
  const log = d.log ?? (() => {});
  const files = listBrainFiles(d.env.vaultDir, tenants);
  let left = [...edits];
  const touched: BrainFile[] = [];
  for (const f of files) {
    if (left.length === 0) break;
    const applied = applyEdits(f.path, left);
    if (applied.length) {
      touched.push(f);
      left = left.filter((e) => !applied.includes(e.id));
    }
  }
  const ids = edits.map((e) => e.id);
  await d.api.lessons(lessonsBody(touched, ids));
  if (touched.length) {
    try {
      await d.commit(touched.map((f) => f.path), `${edits.length - left.length} lesson edits (app)`);
    } catch (e) {
      log(`brain commit failed: ${(e as Error).message}`);
    }
  }
  return ids;
}

// Mirror every brain on disk to the app (`--sync-lessons`, and once at start),
// so lessons Jake typed or changed in Obsidian show up in the Brain tab.
// Returns how many lessons were sent.
export async function syncAllBrains(tenants: ClaimTenant[], d: RunnerDeps): Promise<number> {
  const body = lessonsBody(listBrainFiles(d.env.vaultDir, tenants), []);
  if (body.scopes.length === 0) return 0;
  await d.api.lessons(body);
  return body.lessons.length;
}

// Up to three rounds of the agent's ```video blocks. Each round the runner
// does what was asked, then either resumes the agent with what happened (a
// clip got prepared, a build failed on a phrase) or, when nothing is left for
// it to do, puts the outcome under its reply.
const VIDEO_ROUNDS = 3;

async function creativeRounds(
  first: { text: string; tools: string[] },
  t: CreativeTurn,
  resume: (prompt: string) => Promise<{ text: string; tools: string[] }>,
  show: (text: string) => void,
): Promise<{ text: string; tools: string[] }> {
  const retried = new Set<string>();
  const texts: string[] = [];
  const tools = [...first.tools];
  let cur = first;
  for (let round = 1; ; round++) {
    const { text, blocks } = takeVideoBlocks(cur.text);
    texts.push(text);
    show(texts.join("\n\n"));
    if (!blocks.length) break;
    const out = await runVideoBlocks(blocks, t, retried);
    if (!out.again || round >= VIDEO_ROUNDS) {
      texts.push(out.notes.join("\n"));
      break;
    }
    cur = await resume(`Runner:\n${out.notes.map((n) => `- ${n}`).join("\n")}`);
    tools.push(...cur.tools);
  }
  return { text: texts.filter(Boolean).join("\n\n"), tools };
}

// After a turn Jake approved a spend for: did it stay inside the limit? A
// balance that cannot be read is flagged too: "probably fine" is not a check.
async function spendCheck(before: number | null, after: number | null, limit: number, t: CreativeTurn, itemId: string): Promise<string | null> {
  const spent = before !== null && after !== null ? before - after : null;
  const over = spent === null ? true : checkSpend(before!, after!, limit) === "over";
  if (!over) return null;
  const what =
    spent === null
      ? `Could not read the Higgsfield balance around this turn, so the spend is unchecked (approved: ${limit} credits).`
      : `This turn spent ${spent} credits; ${limit} were approved.`;
  try {
    await t.runnerApi.item({
      tenantId: t.tenant.id,
      agent: "creative",
      chatId: t.chatId,
      fromAgent: null,
      kind: "spend_alert",
      title: "Credits over the approved amount",
      status: "needs_ok",
      payload: { quote: what, stats: [{ label: "Approved", value: limit }, { label: "Spent", value: spent ?? "unknown" }], approvedCard: itemId },
    });
  } catch (e) {
    t.log(`spend alert post failed: ${(e as Error).message}`);
  }
  return what;
}
