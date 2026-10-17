import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  balanceReader,
  checkSpend,
  creativeHiggsfieldTools,
  HF_GENERATE_TOOLS,
  HF_PAID_OTHER,
  HF_QUOTE_TOOLS,
  parseBalance,
  spendLimit,
  writeHiggsfieldConfig,
} from "../src/spend.ts";
import type { Grant } from "../src/wire.ts";

const spend = (limit: number | null): Grant => ({ itemId: "i-1", kind: "spend", limit });

describe("spendLimit", () => {
  it("is the limit of a spend grant with a positive number", () => {
    expect(spendLimit(spend(12))).toBe(12);
  });
  it("is null for no grant, another kind, or no number", () => {
    expect(spendLimit(null)).toBeNull();
    expect(spendLimit({ itemId: "i", kind: "file", limit: 5 })).toBeNull();
    expect(spendLimit(spend(null))).toBeNull();
    expect(spendLimit(spend(0))).toBeNull();
    expect(spendLimit(spend(-3))).toBeNull();
    expect(spendLimit(spend(Number.POSITIVE_INFINITY))).toBeNull();
  });
});

describe("creativeHiggsfieldTools", () => {
  it("allows quotes and refuses every generate tool without a grant", () => {
    const t = creativeHiggsfieldTools(null);
    expect(t.allowed).toEqual(HF_QUOTE_TOOLS);
    for (const g of HF_GENERATE_TOOLS) {
      expect(t.allowed).not.toContain(g);
      expect(t.disallowed).toContain(g);
    }
  });

  it("allows generate tools with a spend grant, and still refuses the other paid tools", () => {
    const t = creativeHiggsfieldTools(spend(40));
    for (const g of [...HF_QUOTE_TOOLS, ...HF_GENERATE_TOOLS]) expect(t.allowed).toContain(g);
    for (const g of HF_GENERATE_TOOLS) expect(t.disallowed).not.toContain(g);
    for (const p of HF_PAID_OTHER) {
      expect(t.disallowed).toContain(p);
      expect(t.allowed).not.toContain(p);
    }
  });

  it("does not treat a file or deploy grant as a spend approval", () => {
    for (const kind of ["file", "deploy", "ghl"] as const) {
      const t = creativeHiggsfieldTools({ itemId: "i", kind, limit: 100 });
      for (const g of HF_GENERATE_TOOLS) expect(t.disallowed).toContain(g);
    }
  });
});

describe("checkSpend", () => {
  it("is ok at or under the limit", () => {
    expect(checkSpend(160, 150, 10)).toBe("ok");
    expect(checkSpend(160, 155, 10)).toBe("ok");
    expect(checkSpend(160, 160, 10)).toBe("ok");
  });
  it("is over past the limit", () => {
    expect(checkSpend(160, 149, 10)).toBe("over");
  });
});

describe("parseBalance", () => {
  it("reads the recorded balance answer, bare or wrapped", () => {
    expect(parseBalance('{"credits":160,"subscription_plan_type":"starter"}')).toBe(160);
    expect(parseBalance('Here it is:\n```json\n{"credits": 12.5}\n```')).toBe(12.5);
  });
  it("is null when there is no number", () => {
    expect(parseBalance("I could not reach Higgsfield.")).toBeNull();
  });
});

describe("writeHiggsfieldConfig", () => {
  it("writes only the higgsfield server, shaped like the user config", () => {
    const f = join(mkdtempSync(join(tmpdir(), "hf-")), "mcp.json");
    writeHiggsfieldConfig(f);
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual({
      mcpServers: { higgsfield: { type: "http", url: "https://mcp.higgsfield.ai/mcp" } },
    });
  });
});

describe("balanceReader", () => {
  it("runs a one-tool locked turn and reads the number back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bal-"));
    const seen: { allowed: string[]; disallowed?: string[]; mcp?: string; prompt: string }[] = [];
    const read = balanceReader(async (o) => {
      seen.push({ allowed: o.bundle.allowedTools, disallowed: o.bundle.disallowedTools, mcp: o.bundle.mcpConfig, prompt: o.prompt });
      return { text: '{"credits":160,"subscription_plan_type":"starter"}', tools: ["mcp__higgsfield__balance"] };
    }, dir);
    expect(await read()).toBe(160);
    expect(seen[0].allowed).toEqual(["mcp__higgsfield__balance"]);
    for (const g of HF_GENERATE_TOOLS) expect(seen[0].disallowed).toContain(g);
    expect(seen[0].mcp).toBe(join(dir, "balance.mcp.json"));
  });

  it("is null when the turn fails", async () => {
    const read = balanceReader(async () => {
      throw new Error("offline");
    }, mkdtempSync(join(tmpdir(), "bal-")));
    expect(await read()).toBeNull();
  });
});
