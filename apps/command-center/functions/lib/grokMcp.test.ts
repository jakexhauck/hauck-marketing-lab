import { describe, it, expect } from "vitest";
import toolsSource from "./grokTools.ts?raw";
import routeSource from "../api/grok/mcp/[key].ts?raw";
import writeSource from "./grokWriteTools.ts?raw";
import buildSource from "./grokMetaBuild.ts?raw";
import { cleanNote, handleBody, handleRpc, isGrokMcpRequest, matchClient, vaultKeyFor, MAX_TOOL_TEXT, type ToolDef } from "./grokMcp";
import { GROK_TOOLS, LINK_HIDDEN, flowGuide, fulfillmentSop, hideLinks, leadsFrom, type GrokDeps } from "./grokTools";
import { BOT_LANES, GROK_ALL_TOOLS, PAGE_WRITERS, planSpendProblem, weekFrom } from "./grokWriteTools";
import type { AdsPage } from "../../src/lib/briefPages";
import { GROK_BOTS, GROK_HOUSE_RULES, GROK_RULES, GROK_VAULT } from "./grokBundle.generated";

const KEY = "k".repeat(40);
const EM = String.fromCharCode(0x2014);

describe("isGrokMcpRequest", () => {
  it("opens only the exact path with the key", () => {
    expect(isGrokMcpRequest("POST", `/api/grok/mcp/${KEY}`, KEY)).toBe(true);
    expect(isGrokMcpRequest("GET", `/api/grok/mcp/${KEY}`, KEY)).toBe(true);
    expect(isGrokMcpRequest("DELETE", `/api/grok/mcp/${KEY}`, KEY)).toBe(true);
    expect(isGrokMcpRequest("POST", `/api/grok/mcp/${KEY}x`, KEY)).toBe(false);
    expect(isGrokMcpRequest("POST", `/api/grok/mcp/${KEY}/`, KEY)).toBe(false);
    expect(isGrokMcpRequest("POST", `/api/admin/x/${KEY}`, KEY)).toBe(false);
    expect(isGrokMcpRequest("POST", `/api/grok/mcp/`, KEY)).toBe(false);
    expect(isGrokMcpRequest("PUT", `/api/grok/mcp/${KEY}`, KEY)).toBe(false);
  });

  it("is closed when the key is unset or short", () => {
    expect(isGrokMcpRequest("POST", "/api/grok/mcp/", undefined)).toBe(false);
    expect(isGrokMcpRequest("POST", "/api/grok/mcp/", "")).toBe(false);
    expect(isGrokMcpRequest("POST", "/api/grok/mcp/short", "short")).toBe(false);
  });
});

describe("handleRpc", () => {
  const echo: ToolDef<null> = {
    name: "echo",
    description: "echo",
    inputSchema: { type: "object", properties: {} },
    run: async (_d, a) => String(a.text ?? ""),
  };
  const boom: ToolDef<null> = { ...echo, name: "boom", run: async () => Promise.reject(new Error("nope")) };
  const big: ToolDef<null> = { ...echo, name: "big", run: async () => "x".repeat(MAX_TOOL_TEXT + 10) };
  const tools = [echo, boom, big];

  it("answers initialize with the client's protocol version", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25" } }, tools, null)) as any;
    expect(r.result.protocolVersion).toBe("2025-11-25");
    expect(r.result.capabilities).toEqual({ tools: {} });
  });

  it("returns nothing for notifications", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, tools, null)).toBeNull();
    expect(await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }], tools, null)).toBeNull();
  });

  it("lists tools without their run functions", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, tools, null)) as any;
    expect(r.result.tools.map((t: any) => t.name)).toEqual(["echo", "boom", "big"]);
    expect(r.result.tools[0].run).toBeUndefined();
  });

  it("calls a tool, and turns a throw or an unknown tool into isError", async () => {
    const ok = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } }, tools, null)) as any;
    expect(ok.result.content[0].text).toBe("hi");
    const bad = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "boom" } }, tools, null)) as any;
    expect(bad.result).toEqual({ content: [{ type: "text", text: "nope" }], isError: true });
    const none = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "x" } }, tools, null)) as any;
    expect(none.result.isError).toBe(true);
  });

  it("cuts an answer that is too long", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "big" } }, tools, null)) as any;
    expect(r.result.content[0].text.length).toBeLessThan(MAX_TOOL_TEXT + 200);
    expect(r.result.content[0].text).toContain("[Cut at");
  });

  it("refuses a batch over the cap and survives junk inside one", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
    expect(((await handleBody(many, tools, null)) as any).error.message).toMatch(/at most 10/);
    const out = (await handleBody([null, { jsonrpc: "2.0", id: 1, method: "ping" }], tools, null)) as any[];
    expect(out[0].error.code).toBe(-32600);
    expect(out[1].result).toEqual({});
  });

  it("rejects unknown methods and bad bodies", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 6, method: "resources/list" }, tools, null)) as any;
    expect(r.error.code).toBe(-32601);
    expect(((await handleBody("nonsense", tools, null)) as any).error.code).toBe(-32600);
  });
});

