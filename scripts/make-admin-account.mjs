#!/usr/bin/env node
// Generate the SQL to create a super-admin login (admin_accounts) for the
// Command Center. The password hash matches the app's scheme exactly
// (PBKDF2-HMAC-SHA256, 100k iterations) so the admin can sign in via
// /api/auth/admin-login. No dependencies; uses Node's built-in WebCrypto.
//
// Usage:
//   node scripts/make-admin-account.mjs "Jake Hauck" jake@hauckmarketing.com "a-strong-password"
//
// Then paste the printed INSERT into the Supabase SQL editor. The plaintext
// password is NEVER written to disk or git; only the hash is emitted.

const ITERATIONS = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;

function b64urlEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return Buffer.from(s, "binary").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, HASH_BITS,
  );
  const hash = new Uint8Array(bits);
  return `pbkdf2$${ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error('Usage: node scripts/make-admin-account.mjs "<name>" <email> "<password>"');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const hash = await hashPassword(password);
const cleanEmail = email.trim().toLowerCase();

console.log(`
-- Super-admin login for the Command Center. Run once in the Supabase SQL editor.
-- Sign in via the Admin tab with this email + the password you supplied.
insert into public.admin_accounts (email, password_hash, name, status)
values ('${sqlEscape(cleanEmail)}', '${hash}', '${sqlEscape(name)}', 'active')
on conflict (lower(email)) do update
  set password_hash = excluded.password_hash,
      name = excluded.name,
      status = 'active';
`);
