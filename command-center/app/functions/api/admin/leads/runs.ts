import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { CALLABLE_LEAD_FILTER } from "../../../lib/leadScraper";
import { logAdminAction } from "../../../lib/adminAuth";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { fetchAllContacts } from "../../../lib/ghl";
import { toE164 } from "../../../lib/agencyCrm";

// GET  /api/admin/leads/runs  -> the run history, newest first
// POST /api/admin/leads/runs  -> queue a run for the local runner to pick up
//
// The app never scrapes. Cloudflare's edge cannot hold a browser open for an hour
// and cannot run a Go binary, so the scraping lives in command-center/lead-scraper
// on Jake's Mac and PC. This endpoint is the hand-off: it writes down what was
// asked for and the runner claims it.
//
// A run is created 'preparing' rather than 'queued', because the GoHighLevel phone
// sweep that powers duplicate-hiding takes longer than a request should. The sweep
// runs after the response via waitUntil and flips the row to 'queued' when it is
// done, so a runner can never claim a job whose duplicate list is half built.

// One literal, not a concatenation: supabase-js infers the row type from this
// string, and a joined expression collapses it to an error type.
const SELECT =
  "id, niche_id, niche_label, states, cities, size, status, host, error, total_queries, done_queries, raw_found, kept_count, passed_count, sendable_count, new_count, in_crm_count, excluded_count, sent_count, pass_rate, failure_rate, blocked, crm_snapshot_count, crm_snapshot_partial, created_at, started_at, finished_at";

const MAX_CONTACT_PAGES = 50; // 100 per page, so up to 5,000 contacts per sweep
const SIZES = new Set(["quick", "standard", "deep"]);

interface RunRow {
  id: string;
  niche_id: string;
  niche_label: string | null;
  states: string[] | null;
  cities: { city: string; state: string }[] | null;
  size: string;
  status: string;
  host: string | null;
  error: string | null;
  total_queries: number;
  done_queries: number;
  raw_found: number;
  kept_count: number;
  passed_count: number;
  sendable_count: number;
  new_count: number;
  in_crm_count: number;
  excluded_count: number;
  sent_count: number;
  pass_rate: number | null;
  failure_rate: number | null;
  blocked: boolean;
  crm_snapshot_count: number;
  crm_snapshot_partial: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// How many of a run's leads are still there to ring, counted from the leads table
// against CALLABLE_LEAD_FILTER rather than from the run's own tallies.
//
// The run counts WRITES: one company found by three of the ten keywords is counted
// three times, so a run reporting 78 kept had put 40 businesses in the table, 16 of
// them callable. Whatever number sits next to a run has to be the number of rows
// you get when you click into it, or the screen is promising work that is not there.
//
// One query for the whole page of runs, not one per run.
export async function callableByRun(
  client: ReturnType<typeof getServiceClient>,
  runIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!client || runIds.length === 0) return out;
  const { data, error } = await client
    .from("cold_sms_outreach_numbers")
    .select("run_id")
    .match(CALLABLE_LEAD_FILTER)
    .in("run_id", runIds)
    .limit(20000);
  if (error) {
    // A count that cannot be read is reported as absent, never as zero: "0 to call"
    // on a run that has fifty is worse than a blank.
    console.error("[leads/runs] callable count failed", error.message);
    return out;
  }
  for (const row of (data ?? []) as { run_id: string | null }[]) {
    if (row.run_id) out[row.run_id] = (out[row.run_id] ?? 0) + 1;
  }
  return out;
}

export function shapeRun(row: RunRow, callable?: number) {
  return {
    callable: callable ?? null,
    id: row.id,
    nicheId: row.niche_id,
    nicheLabel: row.niche_label ?? row.niche_id,
    states: row.states ?? [],
    cities: row.cities ?? [],
    size: row.size,
    status: row.status,
    host: row.host,
    error: row.error,
    // The bar. done/total is honest even mid-run because the queue is built up
    // front, so the denominator never moves once the run starts.
    totalQueries: row.total_queries,
    doneQueries: row.done_queries,
    percent:
      row.total_queries > 0
        ? Math.min(100, Math.round((row.done_queries / row.total_queries) * 100))
        : 0,
    rawFound: row.raw_found,
    kept: row.kept_count,
    // What the run stored, and what of it can actually be handed to a channel.
    // kept is the SOP's number; sendable is the one worth reading.
    passed: row.passed_count,
    sendable: row.sendable_count,
    added: row.new_count,
    hiddenAsDuplicates: row.in_crm_count,
    rejected: row.excluded_count,
    sent: row.sent_count,
    passRate: row.pass_rate,
    failureRate: row.failure_rate,
    blocked: row.blocked,
    crmSnapshotCount: row.crm_snapshot_count,
    crmSnapshotPartial: row.crm_snapshot_partial,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100);

  const { data, error } = await client
    .from("scrape_runs")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[leads/runs] read failed", error.message);
    return Response.json({ error: "could not read the run history" }, { status: 500 });
  }

  const rows = (data ?? []) as RunRow[];
  const callable = await callableByRun(client, rows.map((r) => r.id));
  return Response.json({ runs: rows.map((r) => shapeRun(r, callable[r.id] ?? 0)) });
};

interface PostBody {
  nicheId?: unknown;
  states?: unknown;
  cities?: unknown;
  size?: unknown;
}

