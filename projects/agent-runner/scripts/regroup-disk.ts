// One-off for the agents regroup (docs/build-plans/four-agents-and-handoffs.md):
// the runner's folders are named after the agent, so the Creative and Landing
// Page work moves into Ads and a client's Manager and Reporting work into the
// CSM. data/sites is keyed by card, not agent, and stays.
//
// Usage: npx tsx scripts/regroup-disk.ts [--dry-run] [--data <runner data folder>]
// (run with the runner stopped; --data defaults to this checkout's data/)
// Nothing is deleted but the old copy-skills folder (rebuilt every turn): an
// entry already in the new folder is kept, and the old one moves beside it as
// "<name>.from-<old folder>".

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../src/config.ts";

const dry = process.argv.includes("--dry-run");
const at = process.argv.indexOf("--data");
const data = at > 0 && process.argv[at + 1] ? process.argv[at + 1] : DATA_DIR;

function target(folder: string): string | null {
  const m = folder.match(/^(creative|landing|reporting|manager)-(.+)$/);
  if (!m) return null;
  const [, agent, slug] = m;
  if (agent === "manager" && slug === "agency") return null;
  return `${agent === "creative" || agent === "landing" ? "ads" : "csm"}-${slug}`;
}

function regroup(root: string): void {
  if (!existsSync(root)) return;
  for (const folder of readdirSync(root)) {
    const to = target(folder);
    if (!to) continue;
    const from = join(root, folder);
    const dest = join(root, to);
    console.log(`${dry ? "would move" : "moving"} ${from} -> ${dest}`);
    if (!dry) mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(from)) {
      // The bundle copies the skills into every work folder each turn, so the
      // old copy is never needed.
      if (entry === "copy-skills") {
        console.log(`  ${entry} (dropped, rebuilt every turn)`);
        if (!dry) rmSync(join(from, entry), { recursive: true, force: true });
        continue;
      }
      const clash = existsSync(join(dest, entry));
      const name = clash ? `${entry}.from-${folder}` : entry;
      console.log(`  ${entry}${clash ? ` (kept beside as ${name})` : ""}`);
      if (!dry) renameSync(join(from, entry), join(dest, name));
    }
    if (!dry) rmdirSync(from);
  }
}

regroup(join(data, "work"));
regroup(join(data, "state"));
