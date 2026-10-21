// Committing brain notes.
//
// The runner works in Jake's own checkout, where he may have half-finished work
// staged or unstaged at any moment. So it commits ONLY the brain files it just
// wrote, named one by one: `git add -- <paths>` then `git commit -- <paths>`.
// The pathspec on the commit matters as much as the one on the add. Without it,
// whatever Jake had staged would ride along in a "brain:" commit. Never -A,
// never ".", never --all.

import { execFile } from "node:child_process";
import { isAbsolute, relative } from "node:path";

export type GitRunner = (args: string[], cwd: string) => Promise<string>;

const defaultGit: GitRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile("git", args, { cwd, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });

export interface CommitOptions {
  cwd: string;
  git?: GitRunner;
  // The VPS runner's own clone (AGENT_GIT_PUSH=1): after the commit, pull with
  // rebase and push, so the lesson reaches origin and Jake's checkout. Never on
  // Jake's PC, where pushing is his call.
  push?: boolean;
}

// One commit at a time. The heartbeat's queued edits and a chat's lessons can
// land together, and two git commits at once fight over .git/index.lock.
let queue: Promise<unknown> = Promise.resolve();

export function commitBrains(paths: string[], summary: string, opts: CommitOptions): Promise<boolean> {
  const run = queue.then(() => commitNow(paths, summary, opts));
  queue = run.catch(() => {});
  return run;
}

async function commitNow(paths: string[], summary: string, opts: CommitOptions): Promise<boolean> {
  const git = opts.git ?? defaultGit;
  // Repo-relative, forward slashes: git accepts absolute paths too, but the
  // relative form is what shows up in the log and is easy to check by eye.
  const specs = [...new Set(paths)].map((p) => (isAbsolute(p) ? relative(opts.cwd, p) : p).replace(/\\/g, "/"));
  if (specs.length === 0) return false;
  const status = await git(["status", "--porcelain", "--", ...specs], opts.cwd);
  if (!status.trim()) return false;
  await git(["add", "--", ...specs], opts.cwd);
  await git(["commit", "-m", `brain: ${summary}`, "--", ...specs], opts.cwd);
  if (opts.push) await pushWithRetry(git, opts.cwd);
  return true;
}

// Jake (or the PC runner) may have pushed since the last pull, so a push can
// be rejected once for being behind. One more pull and push covers that; past
// that the lesson stays committed here and goes up with the next push.
async function pushWithRetry(git: GitRunner, cwd: string): Promise<void> {
  let last: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await git(["pull", "--rebase", "-q"], cwd);
      await git(["push", "-q"], cwd);
      return;
    } catch (e) {
      last = e as Error;
    }
  }
  throw new Error(`brain committed here but not pushed: ${last?.message}`);
}

// Brings the VPS clone up to date (Jake's Obsidian edits, Profile and Memory
// notes), in the same queue as commits so the two never share .git/index.lock.
export function pullRepo(opts: { cwd: string; git?: GitRunner }): Promise<void> {
  const git = opts.git ?? defaultGit;
  const run = queue.then(() => git(["pull", "--rebase", "-q"], opts.cwd)).then(() => {});
  queue = run.catch(() => {});
  return run;
}
