// Take the demo cold-calling data back out of the production database.
//
//   node scripts/purge-demo-cold-calling.mjs                   # dry run (default)
//   node scripts/purge-demo-cold-calling.mjs --apply           # delete
//   node scripts/purge-demo-cold-calling.mjs --apply --caller  # and the demo login
//
// seed-demo-cold-calling.mjs has a --clean of its own, and this exists anyway
// for two reasons. It predates cold_call_dials (0052), so it leaves every
// recorded dial behind and the tracker keeps counting calls nobody made. And it
// deletes without showing you anything first, which is the wrong shape for a
// destructive job against the only database there is.
//
// So: a dry run by default that prints exactly what it would remove, and
// deletion only when you ask for it in as many words.
//
// What counts as demo, and nothing else does:
//   - leads.source starting "DEMO"        (what the seeder branded them with)
//   - cold_call_dials against those leads (recorded by pressing outcome buttons
//     on them, whoever pressed)
//   - cold_calls tracker days belonging to the demo caller login
//
// A real lead, a real dial and a day you typed yourself are all untouched. In
// particular a tracker day of YOUR OWN is never removed, even one you filled in
// while testing: that is a number you typed, and this script does not get to
// decide it was not meant.
//
// What this CANNOT clean, and you must: contacts these demo leads created in the
// real GoHighLevel account. Pressing an outcome pushes the prospect over there,
// so a handful of 555 numbers are sitting on the live Cold Calling board. This
// script lists them; deleting a contact stays a human decision made inside GHL,
// where it can be seen. That rule is deliberate (see functions/lib/agencyCrm.ts)
// and this script does not get an exception to it.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_EMAIL = "demo.caller@hauckmarketing.invalid";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const INCLUDE_CALLER = args.includes("--caller");

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".dev.vars", ".env.local"]) {
    let text = "";
    try {
      text = readFileSync(join(APP_DIR, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (env[key] === undefined) env[key] = trimmed.slice(eq + 1).trim();
    }
  }
  return env;
}

function die(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

const env = loadEnv();
const token = env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
if (!token) die("SUPABASE_ACCESS_TOKEN missing. Try: doppler run -- node scripts/purge-demo-cold-calling.mjs");
if (!supabaseUrl) die("SUPABASE_URL missing.");

const ref = new URL(supabaseUrl).hostname.split(".")[0];
const API = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(query) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text).message ?? text;
    } catch {
      // keep the raw body
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return text ? JSON.parse(text) : [];
}

const DEMO_LEADS = `select id from public.leads where source like 'DEMO%'`;

async function main() {
  console.log(`→ Project: ${ref}`);
  console.log(APPLY ? "→ APPLYING. Rows will be deleted.\n" : "→ Dry run. Nothing will be deleted.\n");

  // --- What is there -------------------------------------------------------

  const leads = await runSql(
    `select source, count(*)::int as n from public.leads
      where source like 'DEMO%' group by source order by source;`,
  );
  const leadTotal = leads.reduce((sum, r) => sum + r.n, 0);

  const dials = await runSql(
    `select coalesce(a.name,'(unknown)') as caller, count(*)::int as n
       from public.cold_call_dials d
       left join public.admin_accounts a on a.id = d.caller_id
      where d.lead_id in (${DEMO_LEADS}) group by a.name order by a.name;`,
  );
  const dialTotal = dials.reduce((sum, r) => sum + r.n, 0);

  const caller = await runSql(
    `select id, name from public.admin_accounts where email = '${DEMO_EMAIL}';`,
  );
  const demoCaller = caller[0] ?? null;

  const trackerDays = demoCaller
    ? await runSql(
        `select count(*)::int as n from public.cold_calls where caller_id = '${demoCaller.id}';`,
      )
    : [{ n: 0 }];

  const inCrm = await runSql(
    `select first_name, last_name, phone, ghl_contact_id from public.leads
      where source like 'DEMO%' and ghl_contact_id is not null order by last_name;`,
  );

  // --- What would go -------------------------------------------------------

  console.log(`Leads (${leadTotal}):`);
  for (const row of leads) console.log(`    ${String(row.n).padStart(4)}  ${row.source}`);
  if (leadTotal === 0) console.log("       nothing");

  console.log(`\nRecorded dials against them (${dialTotal}):`);
  for (const row of dials) console.log(`    ${String(row.n).padStart(4)}  pressed by ${row.caller}`);
  if (dialTotal === 0) console.log("       nothing");

  console.log(`\nTracker days belonging to the demo caller: ${trackerDays[0].n}`);

  console.log(
    `\nThe "${demoCaller?.name ?? "demo caller"}" login: ` +
      (!demoCaller
        ? "not there"
        : INCLUDE_CALLER
          ? "WILL BE REMOVED (--caller)"
          : "kept (pass --caller to remove it too)"),
  );

  // --- What this script cannot reach ---------------------------------------

  if (inCrm.length > 0) {
    console.log(
      `\n\x1b[33m! ${inCrm.length} of these reached the real GoHighLevel account and must be` +
        ` deleted there by hand:\x1b[0m`,
    );
    for (const c of inCrm) {
      console.log(`    ${`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}  ${c.phone}  ${c.ghl_contact_id}`);
    }
  }

  if (!APPLY) {
    console.log("\nRun again with --apply to delete the above.");
    return;
  }
  if (leadTotal === 0 && dialTotal === 0 && trackerDays[0].n === 0) {
    console.log("\n\x1b[32m✓ Nothing to remove.\x1b[0m");
    return;
  }

  // --- Delete --------------------------------------------------------------
  //
  // Dials first, deliberately. cold_call_dials.lead_id is `on delete set null`
  // so that a dial survives its prospect being purged, which is right for a real
  // lead and wrong here: deleting the leads first would leave seven dials with a
  // null lead_id and no way left to tell they were demo. So they go while the
  // link still exists.

  console.log("");
  const removedDials = await runSql(
    `delete from public.cold_call_dials where lead_id in (${DEMO_LEADS}) returning id;`,
  );
  console.log(`✓ removed ${removedDials.length} recorded dials`);

  if (demoCaller) {
    const removedDays = await runSql(
      `delete from public.cold_calls where caller_id = '${demoCaller.id}' returning id;`,
    );
    console.log(`✓ removed ${removedDays.length} demo tracker days`);
  }

  const removedLeads = await runSql(
    `delete from public.leads where source like 'DEMO%' returning id;`,
  );
  console.log(`✓ removed ${removedLeads.length} demo leads`);

  if (demoCaller && INCLUDE_CALLER) {
    await runSql(`delete from public.admin_accounts where id = '${demoCaller.id}';`);
    console.log(`✓ removed the ${demoCaller.name} login`);
  }

  console.log("\n\x1b[32m✓ Done. Your real leads, dials, tracker days and logins were not touched.\x1b[0m");
  if (inCrm.length > 0) {
    console.log("Remember the GoHighLevel contacts listed above; they are still there.");
  }
}

main().catch((err) => die(err.message));
