// Delete the landline leads nobody can ever ring.
//
// The Leads page refuses to send a landline, the power dialer refuses to dial
// one, and since 21 August 2026 the table refuses to show one. That left 194
// rows that existed only to be counted. Jake's call: do not show them, delete
// them.
//
// It only ever touches rows the page WOULD have listed: not yet in the CRM, not
// yet sent, and not a mobile. A landline that has already been through a send or
// an export is a record of something that happened, so it is left alone.
//
// Run it AFTER a scrape finishes, not during one. A run still going on writes
// more of these as it works, so a purge mid-scrape is a purge you get to do again
// ten minutes later.
//
//   node scripts/purge-landline-leads.mjs --dry-run     count them, delete nothing
//   node scripts/purge-landline-leads.mjs               write the backup, delete
//   node scripts/purge-landline-leads.mjs --no-backup   delete, leave no file
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. With
// Doppler, from the REPO ROOT:
//
//   doppler run -p hauck-command-center -c prd -- node command-center/app/scripts/purge-landline-leads.mjs
//
// A backup of every deleted row is written beside this script first, because the
// table has no deleted_at column and this is therefore a hard delete.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dryRun = process.argv.includes("--dry-run");

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

// Returns rather than calling process.exit, and the difference is visible.
//
// process.exit kills the process with stdout's bytes still queued on the pipe
// Doppler hands it, and Node 24 on Windows answers that with a libuv assertion
// printed to stderr AFTER the work has succeeded. "Nothing to do" followed by
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" reads exactly like a
// crash, which is how it was read (Jake, 21 August 2026). Letting this return
// lets stdout drain and the process end on its own terms.
async function main() {
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exitCode = 1;
    return;
  }

  const doomed = await (await rest(`cold_sms_outreach_numbers?select=*&${FILTER}`)).json();

  if (doomed.length === 0) {
    console.log("No landline leads waiting. Nothing to do.");
    return;
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
    return;
  }

  // The backup is the only copy of a hard delete, so it is the default and never
  // something you have to remember. --no-backup exists because Jake does not want
  // the files kept once he has read the count, and saying so on the command line
  // beats deleting the file by hand after every run.
  if (!process.argv.includes("--no-backup")) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const backup = resolve(import.meta.dirname, `landline-leads-${stamp}.json`);
    writeFileSync(backup, JSON.stringify(doomed, null, 2));
    console.log(`\nBacked up to ${backup}`);
  }

  // Deleted by id rather than by the filter, so the rows removed are exactly the
  // rows counted above: a scrape finishing while this runs cannot widen it.
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
}

await main();
