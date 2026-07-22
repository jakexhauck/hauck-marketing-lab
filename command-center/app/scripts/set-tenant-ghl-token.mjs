// Set a tenant's GHL token from an env-injected value, verifying access first.
//
// Exists because a tenant row holding a token for the WRONG sub-account is
// indistinguishable from a correct one at the DB layer: both look like real
// creds, so tenantHasGhlCreds() flips to true and the runtime stops falling
// back to the env token. That is exactly how Willis Windows went dark on
// 2026-07-20 (audit id 116) while still looking configured.
//
// So this refuses to write a token that GHL does not accept for that location.
//
// Usage (never pass the token on the command line):
//   doppler run --project hauck-command-center --config prd -- \
//     node scripts/set-tenant-ghl-token.mjs <tenant-slug> <ENV_VAR_HOLDING_TOKEN>
//
// Example:
//   ... -- node scripts/set-tenant-ghl-token.mjs willis-windows GHL_TOKEN

import { readFileSync } from "node:fs";

const [slug, tokenVar] = process.argv.slice(2);
if (!slug || !tokenVar) {
  console.error("usage: set-tenant-ghl-token.mjs <tenant-slug> <ENV_VAR_HOLDING_TOKEN>");
  process.exit(1);
}

// Supabase service creds come from .dev.vars (same project as prod; see
// SUPABASE_URL in Doppler) unless already present in the environment.
const env = { ...process.env };
try {
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  // .dev.vars is optional when the vars are already injected.
}

const token = env[tokenVar];
if (!token) {
  console.error(`${tokenVar} is not set. Run this under \`doppler run -- ...\`.`);
  process.exit(1);
}

const SUPA = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const read = await fetch(
  `${SUPA}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=id,name,ghl_location_id`,
  { headers },
);
const [tenant] = await read.json();
if (!tenant) {
  console.error(`No tenant with slug "${slug}".`);
  process.exit(1);
}

// Verify BEFORE writing. A 401/403 here means this token belongs to a
// different sub-account, which is the failure mode this script exists to stop.
const probe = await fetch(
  `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${encodeURIComponent(tenant.ghl_location_id)}`,
  { headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json" } },
);
if (!probe.ok) {
  console.error(
    `REFUSED: ${tokenVar} has no access to ${tenant.name} (${tenant.ghl_location_id}). ` +
      `GHL returned ${probe.status}. Nothing was written.`,
  );
  process.exit(1);
}
const names = ((await probe.json()).pipelines ?? []).map((p) => p.name);
console.log(`verified: ${tokenVar} reads ${names.length} pipelines for ${tenant.name}`);

const write = await fetch(`${SUPA}/rest/v1/tenants?id=eq.${tenant.id}`, {
  method: "PATCH",
  headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ ghl_token: token }),
});
if (!write.ok) {
  console.error(`write failed: ${write.status} ${await write.text()}`);
  process.exit(1);
}
console.log(`written: ${tenant.name}.ghl_token now holds ${tokenVar}`);
console.log(`pipelines: ${names.join(" | ")}`);
