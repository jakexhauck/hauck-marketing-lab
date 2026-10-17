import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitBrains } from "../src/git.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "brains-git-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "README.md"), "x\n");
  git(dir, "add", "README.md");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

describe("commitBrains", () => {
  it("commits only the brain paths and leaves Jake's work alone", async () => {
    const dir = repo();
    mkdirSync(join(dir, "vault", "Clients", "Willis Windows"), { recursive: true });
    const brain = join(dir, "vault", "Clients", "Willis Windows", "Brain.md");
    writeFileSync(brain, "- lesson\n");
    // Jake's own work in the same checkout: one file staged, one not.
    writeFileSync(join(dir, "staged.txt"), "mine\n");
    git(dir, "add", "staged.txt");
    writeFileSync(join(dir, "README.md"), "edited by Jake\n");

    const ok = await commitBrains([brain], "1 lessons (ads, Willis Windows)", { cwd: dir });
    expect(ok).toBe(true);
    expect(git(dir, "log", "-1", "--format=%s").trim()).toBe("brain: 1 lessons (ads, Willis Windows)");
    expect(git(dir, "show", "--name-only", "--format=", "HEAD").trim()).toBe(
      "vault/Clients/Willis Windows/Brain.md",
    );
    const status = git(dir, "status", "--porcelain");
    expect(status).toContain("A  staged.txt");
    expect(status).toContain(" M README.md");
  });

  it("returns false when nothing changed", async () => {
    const dir = repo();
    expect(await commitBrains([join(dir, "README.md")], "0 lessons", { cwd: dir })).toBe(false);
    expect(await commitBrains([], "0 lessons", { cwd: dir })).toBe(false);
  });

  it("passes an explicit pathspec and never -A", async () => {
    const calls: string[][] = [];
    const ok = await commitBrains(["vault/Agents/Ads/Brain.md"], "2 lessons (ads, agency)", {
      cwd: "/repo",
      git: async (args) => {
        calls.push(args);
        return args[0] === "status" ? " M vault/Agents/Ads/Brain.md\n" : "";
      },
    });
    expect(ok).toBe(true);
    for (const args of calls) {
      expect(args).not.toContain("-A");
      expect(args).not.toContain("--all");
      expect(args).not.toContain(".");
    }
    expect(calls.find((a) => a[0] === "add")).toEqual(["add", "--", "vault/Agents/Ads/Brain.md"]);
    expect(calls.find((a) => a[0] === "commit")!.slice(-2)).toEqual(["--", "vault/Agents/Ads/Brain.md"]);
  });
});
