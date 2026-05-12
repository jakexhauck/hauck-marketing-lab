#!/usr/bin/env node
// Build a latest.json updater manifest from signed bundles.
//
// Run AFTER `npm run tauri build` has produced the bundles on each OS, and
// after you have collected the bundles from both Mac and Windows into a single
// release directory. The release URLs in the manifest assume the bundles are
// uploaded to a GitHub Release tagged `v<version>` on
// github.com/jakexhauck/hauck-marketing-lab.
//
// Usage:
//   node scripts/make-latest-json.mjs <release-dir> [--notes "release notes"]
//
// <release-dir> should contain the signed bundles for the platforms you want
// to ship. The script picks them up by filename pattern.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const tauriConf = JSON.parse(readFileSync(join(appRoot, "src-tauri/tauri.conf.json"), "utf8"));
const version = tauriConf.version;

const args = process.argv.slice(2);
const releaseDir = args[0];
if (!releaseDir) {
  console.error("Usage: node scripts/make-latest-json.mjs <release-dir> [--notes \"...\"]");
  process.exit(1);
}
const notesIdx = args.indexOf("--notes");
const notes = notesIdx >= 0 ? args[notesIdx + 1] : "";

const REPO = "jakexhauck/hauck-marketing-lab";
const tag = `v${version}`;
const releaseUrl = (filename) =>
  `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(filename)}`;

const files = readdirSync(releaseDir);

function readSig(bundle) {
  const sigPath = join(releaseDir, `${bundle}.sig`);
  if (!existsSync(sigPath)) {
    throw new Error(`Missing signature file: ${sigPath}`);
  }
  return readFileSync(sigPath, "utf8").trim();
}

const platforms = {};

// macOS — both arm64 and intel come out as <name>.app.tar.gz with a "_aarch64" or "_x64" hint
// in the parent directory, but the file name itself is the same. Distinguish by parent dir
// or by user copying with platform suffix. We just match all `.app.tar.gz` and let the user
// rename when collecting bundles.
const macFiles = files.filter((f) => f.endsWith(".app.tar.gz"));
for (const f of macFiles) {
  // Convention: rename to include arch when collecting, e.g.
  //   Hauck-Marketing-Lab_aarch64.app.tar.gz
  //   Hauck-Marketing-Lab_x64.app.tar.gz
  const arch = f.includes("aarch64") ? "darwin-aarch64" : "darwin-x86_64";
  platforms[arch] = { signature: readSig(f), url: releaseUrl(f) };
}

// Windows — NSIS .exe is the default updater format in Tauri v2
const winFiles = files.filter((f) => f.endsWith("-setup.exe") || f.endsWith(".nsis.zip"));
for (const f of winFiles) {
  platforms["windows-x86_64"] = { signature: readSig(f), url: releaseUrl(f) };
}

if (Object.keys(platforms).length === 0) {
  console.error("No bundles found in release dir. Expected files like *.app.tar.gz or *-setup.exe.");
  process.exit(1);
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

const outPath = join(releaseDir, "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log("Platforms:", Object.keys(platforms).join(", "));
console.log("\nNext:");
console.log(`  gh release create ${tag} ${releaseDir}/* --title "${tag}" --notes "${notes || tag}"`);
