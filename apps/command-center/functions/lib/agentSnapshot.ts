import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { Snapshot } from "../../src/lib/agentWire";
import { ensureTasks } from "./clientTasks";
import { fetchAllOpportunities, type GhlOpportunity } from "./ghl";
import { graphGet, graphGetAll } from "./metaGraph";
import { sumLeads, UNIFIED_ATTRIBUTION } from "./metaActions";
import { resolveMetaToken } from "./metaToken";
import { loadBoardPipeline } from "./leadBoardGhl";
import { runChecks } from "./clientAccountsRun";
import type { AccountCheck } from "./clientAccounts";

// One client's numbers for the Agents startup check (Task 9 compares two of
// these and wakes an agent only where something moved). Every figure comes
// from the code that already owns it, so the check reads what the pages read:
//
//   cpl, frequency, leads7d  Meta, last 7 days: spend and frequency off the
//                            account line, leads summed from ad set rows by
//                            the shared rule (lib/metaActions.ts sumLeads).
//   stuckNewOver48h          open opportunities in the Leads board's Lead
//                            stage for over 48h (lib/leadBoard.ts finds it).
//   checklistDone/Total      the Full Setup Checklist ticks (sopChecklists).
//   accountsRed              red rows on Client > Accounts (clientAccounts).
//
// Honest gaps, never guesses: Meta not answering or no ad account gives null
// cpl and frequency and 0 leads; a client with no working GHL key or no board
// pipeline (Willis and Made Better today) reads 0 stuck leads, because the
// wire type has no "unknown" for it.

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** The three Meta figures from the account line (or none) and its ad set rows. */
export function metaWeek(row: Row | null, adsets: Row[]): Pick<Snapshot, "cpl" | "frequency" | "leads7d"> {
  if (!row) return { cpl: null, frequency: null, leads7d: 0 };
  const leads = Math.round(sumLeads(adsets));
  const spend = num(row.spend) ?? 0;
  return {
    cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
    frequency: num(row.frequency),
    leads7d: leads,
  };
}

const STUCK_MS = 48 * 60 * 60 * 1000;

/**
 * Open leads sitting in New for over 48 hours. Time in the stage runs from
 * GHL's lastStageChangeAt (on the search response, not in our type), falling
 * back to createdAt, which is the same moment for a lead that never moved.
 */
export function stuckInNew(
  opps: (Pick<GhlOpportunity, "status" | "pipelineStageId" | "createdAt"> & { lastStageChangeAt?: string })[],
  newStageIds: Set<string>,
  now: Date,
): number {
  return opps.filter((o) => {
    if ((o.status ?? "open") !== "open" || !newStageIds.has(o.pipelineStageId ?? "")) return false;
    const since = Date.parse(o.lastStageChangeAt ?? o.createdAt ?? "");
    return Number.isFinite(since) && now.getTime() - since > STUCK_MS;
  }).length;
}

// Setup progress is the client's Director (lib/clientTasks.ts): done out of
// every task not cut. The field names stay so an older runner still reads it.
export function checklistCounts(rows: { state: string }[]): Pick<Snapshot, "checklistDone" | "checklistTotal"> {
  const live = rows.filter((r) => r.state !== "cut");
  return { checklistDone: live.filter((r) => r.state === "done").length, checklistTotal: live.length };
}

/** Red rows only: blocked and unknown are consequences or blips, not new reds. */
export function redCount(checks: AccountCheck[]): number {
  return checks.filter((c) => c.state === "missing").length;
}

async function metaRows(env: Env, account: string | null): Promise<{ row: Row | null; adsets: Row[] }> {
  const none = { row: null, adsets: [] };
  const raw = (account ?? "").trim();
  if (!raw) return none;
  const token = await resolveMetaToken(env);
  if (!token) return none;
  const act = raw.startsWith("act_") ? raw : `act_${raw}`;
  try {
    const [resp, adsets] = await Promise.all([
      graphGet(token, `/${act}/insights`, {
        level: "account",
        date_preset: "last_7d",
        fields: "spend,frequency",
        ...UNIFIED_ATTRIBUTION,
      }),
      graphGetAll(
        token,
        `/${act}/insights`,
        { level: "adset", date_preset: "last_7d", fields: "optimization_goal,actions", limit: "200", ...UNIFIED_ATTRIBUTION },
        5,
        { strict: true },
      ),
    ]);
    return { row: ((resp.data as Row[] | undefined) ?? [])[0] ?? null, adsets: adsets as Row[] };
  } catch {
    return none;
  }
}

/** The snapshot for one tenant, or null when there is no such tenant. */
export async function buildSnapshot(
  env: Env,
  client: SupabaseClient,
  tenantId: string,
  origin: string,
  now: Date = new Date(),
): Promise<Snapshot | null> {
  const [tenantRes, tasks, accounts] = await Promise.all([
    client.from("tenants").select("meta_ad_account_id").eq("id", tenantId).maybeSingle(),
    ensureTasks(client, tenantId).catch(() => [] as { state: string }[]),
    runChecks(env, tenantId, origin).catch((err: Error) => ({ error: err.message, status: 500 }) as const),
  ]);
  if (!tenantRes.data) return null;

  const week = await metaRows(env, (tenantRes.data as Row).meta_ad_account_id as string | null);
  const meta = metaWeek(week.row, week.adsets);

  let stuck = 0;
  const gctx = "error" in accounts ? null : accounts.gctx;
  if (gctx) {
    try {
      const board = await loadBoardPipeline(gctx);
      if (board) {
        const newIds = new Set(board.stages.filter((s) => s.key === "lead").map((s) => s.id));
        const opps = await fetchAllOpportunities(gctx, { pipelineId: board.pipelineId, maxPages: 5 });
        stuck = stuckInNew(opps, newIds, now);
      }
    } catch {
      stuck = 0;
    }
  }

  return {
    ...meta,
    stuckNewOver48h: stuck,
    ...checklistCounts(tasks),
    accountsRed: "error" in accounts ? 0 : redCount(accounts.body.checks),
  };
}
