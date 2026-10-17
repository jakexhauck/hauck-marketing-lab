import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyQueuedEdits, handleClaim, syncAllBrains, type RunnerDeps } from "../src/runner.ts";
import type { ClaimResponse, ClaimTenant } from "../src/wire.ts";
import { fakeApi } from "./fakeApi.ts";

const F = "```";
const willis: ClaimTenant = { id: "t-willis", name: "Willis Windows", slug: "willis-windows", metaAdAccountId: "act_1" };

function world() {
  const root = mkdtempSync(join(tmpdir(), "runner-"));
  const vaultDir = join(root, "vault");
  const agentsDir = join(root, "agents");
  mkdirSync(join(vaultDir, "Clients", "Willis Windows"), { recursive: true });
  mkdirSync(join(vaultDir, "Agents", "Ads"), { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  for (const f of ["ads", "manager", "_rules", "_protocol"]) writeFileSync(join(agentsDir, `${f}.md`), `# ${f}\n`);
  writeFileSync(
    join(vaultDir, "Clients", "Willis Windows", "Brain.md"),
    "## Lessons\n- [2026-10-01] (ads, chat a) Before/after beats quotes ^l-aaaaaaaa\n",
  );
  writeFileSync(join(vaultDir, "Agents", "Ads", "Brain.md"), "## Lessons\n");
  return {
    vaultDir,
    env: {
      vaultDir,
      agentsDir,
      outDir: join(root, "out"),
      driveRoot: join(root, "drive"),
      workRoot: join(root, "work"),
      metaScript: join(root, "bin", "meta.mjs").split("\\").join("/"),
    },
  };
}

function claim(over: Partial<ClaimResponse["chat"]> = {}, body = "What did CPL do?"): ClaimResponse {
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
      followUpOf: null,
      grant: null,
      error: null,
      createdAt: "2026-10-17T10:00:00Z",
    },
    chat: { id: "c1", tenantId: "t-willis", agent: "ads", title: "New chat", claudeSessionId: "sess-1", started: false, ...over },
    history: [],
    tenant: willis,
  };
}

function deps(env: ReturnType<typeof world>["env"], reply: string, commits: string[][] = []) {
  const api = fakeApi();
  const runs: { sessionId: string; resume: boolean; prompt: string }[] = [];
  const d: RunnerDeps = {
    api,
    env,
    today: () => "2026-10-17",
    run: async (o) => {
      runs.push({ sessionId: o.sessionId, resume: o.resume, prompt: o.prompt });
      o.onProgress("Working on it", ["Bash"]);
      return { text: reply, tools: ["Bash"] };
    },
    commit: async (paths, summary) => {
      commits.push([summary, ...paths]);
      return true;
    },
  };
  return { api, runs, d };
}

