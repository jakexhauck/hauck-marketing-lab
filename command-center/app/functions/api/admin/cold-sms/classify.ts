import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { applySort, fetchLatestReplies, loadSortTarget, loadVerdicts } from "../../../lib/coldSmsAgency";
import { classifyReplies, replyKey } from "../../../lib/coldSmsBoard";

// POST /api/admin/cold-sms/classify  (owner only)
//
// Claude reads every reply that has no verdict yet (or whose verdict was for an
// older reply) and the verdicts are saved. The board calls this after it loads
// and again while `remaining` is above zero, so the first visit after a quiet
// week labels a backlog a batch at a time instead of one slow request.
//
// Then the sort: every Replied card with a verdict moves to Positive Reply or
// Negative Reply in GHL (Jake, 2026-10-13). Check stays put for Jake. A failed
// sort never fails the labelling; the next load tries again.

const BATCH = 25;
const PER_CALL = 75; // three Claude batches per request

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  const db = getServiceClient(ctx.env);
  if (!db) return Response.json({ error: "no_db" }, { status: 503 });
  if (!(ctx.env.ANTHROPIC_API_KEY ?? "").trim()) {
    return Response.json({ error: "claude_not_configured" }, { status: 503 });
  }

  const agency = getAgencyGhlContext(ctx.env);
  // The Replied column is read alongside everything else, not after Claude.
  const target = loadSortTarget(agency).catch((err) => {
    console.error("[cold-sms/classify] sort read", err instanceof Error ? err.message : err);
    return null;
  });
  let replies;
  try {
    replies = await fetchLatestReplies(agency);
  } catch (err) {
    console.error("[cold-sms/classify] replies", err);
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }

  const stored = await loadVerdicts(db, [...replies.keys()]);
  const todo = [...replies]
    .filter(([id, r]) => r.body && stored.get(id)?.reply_key !== replyKey(r.at))
    .map(([id, r]) => ({ key: id, reply: r.body, at: r.at }));

  const now = todo.slice(0, PER_CALL);
  const batches: (typeof now)[] = [];
  for (let i = 0; i < now.length; i += BATCH) batches.push(now.slice(i, i + BATCH));
  // Side by side: three batches take as long as one.
  const answers = await Promise.all(batches.map((b) => classifyReplies(ctx.env, b)));

  const done: { contactId: string; verdict: string }[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const results = answers[i];
    if (results.length === 0) continue;
    const byKey = new Map(batch.map((b) => [b.key, b]));
    const rows = results.map((r) => ({
      contact_id: r.key,
      reply_key: replyKey(byKey.get(r.key)!.at)!,
      reply_body: byKey.get(r.key)!.reply.slice(0, 2000),
      verdict: r.verdict,
      classified_at: new Date().toISOString(),
    }));
    const { error } = await db.from("cold_sms_reply_verdicts").upsert(rows, { onConflict: "contact_id" });
    if (error) {
      console.error("[cold-sms/classify] save", error.message);
      return Response.json({ error: "save_failed" }, { status: 500 });
    }
    for (const r of results) done.push({ contactId: r.key, verdict: r.verdict });
  }

  let moves: { id: string; stageId: string }[] = [];
  try {
    const t = await target;
    if (t) moves = await applySort(db, agency, t, replies);
  } catch (err) {
    console.error("[cold-sms/classify] sort", err instanceof Error ? err.message : err);
  }
  const moved = moves.length;

  // Claude down or refusing: say so, so the board stops asking rather than
  // looping on a batch that will never label.
  if (now.length > 0 && done.length === 0) {
    return Response.json({ error: "claude_failed", classified: [], remaining: todo.length, moved, moves }, { status: 502 });
  }
  return Response.json({ classified: done, remaining: Math.max(0, todo.length - done.length), moved, moves });
};
