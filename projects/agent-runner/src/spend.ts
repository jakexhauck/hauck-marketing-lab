// Paid credits: the Creative Agent's Higgsfield gate (docs/build-plans/agents.md,
// "Paid credits" and Phase 3).
//
// Jake's rule: nothing that costs credits runs until he has seen the cost on a
// card and pressed Approve. The rule lives here, in the tool lists claude is
// started with, not in the agent's instructions:
//
//   - Quote tools are always on. The agent prices the work first and files a
//     card with payload { credits, what, grant: { kind: "spend", limit } }.
//   - Generate tools are on only for the one turn that answers that Approve
//     (the follow-up message carries the grant), and stay in --disallowedTools
//     on every other turn.
//   - Everything else Higgsfield sells (upscales, audio, 3D, ...) is refused
//     always. Nothing approves those yet.
//
// claude's dontAsk mode already refuses any tool not on the allowlist; the
// disallow list is the second lock, so an allow rule added by mistake later
// still cannot reach a paid tool.
//
// The limit is checked after the turn too: the runner reads the balance before
// and after, and a turn that spent more than Jake approved is flagged to him.

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bundle, RunOptions } from "./claude.ts";
import type { Grant } from "./wire.ts";

// The server name and config must match Jake's own ~/.claude.json entry: the
// OAuth token in Claude's credential store is keyed by them, which is what
// lets a headless turn use Higgsfield without a login prompt.
export const HF_SERVER = "higgsfield";
export const HF_MCP_URL = "https://mcp.higgsfield.ai/mcp";

const hf = (name: string) => `mcp__${HF_SERVER}__${name}`;

// Free reads: the balance and the price of a run.
export const HF_QUOTE_TOOLS = ["balance", "ads_studio_quote", "models_explore"].map(hf);

// What an approved spend grant switches on. jobs_wait only reads the status of
// a job already paid for; it is here because it is useless without one.
export const HF_GENERATE_TOOLS = [
  "generate_image",
  "generate_video",
  "generate_image_batch",
  "generate_video_batch",
  "ads_studio_generate",
  "execute_preset",
].map(hf);
const HF_AFTER_GENERATE = ["jobs_wait"].map(hf);

// Paid tools no card approves yet. Refused on every turn.
export const HF_PAID_OTHER = [
  "generate_audio",
  "generate_audio_batch",
  "generate_3d",
  "upscale_image",
  "upscale_video",
  "outpaint_image",
  "reframe",
  "remove_background",
  "motion_control",
  "voice_change",
  "dubbing",
  "create_voice",
  "create_voice_from_confirmed_audio",
  "ai_influencer_generate",
  "build_ai_influencer",
  "shorts_studio_create",
  "scene_builder_3d_generate_angles",
  "scene_builder_3d_generate_video",
  "video_analysis_create",
  "virality_predictor",
  "apps_invoke",
  "sandbox_exec",
].map(hf);

/** The credit limit a grant approves, or null when it approves no spending. */
export function spendLimit(grant: Grant | null | undefined): number | null {
  if (!grant || grant.kind !== "spend") return null;
  const n = grant.limit;
  // A spend card with no number on it was never a price Jake saw.
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A spend card as the model filed it, made honest: the credits Jake sees are
 * the grant's own limit, the number his Approve passes on, never a separate
 * figure written beside it. A spend grant with no finite positive whole
 * limit is dropped, with its credits.
 */
export function spendCard(payload: Record<string, unknown>): Record<string, unknown> {
  const g = payload.grant as { kind?: unknown; limit?: unknown } | undefined;
  if (!g || typeof g !== "object" || g.kind !== "spend") return payload;
  const { grant: _g, credits: _c, ...rest } = payload;
  const n = g.limit;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return rest;
  return { ...rest, credits: n, grant: { kind: "spend", limit: n } };
}

export function creativeHiggsfieldTools(grant: Grant | null | undefined): { allowed: string[]; disallowed: string[] } {
  if (spendLimit(grant) !== null) {
    return { allowed: [...HF_QUOTE_TOOLS, ...HF_GENERATE_TOOLS, ...HF_AFTER_GENERATE], disallowed: [...HF_PAID_OTHER] };
  }
  return { allowed: [...HF_QUOTE_TOOLS], disallowed: [...HF_GENERATE_TOOLS, ...HF_AFTER_GENERATE, ...HF_PAID_OTHER] };
}

export function writeHiggsfieldConfig(file: string): string {
  // Same shape and key order as the user config entry (see HF_SERVER).
  writeFileSync(file, JSON.stringify({ mcpServers: { [HF_SERVER]: { type: "http", url: HF_MCP_URL } } }, null, 2) + "\n");
  return file;
}

/** Spent more than approved? Credits go down as they are spent. */
export function checkSpend(before: number, after: number, limit: number): "ok" | "over" {
  return before - after > limit ? "over" : "ok";
}

// The balance tool answers {"credits":160,"subscription_plan_type":"starter"}
// (recorded 2026-10-17). The model echoes it, sometimes inside prose or a code
// fence, so find the number rather than parse the whole reply.
export function parseBalance(text: string): number | null {
  const m = /"credits"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(text);
  return m ? Number(m[1]) : null;
}

export const BALANCE_PROMPT =
  "Call the mcp__higgsfield__balance tool exactly once and reply with its raw JSON result only. Call no other tool.";

// The runner has no MCP client of its own, so the balance is read the way the
// agent would read it: a one-tool claude turn, locked down like every other
// (claudeArgs), allowed the balance tool and nothing else. A fresh session
// each time; no history, no brains, no client.
export function balanceReader(
  run: (o: RunOptions) => Promise<{ text: string; tools: string[] }>,
  dir: string,
  newId: () => string = randomUUID,
): () => Promise<number | null> {
  return async () => {
    mkdirSync(dir, { recursive: true });
    const systemPromptFile = join(dir, "balance.md");
    writeFileSync(systemPromptFile, "# Balance check\nYou only read the Higgsfield credit balance.\n");
    const bundle: Bundle = {
      systemPromptFile,
      allowedTools: [hf("balance")],
      disallowedTools: [...HF_GENERATE_TOOLS, ...HF_AFTER_GENERATE, ...HF_PAID_OTHER],
      addDirs: [],
      workDir: dir,
      mcpConfig: writeHiggsfieldConfig(join(dir, "balance.mcp.json")),
    };
    try {
      const r = await run({ sessionId: newId(), resume: false, prompt: BALANCE_PROMPT, bundle, cwd: dir, onProgress: () => {} });
      return parseBalance(r.text);
    } catch {
      return null;
    }
  };
}
