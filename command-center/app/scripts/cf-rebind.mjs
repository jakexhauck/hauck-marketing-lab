// Rebind production Cloudflare Pages secrets from .env.local in ONE PATCH.
//
// Why this exists: `cf.mjs env:set` fetches the whole production env map and
// PATCHes it back with one key changed. But Cloudflare's GET never returns
// secret *values* (secrets are write-only), so that round-trip rewrites every
// OTHER secret with an empty value and blanks them. That is the recurring
// "login unavailable" outage. This script instead sends every secret's real
// value (read from .env.local) in a single PATCH, so nothing gets blanked, and
// preserves the plain build vars (NODE_VERSION, etc.) as-is.
//
// Source of truth for the values: Doppler if available (preferred), else
// .env.local. Pass --from-doppler to force Doppler.
//
// Usage (from command-center/app):
//   node scripts/cf-rebind.mjs --dry            # preview, write nothing
//   node scripts/cf-rebind.mjs                  # apply, then redeploy to pick it up
//   node scripts/cf-rebind.mjs --from-doppler   # pull values from Doppler, not .env.local
//   node scripts/cf-rebind.mjs --add A,B        # also bind NEW secrets not yet in production
//
// It only rebinds keys that ALREADY exist in production AND have a value in the
// chosen source. Secrets missing from the source are listed so you can add them
// and rerun. Values are never printed.
//
// --add exists because there is otherwise no safe way to introduce a brand new
// secret: `cf.mjs env:set` blanks every other secret on the way through, and
// this script alone only ever touches keys production already knows about. The
// added keys ride along in the same single PATCH, so nothing else is disturbed.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.cloudflare.com/client/v4";
const DRY = process.argv.includes("--dry");
const FROM_DOPPLER = process.argv.includes("--from-doppler");
// --add KEY,KEY (or --add=KEY,KEY): secrets to create that production lacks.
const ADD = (() => {
  const i = process.argv.findIndex((a) => a === "--add" || a.startsWith("--add="));
  if (i < 0) return [];
  const raw = process.argv[i].startsWith("--add=")
    ? process.argv[i].slice("--add=".length)
    : process.argv[i + 1];
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
})();

