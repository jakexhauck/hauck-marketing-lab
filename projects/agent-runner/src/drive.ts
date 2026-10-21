// Google Drive on the VPS (docs/build-plans/hermes-agents.md, Task 5).
//
// On the PC every agent reads the client's folder on the Drive for desktop
// mount (G:). The VPS has no mount, so the runner keeps a mirror with rclone:
// the agency folder is copied down on the tenant refresh (every 10 minutes),
// small files only, Google Docs and Sheets as text and CSV so an agent can
// read them. Nothing is ever deleted on either side: copy and copyto only.
//
// Going back up is narrower on purpose. A mirrored Doc is a .txt export, and
// copying the folder back would litter Drive with text copies of every Doc.
// So the runner notes the client folder's files before a turn and uploads
// only what the agent created or changed during it.

import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { AgentId } from "./wire.ts";

export type Exec = (cmd: string, args: string[]) => Promise<string>;

export interface DriveSync {
  // The rclone remote and folder, e.g. "gdrive:🌟 Hauck Marketing".
  remote: string;
  // The local mirror, inside Hermes's data dir so the agents' file tools reach it.
  localRoot: string;
  exec: Exec;
}

export const defaultExec: Exec = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15 * 60_000, maxBuffer: 10_000_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args[0]} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });

// The agents whose job reads and writes client documents.
export function driveAgent(agent: AgentId): boolean {
  return agent === "csm" || agent === "research";
}

export async function pullDrive(d: DriveSync): Promise<void> {
  await d.exec("rclone", ["copy", d.remote, d.localRoot, "--max-size", "20M", "--drive-export-formats", "txt,csv"]);
}

// Every file under dir by its path relative to dir (forward slashes), with its
// modified time. Dot files are rclone's and the OS's, never an agent's work.
export function snapshotFiles(dir: string): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (d: string) => {
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.set(relative(dir, full).split("\\").join("/"), st.mtimeMs);
    }
  };
  walk(dir);
  return out;
}

export function changedSince(dir: string, before: Map<string, number>): string[] {
  const now = snapshotFiles(dir);
  return [...now].filter(([p, t]) => before.get(p) !== t).map(([p]) => p);
}

// Uploads the given files of one client folder to the same place on Drive.
// Returns the ones that went up; a failure is thrown after trying them all.
export async function pushChanged(d: DriveSync, folder: string, files: string[]): Promise<string[]> {
  const rel = relative(d.localRoot, folder).split("\\").join("/");
  const sent: string[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      await d.exec("rclone", ["copyto", `${folder}/${f}`, `${d.remote}/${rel}/${f}`]);
      sent.push(f);
    } catch {
      failed.push(f);
    }
  }
  if (failed.length) throw new Error(`Drive upload failed for ${failed.join(", ")}`);
  return sent;
}
