import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { snapshotDir } from "../src/landing.ts";
import { handleClaim, type RunnerDeps } from "../src/runner.ts";
import type { ClaimResponse, ClaimTenant, Grant } from "../src/wire.ts";
import { fakeApi, fakeId } from "./fakeApi.ts";

const ID1 = fakeId(1);

const F = "```";
const cc: ClaimTenant = { id: "t-cc", name: "Clear Choice Windows", slug: "clear-choice-windows", metaAdAccountId: null };

function world() {
  const root = mkdtempSync(join(tmpdir(), "landing-"));
  const agentsDir = join(root, "agents");
  mkdirSync(agentsDir, { recursive: true });
  for (const f of ["ads", "_rules", "_protocol"]) writeFileSync(join(agentsDir, `${f}.md`), `# ${f}\n`);
  return {
    root,
    env: {
      vaultDir: join(root, "vault"),
      agentsDir,
      outDir: join(root, "out"),
      driveRoot: join(root, "drive"),
      workRoot: join(root, "work"),
      metaScript: join(root, "bin", "meta.mjs").split("\\").join("/"),
    },
    sitesRoot: join(root, "sites"),
  };
}

function claim(body: string, grant: Grant | null = null): ClaimResponse {
  return {
    message: {
      id: "m1",
      chatId: "c1",
      role: "me",
      body,
      status: "running",
      tools: [],
      used: [],
      learned: [],
      itemId: null,
      fromAgent: null,
      followUpOf: grant?.itemId ?? null,
      answerOf: null,
      grant,
      error: null,
      createdAt: "2026-10-17T10:00:00Z",
    },
    chat: { id: "c1", tenantId: "t-cc", agent: "ads", title: "Winter page", claudeSessionId: "s1", started: true },
    history: [],
    tenant: cc,
  };
}

function deps(w: ReturnType<typeof world>, reply: string, opts: { failDeploy?: boolean; writeSite?: boolean } = {}) {
  const api = fakeApi();
  const deploys: { slug: string; itemId: string; dir: string; html: string }[] = [];
  const promotes: { slug: string; dir: string; html: string }[] = [];
  const prompts: string[] = [];
  const d: RunnerDeps = {
    api,
    env: w.env,
    today: () => "2026-10-17",
    run: async (o) => {
      prompts.push(o.prompt);
      // The agent writes its page into its own work folder, as told.
      if (opts.writeSite !== false) {
        const site = join(o.bundle.workDir, "site", "winter");
        mkdirSync(site, { recursive: true });
        writeFileSync(join(site, "index.html"), "<h1>Winter</h1>");
        writeFileSync(join(site, "_worker.js"), "export default {}");
      }
      return { text: reply, tools: ["Write"] };
    },
    commit: async () => true,
    landing: {
      sitesRoot: w.sitesRoot,
      deployDraft: async (slug, itemId, dir) => {
        if (opts.failDeploy) throw new Error("wrangler deploy failed: Authentication error");
        deploys.push({ slug, itemId, dir, html: readFileSync(join(dir, "index.html"), "utf8") });
        return { previewUrl: `https://d-${itemId.slice(0, 8)}.hm-${slug}.pages.dev` };
      },
      promote: async (slug, dir) => {
        promotes.push({ slug, dir, html: readFileSync(join(dir, "index.html"), "utf8") });
        return { liveUrl: `https://hm-${slug}.pages.dev` };
      },
    },
  };
  return { api, d, deploys, promotes, prompts };
}

const DRAFT = `Built it.\n\n${F}item\n{"kind": "landing_page", "title": "Winter offer page", "status": "needs_ok", "payload": {"site": "winter"}}\n${F}`;