describe("handleClaim", () => {
  it("replies, saves lessons, files items and requests, and commits the brain", async () => {
    const { env, vaultDir } = world();
    const commits: string[][] = [];
    const text = [
      "CPL fell to $31. Keep the before/after ad [l-aaaaaaaa].",
      `${F}lessons`,
      "Owner prefers texts over calls",
      "agent: Winter offers lift CTR in cold metros",
      F,
      `${F}item`,
      '{"kind":"ad_plan","title":"Winter push","status":"live","payload":{"plan":["A"]}}',
      F,
      `${F}request`,
      '{"toAgent":"ghl","title":"Tag winter leads","body":"Please tag them.","plan":["Add tag"]}',
      F,
    ].join("\n");
    const { api, runs, d } = deps(env, text, commits);
    await handleClaim(claim(), d);

    expect(runs[0]).toMatchObject({ sessionId: "sess-1", resume: false });
    expect(api.replies[0]).toEqual({ messageId: "m1", status: "running" });
    expect(api.replies.some((r) => r.status === "running" && r.aiBody === "Working on it")).toBe(true);
    const done = api.replies.at(-1)!;
    expect(done.status).toBe("done");
    expect(done.aiBody).toBe("CPL fell to $31. Keep the before/after ad.");
    expect(done.used).toEqual(["Before/after beats quotes"]);
    expect(done.learned).toEqual(["Owner prefers texts over calls", "Winter offers lift CTR in cold metros"]);
    expect(done.tools).toEqual(["Bash"]);
    expect(done.title).toBe("What did CPL do?");

    const client = readFileSync(join(vaultDir, "Clients", "Willis Windows", "Brain.md"), "utf8");
    expect(client).toMatch(/- \[2026-10-17\] \(ads, chat c1\) Owner prefers texts over calls \^l-[0-9a-f]{8}/);
    const agent = readFileSync(join(vaultDir, "Agents", "Ads", "Brain.md"), "utf8");
    expect(agent).toMatch(/\(ads, Willis Windows, chat c1\) Winter offers lift CTR in cold metros \^l-/);

    // An agent can never mark its own work live: that is Jake's click.
    expect(api.items[0]).toMatchObject({ tenantId: "t-willis", agent: "ads", chatId: "c1", kind: "ad_plan", status: "needs_ok" });
    expect(api.items[1]).toMatchObject({
      tenantId: "t-willis",
      agent: "ghl",
      fromAgent: "ads",
      kind: "request",
      title: "Tag winter leads",
      status: "needs_ok",
      payload: { body: "Please tag them.", plan: ["Add tag"], fromChatId: "c1" },
    });

    expect(commits).toHaveLength(1);
    expect(commits[0][0]).toBe("2 lessons (ads, Willis Windows)");
    expect(commits[0]).toHaveLength(3);

    const post = api.lessonPosts[0];
    expect(post.appliedEditIds).toEqual([]);
    expect(post.scopes).toContainEqual({ scope: "agent", tenantId: null, agent: "ads" });
    expect(post.scopes).toContainEqual({ scope: "client", tenantId: "t-willis", agent: "ghl" });
    expect(post.lessons.map((l) => l.text).sort()).toEqual([
      "Before/after beats quotes",
      "Owner prefers texts over calls",
      "Winter offers lift CTR in cold metros",
    ]);
  });

  it("resumes a started chat and keeps its title", async () => {
    const { env } = world();
    const { api, runs, d } = deps(env, "Fine.");
    await handleClaim(claim({ started: true, title: "CPL check" }), d);
    expect(runs[0].resume).toBe(true);
    expect(api.replies.at(-1)!.title).toBeUndefined();
    expect(api.lessonPosts).toEqual([]);
  });

  it("gives a fresh session the earlier messages", async () => {
    const { env } = world();
    const { runs, d } = deps(env, "ok");
    const c = claim();
    c.history = [{ ...c.message, id: "r0", role: "request", body: "Landing Page Agent asks: add the page", fromAgent: "landing" }];
    await handleClaim(c, d);
    expect(runs[0].prompt).toContain("Landing Page Agent asks: add the page");
    expect(runs[0].prompt).toContain("What did CPL do?");
  });

  it("drops a request to itself or to no agent", async () => {
    const { env } = world();
    const { api, d } = deps(env, `ok\n${F}request\n{"toAgent":"ads","title":"x","body":"y"}\n${F}`);
    await handleClaim(claim(), d);
    expect(api.items).toEqual([]);
  });

  it("reports an error instead of crashing", async () => {
    const { env } = world();
    const { api, d } = deps(env, "");
    d.run = async () => {
      throw new Error("claude exited 1: boom");
    };
    await handleClaim(claim(), d);
    expect(api.replies.at(-1)).toEqual({ messageId: "m1", status: "error", error: "claude exited 1: boom" });
  });

  it("writes the agency Manager's lessons to the Manager brain only", async () => {
    const { env, vaultDir } = world();
    const { api, d } = deps(env, `ok\n${F}lessons\nAAG is stuck on GHL\n${F}`);
    const c = claim({ agent: "manager", tenantId: null });
    c.tenant = null;
    await handleClaim(c, d);
    const body = readFileSync(join(vaultDir, "Agents", "Manager", "Brain.md"), "utf8");
    expect(body).toMatch(/\(manager, agency, chat c1\) AAG is stuck on GHL/);
    expect(api.lessonPosts[0].scopes).toEqual([{ scope: "manager", tenantId: null, agent: "manager" }]);
  });
});

describe("applyQueuedEdits", () => {
  it("applies edits by id, marks unknown ids applied, and mirrors the files it touched", async () => {
    const { env, vaultDir } = world();
    const { api, d } = deps(env, "");
    const applied = await applyQueuedEdits(
      [
        { id: "e1", lessonId: "l-aaaaaaaa", action: "edit", text: "Before/after beats quotes 3 to 1" },
        { id: "e2", lessonId: "l-99999999", action: "delete", text: null },
      ],
      [willis],
      d,
    );
    expect(applied.sort()).toEqual(["e1", "e2"]);
    expect(readFileSync(join(vaultDir, "Clients", "Willis Windows", "Brain.md"), "utf8")).toContain(
      "Before/after beats quotes 3 to 1 ^l-aaaaaaaa",
    );
    expect(api.lessonPosts[0].appliedEditIds.sort()).toEqual(["e1", "e2"]);
    expect(api.lessonPosts[0].lessons.map((l) => l.text)).toEqual(["Before/after beats quotes 3 to 1"]);
  });
});

describe("syncAllBrains", () => {
  it("mirrors every brain file whose client is a known tenant", async () => {
    const { env } = world();
    const { api, d } = deps(env, "");
    const n = await syncAllBrains([willis], d);
    expect(n).toBe(1);
    const scopes = api.lessonPosts[0].scopes;
    expect(scopes).toContainEqual({ scope: "client", tenantId: "t-willis", agent: "ads" });
    expect(scopes).toContainEqual({ scope: "agent", tenantId: null, agent: "ads" });
  });
});
