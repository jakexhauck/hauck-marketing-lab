import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deployDraft,
  draftBranch,
  ensureProject,
  liveUrlOf,
  parseDeployUrl,
  parseDeployUrls,
  projectName,
  promote,
  snapshotSite,
  type WranglerExec,
} from "../src/pages.ts";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const ITEM = "1234abcd-5678-4ef0-9abc-def012345678";

// Records every wrangler call and answers from a script, one entry per call.
function fakeExec(answers: { code: number; stdout?: string; stderr?: string }[]) {
  const calls: { args: string[]; cwd: string }[] = [];
  const exec: WranglerExec = async (args, cwd) => {
    calls.push({ args, cwd });
    const a = answers.shift() ?? { code: 0 };
    return { code: a.code, stdout: a.stdout ?? "", stderr: a.stderr ?? "" };
  };
  return { exec, calls };
}

describe("parseDeployUrl", () => {
  it("reads the branch alias off a real draft deploy", () => {
    expect(parseDeployUrl(fixture("wrangler-deploy-draft.txt"))).toBe("https://d-1234abcd.hm-zz-test.pages.dev");
  });

  it("falls back to the deployment URL when there is no alias line", () => {
    const out = fixture("wrangler-deploy-draft.txt").split("\n").filter((l) => !/alias/i.test(l)).join("\n");
    expect(parseDeployUrl(out)).toBe("https://5d1df8db.hm-zz-test.pages.dev");
  });

  it("gives both URLs apart", () => {
    expect(parseDeployUrls(fixture("wrangler-deploy-draft.txt"))).toEqual({
      deployment: "https://5d1df8db.hm-zz-test.pages.dev",
      alias: "https://d-1234abcd.hm-zz-test.pages.dev",
    });
  });

  it("is null for output with no pages.dev URL", () => {
    expect(parseDeployUrl(fixture("wrangler-create-exists.txt"))).toBeNull();
    expect(parseDeployUrl("Take a peek over at https://evil.example.com")).toBeNull();
    expect(parseDeployUrl("")).toBeNull();
  });

  it("ignores colour codes around the URL", () => {
    expect(parseDeployUrl("\u001b[1mDeployment alias URL: https://d-1.hm-a.pages.dev\u001b[0m")).toBe("https://d-1.hm-a.pages.dev");
  });
});

describe("names", () => {
  it("prefixes the client slug", () => {
    expect(projectName("clear-choice-windows")).toBe("hm-clear-choice-windows");
  });

  it("refuses a slug that is not a plain slug", () => {
    for (const bad of ["", "Clear Choice", "a/b", "../x", "-x", "a".repeat(60)]) expect(() => projectName(bad), bad).toThrow();
  });

  it("names a draft branch from the item id", () => {
    expect(draftBranch(ITEM)).toBe("d-1234abcd");
    expect(() => draftBranch("nope")).toThrow();
  });

  it("finds the live URL one label up from a deploy URL", () => {
    expect(liveUrlOf("https://5d1df8db.hm-zz-test.pages.dev")).toBe("https://hm-zz-test.pages.dev");
    expect(liveUrlOf("https://hm-zz-test.pages.dev")).toBeNull();
    expect(liveUrlOf("https://a.b.example.com")).toBeNull();
  });
});

describe("ensureProject", () => {
  it("creates the project with main as production", async () => {
    const { exec, calls } = fakeExec([{ code: 0, stdout: fixture("wrangler-create-ok.txt") }]);
    await ensureProject("willis", { exec, cwd: "C:/cwd", known: new Set() });
    expect(calls[0].args).toEqual(["pages", "project", "create", "hm-willis", "--production-branch", "main"]);
  });

  it("takes 'already exists' as done", async () => {
    const { exec } = fakeExec([{ code: 1, stdout: fixture("wrangler-create-exists.txt") }]);
    await expect(ensureProject("willis", { exec, cwd: "C:/cwd", known: new Set() })).resolves.toBeUndefined();
  });

  it("retries once on Cloudflare's unknown error, as seen live", async () => {
    const { exec, calls } = fakeExec([
      { code: 1, stdout: fixture("wrangler-create-unknown.txt") },
      { code: 0, stdout: fixture("wrangler-create-ok.txt") },
    ]);
    await ensureProject("willis", { exec, cwd: "C:/cwd", known: new Set() });
    expect(calls).toHaveLength(2);
  });

  it("throws when it still fails", async () => {
    const { exec } = fakeExec([
      { code: 1, stdout: fixture("wrangler-create-unknown.txt") },
      { code: 1, stdout: fixture("wrangler-create-unknown.txt") },
    ]);
    await expect(ensureProject("willis", { exec, cwd: "C:/cwd", known: new Set() })).rejects.toThrow(/project/);
  });

  it("asks wrangler once per project per run", async () => {
    const known = new Set<string>();
    const { exec, calls } = fakeExec([{ code: 0 }, { code: 0 }]);
    await ensureProject("willis", { exec, cwd: "C:/cwd", known });
    await ensureProject("willis", { exec, cwd: "C:/cwd", known });
    expect(calls).toHaveLength(1);
  });
});

