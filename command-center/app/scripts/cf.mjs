// Cloudflare Pages control via the API: set env vars / secrets and watch
// deploys, so the CF dashboard never needs opening for routine work.
//
// Setup (once): put a Cloudflare API token in .env.local as
//   CLOUDFLARE_API_TOKEN=...
// Token needs: Account > Cloudflare Pages > Edit (and Account > Account
// Settings > Read so the account id can self-discover; or set
// CLOUDFLARE_ACCOUNT_ID explicitly).
//
// Usage:
//   node scripts/cf.mjs whoami                 # verify token + show account/project
//   node scripts/cf.mjs env:list               # list production env vars (values hidden)
//   node scripts/cf.mjs env:set KEY value      # set/replace a production env var
//   node scripts/cf.mjs env:set KEY value --secret   # store as an encrypted secret
//   node scripts/cf.mjs env:unset KEY          # remove a production env var
//   node scripts/cf.mjs deploy:list            # recent deployments + status
//   node scripts/cf.mjs deploy:watch [sha]     # poll until the deploy (matching sha, or latest) finishes
//
// Note: changing an env var does NOT redeploy. The next push (or deploy:retry)
// picks it up. Project defaults to wrangler.toml's name; override with CF_PAGES_PROJECT.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.cloudflare.com/client/v4";

function loadEnv() {
  const env = { ...process.env };
  const file = join(APP_DIR, ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      if (env[k] === undefined) env[k] = t.slice(eq + 1).trim();
    }
  }
  return env;
}

function die(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

const env = loadEnv();
const token = env.CLOUDFLARE_API_TOKEN;
if (!token) {
  die(
    "CLOUDFLARE_API_TOKEN missing. Add it to command-center/app/.env.local\n" +
      "  Cloudflare dashboard > My Profile > API Tokens > Create Token\n" +
      "  Permissions: Account > Cloudflare Pages > Edit",
  );
}

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
  if (!accounts?.length) die("token sees no accounts");
  if (accounts.length > 1) {
    die(
      "multiple accounts visible; set CLOUDFLARE_ACCOUNT_ID in .env.local. Options:\n" +
        accounts.map((a) => `  ${a.id}  ${a.name}`).join("\n"),
    );
  }
  return accounts[0].id;
}

function projectPath(acct) {
  if (!PROJECT) die("project name unknown; set CF_PAGES_PROJECT in .env.local");
  return `/accounts/${acct}/pages/projects/${PROJECT}`;
}

async function getProductionEnv(acct) {
  const project = await cf(projectPath(acct));
  return project?.deployment_configs?.production?.env_vars ?? {};
}

async function patchProductionEnv(acct, envVars) {
  await cf(projectPath(acct), {
    method: "PATCH",
    body: JSON.stringify({ deployment_configs: { production: { env_vars: envVars } } }),
  });
}

const ok = (m) => console.log(`\x1b[32m✓ ${m}\x1b[0m`);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const acct = await accountId();

  switch (cmd) {
    case "whoami": {
      console.log(`account: ${acct}`);
      console.log(`project: ${PROJECT}`);
      const project = await cf(projectPath(acct));
      console.log(`domains: ${(project.domains ?? []).join(", ") || "(none)"}`);
      break;
    }
    case "env:list": {
      const vars = await getProductionEnv(acct);
      const keys = Object.keys(vars);
      if (!keys.length) return console.log("(no production env vars)");
      for (const k of keys.sort()) {
        const type = vars[k]?.type === "secret_text" ? "secret" : "plain";
        console.log(`${k}  [${type}]`);
      }
      break;
    }
    case "env:set": {
      const [key, value] = rest;
      const secret = rest.includes("--secret");
      if (!key || value === undefined) die("usage: env:set KEY value [--secret]");
      const vars = await getProductionEnv(acct);
      // FOOTGUN: Cloudflare's GET never returns existing secret *values*, so
      // re-PATCHing this whole map rewrites every OTHER secret_text var with an
      // empty value and blanks them (the recurring "login unavailable" outage).
      // Only safe when no other secrets exist. To restore/rotate a secret, use
      // `node scripts/cf-rebind.mjs` instead, which sends all values at once.
      const otherSecrets = Object.entries(vars).filter(
        ([k, c]) => k !== key && c?.type === "secret_text",
      );
      if (secret === false && vars[key]?.type === "secret_text") {
        die(`${key} is a secret; pass --secret (setting it plain would expose it)`);
      }
      if (otherSecrets.length) {
        die(
          `refusing: this would blank ${otherSecrets.length} other secret(s) ` +
            `(${otherSecrets.map(([k]) => k).join(", ")}).\n` +
            `  Use: node scripts/cf-rebind.mjs   (rebinds every secret from .env.local in one safe PATCH)`,
        );
      }
      vars[key] = { type: secret ? "secret_text" : "plain_text", value };
      await patchProductionEnv(acct, vars);
      ok(`set ${key} (${secret ? "secret" : "plain"}). Redeploy to apply.`);
      break;
    }
    case "env:unset": {
      const [key] = rest;
      if (!key) die("usage: env:unset KEY");
      const vars = await getProductionEnv(acct);
      if (!(key in vars)) return console.log(`${key} not set`);
      vars[key] = null; // CF removes a var set to null on PATCH
      await patchProductionEnv(acct, vars);
      ok(`removed ${key}. Redeploy to apply.`);
      break;
    }
    case "deploy:list": {
      const deps = await cf(`${projectPath(acct)}/deployments?per_page=10`);
      for (const d of deps) {
        const status = d.latest_stage?.status ?? "?";
        const sha = (d.deployment_trigger?.metadata?.commit_hash ?? "").slice(0, 7);
        console.log(`${d.created_on}  ${status.padEnd(10)} ${sha}  ${d.url ?? ""}`);
      }
      break;
    }
    case "deploy:watch": {
      const [wantSha] = rest;
      const deadline = Date.now() + 10 * 60 * 1000;
      let printed = "";
      for (;;) {
        const deps = await cf(`${projectPath(acct)}/deployments?per_page=10`);
        const dep = wantSha
          ? deps.find((d) => (d.deployment_trigger?.metadata?.commit_hash ?? "").startsWith(wantSha))
          : deps[0];
        if (!dep) {
          if (Date.now() > deadline) die("no matching deployment found within timeout");
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        const stage = dep.latest_stage?.name ?? "?";
        const status = dep.latest_stage?.status ?? "?";
        const line = `${stage}: ${status}`;
        if (line !== printed) {
          console.log(`→ ${line}`);
          printed = line;
        }
        if (status === "success") return ok(`deployed: ${dep.url}`);
        if (["failure", "canceled", "skipped"].includes(status)) {
          die(`deploy ${status} at stage ${stage} (id ${dep.id})`);
        }
        if (Date.now() > deadline) die("deploy did not finish within 10 min");
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    default:
      console.log(
        "commands: whoami | env:list | env:set KEY value [--secret] | env:unset KEY | deploy:list | deploy:watch [sha]",
      );
  }
}

main().catch((err) => die(err.message));
