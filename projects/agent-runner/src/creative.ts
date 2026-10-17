// The runner's half of the Creative Agent (Phase 3). The agent has no shell
// and no upload rights; it asks with a fenced ```video block and the runner
// does the work, then tells it what happened:
//
//   {"action": "prepare", "source": "<clip in the client's Drive folder>", "name": "hey-im-ryan"}
//       proxy, transcript (words + readable lines) and four stills, all in
//       the agent's work folder, for it to read and draft an ad config from
//   {"action": "photo", "source": "<image in the Drive folder>", "as": "ba1-before"}
//       into the client's photo library (brand/photos/<as>.jpg)
//   {"action": "preview", "config": "ads/<id>.json"}
//       build + draft render; the clip lands on a Building card
//   {"action": "final", "config": "ads/<id>.json"}
//       build + standard render; a card with the final and Approve to file it
//   {"action": "stage", "url": "https://...", "name": "winter-offer"}
//       a finished Higgsfield image or video, onto a card with Approve to file
//
// Filing into Creatives happens on the turn that answers that Approve: the
// follow-up carries a { kind: "file" } grant for the card, and the runner,
// not the agent, files what it staged for that card. It only ever files a
// card it made itself (state.finals), never a path from model output, and
// the app checks the grant again on its side.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RunnerApi } from "./api.ts";
import type { CreativeApi } from "./creativeApi.ts";
import { brandFor, BRANDS_DIR } from "../video/brand.ts";
import { buildProject, BuildError, frames, inside, photoArgs, proxy, render, safeName, transcribe, transcriptLines, workPaths, type Exec, type RenderMode, type Word } from "./video.ts";
import { within } from "./paths.ts";
import type { ClaimTenant, Grant } from "./wire.ts";

export interface CreativeDeps {
  api: CreativeApi;
  exec: Exec;
  // The Higgsfield credit balance, or null when it could not be read.
  balance: () => Promise<number | null>;
  fetch?: typeof fetch;
}

export interface CreativeTurn {
  deps: CreativeDeps;
  runnerApi: RunnerApi;
  messageId: string;
  chatId: string;
  tenant: ClaimTenant;
  workDir: string;
  // The runner's own folder for this agent and client (bundle.stateDirFor),
  // outside the work folder, so the agent cannot rewrite what was staged.
  stateDir: string;
  driveDir: string | null;
  vaultFolder: string | null;
  // Show a step in the chat while it runs. Also keeps the message fresh: a
  // running message with no write for 10 minutes is taken for a dead runner.
  say: (step: string) => void;
  log: (line: string) => void;
}

export type VideoBlock =
  | { action: "prepare"; source: string; name: string }
  | { action: "photo"; source: string; as: string }
  | { action: "preview" | "final"; config: string; title?: string }
  | { action: "stage"; url: string; name: string; title?: string };

const BLOCK = /```video[^\n]*\n([\s\S]*?)```/g;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function toBlock(v: unknown): VideoBlock | null {
  if (!isObj(v)) return null;
  const title = str(v.title) ? { title: v.title } : {};
  switch (v.action) {
    case "prepare":
      return str(v.source) && safeName(v.name) ? { action: "prepare", source: v.source, name: v.name as string } : null;
    case "photo":
      return str(v.source) && safeName(v.as) ? { action: "photo", source: v.source, as: v.as as string } : null;
    case "preview":
    case "final":
      return str(v.config) ? { action: v.action, config: v.config, ...title } : null;
    case "stage":
      return str(v.url) && safeName(v.name) ? { action: "stage", url: v.url, name: v.name as string, ...title } : null;
    default:
      return null;
  }
}

/** The ```video blocks in an answer, and the answer without them. Bad JSON is dropped. */
export function takeVideoBlocks(text: string): { text: string; blocks: VideoBlock[] } {
  const blocks: VideoBlock[] = [];
  for (const [, body] of text.matchAll(BLOCK)) {
    let v: unknown;
    try {
      v = JSON.parse(body);
    } catch {
      continue;
    }
    for (const one of Array.isArray(v) ? v : [v]) {
      const b = toBlock(one);
      if (b) blocks.push(b);
    }
  }
  return { text: text.replace(BLOCK, "").trim(), blocks };
}

// What the runner remembers per agent and client, in its state folder.
interface Staged {
  path: string;
  name: string;
  type: string;
  size: number;
}
interface CreativeState {
  cards: Record<string, string>;
  finals: Record<string, Staged>;
}

const stateFile = (stateDir: string) => join(stateDir, "creative-state.json");

export function readState(stateDir: string): CreativeState {
  try {
    const v = JSON.parse(readFileSync(stateFile(stateDir), "utf8"));
    return { cards: isObj(v.cards) ? (v.cards as Record<string, string>) : {}, finals: isObj(v.finals) ? (v.finals as Record<string, Staged>) : {} };
  } catch {
    return { cards: {}, finals: {} };
  }
}

function writeState(stateDir: string, s: CreativeState): void {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile(stateDir), JSON.stringify(s, null, 2) + "\n");
}

export const brandAssetsDir = (workDir: string) => join(workDir, "brand");