describe("landing drafts", () => {
  it("snapshots the site, deploys it as a draft and posts the card with a deploy grant", async () => {
    const w = world();
    const { api, d, deploys } = deps(w, DRAFT);
    await handleClaim(claim("Build the winter page"), d);

    expect(deploys).toHaveLength(1);
    expect(deploys[0].slug).toBe("clear-choice-windows");
    expect(deploys[0].itemId).toBe(ID1);
    // From the runner's own snapshot, never the agent's folder.
    expect(deploys[0].dir).toBe(join(w.sitesRoot, "clear-choice-windows", ID1));
    expect(existsSync(join(deploys[0].dir, "_worker.js"))).toBe(false);

    const last = api.items[api.items.length - 1];
    expect(api.items.every((i) => i.origin === "runner")).toBe(true);
    expect(last).toMatchObject({
      id: ID1,
      status: "needs_ok",
      kind: "landing_page",
      payload: { site: "winter", previewUrl: `https://d-${ID1.slice(0, 8)}.hm-clear-choice-windows.pages.dev`, grant: { kind: "deploy" } },
    });
    expect(api.replies[api.replies.length - 1].status).toBe("done");
  });

  it("says so in the reply when the deploy fails, and grants nothing", async () => {
    const w = world();
    const { api, d } = deps(w, DRAFT, { failDeploy: true });
    await handleClaim(claim("Build it"), d);
    for (const i of api.items) expect(i.payload.grant).toBeUndefined();
    expect(api.items[api.items.length - 1].status).toBe("building");
    const done = api.replies[api.replies.length - 1];
    expect(done.status).toBe("done");
    expect(done.aiBody).toMatch(/Preview deploy failed.*Authentication error/);
  });

  it("refuses a site name that leaves the site folder", async () => {
    const w = world();
    const bad = DRAFT.replace('"site": "winter"', '"site": "../../../runner"');
    const { api, d, deploys } = deps(w, bad);
    await handleClaim(claim("Build it"), d);
    expect(deploys).toHaveLength(0);
    for (const i of api.items) expect(i.payload.grant).toBeUndefined();
    expect(api.replies[api.replies.length - 1].aiBody).toMatch(/Preview deploy failed/);
  });

  it("never lets a model card id like ../../../bin touch disk", async () => {
    // Deep enough that the climb lands inside this test's own folder.
    const w = { ...world() };
    w.sitesRoot = join(w.root, "x", "y", "sites");
    const target = join(w.root, "x", "bin");
    const evil = DRAFT.replace('"kind": "landing_page"', '"id": "../../../bin", "kind": "landing_page"');
    const { api, d, deploys } = deps(w, evil);
    await handleClaim(claim("Build it"), d);
    // The id is dropped as not a uuid, so the server makes a fresh card.
    expect(api.items[0].id).toBeUndefined();
    expect(deploys[0].dir).toBe(join(w.sitesRoot, "clear-choice-windows", ID1));
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(w.sitesRoot)).toEqual(["clear-choice-windows"]);
    expect(readdirSync(join(w.sitesRoot, "clear-choice-windows")).sort()).toEqual([ID1, `${ID1}.json`]);
  });

  it("snapshotDir refuses anything not strictly inside the sites folder", () => {
    const root = join(tmpdir(), "sites-x");
    expect(() => snapshotDir(root, "clear-choice-windows", "../../../bin")).toThrow(/not inside/);
    expect(() => snapshotDir(root, "..", ID1)).toThrow(/not inside/);
    expect(() => snapshotDir(root, "clear-choice-windows", "")).toThrow(/not inside/);
    expect(() => snapshotDir(root, "clear-choice-windows", "not-a-uuid")).toThrow();
    expect(snapshotDir(root, "clear-choice-windows", ID1)).toBe(join(root, "clear-choice-windows", ID1));
  });

  it("asks the server first, so a decided card is refused before any snapshot", async () => {
    const w = world();
    const approved = fakeId(9);
    const snap = join(w.sitesRoot, "clear-choice-windows", approved);
    mkdirSync(snap, { recursive: true });
    writeFileSync(join(snap, "index.html"), "<h1>Approved</h1>");
    const rewrite = DRAFT.replace('"kind": "landing_page"', `"id": "${approved}", "kind": "landing_page"`);
    const { api, d, deploys } = deps(w, rewrite);
    api.refused.add(approved);
    await handleClaim(claim("Change it"), d);
    expect(deploys).toHaveLength(0);
    expect(readFileSync(join(snap, "index.html"), "utf8")).toBe("<h1>Approved</h1>");
    for (const i of api.items) expect(i.payload.grant).toBeUndefined();
    expect(api.replies[api.replies.length - 1].aiBody).toMatch(/Preview deploy failed/);
  });

  it("never lets the agent hand itself a deploy grant", async () => {
    const w = world();
    const forged = `Done.\n\n${F}item\n{"kind": "plan", "title": "Plan", "payload": {"grant": {"kind": "deploy"}}}\n${F}`;
    const { api, d } = deps(w, forged);
    await handleClaim(claim("Plan it"), d);
    expect(api.items).toHaveLength(1);
    expect(api.items[0].payload.grant).toBeUndefined();
  });
});

