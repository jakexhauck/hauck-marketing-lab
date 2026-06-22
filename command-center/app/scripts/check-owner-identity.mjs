// Read-only check: confirm every tenant has at least one staff_accounts row with
// role='owner'. Any tenant without one is stuck on the shared-password login and
// cannot use chat (no individual identity).
//
// Output: one line per tenant:
//   OK <slug>
//   MISSING OWNER <slug>
//
// For any MISSING OWNER, add the owner through the existing Team flow or the
// admin staff-import tool before enabling chat for that client.
//
// Usage:  node scripts/check-owner-identity.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  console.error(`\x1b[31mx ${msg}\x1b[0m`);
  process.exit(1);
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) die("SUPABASE_URL missing from .env.local");
if (!serviceRoleKey) die("SUPABASE_SERVICE_ROLE_KEY missing from .env.local");

const REST = `${supabaseUrl}/rest/v1`;

async function restGet(path) {
  const res = await fetch(`${REST}${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  // Fetch all tenants.
  const tenants = await restGet("/tenants?select=id,slug&order=slug.asc");
  if (!Array.isArray(tenants) || tenants.length === 0) {
    console.log("No tenants found.");
    return;
  }

  let missing = 0;
  for (const t of tenants) {
    // Count owner-role staff accounts for this tenant.
    const rows = await restGet(
      `/staff_accounts?select=id&tenant_id=eq.${encodeURIComponent(t.id)}&role=eq.owner&status=eq.active`,
    );
    const count = Array.isArray(rows) ? rows.length : 0;
    if (count > 0) {
      console.log(`\x1b[32mOK\x1b[0m ${t.slug}`);
    } else {
      console.log(`\x1b[33mMISSING OWNER\x1b[0m ${t.slug}`);
      missing++;
    }
  }

  if (missing > 0) {
    console.log(
      `\x1b[33m\n${missing} tenant(s) have no owner account. Add them via the Team flow before enabling chat.\x1b[0m`,
    );
    process.exit(1);
  } else {
    console.log("\x1b[32m\nAll tenants have at least one active owner account.\x1b[0m");
  }
}

main().catch((err) => die(err.message));
