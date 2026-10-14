// Set a staff account's password from the terminal.
//
//   node scripts/set-staff-password.mjs <email> <password>
//
// Why this exists: the Team screen in the app does the same job, but it needs
// somebody signed in as the owner of that client. This is the route for when
// you are standing up a client's logins and do not want to log in as them to
// do it.
//
// It writes the SAME hash format the Workers runtime produces
// (functions/lib/password.ts): PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte
// salt, base64url, stored as pbkdf2$<iterations>$<salt>$<hash>. The iteration
// count is capped at 100k because that is Cloudflare's ceiling; deriving with
// more here would produce a hash the app can verify but never create.
//
// It re-reads and verifies the hash after writing, so a silent no-op (wrong
// email, RLS refusal) fails loudly instead of leaving somebody locked out of an
// account you have just told them the password for.
//
// Credentials come from .env.local / .dev.vars, the same as every other script
// here. Nothing is logged except the row it changed.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const ITERATIONS = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;
const MIN_LENGTH = 8;

function readEnv() {
  const out = { ...process.env };
  for (const file of [".dev.vars", ".env.local"]) {
    const path = join(APP_DIR, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      if (!out[key]) out[key] = t.slice(eq + 1).trim();
    }
  }
  return out;
}

function b64url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s) {
  return Uint8Array.from(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(await derive(password, salt, ITERATIONS))}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const actual = await derive(password, fromB64url(parts[2]), Number(parts[1]));
  return b64url(actual) === parts[3];
}

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("usage: node scripts/set-staff-password.mjs <email> <password>");
  process.exit(1);
}
if (password.length < MIN_LENGTH) {
  console.error(`✗ password must be at least ${MIN_LENGTH} characters (the app enforces the same).`);
  process.exit(1);
}

const env = readEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .dev.vars or .env.local.");
  process.exit(1);
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const found = await db
  .from("staff_accounts")
  .select("id, name, email, role, status, tenant_id")
  .eq("email", email)
  .maybeSingle();

if (found.error) {
  console.error("✗ lookup failed:", found.error.message);
  process.exit(1);
}
if (!found.data) {
  console.error(`✗ no staff account with the email ${email}. Nothing changed.`);
  process.exit(1);
}

const { error } = await db
  .from("staff_accounts")
  .update({ password_hash: await hashPassword(password), updated_at: new Date().toISOString() })
  .eq("id", found.data.id);

if (error) {
  console.error("✗ update failed:", error.message);
  process.exit(1);
}

// Read it back and check the new password actually verifies against what is
// now stored. Telling somebody a password that does not work is worse than
// failing here.
const after = await db
  .from("staff_accounts")
  .select("password_hash, status")
  .eq("id", found.data.id)
  .maybeSingle();

if (!(await verifyPassword(password, after.data?.password_hash))) {
  console.error("✗ wrote a hash the password does not verify against. Do NOT send this password.");
  process.exit(1);
}

console.log(
  `✓ ${found.data.name} <${found.data.email}>  role=${found.data.role}  status=${after.data.status}`,
);
if (after.data.status !== "active") {
  console.log(`  note: this account is ${after.data.status}, so the password alone will not let them in.`);
}
