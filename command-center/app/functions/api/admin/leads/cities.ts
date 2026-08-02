import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { stateAliases, stateCode } from "../../../lib/usStates";

// GET /api/admin/leads/cities            -> every city with its coverage
// GET /api/admin/leads/cities?niche=hvac -> the same, counting only that niche
//
// The 1000 biggest US cities and what we have already done in each. Two counts,
// never merged into one "scraped" flag:
//
//   runs   how many scrape runs named this city
//   leads  how many leads in the book carry it
//
// They disagree in both directions, and each disagreement means something. A
// city with runs and no leads was worked and came up empty, which is worth
// knowing before spending another run on it. A city with leads and no runs
// arrived some other way (an import, or a run whose city list was typed
// differently), which is worth knowing before assuming the list is complete.
//
// Everything is returned in one payload rather than paged. It is 1000 rows, and
// searching and sorting them in the browser is instant, where paging would make
// every keystroke a round trip.
//
// Admin-only: gated centrally in api/_middleware.ts.

interface CityRow {
  rank: number;
  city: string;
  state_name: string;
  state_code: string;
  population: number | null;
  growth_pct: number | null;
}

interface CountRow {
  city_key: string;
  state_key: string;
  niche_id: string;
  leads: number;
}

interface RunRow {
  niche_id: string | null;
  cities: unknown;
  states: unknown;
  created_at: string;
}

const key = (city: string, state: string): string =>
  `${city.toLowerCase().trim()}|${state.toLowerCase().trim()}`;

// The wizard writes the queried city with its state code stuck on the end
// ("Novi MI", "Rochester Hills MI") because that is the string handed to the
// search. Stripped here so it can be matched against a real city name, which is
// just "Novi".
//
// Only a trailing two-letter token is taken, and only when something is left in
// front of it, so "New York" keeps its name and a bare "MI" is not reduced to
// nothing.
function stripTrailingState(name: string): string {
  const m = name.trim().match(/^(.*\S)\s+([A-Za-z]{2})$/);
  return m ? m[1]! : name.trim();
}

interface RunCity {
  city: string;
  state: string;
}