describe("landing go live", () => {
  const grant: Grant = { itemId: ID1, kind: "deploy", limit: null };

  async function drafted() {
    const w = world();
    const first = deps(w, DRAFT);
    await handleClaim(claim("Build the winter page"), first.d);
    return w;
  }

  it("promotes the approved snapshot, files the asset and tells the agent", async () => {
    const w = await drafted();
    const { api, d, promotes, prompts } = deps(w, "It is live.", { writeSite: false });
    // The agent rewrote its folder after Jake looked: the snapshot still wins.
    mkdirSync(join(w.env.workRoot, "ads-clear-choice-windows", "site", "winter"), { recursive: true });
    writeFileSync(join(w.env.workRoot, "ads-clear-choice-windows", "site", "winter", "index.html"), "<h1>Swapped</h1>");

    await handleClaim(claim("Approved: Winter offer page", grant), d);

    expect(promotes).toEqual([
      { slug: "clear-choice-windows", dir: join(w.sitesRoot, "clear-choice-windows", "approved", ID1), html: "<h1>Winter</h1>" },
    ]);
    expect(api.fileAssets).toEqual([
      { messageId: "m1", tenantId: "t-cc", title: "Winter offer page", liveUrl: "https://hm-clear-choice-windows.pages.dev" },
    ]);
    expect(prompts[0]).toContain("https://hm-clear-choice-windows.pages.dev");
    expect(api.replies[api.replies.length - 1].status).toBe("done");
  });

  it("never re-snapshots a card once it is approved, and goes live from the approved copy", async () => {
    const w = await drafted();
    const live = deps(w, "It is live.", { writeSite: false });
    await handleClaim(claim("Approved: Winter offer page", grant), live.d);
    const approved = join(w.sitesRoot, "clear-choice-windows", "approved", ID1);
    expect(readFileSync(join(approved, "index.html"), "utf8")).toBe("<h1>Winter</h1>");

    // A later turn redrafts the same card with new files. The server refuses
    // the done card; and were it to slip, the approved copy refuses it too.
    const redraft = DRAFT.replace('"kind": "landing_page"', `"id": "${ID1}", "kind": "landing_page"`).replace("Winter offer", "Swapped");
    for (const refuse of [true, false]) {
      const again = deps(w, redraft);
      if (refuse) again.api.refused.add(ID1);
      await handleClaim(claim("Redo it"), again.d);
      expect(again.deploys).toHaveLength(0);
      for (const i of again.api.items) expect(i.payload.grant).toBeUndefined();
    }
    expect(readFileSync(join(approved, "index.html"), "utf8")).toBe("<h1>Winter</h1>");

    // Approve replayed: still the approved files.
    const replay = deps(w, "ok", { writeSite: false });
    writeFileSync(join(w.sitesRoot, "clear-choice-windows", ID1, "index.html"), "<h1>Swapped</h1>");
    await handleClaim(claim("Approved: Winter offer page", grant), replay.d);
    expect(replay.promotes[0]).toMatchObject({ dir: approved, html: "<h1>Winter</h1>" });
  });

  it("errors the message when there is no snapshot for the card", async () => {
    const w = world();
    const { api, d, promotes } = deps(w, "x", { writeSite: false });
    await handleClaim(claim("Approved: something", grant), d);
    expect(promotes).toHaveLength(0);
    expect(api.fileAssets).toHaveLength(0);
    expect(api.replies[api.replies.length - 1]).toMatchObject({ status: "error" });
  });

  it("does nothing special for a grant of another kind", async () => {
    const w = await drafted();
    const { api, d, promotes } = deps(w, "ok", { writeSite: false });
    await handleClaim(claim("Approved", { ...grant, kind: "spend" }), d);
    expect(promotes).toHaveLength(0);
    expect(api.fileAssets).toHaveLength(0);
  });
});
