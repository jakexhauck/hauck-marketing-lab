import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";

// GET /api/admin/leads/metros            -> which states have a grid, with counts
// GET /api/admin/leads/metros?states=TX,CA -> the metros and suburbs for those states
//
// This is what makes the wizard's second step honest. Jake ticks a state and sees
// the actual cities that will be searched, rather than trusting the word "Texas"
// to mean whatever the runner decides later. He can strike any of them out, or
// ignore the list and name his own cities instead.

interface MetroRow {
  metro: string;
  state: string;
  query_anchor: string;
  rank: number;
  tier: number;
  suburbs: string[] | null;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const states = (url.searchParams.get("states") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));

  let query = client
    .from("lead_metros")
    .select("metro, state, query_anchor, rank, tier, suburbs");
  if (states.length > 0) query = query.in("state", states);

  const { data, error } = await query
    .order("rank", { ascending: true })
    .order("metro", { ascending: true });

  if (error) {
    console.error("[leads/metros] read failed", error.message);
    return Response.json({ error: "could not read the metro grid" }, { status: 500 });
  }

  const rows = (data ?? []) as MetroRow[];

  // With no state asked for, the caller is drawing the state picker and only needs
  // to know which states exist and how much is behind each one.
  if (states.length === 0) {
    const byState = new Map<string, { metros: number; cities: number }>();
    for (const row of rows) {
      const entry = byState.get(row.state) ?? { metros: 0, cities: 0 };
      entry.metros += 1;
      entry.cities += 1 + (row.suburbs?.length ?? 0);
      byState.set(row.state, entry);
    }
    return Response.json({
      states: [...byState.entries()]
        .map(([state, counts]) => ({ state, ...counts }))
        .sort((a, b) => a.state.localeCompare(b.state)),
    });
  }

  return Response.json({
    metros: rows.map((row) => ({
      metro: row.metro,
      state: row.state,
      anchor: row.query_anchor,
      rank: row.rank,
      tier: row.tier,
      suburbs: row.suburbs ?? [],
    })),
    // Flattened, in the order the runner would work them: the metro itself first,
    // then its suburb ring. This is the list the wizard shows for editing.
    cities: rows.flatMap((row) => [
      { city: row.query_anchor, state: row.state, metro: row.metro, isAnchor: true },
      ...(row.suburbs ?? []).map((s) => ({
        city: s,
        state: row.state,
        metro: row.metro,
        isAnchor: false,
      })),
    ]),
  });
};