// A run's `cities` is a jsonb array. It holds OBJECTS ({city, state}) as written
// by the wizard, but older rows hold plain strings, so both are read. Anything
// else is ignored rather than coerced: a malformed entry must not silently mark
// a real city as covered.
//
// Getting this wrong is not a small error. Reading only strings returns nothing
// for every current run, which renders all 999 cities as never touched: a page
// that looks fully populated and is uniformly wrong.
function citiesOf(value: unknown): RunCity[] {
  if (!Array.isArray(value)) return [];
  const out: RunCity[] = [];
  for (const v of value) {
    if (typeof v === "string" && v.trim()) {
      out.push({ city: stripTrailingState(v), state: "" });
      continue;
    }
    if (v && typeof v === "object") {
      const o = v as { city?: unknown; state?: unknown };
      if (typeof o.city === "string" && o.city.trim()) {
        out.push({
          city: stripTrailingState(o.city),
          state: typeof o.state === "string" ? o.state.trim() : "",
        });
      }
    }
  }
  return out;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const niche = (url.searchParams.get("niche") ?? "").trim();

  const [cityRes, countRes, runRes] = await Promise.all([
    client
      .from("lead_cities")
      .select("rank, city, state_name, state_code, population, growth_pct")
      .order("rank", { ascending: true }),
    client.from("lead_city_counts").select("city_key, state_key, niche_id, leads"),
    // Runs are read whole because a run's cities live in a jsonb array that
    // Postgres cannot index into usefully from PostgREST. There are hundreds of
    // runs, not millions.
    client
      .from("scrape_runs")
      .select("niche_id, cities, states, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (cityRes.error) {
    console.error("[leads/cities] city read failed", cityRes.error.message);
    return Response.json({ error: "could not read the city list" }, { status: 500 });
  }
  if (countRes.error) {
    console.error("[leads/cities] count read failed", countRes.error.message);
    return Response.json({ error: "could not read lead counts" }, { status: 500 });
  }
  if (runRes.error) {
    console.error("[leads/cities] run read failed", runRes.error.message);
    return Response.json({ error: "could not read scrape runs" }, { status: 500 });
  }

  const cities = (cityRes.data ?? []) as CityRow[];
  const counts = (countRes.data ?? []) as CountRow[];
  const runs = (runRes.data ?? []) as RunRow[];

  // Leads per city. The state on a lead may be a code or a full name, so each
  // city registers both spellings and reads whichever turned up.
  const leadsByKey = new Map<string, number>();
  for (const c of counts) {
    if (niche && c.niche_id !== niche) continue;
    const k = key(c.city_key, c.state_key);
    leadsByKey.set(k, (leadsByKey.get(k) ?? 0) + Number(c.leads ?? 0));
  }

  // Runs per city, and when the most recent one was.
  //
  // Keyed on city AND state where the run recorded one, which it now always
  // does. That distinction matters: there is a Portland in Oregon and one in
  // Maine, and both are in this list, so a name-only match would mark both as
  // worked off a single run.
  //
  // The name-only bucket holds ONLY runs that recorded no state at all (older
  // rows storing a bare string). A run that named its state must never fall into
  // it, or the credit lands on the wrong city entirely: the live runs target
  // Birmingham MICHIGAN, which is too small for this list, and a name-only
  // fallback handed that run to Birmingham ALABAMA, a state nobody has ever
  // scraped. Measured, not hypothetical.
  const runsByKey = new Map<string, { count: number; last: string }>();
  const runsByName = new Map<string, { count: number; last: string }>();

  const bump = (map: Map<string, { count: number; last: string }>, k: string, at: string) => {
    const prev = map.get(k);
    if (prev) prev.count += 1;
    // Runs arrive newest first, so the first sighting is the latest one.
    else map.set(k, { count: 1, last: at });
  };

  for (const r of runs) {
    if (niche && (r.niche_id ?? "") !== niche) continue;
    for (const rc of citiesOf(r.cities)) {
      const name = rc.city.toLowerCase().trim();
      if (!name) continue;
      const code = stateCode(rc.state);
      // Exactly one bucket per entry: precise when the state is known, name-only
      // when it is not. Writing to both is what mis-credited Birmingham.
      if (code) bump(runsByKey, key(rc.city, code), r.created_at);
      else bump(runsByName, name, r.created_at);
    }
  }

  const rows = cities.map((c) => {
    const aliases = stateAliases(c.state_name, c.state_code);
    let leads = 0;
    for (const alias of aliases) leads += leadsByKey.get(key(c.city, alias)) ?? 0;
    // A lead with no state at all still belongs somewhere; credit it to the city
    // name so it is not silently dropped from every row.
    leads += leadsByKey.get(key(c.city, "")) ?? 0;

    // A precise city+state hit wins. Only when there is none does the name-only
    // bucket answer, which is where a legacy run with no state lands.
    const run =
      runsByKey.get(key(c.city, c.state_code)) ?? runsByName.get(c.city.toLowerCase().trim());

    return {
      rank: c.rank,
      city: c.city,
      stateName: c.state_name,
      stateCode: c.state_code,
      population: c.population,
      growthPct: c.growth_pct == null ? null : Number(c.growth_pct),
      runs: run?.count ?? 0,
      lastRunAt: run?.last ?? null,
      leads,
    };
  });

  // The niches actually present in the run history, for the filter. Read from
  // the runs rather than the preset list so a niche that was renamed or deleted
  // still appears while its runs do.
  const niches = [...new Set(runs.map((r) => (r.niche_id ?? "").trim()).filter(Boolean))].sort();

  return Response.json({ cities: rows, niches, niche: niche || null });
};