describe("matchClient", () => {
  const list = [
    { id: "1", name: "Willis Windows", slug: "willis-windows" },
    { id: "2", name: "Clear Choice Windows", slug: "clear-choice-windows" },
    { id: "3", name: "Above All Garage Doors", slug: "above-all-garage-doors" },
  ];
  it("finds by name, slug or a unique part", () => {
    expect(matchClient(list, "Willis Windows").id).toBe("1");
    expect(matchClient(list, "clear-choice-windows").id).toBe("2");
    expect(matchClient(list, "willis").id).toBe("1");
    expect(matchClient(list, "ABOVE ALL").id).toBe("3");
  });
  it("never guesses", () => {
    expect(() => matchClient(list, "windows")).toThrow(/matches Willis Windows, Clear Choice Windows/);
    expect(() => matchClient(list, "nobody")).toThrow(/No client/);
    expect(() => matchClient(list, "")).toThrow(/client is required/);
  });
});

describe("vaultKeyFor", () => {
  it("maps app names to vault folders", () => {
    const folders = ["Comfort Wizards LLC", "Made Better LC", "Willis Windows"];
    expect(vaultKeyFor(folders, "Willis Windows")).toBe("Willis Windows");
    expect(vaultKeyFor(folders, "Comfort Wizards")).toBe("Comfort Wizards LLC");
    expect(vaultKeyFor(folders, "Nobody")).toBeNull();
  });
});

describe("cleanNote", () => {
  it("keeps one plain line, no em dashes, under the cap", () => {
    expect(cleanNote(`  New offer ${EM} $200 off\n gutters `)).toBe("New offer, $200 off gutters");
    expect(() => cleanNote("")).toThrow();
    expect(() => cleanNote("x".repeat(501))).toThrow(/under 500/);
  });
});

describe("hideLinks", () => {
  it("hides every link and app-owned value, keeps plain values", () => {
    const out = hideLinks([
      { name: "Open Lead", value: "https://app.hauckmarketing.com/api/n?o=abc", appOwned: true },
      { name: "Lead Outcome Link", value: "https://app.hauckmarketing.com/o?l=1&c=2&k=3", appOwned: false },
      { name: "Webhook", value: "https://services.leadconnectorhq.com/hooks/x/webhook-trigger/uuid", appOwned: false },
      { name: "Site", value: "www.example.com", appOwned: false },
      { name: "Business Name", value: "Willis Windows", appOwned: false },
      { name: "API Key", value: "(hidden)", appOwned: false },
    ]) as any[];
    expect(out.slice(0, 4).every((v) => v.value === LINK_HIDDEN)).toBe(true);
    expect(out[4].value).toBe("Willis Windows");
    expect(out[5].value).toBe("(hidden)");
  });
});

describe("leadsFrom", () => {
  it("takes the first lead type present, never a sum", () => {
    expect(leadsFrom([{ action_type: "lead", value: "3" }, { action_type: "onsite_conversion.lead_grouped", value: "3" }])).toBe(3);
    expect(leadsFrom([{ action_type: "onsite_conversion.lead_grouped", value: "2" }])).toBe(2);
    expect(leadsFrom(undefined)).toBe(0);
  });
});

