import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { STATE_CODE, stateCode } from "../../../lib/usStates";

// GET /api/admin/leads/cities            -> every city with its coverage
// GET /api/admin/leads/cities?niche=hvac -> the same, with the counts scoped to
//                                           that trade
//
// What we have already done in each city, so picking the next scrape is a
// decision rather than a memory test. Two counts, never merged into one
// "scraped" flag:
//
//   runs   how many scrape runs named this city
//   leads  how many leads in the book carry it
//
// They disagree in both directions, and each disagreement means something. A
// city with runs and no leads was worked and came up empty, which is worth
// knowing before spending another run on it. A city with leads and no runs
// arrived some other way (an import, or a state-wide run that never named the
// city it found them in), which is worth knowing before assuming the list is
// complete.
//
// The list is a UNION of three sources, not lead_cities alone:
//
//   lead_cities        the 999 biggest cities: the planning list
//   scrape_runs.cities every city a run has ever named
//   lead_city_counts   every city a lead carries
//
// The union is the point. lead_cities holds the 999 biggest, and the cities Jake
// types in himself are wealthy SUBURBS, most of them far too small for that
// list: Mercer Island, Issaquah, Los Gatos, Gig Harbor, Bloomfield Hills. Every
// one of those has been scraped and none of them existed on this page, so the
// one screen meant to answer "have we done this city yet" was silent for exactly
// the cities Jake picks by hand. An off-list city has no rank and no population;
// it carries its coverage and nothing else.
//
// Each row also carries `niches`: every trade that city has been worked for.
// That is the second half of the question. Kirkland has been run for garage
// doors AND windows; Los Gatos only for garage doors, so it is still open for
// windows. With the counts merged across trades both read identically done.
//
// Everything is returned in one payload rather than paged. It is a few thousand
// rows, and searching and sorting them in the browser is instant, where paging
// would make every keystroke a round trip.
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

export interface CoverageCity {
  // Null for a city that is not on the 999 planning list. It was still scraped;
  // it simply has no rank or population of its own.
  rank: number | null;
  city: string;
  stateName: string;
  stateCode: string;
  population: number | null;
  growthPct: number | null;
  // Scoped to the niche filter when one is set.
  runs: number;
  lastRunAt: string | null;
  leads: number;
  // Never scoped: what the city has had done to it by ANY trade. This is what
  // separates a cold city from one that is worked, but not for the trade being
  // planned.
  totalRuns: number;
  totalLeads: number;
  niches: string[];
}

const key = (city: string, state: string): string =>
  `${city.toLowerCase().trim()}|${state.toLowerCase().trim()}`;

// Code back to a display name, for a city that exists only in the run history.
const STATE_NAME: Record<string, string> = {};
for (const [name, code] of Object.entries(STATE_CODE)) {
  if (!STATE_NAME[code]) {
    STATE_NAME[code] = name.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }
}

