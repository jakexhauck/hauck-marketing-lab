// Seed the lead scraper's reference data into Supabase.
//
// Two things, both read from the runner's own files so nothing is written down
// twice: the built-in niche definitions (lead-scraper/niches/*.json) and the metro
// grid (lead-scraper/data/metros.json).
//
// Safe to re-run. Built-in niches are overwritten from the file (the file wins);
// niches Jake saved in the app are left alone. Metros are upserted on (metro, state).
//
//   node scripts/seed-niches.mjs
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (.dev.vars
// or Doppler). Run it once after applying migration 0069, and again whenever a
// niche file or the metro grid changes.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRAPER = resolve(HERE, "..", "..", "lead-scraper");
const NICHES_DIR = join(SCRAPER, "niches");
const METROS_FILE = join(SCRAPER, "data", "metros.json");

const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error(`${table} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    written += chunk.length;
  }
  return written;
}

// --- niches ------------------------------------------------------------------

if (!existsSync(NICHES_DIR)) {
  console.error(`No niches directory at ${NICHES_DIR}`);
  process.exit(1);
}

// Lists a child ADDS to rather than replaces. Must match INHERITED_LISTS in
// lead-scraper/niche.py: the runner resolves the same files when run standalone,
// and two resolvers that disagree would score the same niche two ways.
const INHERITED_LISTS = [
  "deny", "recurring_deny", "category_only", "whole_word",
  "primary_deny", "category_unless",
];

// Fold a niche's `extends` base into it, so the database always holds a complete
// spec. The run freezes that spec, and a frozen spec that still says "extends"
// would need a file on disk to mean anything a year later.
function resolveSpec(spec, seen = []) {
  if (!spec.extends) return spec;
  if (seen.includes(spec.extends)) {
    console.error(`${spec.id} extends itself via ${spec.extends}`);
    process.exit(1);
  }
  const parentFile = join(NICHES_DIR, `${spec.extends}.json`);
  if (!existsSync(parentFile)) {
    console.error(`${spec.id} extends missing base ${spec.extends}`);
    process.exit(1);
  }
  const parent = resolveSpec(
    JSON.parse(readFileSync(parentFile, "utf8")),
    [...seen, spec.extends],
  );

  const merged = { ...parent, ...spec };
  for (const key of INHERITED_LISTS) {
    const base = parent[key] ?? [];
    const own = spec[key] ?? [];
    if (base.length === 0 && own.length === 0) continue;
    if (key === "category_unless") {
      const byTerm = new Map();
      for (const rule of [...base, ...own]) byTerm.set(rule.deny, rule);
      merged[key] = [...byTerm.values()];
    } else {
      merged[key] = [...new Set([...base, ...own])];
    }
  }
  delete merged.extends;
  return merged;
}

const niches = readdirSync(NICHES_DIR)
  // A leading underscore marks a base that exists to be extended, not chosen.
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => {
    const spec = resolveSpec(JSON.parse(readFileSync(join(NICHES_DIR, f), "utf8")));
    const nicheId = spec.id ?? f.replace(/\.json$/, "");
    return {
      niche_id: nicheId,
      label: spec.label ?? nicheId,
      spec,
      built_in: true,
      updated_at: new Date().toISOString(),
    };
  });

const nicheCount = await upsert("lead_niche_presets", niches, "niche_id");
console.log(`niches: ${nicheCount} seeded (${niches.map((n) => n.niche_id).join(", ")})`);

// --- metros ------------------------------------------------------------------

const metros = JSON.parse(readFileSync(METROS_FILE, "utf8")).map((m) => ({
  metro: m.metro,
  state: m.state,
  query_anchor: m.query_anchor,
  rank: m.rank ?? 99,
  tier: m.tier ?? 2,
  suburbs: m.suburbs ?? [],
  updated_at: new Date().toISOString(),
}));

const metroCount = await upsert("lead_metros", metros, "metro,state");
const states = new Set(metros.map((m) => m.state));
const cities = metros.reduce((n, m) => n + 1 + m.suburbs.length, 0);
console.log(`metros: ${metroCount} seeded across ${states.size} states, ${cities} cities`);
console.log("done.");