function brandFile(t: CreativeTurn): string {
  const b = brandFor(t.tenant.slug, {
    vaultFolder: t.vaultFolder,
    name: t.tenant.name,
    brandsDir: BRANDS_DIR,
    assetsDir: brandAssetsDir(t.workDir),
  });
  mkdirSync(t.stateDir, { recursive: true });
  const f = join(t.stateDir, "brand.resolved.json");
  writeFileSync(f, JSON.stringify(b, null, 2) + "\n");
  return f;
}

// Bucket cap, the same as the app's (functions/lib/adCreativeFiles.ts).
const MAX_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" };

function idOf(res: unknown): string | null {
  return isObj(res) && typeof res.id === "string" ? res.id : null;
}

async function upload(t: CreativeTurn, file: string, type: string, preview: boolean): Promise<{ path: string; url: string; size: number }> {
  const size = statSync(file).size;
  if (size > MAX_BYTES) throw new Error(`${Math.round(size / 1048576)} MB is over the 50 MB Creatives limit`);
  const base = { messageId: t.messageId, tenantId: t.tenant.id };
  const { uploadUrl, path } = await t.deps.api.uploadUrl({ ...base, type, size, preview });
  await t.deps.api.put(uploadUrl, file, type);
  const { url } = await t.deps.api.readUrl({ ...base, path });
  return { path, url, size };
}

// A card the runner made, with Approve meaning "file this into Creatives".
async function fileCard(t: CreativeTurn, state: CreativeState, title: string, staged: Staged, url: string, video: boolean): Promise<void> {
  const res = await t.runnerApi.item({
    tenantId: t.tenant.id,
    agent: "creative",
    chatId: t.chatId,
    fromAgent: null,
    kind: "creative",
    title,
    status: "needs_ok",
    origin: "runner",
    // path ties the card to the one upload: the app files that and nothing else.
    payload: { ...(video ? { previewUrl: url } : { thumbs: [url] }), path: staged.path, quote: "Approve files it into Creatives.", grant: { kind: "file" } },
  });
  const id = idOf(res);
  if (!id) throw new Error("the card was not created");
  state.finals[id] = staged;
}

interface Outcome {
  notes: string[];
  // Does the agent need another turn to act on what happened?
  again: boolean;
}

function readConfig(t: CreativeTurn, rel: string): { file: string; id: string; source: string; title: string } {
  const file = resolve(t.workDir, rel);
  if (!inside(file, t.workDir)) throw new Error(`${rel} is outside your work folder`);
  if (!existsSync(file)) throw new Error(`${rel} does not exist; write it first`);
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  const id = safeName(cfg?.id);
  const source = safeName(cfg?.source);
  if (!id || !source) throw new Error(`${rel} needs an "id" and a "source" in lowercase-and-dashes`);
  return { file, id, source, title: typeof cfg.title === "string" ? cfg.title : id };
}

async function renderOne(t: CreativeTurn, state: CreativeState, b: { config: string; title?: string }, mode: RenderMode, retried: Set<string>, out: Outcome): Promise<void> {
  const cfg = readConfig(t, b.config);
  const w = workPaths(t.workDir, cfg.source);
  if (!existsSync(w.proxy) || !existsSync(w.transcript)) throw new Error(`"${cfg.source}" is not prepared; send a prepare block for it first`);
  const project = within(t.workDir, "videos", cfg.id);
  t.say(`Building ${cfg.id}`);
  try {
    await buildProject(t.deps.exec, { config: cfg.file, brandFile: brandFile(t), proxy: w.proxy, transcript: w.transcript, out: project });
  } catch (e) {
    if (!(e instanceof BuildError) || !e.fixable) throw e;
    // The plan's one automatic retry: the agent fixes its config once.
    if (retried.has(cfg.id)) {
      out.notes.push(`Build of ${cfg.id} failed again: ${e.message}. Stop and tell Jake what is wrong.`);
      return;
    }
    retried.add(cfg.id);
    out.notes.push(`Build of ${cfg.id} failed: ${e.message}. Phrases must match the transcript words exactly (tx/${cfg.source}.txt). Fix ${b.config} and send the ${mode} block again.`);
    out.again = true;
    return;
  }
  t.say(mode === "final" ? `Rendering the final of ${cfg.id} (a few minutes)` : `Rendering a preview of ${cfg.id}`);
  const mp4 = await render(t.deps.exec, project, mode);
  t.say(`Uploading ${cfg.id}`);
  const up = await upload(t, mp4, "video/mp4", mode === "preview");
  const title = b.title ?? cfg.title;
  if (mode === "preview") {
    const card = {
      tenantId: t.tenant.id,
      agent: "creative" as const,
      chatId: t.chatId,
      fromAgent: null,
      kind: "video",
      title: `Preview: ${title}`,
      status: "needs_ok" as const,
      origin: "runner" as const,
      payload: { previewUrl: up.url, quote: "Approve to render the final. Change it to tweak." },
    };
    // The same card while Jake is still deciding it; once he has, the app
    // refuses the rewrite and the new preview gets a card of its own.
    const prev = state.cards[cfg.id];
    const res = prev ? await t.runnerApi.item({ ...card, id: prev }).catch(() => t.runnerApi.item(card)) : await t.runnerApi.item(card);
    const id = idOf(res);
    if (id) state.cards[cfg.id] = id;
    out.notes.push(`The preview of ${cfg.id} is on its card.`);
  } else {
    await fileCard(t, state, title, { path: up.path, name: `${cfg.id}.mp4`, type: "video/mp4", size: up.size }, up.url, true);
    out.notes.push(`The final of ${cfg.id} is on its card. Approve files it into Creatives.`);
  }
}

