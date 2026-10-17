import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundle } from "../src/bundle.ts";
import { HF_GENERATE_TOOLS, HF_QUOTE_TOOLS } from "../src/spend.ts";
import type { ClaimTenant } from "../src/wire.ts";

const EM = "\u2014";

function world() {
  const root = mkdtempSync(join(tmpdir(), "bundle-"));
  const vaultDir = join(root, "vault");
  const agentsDir = join(root, "agents");
  const outDir = join(root, "out");
  const driveRoot = join(root, "drive");
  mkdirSync(join(vaultDir, "Clients", "Willis Windows"), { recursive: true });
  mkdirSync(join(vaultDir, "Clients", "Made Better LC"), { recursive: true });
  mkdirSync(join(vaultDir, "Agents", "Ads"), { recursive: true });
  mkdirSync(join(vaultDir, "Agents", "Manager"), { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  // The Drive names its client folders "<handshake>   Name" on the G: mount.
  mkdirSync(join(driveRoot, "\u{1F91D}   Willis Windows"), { recursive: true });
  for (const id of ["manager", "research", "ads", "creative", "landing", "ghl", "reporting"]) {
    writeFileSync(join(agentsDir, `${id}.md`), `# ${id} instructions\n`);
  }
  writeFileSync(join(agentsDir, "_rules.md"), "# House rules\n");
  writeFileSync(join(agentsDir, "_protocol.md"), "# Output protocol\n");
  writeFileSync(
    join(vaultDir, "Clients", "Willis Windows", "Brain.md"),
    "## Lessons\n- [2026-10-01] (ads, chat a) Before/after beats quotes ^l-aaaaaaaa\n",
  );
  writeFileSync(
    join(vaultDir, "Clients", "Made Better LC", "Brain.md"),
    "## Lessons\n- [2026-10-02] (research, chat b) Owners hate long forms ^l-bbbbbbbb\n",
  );
  writeFileSync(
    join(vaultDir, "Agents", "Ads", "Brain.md"),
    "## Lessons\n- [2026-10-03] (ads, chat c) 3 question forms win ^l-cccccccc\n",
  );
  writeFileSync(
    join(vaultDir, "Agents", "Manager", "Brain.md"),
    `## Lessons\n- [2026-10-04] (manager, chat d) Onboarding stalls at GHL ${EM} chase it ^l-dddddddd\n`,
  );
  const workRoot = join(root, "work");
  const metaScript = join(root, "runner", "bin", "meta.mjs").split("\\").join("/");
  const ghlScript = join(root, "runner", "bin", "ghl.mjs").split("\\").join("/");
  return { vaultDir, agentsDir, outDir, driveRoot, workRoot, metaScript, ghlScript };
}

const metaTool = (env: { metaScript: string }) => `Bash(node ${env.metaScript}:*)`;

const willis: ClaimTenant = { id: "t-willis", name: "Willis Windows", slug: "willis-windows", metaAdAccountId: "act_1" };

describe("buildBundle", () => {
  it("gives the meta script to ads, reporting and manager only", () => {
    const env = world();
    for (const id of ["ads", "reporting", "manager"] as const) {
      expect(buildBundle(id, willis, env).allowedTools).toContain(metaTool(env));
    }
    for (const id of ["ghl", "landing", "creative", "research"] as const) {
      expect(buildBundle(id, willis, env).allowedTools).not.toContain(metaTool(env));
    }
  });

  it("gives the ghl script to the GHL Agent at a client and nobody else", () => {
    const env = world();
    const ghlTool = `Bash(node ${env.ghlScript}:*)`;
    expect(buildBundle("ghl", willis, env).allowedTools).toContain(ghlTool);
    for (const id of ["manager", "research", "ads", "creative", "landing", "reporting"] as const) {
      expect(buildBundle(id, willis, env).allowedTools, id).not.toContain(ghlTool);
      expect(buildBundle(id, willis, env).allowedTools.some((t) => t.includes("ghl.mjs")), id).toBe(false);
    }
    expect(buildBundle("ghl", null, env).allowedTools).not.toContain(ghlTool);
    expect(readFileSync(buildBundle("ghl", willis, env).systemPromptFile, "utf8")).toContain(`node ${env.ghlScript} <op>`);
  });

  it("gives the GHL Agent the same tools with or without a grant", () => {
    const env = world();
    const grant = { itemId: "i1", kind: "ghl" as const, limit: null };
    expect(buildBundle("ghl", willis, env, grant).allowedTools).toEqual(buildBundle("ghl", willis, env, null).allowedTools);
    expect(buildBundle("ghl", willis, env, grant).allowedTools).not.toContain("Bash");
  });

  it("never allows a bare Bash", () => {
    const env = world();
    for (const id of ["manager", "research", "ads", "creative", "landing", "ghl", "reporting"] as const) {
      expect(buildBundle(id, willis, env).allowedTools).not.toContain("Bash");
    }
  });

  it("writes instructions, rules, protocol and both brains into the prompt file", () => {
    const env = world();
    const b = buildBundle("ads", willis, env);
    const prompt = readFileSync(b.systemPromptFile, "utf8");
    expect(prompt).toContain("# ads instructions");
    expect(prompt).toContain("# House rules");
    expect(prompt).toContain("# Output protocol");
    expect(prompt).toContain("Before/after beats quotes ^l-aaaaaaaa");
    expect(prompt).toContain("3 question forms win ^l-cccccccc");
    expect(prompt).not.toContain("Owners hate long forms");
    expect(prompt).toContain("Willis Windows");
  });

  it("adds only the client's Drive folder, never the vault", () => {
    const env = world();
    const b = buildBundle("ads", willis, env);
    expect(b.addDirs).toEqual([join(env.driveRoot, "\u{1F91D}   Willis Windows")]);
    const mb: ClaimTenant = { id: "t-mb", name: "Made Better", slug: "made-better-landscaping-co", metaAdAccountId: null };
    expect(buildBundle("ads", mb, env).addDirs).toEqual([]);
    for (const id of ["manager", "research", "ads", "creative", "landing", "ghl", "reporting"] as const) {
      expect(buildBundle(id, willis, env).addDirs).not.toContain(env.vaultDir);
    }
  });

  it("gives the GHL Agent no Drive folder, and does not point it at one", () => {
    const env = world();
    const b = buildBundle("ghl", willis, env);
    expect(b.addDirs).toEqual([]);
    expect(readFileSync(b.systemPromptFile, "utf8")).not.toContain(env.driveRoot);
  });

  it("runs each agent and client in its own work folder, outside the runner", () => {
    const env = world();
    const b = buildBundle("ads", willis, env);
    expect(b.workDir).toBe(join(env.workRoot, "ads-willis-windows"));
    expect(buildBundle("manager", null, env).workDir).toBe(join(env.workRoot, "manager-agency"));
  });

  it("tells the agent the exact Meta command it may run", () => {
    const env = world();
    const prompt = readFileSync(buildBundle("ads", willis, env).systemPromptFile, "utf8");
    expect(prompt).toContain(`node ${env.metaScript} --level`);
    const ghl = readFileSync(buildBundle("ghl", willis, env).systemPromptFile, "utf8");
    expect(ghl).not.toContain(env.metaScript);
  });

  it("puts the client's Profile and Memory notes into the prompt", () => {
    const env = world();
    writeFileSync(join(env.vaultDir, "Clients", "Willis Windows", "Profile.md"), "Owner is Bob\n");
    writeFileSync(join(env.vaultDir, "Clients", "Willis Windows", "Memory.md"), "Prefers texts\n");
    const prompt = readFileSync(buildBundle("ads", willis, env).systemPromptFile, "utf8");
    expect(prompt).toContain("Owner is Bob");
    expect(prompt).toContain("Prefers texts");
  });

  it("gives the Manager every brain's lessons, without em dashes", () => {
    const env = world();
    const prompt = readFileSync(buildBundle("manager", null, env).systemPromptFile, "utf8");
    for (const id of ["aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd"]) expect(prompt).toContain(`^l-${id}`);
    expect(prompt.includes(EM)).toBe(false);
  });

  it("never gives the Landing Page Agent wrangler or a shell, grant or not", () => {
    const env = world();
    const deploy = { itemId: "i-1", kind: "deploy" as const, limit: null };
    for (const g of [null, deploy]) {
      const tools = buildBundle("landing", willis, env, g).allowedTools;
      expect(tools.some((t) => /wrangler|bash/i.test(t)), String(g)).toBe(false);
      expect(tools).toEqual(buildBundle("landing", willis, env).allowedTools);
    }
  });

  it("tells the Landing Page Agent its site folder, and on an approved turn that it is live", () => {
    const env = world();
    const plain = readFileSync(buildBundle("landing", willis, env).systemPromptFile, "utf8");
    expect(plain).toContain(join(env.workRoot, "landing-willis-windows", "site", "<name>"));
    expect(plain).toContain('"site": "<name>"');
    expect(plain).not.toContain("Approve of card");
    const approved = readFileSync(
      buildBundle("landing", willis, env, { itemId: "i-1", kind: "deploy", limit: null }).systemPromptFile,
      "utf8",
    );
    expect(approved).toContain("Approve of card i-1");
    const ads = readFileSync(buildBundle("ads", willis, env).systemPromptFile, "utf8");
    expect(ads).not.toContain("Site folder");
  });

  it("gives the Creative Agent Higgsfield quotes, never generate tools, without a grant", () => {
    const env = world();
    const b = buildBundle("creative", willis, env, null);
    for (const q of HF_QUOTE_TOOLS) expect(b.allowedTools).toContain(q);
    for (const g of HF_GENERATE_TOOLS) {
      expect(b.allowedTools).not.toContain(g);
      expect(b.disallowedTools).toContain(g);
    }
    expect(JSON.parse(readFileSync(b.mcpConfig!, "utf8")).mcpServers).toEqual({
      higgsfield: { type: "http", url: "https://mcp.higgsfield.ai/mcp" },
    });
    expect(readFileSync(b.systemPromptFile, "utf8")).toContain("None approved");
  });

  it("switches generate tools on only for a turn with an approved spend grant", () => {
    const env = world();
    const b = buildBundle("creative", willis, env, { itemId: "i-9", kind: "spend", limit: 24 });
    for (const g of HF_GENERATE_TOOLS) {
      expect(b.allowedTools).toContain(g);
      expect(b.disallowedTools).not.toContain(g);
    }
    expect(readFileSync(b.systemPromptFile, "utf8")).toContain("up to 24 credits");
    const noLimit = buildBundle("creative", willis, env, { itemId: "i-9", kind: "spend", limit: null });
    for (const g of HF_GENERATE_TOOLS) expect(noLimit.allowedTools).not.toContain(g);
  });

  it("gives no other agent an MCP server or a Higgsfield tool", () => {
    const env = world();
    const grant = { itemId: "i-9", kind: "spend" as const, limit: 24 };
    for (const id of ["manager", "research", "ads", "landing", "ghl", "reporting"] as const) {
      const b = buildBundle(id, id === "manager" ? null : willis, env, grant);
      expect(b.mcpConfig).toBeUndefined();
      expect(b.allowedTools.some((t) => t.startsWith("mcp__"))).toBe(false);
    }
  });
});