// lead_city_counts lowercases its keys, so a city that reaches this page only
// through its leads would otherwise render as "mercer island".
function titleCase(name: string): string {
  return name.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

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
//
// A slashed entry ("Frisco / Southlake", "Leawood / Overland Park") names two
// cities on one line. Historic runs hold a handful of them, and left whole they
// match no city on earth and so report nothing at all. Split, both cities get
// the credit for a query that did carry both names. New runs cannot write them:
// parseCityList splits on the way in.
export function citiesOf(value: unknown): RunCity[] {
  if (!Array.isArray(value)) return [];
  const out: RunCity[] = [];
  const push = (rawCity: string, rawState: string) => {
    const state = rawState.trim();
    for (const part of rawCity.split("/")) {
      const city = stripTrailingState(part);
      if (city) out.push({ city, state });
    }
  };
  for (const v of value) {
    if (typeof v === "string" && v.trim()) {
      push(v, "");
      continue;
    }
    if (v && typeof v === "object") {
      const o = v as { city?: unknown; state?: unknown };
      if (typeof o.city === "string" && o.city.trim()) {
        push(o.city, typeof o.state === "string" ? o.state : "");
      }
    }
  }
  return out;
}

// What one city has had done to it, before it is matched to a name on the list.
interface Cover {
  city: string;
  state: string;
  runs: number;
  totalRuns: number;
  lastRunAt: string | null;
  leads: number;
  totalLeads: number;
  niches: Set<string>;
}

function blank(city: string, state: string): Cover {
  return {
    city,
    state,
    runs: 0,
    totalRuns: 0,
    lastRunAt: null,
    leads: 0,
    totalLeads: 0,
    niches: new Set<string>(),
  };
}

function absorb(into: Cover, from: Cover | undefined): Cover {
  if (!from) return into;
  into.runs += from.runs;
  into.totalRuns += from.totalRuns;
  into.leads += from.leads;
  into.totalLeads += from.totalLeads;
  for (const n of from.niches) into.niches.add(n);
  // ISO timestamps sort lexically, so the later string is the later run.
  if (from.lastRunAt && (!into.lastRunAt || from.lastRunAt > into.lastRunAt)) {
    into.lastRunAt = from.lastRunAt;
  }
  return into;
}

/**
 * Fold the three sources into one row per city.
 *
 * Exported for its own tests: this is where a mistake is invisible on the page
 * and wrong in exactly the way that costs a run.
 */
export function buildCoverage(
  cities: CityRow[],
  counts: CountRow[],
  runs: RunRow[],
  niche: string,
): CoverageCity[] {
  // Keyed on city AND state wherever it is known. That distinction matters:
  // there is a Portland in Oregon and one in Maine, both on the list, so a
  // name-only match would mark both as worked off a single run.
  //
  // The name-only bucket holds ONLY entries that recorded no state at all (older
  // rows storing a bare string). An entry that named its state must never fall
  // into it, or the credit lands on the wrong city entirely: the live runs
  // target Birmingham MICHIGAN, and a name-only fallback handed that run to
  // Birmingham ALABAMA, a state nobody has ever scraped. Measured, not
  // hypothetical.
  const byKey = new Map<string, Cover>();
  const byName = new Map<string, Cover>();

  const bucket = (city: string, state: string): Cover => {
    const code = stateCode(state);
    const map = code ? byKey : byName;
    const k = code ? key(city, code) : city.toLowerCase().trim();
    let cover = map.get(k);
    if (!cover) {
      cover = blank(city.trim(), code);
      map.set(k, cover);
    }
    return cover;
  };

  // Runs first, so a city's display spelling comes from what Jake typed rather
  // than from the lowercased leads view.
  for (const r of runs) {
    const nicheId = (r.niche_id ?? "").trim();
    for (const rc of citiesOf(r.cities)) {
      const cover = bucket(rc.city, rc.state);
      cover.totalRuns += 1;
      if (nicheId) cover.niches.add(nicheId);
      if (!niche || nicheId === niche) {
        cover.runs += 1;
        // Runs arrive newest first, so the first sighting is the latest one.
        if (!cover.lastRunAt) cover.lastRunAt = r.created_at;
      }
    }
  }

  for (const c of counts) {
    const name = (c.city_key ?? "").trim();
    if (!name) continue;
    const cover = bucket(titleCase(name), c.state_key ?? "");
    const n = Number(c.leads ?? 0);
    cover.totalLeads += n;
    const nicheId = (c.niche_id ?? "").trim();
    if (nicheId) cover.niches.add(nicheId);
    if (!niche || nicheId === niche) cover.leads += n;
  }

  const rows: CoverageCity[] = [];
  const usedKeys = new Set<string>();
  const usedNames = new Set<string>();

  for (const c of cities) {
    const code = c.state_code.toUpperCase();
    const k = key(c.city, code);
    const name = c.city.toLowerCase().trim();
    usedKeys.add(k);
    usedNames.add(name);

    // A precise city+state hit, plus whatever the stateless bucket holds under
    // that name: a lead or a legacy run with no state at all still belongs
    // somewhere, and crediting it to every city of that name beats dropping it.
    const cover = absorb(absorb(blank(c.city, code), byKey.get(k)), byName.get(name));

    rows.push({
      rank: c.rank,
      city: c.city,
      stateName: c.state_name,
      stateCode: code,
      population: c.population,
      growthPct: c.growth_pct == null ? null : Number(c.growth_pct),
      runs: cover.runs,
      lastRunAt: cover.lastRunAt,
      leads: cover.leads,
      totalRuns: cover.totalRuns,
      totalLeads: cover.totalLeads,
      niches: [...cover.niches].sort(),
    });
  }

  // Everything that has been worked but is not on the planning list.
  const extras: Cover[] = [];
  for (const [k, cover] of byKey) if (!usedKeys.has(k)) extras.push(cover);
  for (const [name, cover] of byName) if (!usedNames.has(name)) extras.push(cover);

  for (const cover of extras) {
    rows.push({
      rank: null,
      city: cover.city,
      stateName: STATE_NAME[cover.state] ?? cover.state,
      stateCode: cover.state,
      population: null,
      growthPct: null,
      runs: cover.runs,
      lastRunAt: cover.lastRunAt,
      leads: cover.leads,
      totalRuns: cover.totalRuns,
      totalLeads: cover.totalLeads,
      niches: [...cover.niches].sort(),
    });
  }

  return rows;
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

  const runs = (runRes.data ?? []) as RunRow[];
  const rows = buildCoverage(
    (cityRes.data ?? []) as CityRow[],
    (countRes.data ?? []) as CountRow[],
    runs,
    niche,
  );

  // The niches actually present in the run history, for the filter. Read from
  // the runs rather than the preset list so a niche that was renamed or deleted
  // still appears while its runs do.
  const niches = [...new Set(runs.map((r) => (r.niche_id ?? "").trim()).filter(Boolean))].sort();

  return Response.json({ cities: rows, niches, niche: niche || null });
};
