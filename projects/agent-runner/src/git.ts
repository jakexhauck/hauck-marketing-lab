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
}

export async function commitBrains(paths: string[], summary: string, opts: CommitOptions): Promise<boolean> {
  const git = opts.git ?? defaultGit;
  // Repo-relative, forward slashes: git accepts absolute paths too, but the
  // relative form is what shows up in the log and is easy to check by eye.
  const specs = [...new Set(paths)].map((p) => (isAbsolute(p) ? relative(opts.cwd, p) : p).replace(/\\/g, "/"));
  if (specs.length === 0) return false;
  const status = await git(["status", "--porcelain", "--", ...specs], opts.cwd);
  if (!status.trim()) return false;
  await git(["add", "--", ...specs], opts.cwd);
  await git(["commit", "-m", `brain: ${summary}`, "--", ...specs], opts.cwd);
  return true;
}
