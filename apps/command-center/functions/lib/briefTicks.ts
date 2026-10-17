import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerTickBody, RunnerTickResult } from "../../src/lib/agentWire";
import { resolveTicks } from "../../src/lib/briefChecklist";
import { turnChat } from "./clientBriefs";

// An agent ticks boxes in the Client Brief (Brief v2, Jake, 2026-10-17).
//
// The agent ends its turn with a ```tick block naming the finished items; the
// runner posts the labels here. Which boxes the agent may tick is decided from
// the claimed message's chat on the server (turnChat, tickSections): its own
// section, and for the Manager also Onboarding Call and Launch Call. A label
// anywhere else, or an Accounts check (those follow the live check), is
// refused and named back. Ticks only: an agent never unticks, that is Jake's.
//
// The ticks are the same "sop:" rows in onboarding_checklist the app's boxes
// read and write, done_by "agent:<id>".

export type TickResult = ({ tenantId: string } & RunnerTickResult) | { error: 400 | 403 | 404 | 409; reason: string };

const MAX_LABELS = 50;

export async function agentTick(client: SupabaseClient, body: RunnerTickBody, now: Date = new Date()): Promise<TickResult> {
  if (!Array.isArray(body?.labels) || body.labels.length > MAX_LABELS || body.labels.some((l) => typeof l !== "string")) {
    return { error: 400, reason: "labels must be a list of item labels" };
  }
  const who = await turnChat(client, body.messageId);
  if ("error" in who) return who;
  const { keys, ticked, refused } = resolveTicks(who.agent, body.labels);
  if (keys.length) {
    const stamp = now.toISOString();
    const { error } = await client.from("onboarding_checklist").upsert(
      keys.map((task_key) => ({
        tenant_id: who.tenantId,
        task_key,
        done: true,
        done_at: stamp,
        done_by: `agent:${who.agent}`,
      })),
      { onConflict: "tenant_id,task_key" },
    );
    if (error) throw new Error(`tick: ${error.message}`);
  }
  return { tenantId: who.tenantId, ticked, refused };
}
