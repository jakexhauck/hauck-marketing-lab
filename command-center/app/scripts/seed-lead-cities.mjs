// Seed public.lead_cities from Jake's cities spreadsheet.
//
//   node scripts/seed-lead-cities.mjs <path-to-csv>
//
// A one-off data load, not a migration: 1000 INSERT rows inside a migration file
// makes the schema history unreadable and risks the Management API's statement
// size limit. Migration 0080 owns the table; this owns the rows.
//
// Idempotent. Upserts on (city, state_code), so re-running after the sheet gains
// rows updates rather than duplicates.
//
// Input is the sheet exported as CSV, one row per city:
//   rank,city,state,population,growth
// The growth column may carry a trailing % and is stored as a plain number.

import { readFileSync } from "node:fs";

const STATE_CODE = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};

function envFromDevVars() {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("usage: node scripts/seed-lead-cities.mjs <path-to-csv>");
  process.exit(1);
}

const rows = [];
const skipped = [];
for (const line of readFileSync(csvPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t) continue;
  const parts = t.split(",").map((p) => p.trim());
  if (parts.length < 5) continue;
  const [rank, city, stateName, population, growth] = parts;
  if (!/^\d+$/.test(rank)) continue; // header or stray line

  const code = STATE_CODE[stateName.toLowerCase()];
  if (!code) {
    // Never guessed. An unmapped state would produce a row that can never match
    // a scraped lead, which reads as "never scraped" forever.
    skipped.push(`${city}, ${stateName}`);
    continue;
  }

  rows.push({
    rank: Number(rank),
    city,
    state_name: stateName,
    state_code: code,
    population: Number(population) || null,
    growth_pct: growth ? Number(growth.replace("%", "")) : null,
  });
}

// Postgres refuses an upsert whose batch names the same key twice ("ON CONFLICT
// DO UPDATE command cannot affect row a second time"), so duplicates have to go
// before the write, not be left to the constraint. The sheet has one: rank 957,
// Hallandale Beach, listed twice identically. First occurrence wins, and anything
// dropped is printed rather than swallowed, because a silent dedupe here would
// hide a real data problem in a later export.
const byKey = new Map();
const dropped = [];
for (const r of rows) {
  const k = `${r.city.toLowerCase()}|${r.state_code}`;
  if (byKey.has(k)) dropped.push(`${r.city}, ${r.state_name} (rank ${r.rank})`);
  else byKey.set(k, r);
}
const unique = [...byKey.values()];
if (dropped.length) console.log(`deduped ${dropped.length}: ${dropped.join("; ")}`);

const env = envFromDevVars();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .dev.vars");
  process.exit(1);
}

console.log(`parsed ${rows.length} cities, ${unique.length} unique`);
if (skipped.length) console.log(`skipped ${skipped.length} (unmapped state): ${skipped.slice(0, 5).join("; ")}`);

const CHUNK = 200;
let written = 0;
for (let i = 0; i < unique.length; i += CHUNK) {
  const chunk = unique.slice(i, i + CHUNK);
  const res = await fetch(`${url}/rest/v1/lead_cities?on_conflict=city,state_code`, {
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
    console.error(`chunk ${i} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  written += chunk.length;
  process.stdout.write(`\rwrote ${written}/${unique.length}`);
}
console.log(`\ndone: ${written} cities in lead_cities`);
