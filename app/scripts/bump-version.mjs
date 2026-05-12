#!/usr/bin/env node
// Bump version in app/package.json, app/src-tauri/tauri.conf.json, and app/src-tauri/Cargo.toml.
// Usage: node scripts/bump-version.mjs <new-version>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");

const next = process.argv[2];
if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error("Usage: node scripts/bump-version.mjs <x.y.z>");
  process.exit(1);
}

function bumpJson(path, key = "version") {
  const j = JSON.parse(readFileSync(path, "utf8"));
  const prev = j[key];
  j[key] = next;
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
  console.log(`  ${path}: ${prev} → ${next}`);
}

function bumpCargoToml(path) {
  const t = readFileSync(path, "utf8");
  const out = t.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`);
  writeFileSync(path, out);
  console.log(`  ${path} → ${next}`);
}

console.log(`Bumping to ${next}…`);
bumpJson(join(appRoot, "package.json"));
bumpJson(join(appRoot, "src-tauri/tauri.conf.json"));
bumpCargoToml(join(appRoot, "src-tauri/Cargo.toml"));
console.log("\nDone. Next:");
console.log("  TAURI_SIGNING_PRIVATE_KEY=\"$(cat ~/.tauri/hauck-marketing-lab.key)\" npm run tauri build");