async function prepare(t: CreativeTurn, b: { source: string; name: string }, out: Outcome): Promise<void> {
  const src = resolve(b.source);
  if (!t.driveDir || !inside(src, t.driveDir)) throw new Error(`${b.source} is not in the client's Drive folder`);
  if (!existsSync(src)) throw new Error(`${b.source} does not exist`);
  const w = workPaths(t.workDir, b.name);
  t.say(`Making a proxy of ${b.name}`);
  await proxy(t.deps.exec, src, w.proxy);
  t.say(`Transcribing ${b.name}`);
  await transcribe(t.deps.exec, w.proxy, w.wav, w.transcript);
  const words = JSON.parse(readFileSync(w.transcript, "utf8")) as Word[];
  writeFileSync(w.lines, transcriptLines(words) + "\n");
  t.say(`Grabbing stills of ${b.name}`);
  const stills = await frames(t.deps.exec, w.proxy, w.frames);
  const rel = (f: string) => f.slice(t.workDir.length + 1).split("\\").join("/");
  out.notes.push(
    `Prepared "${b.name}": lines ${rel(w.lines)}, words ${rel(w.transcript)}, stills ${stills.map(rel).join(", ")}. Read them, write ads/<id>.json with "source": "${b.name}", then send a preview block.`,
  );
  out.again = true;
}

async function photo(t: CreativeTurn, b: { source: string; as: string }, out: Outcome): Promise<void> {
  const src = resolve(b.source);
  if (!t.driveDir || !inside(src, t.driveDir)) throw new Error(`${b.source} is not in the client's Drive folder`);
  if (!existsSync(src)) throw new Error(`${b.source} does not exist`);
  const dest = within(brandAssetsDir(t.workDir), "photos", `${b.as}.jpg`);
  mkdirSync(dirname(dest), { recursive: true });
  const r = await t.deps.exec("ffmpeg", photoArgs(src, dest));
  if (r.code !== 0) throw new Error(`photo ${b.as} failed: ${r.stderr.trim().split("\n").pop()}`);
  out.notes.push(`Photo "${b.as}" is in brand/photos.`);
}

async function stage(t: CreativeTurn, state: CreativeState, b: { url: string; name: string; title?: string }, out: Outcome): Promise<void> {
  if (!/^https:\/\//.test(b.url)) throw new Error("only https links can be staged");
  t.say(`Fetching ${b.name}`);
  const res = await (t.deps.fetch ?? fetch)(b.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new Error(`${type || "unknown type"} cannot go into Creatives`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("over the 50 MB Creatives limit");
  const file = within(t.workDir, "staged", `${b.name}.${ext}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  const up = await upload(t, file, type, false);
  await fileCard(t, state, b.title ?? b.name, { path: up.path, name: `${b.name}.${ext}`, type, size: up.size }, up.url, type === "video/mp4");
  out.notes.push(`"${b.name}" is on a card. Approve files it into Creatives.`);
}

/** Carry out the agent's blocks, in order. Returns what to tell it. */
export async function runVideoBlocks(blocks: VideoBlock[], t: CreativeTurn, retried: Set<string>): Promise<Outcome> {
  const out: Outcome = { notes: [], again: false };
  const state = readState(t.stateDir);
  for (const b of blocks) {
    try {
      if (b.action === "prepare") await prepare(t, b, out);
      else if (b.action === "photo") await photo(t, b, out);
      else if (b.action === "stage") await stage(t, state, b, out);
      else await renderOne(t, state, b, b.action, retried, out);
    } catch (e) {
      const msg = (e as Error).message;
      t.log(`video ${b.action} failed: ${msg}`);
      out.notes.push(`${b.action} failed: ${msg}`);
      // The agent hears about it and can fix it (a wrong path, an unprepared
      // clip), inside the round limit.
      out.again = true;
    } finally {
      writeState(t.stateDir, state);
    }
  }
  return out;
}

/** The turn that answers Approve on a file card: file it, before the agent speaks. */
export async function fileApproved(grant: Grant, t: CreativeTurn): Promise<string> {
  const staged = readState(t.stateDir).finals[grant.itemId];
  if (!staged) return "Runner: there is nothing staged for that card on this PC, so nothing was filed.";
  try {
    await t.deps.api.fileCreative({ messageId: t.messageId, tenantId: t.tenant.id, ...staged });
    return `Runner: filed ${staged.name} into Creatives.`;
  } catch (e) {
    return `Runner: filing ${staged.name} failed: ${(e as Error).message}`;
  }
}
