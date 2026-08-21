// Delete the landline leads nobody can ever ring.
//
// The Leads page refuses to send a landline, the power dialer refuses to dial
// one, and since 21 August 2026 the table refuses to show one. That left 126
// rows that existed only to be counted. Jake's call: do not show them, delete
// them.
//
// It only ever touches rows the page WOULD have listed: not yet in the CRM, not
// yet sent, and not a mobile. A landline that has already been through a send or
// an export is a record of something that happened, so it is left alone.
//
//   node scripts/purge-landline-leads.mjs --dry-run   count them, delete nothing
//   node scripts/purge-landline-leads.mjs             write the backup, delete
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. With
// Doppler that is:
//
//   doppler run -p hauck-command-center -c prd -- node scripts/purge-landline-leads.mjs
//
// A backup of every deleted row is written beside this script first, because the
// table has no deleted_at column and this is therefore a hard delete.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dryRun = process.argv.includes("--dry-run");

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

// The page's own base query, minus the wireless rule and then inverted: exactly
// the rows the table used to show and now hides.
const FILTER =
  "in_crm=eq.false&send_status=eq.pending&or=(line_type.is.null,line_type.neq.wireless)";

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res;
}

const doomed = await (await rest(`cold_sms_outreach_numbers?select=*&${FILTER}`)).json();

if (doomed.length === 0) {
  console.log("No landline leads waiting. Nothing to do.");
  process.exit(0);
}

const byType = doomed.reduce((acc, r) => {
  const k = r.line_type ?? "unknown";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
console.log(`${doomed.length} landline leads would go:`);
for (const [type, n] of Object.entries(byType)) console.log(`  ${type}: ${n}`);

if (dryRun) {
  console.log("\nDry run. Nothing deleted.");
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const backup = resolve(import.meta.dirname, `landline-leads-${stamp}.json`);
writeFileSync(backup, JSON.stringify(doomed, null, 2));
console.log(`\nBacked up to ${backup}`);

// Deleted by id rather than by the filter, so the rows removed are exactly the
// rows in the backup: a scrape finishing while this runs cannot widen it.
const ids = doomed.map((r) => r.id);
const CHUNK = 100;
let gone = 0;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  await rest(`cold_sms_outreach_numbers?id=in.(${slice.join(",")})`, { method: "DELETE" });
  gone += slice.length;
  console.log(`  deleted ${gone}/${ids.length}`);
}

console.log(`\nDone. ${gone} landline leads deleted.`);