function readDotEnv() {
  const out = {};
  const file = join(APP_DIR, ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
  return out;
}

// Doppler scopes its project/config to an absolute path, so a git worktree at a
// different path inherits nothing and the download fails with "You must specify
// a project". doppler.yaml is committed, so read the scope from there and pass
// it explicitly. Keeps this script runnable from any worktree.
function dopplerScope() {
  try {
    const yaml = readFileSync(join(APP_DIR, "doppler.yaml"), "utf8");
    const project = yaml.match(/^\s*project:\s*(\S+)/m)?.[1];
    const config = yaml.match(/^\s*config:\s*(\S+)/m)?.[1];
    return project && config ? ["--project", project, "--config", config] : [];
  } catch {
    return [];
  }
}

// Pull every secret value from Doppler as JSON. Needs the `doppler` CLI + either
// an authenticated `doppler setup` in this dir or DOPPLER_TOKEN in the env.
function readDoppler() {
  const raw = execFileSync(
    "doppler",
    ["secrets", "download", "--no-file", "--format", "json", ...dopplerScope()],
    { cwd: APP_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(raw);
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = typeof v === "object" && v ? v.computed ?? v.raw ?? "" : v;
  }
  return out;
}

function loadEnv() {
  const env = { ...process.env };
  let source = ".env.local";
  let values = readDotEnv();
  const dopplerReady =
    FROM_DOPPLER || (values.SUPABASE_URL === undefined && !!env.DOPPLER_TOKEN);
  if (dopplerReady) {
    try {
      values = readDoppler();
      source = "Doppler";
    } catch (e) {
      if (FROM_DOPPLER) die(`Doppler read failed: ${e.message}`);
    }
  }
  for (const [k, v] of Object.entries(values)) {
    if (env[k] === undefined) env[k] = typeof v === "string" ? v.trim() : v;
  }
  env.__SOURCE__ = source;
  return env;
}

function die(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

const env = loadEnv();
const token = env.CLOUDFLARE_API_TOKEN;
if (!token) die("CLOUDFLARE_API_TOKEN missing in .env.local");

const PROJECT =
  env.CF_PAGES_PROJECT ||
  (() => {
    try {
      const toml = readFileSync(join(APP_DIR, "wrangler.toml"), "utf8");
      return toml.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? null;
    } catch {
      return null;
    }
  })();

async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const err = json?.errors?.map((e) => e.message).join("; ") || `${res.status}`;
    throw new Error(err);
  }
  return json.result;
}

async function accountId() {
  if (env.CLOUDFLARE_ACCOUNT_ID) return env.CLOUDFLARE_ACCOUNT_ID;
  const accounts = await cf("/accounts?per_page=50");
  if (accounts?.length === 1) return accounts[0].id;
  die("set CLOUDFLARE_ACCOUNT_ID in .env.local");
}

async function main() {
  if (!PROJECT) die("project name unknown; set CF_PAGES_PROJECT in .env.local");
  const acct = await accountId();
  const projectPath = `/accounts/${acct}/pages/projects/${PROJECT}`;
  const project = await cf(projectPath);
  const current = project?.deployment_configs?.production?.env_vars ?? {};

  const payload = {};
  const setSecrets = [];
  const preservedPlain = [];
  const missingSecrets = [];

  for (const [key, cfg] of Object.entries(current)) {
    if (cfg?.type === "secret_text") {
      if (env[key] !== undefined && env[key] !== "") {
        payload[key] = { type: "secret_text", value: env[key] };
        setSecrets.push(key);
      } else {
        // No value available to restore. Leave it out of the payload so we
        // never overwrite it, and report it for a manual set.
        missingSecrets.push(key);
      }
    } else {
      // Plain build var: keep exactly as-is so a full-map PATCH can't drop it.
      payload[key] = { type: "plain_text", value: env[key] ?? cfg?.value ?? "" };
      preservedPlain.push(key);
    }
  }

  // New secrets production has never seen. Refuse rather than bind a blank:
  // a silently empty secret reads as "configured" and fails at the call site.
  const addedSecrets = [];
  for (const key of ADD) {
    if (key in current) continue; // already handled by the rebind loop above
    if (env[key] === undefined || env[key] === "") {
      die(`--add ${key}: no value in ${env.__SOURCE__}. Add it there and rerun.`);
    }
    payload[key] = { type: "secret_text", value: env[key] };
    addedSecrets.push(key);
  }

  console.log(`project: ${PROJECT}  (${(project.domains ?? []).join(", ")})`);
  console.log(`source:  ${env.__SOURCE__}`);
  console.log(`\nwill SET ${setSecrets.length} secrets from ${env.__SOURCE__}:`);
  console.log("  " + (setSecrets.sort().join(", ") || "(none)"));
  if (addedSecrets.length) {
    console.log(`\nwill ADD ${addedSecrets.length} new secrets:`);
    console.log("  " + addedSecrets.sort().join(", "));
  }
  console.log(`\nwill PRESERVE ${preservedPlain.length} plain vars:`);
  console.log("  " + (preservedPlain.sort().join(", ") || "(none)"));
  if (missingSecrets.length) {
    console.log(
      `\n\x1b[33m⚠ ${missingSecrets.length} secrets are NOT in ${env.__SOURCE__} and will be left untouched (still blank if the outage wiped them):\x1b[0m`,
    );
    console.log("  " + missingSecrets.sort().join(", "));
    console.log(
      `  → add their real values to ${env.__SOURCE__} and rerun to restore them in the same safe PATCH.`,
    );
  }

  if (DRY) {
    console.log("\n(dry run: nothing written)");
    return;
  }

  await cf(projectPath, {
    method: "PATCH",
    body: JSON.stringify({ deployment_configs: { production: { env_vars: payload } } }),
  });
  const added = addedSecrets.length ? `, added ${addedSecrets.length}` : "";
  console.log(`\n\x1b[32m✓ rebound ${setSecrets.length} secrets${added}. Redeploy to apply.\x1b[0m`);
}

main().catch((e) => die(e.message));