function cleanStates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const v of value) {
    const s = String(v ?? "").trim().toUpperCase().slice(0, 2);
    if (/^[A-Z]{2}$/.test(s)) out.add(s);
  }
  return [...out];
}

function cleanCities(value: unknown): { city: string; state: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { city: string; state: string }[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const city = String((v as Record<string, unknown>).city ?? "").trim().slice(0, 80);
    const state = String((v as Record<string, unknown>).state ?? "")
      .trim().toUpperCase().slice(0, 2);
    const key = `${city}|${state}`;
    if (city && !seen.has(key)) {
      seen.add(key);
      out.push({ city, state });
    }
  }
  return out;
}

/**
 * Sweep GoHighLevel once and drop every phone into lead_crm_phone_cache.
 *
 * This is the whole of the duplicate-hiding mechanism. Doing it once per run and
 * letting the runner filter in memory costs one sweep; checking each scraped lead
 * against the API would be thousands of calls and would hit the rate limit long
 * before the run finished.
 *
 * Never throws at the caller: a failed sweep means duplicates are not hidden, which
 * is recorded on the run and shown on the page, rather than a run that will not start.
 */
async function refreshCrmPhoneCache(
  env: Env,
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  runId: string,
): Promise<void> {
  let phones: string[] = [];
  let partial = false;

  if (isAgencyGhlConfigured(env)) {
    try {
      const contacts = await fetchAllContacts(getAgencyGhlContext(env), {
        maxPages: MAX_CONTACT_PAGES,
      });
      // Hitting the cap means there are more contacts than we looked at, so the
      // hiding is incomplete and the page has to say so.
      partial = contacts.length >= MAX_CONTACT_PAGES * 100;
      const set = new Set<string>();
      for (const c of contacts) {
        const raw = (c as { phone?: string }).phone;
        const e164 = raw ? toE164(raw) : null;
        if (e164) set.add(e164);
      }
      phones = [...set];
    } catch (err) {
      console.error("[leads/runs] crm sweep failed", err);
      partial = true;
    }
  } else {
    // Not connected is not a failure, but it does mean nothing can be hidden.
    partial = true;
  }

  try {
    // Replace wholesale: a stale phone left behind would hide a lead forever.
    await client.from("lead_crm_phone_cache").delete().neq("phone_e164", "");
    for (let i = 0; i < phones.length; i += 500) {
      await client
        .from("lead_crm_phone_cache")
        .upsert(
          phones.slice(i, i + 500).map((phone_e164) => ({ phone_e164 })),
          { onConflict: "phone_e164" },
        );
    }
  } catch (err) {
    console.error("[leads/runs] crm cache write failed", err);
    partial = true;
  }

  // Queued last, and only now: a runner must never claim a job whose duplicate
  // list is half written.
  await client
    .from("scrape_runs")
    .update({
      status: "queued",
      crm_snapshot_count: phones.length,
      crm_snapshot_partial: partial,
    })
    .eq("id", runId)
    .eq("status", "preparing");
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const nicheId = typeof body.nicheId === "string" ? body.nicheId.trim() : "";
  if (!nicheId) return Response.json({ error: "Pick a niche first." }, { status: 400 });

  const states = cleanStates(body.states);
  const cities = cleanCities(body.cities);
  if (states.length === 0 && cities.length === 0) {
    return Response.json(
      { error: "Choose at least one state, or name the cities you want." },
      { status: 400 },
    );
  }

  const size = typeof body.size === "string" && SIZES.has(body.size) ? body.size : "standard";

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: preset, error: presetErr } = await client
    .from("lead_niche_presets")
    .select("niche_id, label, spec")
    .eq("niche_id", nicheId)
    .maybeSingle();

  if (presetErr || !preset) {
    return Response.json({ error: "That niche no longer exists." }, { status: 404 });
  }

  // Only one run at a time. Two runners scraping the same Google from the same
  // house is the fastest way to get the house rate limited.
  const { data: busy } = await client
    .from("scrape_runs")
    .select("id")
    .in("status", ["preparing", "running"])
    .limit(1);
  if (busy && busy.length > 0) {
    return Response.json(
      { error: "A scrape is already running. Let it finish first." },
      { status: 409 },
    );
  }

  const row = preset as { niche_id: string; label: string; spec: Record<string, unknown> };

  const { data, error } = await client
    .from("scrape_runs")
    .insert({
      niche_id: row.niche_id,
      niche_label: row.label,
      // Frozen, not referenced. Editing the preset next month must not rewrite
      // what this run actually searched for.
      niche_spec: row.spec,
      states,
      cities,
      size,
      status: "preparing",
    })
    .select(SELECT)
    .single();

  if (error || !data) {
    console.error("[leads/runs] insert failed", error?.message);
    return Response.json({ error: "could not queue that run" }, { status: 500 });
  }

  const run = data as RunRow;

  await logAdminAction(client, ctx.data.admin!.id, "leads.run.queue", null, {
    nicheId: row.niche_id,
    states,
    cities: cities.length,
    size,
  });

  // The sweep outlives the response. The row stays 'preparing' until it lands.
  ctx.waitUntil(refreshCrmPhoneCache(ctx.env, client, run.id));

  return Response.json({ run: shapeRun(run) }, { status: 201 });
};
