import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleClaim, type RunnerDeps } from "../src/runner.ts";
import type { ClaimResponse, ClaimTenant, Grant } from "../src/wire.ts";
import { fakeApi } from "./fakeApi.ts";

const F = "```";
const cc: ClaimTenant = { id: "t-cc", name: "Clear Choice Windows", slug: "clear-choice-windows", metaAdAccountId: null };

function world() {
  const root = mkdtempSync(join(tmpdir(), "landing-"));
  const agentsDir = join(root, "agents");
  mkdirSync(agentsDir, { recursive: true });
  for (const f of ["landing", "_rules", "_protocol"]) writeFileSync(join(agentsDir, `${f}.md`), `# ${f}\n`);
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
      grant,
      error: null,
      createdAt: "2026-10-17T10:00:00Z",
    },
    chat: { id: "c1", tenantId: "t-cc", agent: "landing", title: "Winter page", claudeSessionId: "s1", started: true },
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
    expect(deploys[0].itemId).toBe("item-1");
    // From the runner's own snapshot, never the agent's folder.
    expect(deploys[0].dir).toBe(join(w.sitesRoot, "clear-choice-windows", "item-1"));
    expect(existsSync(join(deploys[0].dir, "_worker.js"))).toBe(false);

    const last = api.items[api.items.length - 1];
    expect(last).toMatchObject({
      id: "item-1",
      status: "needs_ok",
      kind: "landing_page",
      payload: { site: "winter", previewUrl: "https://d-item-1.hm-clear-choice-windows.pages.dev", grant: { kind: "deploy" } },
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
  const grant: Grant = { itemId: "item-1", kind: "deploy", limit: null };

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
    mkdirSync(join(w.env.workRoot, "landing-clear-choice-windows", "site", "winter"), { recursive: true });
    writeFileSync(join(w.env.workRoot, "landing-clear-choice-windows", "site", "winter", "index.html"), "<h1>Swapped</h1>");

    await handleClaim(claim("Approved: Winter offer page", grant), d);

    expect(promotes).toEqual([
      { slug: "clear-choice-windows", dir: join(w.sitesRoot, "clear-choice-windows", "item-1"), html: "<h1>Winter</h1>" },
    ]);
    expect(api.fileAssets).toEqual([
      { messageId: "m1", tenantId: "t-cc", title: "Winter offer page", liveUrl: "https://hm-clear-choice-windows.pages.dev" },
    ]);
    expect(prompts[0]).toContain("https://hm-clear-choice-windows.pages.dev");
    expect(api.replies[api.replies.length - 1].status).toBe("done");
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