describe("the bundle", () => {
  it("has rules for all six bots and none of them hold an em dash", () => {
    expect(GROK_BOTS).toEqual(["executive-assistant", "success-manager", "ads", "creative", "market-research", "ghl"]);
    for (const bot of GROK_BOTS) {
      expect(GROK_RULES[bot]?.length).toBeGreaterThan(500);
      expect(GROK_RULES[bot]).not.toContain(EM);
    }
    expect(GROK_HOUSE_RULES).not.toContain(EM);
    for (const v of Object.values(GROK_VAULT)) expect(`${v.profile}${v.memory}${v.brain}`).not.toContain(EM);
  });

  it("get_rules serves house rules plus the bot's own", async () => {
    const tool = GROK_TOOLS.find((t) => t.name === "get_rules")!;
    const text = await tool.run({} as GrokDeps, { bot: "creative" });
    expect(text.startsWith(GROK_HOUSE_RULES)).toBe(true);
    expect(text).toContain(GROK_RULES.creative);
    await expect(tool.run({} as GrokDeps, { bot: "nope" })).rejects.toThrow(/Unknown bot/);
  });

  it("the fulfillment SOP guide comes from the app's checklists", async () => {
    const sop = fulfillmentSop();
    expect(sop).toContain("Full Setup Checklist");
    expect(sop).toContain("Launch Call");
    const text = await GROK_TOOLS.find((t) => t.name === "get_guide")!.run({} as GrokDeps, { name: "fulfillment-sop" });
    expect(text).toBe(sop);
  });

  it("serves the Mission Control maps, who does each box included", async () => {
    const ghl = flowGuide("ghl");
    expect(ghl).toContain("sub-account to automations live");
    expect(ghl).toMatch(/## custom values \(the bot\)/);
    expect(ghl).toMatch(/## connect facebook \(Jake\)/);
    const text = await GROK_TOOLS.find((t) => t.name === "get_guide")!.run({} as GrokDeps, { name: "flow-ads" });
    expect(text).toMatch(/## build paused \(the bot\)/);
    expect(text).not.toContain(EM);
  });
});

describe("what the connector can touch", () => {
  it("exposes exactly the planned tools", () => {
    expect(GROK_TOOLS.map((t) => t.name).sort()).toEqual(
      [
        "get_rules", "get_guide", "list_clients", "get_client", "get_research", "get_ads_plan", "get_ad_results",
        "get_ad_structure", "get_ad_assets", "get_lead_results", "get_ghl_setup", "get_tasks", "places_search", "places_reviews",
        "save_note",
      ].sort(),
    );
    expect(GROK_ALL_TOOLS.map((t) => t.name).slice(GROK_TOOLS.length)).toEqual([
      "meta_create_campaign", "meta_create_adset", "meta_create_ad",
      "ghl_set_custom_value", "ghl_create_custom_field", "ghl_set_calendar_hours", "update_task", "save_plan_page",
    ]);
    expect(routeSource).toMatch(/handleBody\(body, GROK_ALL_TOOLS,/);
  });

  it("Meta: creates only, always paused", () => {
    expect(buildSource).not.toMatch(/"ACTIVE"|DELETE|ARCHIVED/);
    // Four creates and nothing else: no lead forms (Jake builds those), no post to an existing object's own id.
    const posts = (buildSource.match(/graphPost\([^,]+, `[^`]+`/g) ?? []).map((p) => p.replace(/^graphPost\([^,]+, /, ""));
    expect(posts).toEqual([
      "`/${ctx.account}/campaigns`",
      "`/${ctx.account}/adsets`",
      "`/${ctx.account}/adcreatives`",
      "`/${ctx.account}/ads`",
    ]);
    // Campaign, ad set and ad each say PAUSED, and nothing takes a status from the bot.
    expect(buildSource.match(/^\s+status: "PAUSED",$/gm)?.length).toBe(3);
    expect(buildSource).not.toMatch(/a\.status/);
  });

  it("every write is counted and logged before it is sent", () => {
    expect(writeSource).toMatch(/logAdminAction\(d\.client, admin, `grok:\$\{tool\}`/);
    expect(writeSource).toMatch(/if \(!logged\) throw/);
    // GHL writes only through the allowlisted ops and the hours writer; no raw calls, no table writes.
    expect(writeSource).not.toMatch(/ghlFetch|ghlJson|graphPost|method:\s*"(POST|PUT|DELETE)"/);
    expect(writeSource).not.toMatch(/\.(insert|upsert|delete|rpc)\(/);
    expect(writeSource).toMatch(/\{ handoffs: false \}/);
    // A credential is refused before write() logs the args, so no token reaches the audit row.
    const ghlRun = writeSource.slice(writeSource.indexOf("function ghlTool("));
    expect(ghlRun.indexOf("isSecretValue(")).toBeGreaterThan(0);
    expect(ghlRun.indexOf("isSecretValue(")).toBeLessThan(ghlRun.indexOf("return write("));
  });

  it("plan pages: each has one writer, and no bot raises its own budget ceiling", () => {
    expect(PAGE_WRITERS).toEqual({ research: "market-research", ads: "ads" });
    const plan = (...spends: (number | null)[]) => ({ campaigns: spends.map((dailySpend) => ({ dailySpend })), headlines: [] }) as unknown as AdsPage;
    expect(planSpendProblem(null, plan(100))).toBeNull();
    expect(planSpendProblem(null, plan(101))).toMatch(/\$100/);
    expect(planSpendProblem(plan(60), plan(60, 40))).toBeNull();
    expect(planSpendProblem(plan(60), plan(80))).toMatch(/Jake raises it/);
    expect(planSpendProblem(plan(250), plan(200))).toBeNull();
    expect(planSpendProblem(plan(60), plan(null))).toBeNull();
  });

  it("a bot moves only its own lane's tasks; the assistant moves none", () => {
    expect(BOT_LANES["executive-assistant"]).toEqual([]);
    expect(Object.keys(BOT_LANES).sort()).toEqual([...GROK_BOTS].sort());
    for (const lanes of Object.values(BOT_LANES)) expect(lanes).not.toContain("jake");
  });

  it("calendar hours: named days, closed when unlisted, bad times refused", () => {
    const week = weekFrom([
      { day: "Mon", open: "08:00", close: "17:00" },
      { day: "tuesday", open: "08:00", close: "17:00" },
    ]);
    expect(week).toEqual([{ daysOfTheWeek: [1, 2], hours: [{ openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0 }] }]);
    expect(() => weekFrom([{ day: "Mon", open: "17:00", close: "08:00" }])).toThrow(/close is after/);
    expect(() => weekFrom([{ day: "Someday", open: "08:00", close: "17:00" }])).toThrow(/weekday/);
    expect(() => weekFrom([])).toThrow();
  });

  it("writes nothing but grok_notes", () => {
    expect(toolsSource).not.toMatch(/\.(update|upsert|delete|rpc)\(/);
    const inserts = toolsSource.match(/\.from\("[a-z_]+"\)\.insert\(/g) ?? [];
    expect(inserts).toEqual(['.from("grok_notes").insert(']);
    // GHL: reads only, through the allowlisted read ops.
    expect(toolsSource).not.toMatch(/"write\./);
    expect(toolsSource).not.toMatch(/ghlFetch|graphPost|method:\s*"(POST|PUT|DELETE)"/);
  });

  it("never reads intake passwords or hands out people's details", () => {
    expect(toolsSource).not.toMatch(/password|intake_submissions/);
    expect(toolsSource).toMatch(/const \{ kpis, breakdown, meta, model \} = body;/);
  });

  it("the route re-checks the key itself", () => {
    expect(routeSource).toMatch(/isGrokMcpRequest\(ctx\.request\.method, url\.pathname, ctx\.env\.GROK_MCP_KEY\)/);
  });
});