describe("deployDraft and promote", () => {
  it("deploys a draft to its own branch from a runner-owned folder", async () => {
    const { exec, calls } = fakeExec([{ code: 0 }, { code: 0, stdout: fixture("wrangler-deploy-draft.txt") }]);
    const r = await deployDraft("zz-test", ITEM, "C:/sites/zz-test/x", { exec, cwd: "C:/cwd", known: new Set() });
    expect(r).toEqual({ previewUrl: "https://d-1234abcd.hm-zz-test.pages.dev" });
    expect(calls[1].args).toEqual([
      "pages",
      "deploy",
      "C:/sites/zz-test/x",
      "--project-name",
      "hm-zz-test",
      "--branch",
      "d-1234abcd",
      "--commit-dirty=true",
    ]);
    // Never the site folder: wrangler builds a ./functions folder it finds in
    // its working folder into server code.
    expect(calls[1].cwd).toBe("C:/cwd");
  });

  it("throws with the tail of wrangler's output when the deploy fails", async () => {
    const { exec } = fakeExec([{ code: 0 }, { code: 1, stderr: "Authentication error" }]);
    await expect(deployDraft("zz-test", ITEM, "C:/d", { exec, cwd: "C:/cwd", known: new Set() })).rejects.toThrow(/Authentication error/);
  });

  it("throws when the deploy prints no URL", async () => {
    const { exec } = fakeExec([{ code: 0 }, { code: 0, stdout: "done" }]);
    await expect(deployDraft("zz-test", ITEM, "C:/d", { exec, cwd: "C:/cwd", known: new Set() })).rejects.toThrow(/URL/);
  });

  it("promotes to main and answers the project's own URL", async () => {
    const prod = fixture("wrangler-deploy-draft.txt").split("\n").filter((l) => !/alias/i.test(l)).join("\n");
    const { exec, calls } = fakeExec([{ code: 0 }, { code: 0, stdout: prod }]);
    const r = await promote("zz-test", "C:/d", { exec, cwd: "C:/cwd", known: new Set() });
    expect(r).toEqual({ liveUrl: "https://hm-zz-test.pages.dev" });
    expect(calls[1].args).toContain("main");
  });
});

describe("snapshotSite", () => {
  function site() {
    const root = mkdtempSync(join(tmpdir(), "site-"));
    const src = join(root, "src");
    mkdirSync(join(src, "img"), { recursive: true });
    writeFileSync(join(src, "index.html"), "<h1>Hi</h1>");
    writeFileSync(join(src, "style.css"), "h1{}");
    writeFileSync(join(src, "img", "a.png"), "png");
    return { root, src, dest: join(root, "out", "item") };
  }

  it("copies the static files", () => {
    const { src, dest } = site();
    expect(snapshotSite(src, dest)).toEqual({ files: 3 });
    expect(readFileSync(join(dest, "img", "a.png"), "utf8")).toBe("png");
  });

  it("leaves out anything Pages would run as code or treat as config", () => {
    const { src, dest } = site();
    writeFileSync(join(src, "_worker.js"), "export default {}");
    writeFileSync(join(src, "_redirects"), "/ https://evil.example 302");
    writeFileSync(join(src, "_headers"), "/*\n  x: y");
    writeFileSync(join(src, "_routes.json"), "{}");
    mkdirSync(join(src, "functions"));
    writeFileSync(join(src, "functions", "x.js"), "x");
    mkdirSync(join(src, "_worker.js.d"));
    writeFileSync(join(src, "_worker.js.d", "index.js"), "x");
    writeFileSync(join(src, "run.exe"), "x");
    snapshotSite(src, dest);
    for (const f of ["_worker.js", "_redirects", "_headers", "_routes.json", "functions", "_worker.js.d", "run.exe"]) {
      expect(existsSync(join(dest, f)), f).toBe(false);
    }
  });

  it("starts the snapshot clean, so a removed file does not linger", () => {
    const { src, dest } = site();
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "old.html"), "old");
    snapshotSite(src, dest);
    expect(existsSync(join(dest, "old.html"))).toBe(false);
  });

  it("refuses a site with no index.html", () => {
    const { src, dest, root } = site();
    const empty = join(root, "empty");
    mkdirSync(empty);
    expect(() => snapshotSite(empty, dest)).toThrow(/index\.html/);
    expect(() => snapshotSite(join(src, "missing"), dest)).toThrow();
  });

  it("does not follow links out of the folder", () => {
    const { src, dest, root } = site();
    writeFileSync(join(root, "secret.txt"), "secret");
    try {
      symlinkSync(join(root, "secret.txt"), join(src, "leak.txt"));
    } catch {
      return; // Windows without the symlink privilege: nothing to check.
    }
    snapshotSite(src, dest);
    expect(existsSync(join(dest, "leak.txt"))).toBe(false);
  });

  it("refuses a site over the size cap", () => {
    const { src, dest } = site();
    writeFileSync(join(src, "big.mp4"), Buffer.alloc(1024 * 1024 + 1));
    expect(() => snapshotSite(src, dest, { maxBytes: 1024 * 1024 })).toThrow(/too big/);
  });
});
