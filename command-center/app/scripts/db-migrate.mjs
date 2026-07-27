// Apply pending Supabase migrations via the Management API.
//
// Why this exists: the service-role key cannot run DDL (schema changes), so
// migrations used to be pasted into the Supabase SQL editor by hand. This runs
// them for you. It keeps a ledger table (_hml_migrations) of what has already
// been applied and only runs files not in it, so it is safe to run repeatedly.
//
// Setup (once): put a Supabase Personal Access Token in .env.local as
//   SUPABASE_ACCESS_TOKEN=sbp_...
// (Supabase dashboard > Account > Access Tokens > Generate new token.)
//
// Usage:  npm run db:migrate
//         npm run db:migrate -- --dry-run   (list what would run, change nothing)
//
// The project ref is derived from SUPABASE_URL. The very first run baselines the
// migrations that were applied by hand before this automation existed (BASELINE
// below), so only genuinely new files run against the live database.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(APP_DIR, "supabase", "migrations");
const LEDGER = "public._hml_migrations";

// Migrations applied by hand in the Supabase SQL editor before this runner
// existed. Seeded into the ledger on first run so they are never re-applied.
const BASELINE = [
  "0001_init.sql",
  "0003_admins.sql",
  "0004_ghl_identity_and_test_tenant.sql",
  "0005_activity_read_state.sql",
  "0006_security_fixes.sql",
  "0007_staff_accounts.sql",
  "0008_admin_accounts.sql",
  "0009_subdomain_and_owner_password.sql",
  "0010_global_email_login.sql",
  "0011_notify_audience.sql",
];

// Minimal .env.local loader: split on the first '=' so base64 values survive.
// Real process env wins, so CI / shell exports override the file.
function loadEnv() {
  const env = { ...process.env };
  try {
    const text = readFileSync(join(APP_DIR, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (env[key] === undefined) env[key] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // No .env.local: rely on process env.
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

if (!token) {
  die(
    "SUPABASE_ACCESS_TOKEN missing. Add it to command-center/app/.env.local\n" +
      "  Get one at: Supabase dashboard > Account > Access Tokens > Generate new token",
  );
}
if (!supabaseUrl) die("SUPABASE_URL missing from .env.local");

const ref = new URL(supabaseUrl).hostname.split(".")[0];
const API = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(query) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text).message ?? text;
    } catch {
      // keep raw text
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return text ? JSON.parse(text) : null;
}

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

// --dry-run answers "what would this run?" without touching anything. Worth the
// ten lines: the pending list is derived from a ledger, and a ledger that has
// drifted turns a routine migrate into a replay of old data backfills.
const dryRun = process.argv.slice(2).includes("--dry-run");

async function main() {
  console.log(`→ Project: ${ref}${dryRun ? " (dry run — nothing will be written)" : ""}`);

  const applied = new Set();

  if (dryRun) {
    // Read-only: never create the ledger, never seed the baseline. If the ledger
    // is absent, report what a real run would seed rather than seeding it.
    const [{ ledger }] = await runSql(`select to_regclass(${sqlString(LEDGER)}) as ledger;`);
    if (ledger === null) {
      console.log(`→ No ledger yet. A real run would baseline ${BASELINE.length} migrations.`);
      for (const n of BASELINE) applied.add(n);
    } else {
      for (const r of (await runSql(`select name from ${LEDGER};`)) ?? []) applied.add(r.name);
    }
  } else {
    // Ledger of applied migrations. First time it appears, seed the baseline so
    // the hand-applied migrations are recorded without re-running them.
    await runSql(
      `create table if not exists ${LEDGER} (` +
        `name text primary key, applied_at timestamptz not null default now());`,
    );

    const ledgerRows = await runSql(`select name from ${LEDGER};`);
    for (const r of ledgerRows ?? []) applied.add(r.name);

    if (applied.size === 0) {
      const values = BASELINE.map((n) => `(${sqlString(n)})`).join(",");
      await runSql(
        `insert into ${LEDGER} (name) values ${values} on conflict (name) do nothing;`,
      );
      for (const n of BASELINE) applied.add(n);
      console.log(`→ Baselined ${BASELINE.length} pre-automation migrations.`);
    }
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("\x1b[32m✓ Database is up to date. Nothing to apply.\x1b[0m");
    return;
  }

  if (dryRun) {
    console.log(`→ ${pending.length} pending migration(s):`);
    for (const file of pending) console.log(`    ${file}`);
    console.log("Run without --dry-run to apply them.");
    return;
  }

  for (const file of pending) {
    process.stdout.write(`→ Applying ${file} ... `);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await runSql(sql);
      await runSql(`insert into ${LEDGER} (name) values (${sqlString(file)});`);
      console.log("\x1b[32mok\x1b[0m");
    } catch (err) {
      console.log("\x1b[31mfailed\x1b[0m");
      die(`${file}: ${err.message}`);
    }
  }

  console.log(`\x1b[32m✓ Applied ${pending.length} migration(s).\x1b[0m`);
}

main().catch((err) => die(err.message));
