import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import routeSource from "../api/grok/[connector]/[key].ts?raw";
import ghlSource from "./grokGhl.ts?raw";
import metaSource from "./grokMeta.ts?raw";
import buildSource from "./grokMetaBuild.ts?raw";
import softwareSource from "./grokSoftware.ts?raw";
import { audited, botName, connectorOf, handleBody, handleRpc, isGrokMcpRequest, loggablePath, matchClient, MAX_TOOL_TEXT, type ToolDef } from "./grokMcp";
import { CONNECTORS } from "./grokConnectors";
import { ghlMethod, ghlUrl, GHL_ORIGIN, locationIdOf, pickSubAccount } from "./grokGhl";
import { leadsFrom } from "./grokMeta";
import { LOGIN_PAGES, loginEmail, loginRole, pageGrants, pickLogin, problemsOnly, splitConnections } from "./grokSoftware";

const KEY = "k".repeat(40);

describe("isGrokMcpRequest", () => {
  it("opens only a known connector's exact path with the key", () => {
    for (const name of ["ghl", "meta", "software"]) {
      expect(isGrokMcpRequest("POST", `/api/grok/${name}/${KEY}`, KEY)).toBe(true);
      expect(isGrokMcpRequest("GET", `/api/grok/${name}/${KEY}`, KEY)).toBe(true);
      expect(isGrokMcpRequest("DELETE", `/api/grok/${name}/${KEY}`, KEY)).toBe(true);
      expect(isGrokMcpRequest("POST", `/api/grok/${name}/${KEY}x`, KEY)).toBe(false);
      expect(isGrokMcpRequest("POST", `/api/grok/${name}/${KEY}/`, KEY)).toBe(false);
      expect(isGrokMcpRequest("POST", `/api/grok/${name}/`, KEY)).toBe(false);
      expect(isGrokMcpRequest("PUT", `/api/grok/${name}/${KEY}`, KEY)).toBe(false);
    }
    // The Hauck Brain is gone, and no other name opens.
    expect(isGrokMcpRequest("POST", `/api/grok/mcp/${KEY}`, KEY)).toBe(false);
    expect(isGrokMcpRequest("POST", `/api/grok/admin/${KEY}`, KEY)).toBe(false);
    expect(isGrokMcpRequest("POST", `/api/admin/ghl/${KEY}`, KEY)).toBe(false);
  });

  it("is closed when the key is unset or short", () => {
    expect(isGrokMcpRequest("POST", "/api/grok/ghl/", undefined)).toBe(false);
    expect(isGrokMcpRequest("POST", "/api/grok/ghl/", "")).toBe(false);
    expect(isGrokMcpRequest("POST", "/api/grok/ghl/short", "short")).toBe(false);
  });

  it("names the connector, and the key never reaches a log", () => {
    expect(connectorOf(`/api/grok/ghl/${KEY}`)).toBe("ghl");
    expect(connectorOf(`/api/grok/meta/${KEY}`)).toBe("meta");
    expect(connectorOf(`/api/grok/software/${KEY}`)).toBe("software");
    expect(connectorOf(`/api/grok/mcp/${KEY}`)).toBeNull();
    expect(loggablePath(`/api/grok/ghl/${KEY}`)).toBe("/api/grok/ghl/<key>");
    expect(loggablePath(`/api/grok/anything/${KEY}`)).not.toContain(KEY);
    expect(loggablePath("/api/admin/clients")).toBe("/api/admin/clients");
  });
});

describe("handleRpc", () => {
  const server = { name: "test", instructions: "Test server." };
  const echo: ToolDef<null> = {
    name: "echo",
    description: "echo",
    inputSchema: { type: "object", properties: {} },
    run: async (_d, a) => String(a.text ?? ""),
  };
  const boom: ToolDef<null> = { ...echo, name: "boom", run: async () => Promise.reject(new Error("nope")) };
  const big: ToolDef<null> = { ...echo, name: "big", run: async () => "x".repeat(MAX_TOOL_TEXT + 10) };
  const tools = [echo, boom, big];

  it("answers initialize with the client's protocol version and the server's name", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25" } }, server, tools, null)) as any;
    expect(r.result.protocolVersion).toBe("2025-11-25");
    expect(r.result.capabilities).toEqual({ tools: {} });
    expect(r.result.serverInfo.name).toBe("test");
    expect(r.result.instructions).toBe("Test server.");
  });

  it("returns nothing for notifications", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, server, tools, null)).toBeNull();
    expect(await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }], server, tools, null)).toBeNull();
  });

  it("lists tools without their run functions", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, server, tools, null)) as any;
    expect(r.result.tools.map((t: any) => t.name)).toEqual(["echo", "boom", "big"]);
    expect(r.result.tools[0].run).toBeUndefined();
  });

  it("calls a tool, and turns a throw or an unknown tool into isError", async () => {
    const ok = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } }, server, tools, null)) as any;
    expect(ok.result.content[0].text).toBe("hi");
    const bad = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "boom" } }, server, tools, null)) as any;
    expect(bad.result).toEqual({ content: [{ type: "text", text: "nope" }], isError: true });
    const none = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "x" } }, server, tools, null)) as any;
    expect(none.result.isError).toBe(true);
  });

  it("cuts an answer that is too long", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "big" } }, server, tools, null)) as any;
    expect(r.result.content[0].text.length).toBeLessThan(MAX_TOOL_TEXT + 200);
    expect(r.result.content[0].text).toContain("[Cut at");
  });

  it("refuses a batch over the cap and survives junk inside one", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
    expect(((await handleBody(many, server, tools, null)) as any).error.message).toMatch(/at most 10/);
    const out = (await handleBody([null, { jsonrpc: "2.0", id: 1, method: "ping" }], server, tools, null)) as any[];
    expect(out[0].error.code).toBe(-32600);
    expect(out[1].result).toEqual({});
  });

  it("rejects unknown methods and bad bodies", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 6, method: "resources/list" }, server, tools, null)) as any;
    expect(r.error.code).toBe(-32601);
    expect(((await handleBody("nonsense", server, tools, null)) as any).error.code).toBe(-32600);
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

describe("audited", () => {
  // A Supabase stand-in: the owner lookup chain, and audit inserts that pass or fail.
  function fakeClient(insertOk: boolean) {
    const inserts: Record<string, unknown>[] = [];
    const owner = { data: [{ id: "owner-1" }], error: null };
    const chain: any = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve(owner) };
    const client = {
      from: (table: string) =>
        table === "admin_audit_log"
          ? { insert: (row: Record<string, unknown>) => (inserts.push(row), Promise.resolve({ error: insertOk ? null : { message: "down" } })) }
          : chain,
    } as unknown as SupabaseClient;
    return { client, inserts };
  }

  it("logs the change, naming the bot, before it runs", async () => {
    const { client, inserts } = fakeClient(true);
    const run = vi.fn(async () => {
      expect(inserts).toHaveLength(1);
      return "done";
    });
    expect(await audited(client, "ghl_request", "t1", { bot: "GHL Bot", path: "/x" }, run)).toBe("done");
    expect(inserts[0]).toMatchObject({ admin_id: "owner-1", action: "grok:ghl_request", target_tenant_id: "t1", payload: { bot: "GHL Bot" } });
  });

  it("makes no change when the log cannot be written", async () => {
    const { client } = fakeClient(false);
    const run = vi.fn(async () => "done");
    await expect(audited(client, "ghl_request", "t1", { bot: "x" }, run)).rejects.toThrow(/not made/);
    expect(run).not.toHaveBeenCalled();
  });

  it("logs a failure too", async () => {
    const { client, inserts } = fakeClient(true);
    await expect(audited(client, "ghl_request", null, { bot: "x" }, () => Promise.reject(new Error("GHL 422")))).rejects.toThrow("GHL 422");
    expect(inserts.map((r) => r.action)).toEqual(["grok:ghl_request", "grok:failed"]);
  });

  it("names the bot for the log from whatever it says, or grok", () => {
    expect(botName("  Ads   Bot ")).toBe("Ads Bot");
    expect(botName(undefined)).toBe("grok");
    expect(botName("x".repeat(80))).toHaveLength(40);
  });
});

describe("the GHL connector", () => {
  it("takes any API path and query, and only ever calls GHL", () => {
    expect(ghlUrl("/contacts/abc", undefined).href).toBe(`${GHL_ORIGIN}/contacts/abc`);
    const u = ghlUrl("/opportunities/search", { location_id: "L1", limit: 20, tags: ["a", "b"], skip: null });
    expect(u.origin).toBe(GHL_ORIGIN);
    expect(u.search).toBe("?location_id=L1&limit=20&tags=a&tags=b");
    // Never a URL, a protocol-relative path, a backslash or a host trick.
    for (const bad of ["https://evil.com/x", "//evil.com/x", "/\\evil.com", "@evil.com/x", "contacts", "/", "/a b", 5, undefined]) {
      expect(() => ghlUrl(bad, undefined)).toThrow();
    }
    expect(ghlUrl("/@evil.com/x", undefined).origin).toBe(GHL_ORIGIN);
    expect(() => ghlUrl("/x", "a=b")).toThrow(/query/);
  });

  it("reaches a sub-account that is not a client by its locationId, and nothing else", () => {
    expect(locationIdOf("yVfX127fswQ03fydxBQg")).toBe("yVfX127fswQ03fydxBQg");
    expect(locationIdOf(" wbrjjHYzznyEHx9wumSr ")).toBe("wbrjjHYzznyEHx9wumSr");
    for (const bad of [undefined, "", "short", "../oauth", "a b c d e f g h", 42]) {
      expect(() => locationIdOf(bad)).toThrow(/client .* or locationId/);
    }
  });

  it("finds a sub-account that is not a client by its name too, never guessing", () => {
    const clients = [
      { id: "t1", name: "Willis Windows", slug: "willis-windows" },
      { id: "t2", name: "Above All Garage Doors", slug: "above-all-garage-doors" },
      { id: "t3", name: "TNT Garage Doors & Openers", slug: "tnt-garage-doors" },
    ];
    const others = [
      { name: "Test Account", locationId: "yVfX127fswQ03fydxBQg" },
      { name: "Hauck Marketing", locationId: "wbrjjHYzznyEHx9wumSr" },
      { name: "", locationId: "blankNamedLocation01" },
    ];
    expect(pickSubAccount(clients, others, "Test Account")).toEqual({ locationId: "yVfX127fswQ03fydxBQg" });
    expect(pickSubAccount(clients, others, "the test account")).toEqual({ locationId: "yVfX127fswQ03fydxBQg" });
    expect(pickSubAccount(clients, others, "hauck")).toEqual({ locationId: "wbrjjHYzznyEHx9wumSr" });
    expect(pickSubAccount(clients, others, "willis")).toEqual({ tenantId: "t1" });
    expect(() => pickSubAccount(clients, others, "garage")).toThrow(/matches Above All Garage Doors, TNT Garage Doors/);
    expect(() => pickSubAccount(clients, others, "nobody")).toThrow(/Test Account, Hauck Marketing/);
  });

  it("takes every method, GET by default", () => {
    expect(ghlMethod(undefined)).toBe("GET");
    expect(ghlMethod("delete")).toBe("DELETE");
    expect(ghlMethod("PATCH")).toBe("PATCH");
    expect(() => ghlMethod("TRACE")).toThrow(/method/);
  });

  it("logs every call that is not a GET before sending it", () => {
    for (const tool of ["const ghlRequest", "const ghlAgencyRequest"]) {
      const run = ghlSource.slice(ghlSource.indexOf(tool));
      const getLine = run.indexOf('if (method === "GET") return send(');
      const auditedLine = run.indexOf("return audited(d.client,");
      expect(getLine).toBeGreaterThan(0);
      expect(auditedLine).toBeGreaterThan(getLine);
      expect(run.slice(auditedLine, run.indexOf("\n", auditedLine))).toMatch(/\(\) => send\(/);
    }
    // One place sends, and it only takes a URL built by ghlUrl.
    expect(ghlSource.match(/await fetch\(/g)).toHaveLength(1);
    expect(ghlSource).toMatch(/await fetch\(url\.href, init\)/);
  });
});

describe("the Meta connector", () => {
  it("leads: takes the first lead type present, never a sum", () => {
    expect(leadsFrom([{ action_type: "lead", value: "4" }, { action_type: "onsite_conversion.lead_grouped", value: "4" }])).toBe(4);
    expect(leadsFrom([{ action_type: "offsite_conversion.fb_pixel_lead", value: "2" }])).toBe(2);
    expect(leadsFrom(undefined)).toBe(0);
  });

  it("creates only, always paused", () => {
    expect(buildSource).not.toMatch(/"ACTIVE"|DELETE|ARCHIVED/);
    // Four creates and nothing else: no lead forms (Jake builds those), no post to an existing object's own id.
    const posts = (buildSource.match(/graphPost\([^,]+, `[^`]+`/g) ?? []).map((p) => p.replace(/^graphPost\([^,]+, /, ""));
    expect(posts).toEqual(["`/${ctx.account}/campaigns`", "`/${ctx.account}/adsets`", "`/${ctx.account}/adcreatives`", "`/${ctx.account}/ads`"]);
    // Campaign, ad set and ad each say PAUSED, and nothing takes a status from the bot.
    expect(buildSource.match(/^\s+status: "PAUSED",$/gm)?.length).toBe(3);
    expect(buildSource).not.toMatch(/a\.status/);
    // The connector itself writes nothing to Meta directly, and every real build is logged first.
    expect(metaSource).not.toMatch(/graphPost|method:\s*"(POST|PUT|DELETE)"/);
    expect(metaSource).toMatch(/return json\(await audited\(d\.client, name, c\.id,/);
  });
});

describe("the Software connector", () => {
  it("logs every change before making it, and makes each password inside the change", () => {
    for (const tool of ["software_create_client", "software_link_ghl", "software_add_login", "software_set_password", "software_fix", "software_go_live", "software_set_script", "software_add_creatives"]) {
      const run = softwareSource.slice(softwareSource.indexOf(`name: "${tool}"`));
      const body = run.slice(0, run.search(/\r?\n\};\r?\n/));
      const auditedAt = body.indexOf(`return audited(d.client, "${tool}",`);
      expect(auditedAt).toBeGreaterThan(0);
      // Nothing is written before the log row: every write call sits after it.
      for (const write of ["createTenantWithOwner(", "linkSubaccount(", "createStaffLogin(", "writeCustomValues(", "provisionOwnerLinks(", ".update(", ".upsert(", "copyFinishedCreatives("]) {
        const at = body.indexOf(write);
        if (at >= 0) expect(at).toBeGreaterThan(auditedAt);
      }
      const pw = body.indexOf("newPassword()");
      if (pw >= 0) expect(pw).toBeGreaterThan(auditedAt);
    }
    // The named tools never delete. Anything else in the app, deletes included,
    // goes through software_request (lib/grokSoftwareApi.ts), which logs first
    // too. Go Live is a bot's since 2026-10-27.
    expect(softwareSource).not.toMatch(/\.delete\(/);
    // One named tool sets a password, software_set_password (Jake, 2026-10-27:
    // the Grok Bot makes the client's password), and it makes the password
    // itself inside the logged change; a bot never chooses one.
    const setPw = softwareSource.slice(softwareSource.indexOf('name: "software_set_password"'));
    const setPwBody = setPw.slice(0, setPw.search(/\r?\n\};\r?\n/));
    const outside = softwareSource.replace(setPwBody, "");
    expect(outside).not.toMatch(/password_hash:/);
    expect(setPwBody).toMatch(/password_hash:/);
    expect(setPwBody).not.toMatch(/a\.password/);
    // The only status a bot can set is live, and only through software_go_live.
    expect(softwareSource.match(/onboarding_status: "live"/g)).toHaveLength(1);
    expect(softwareSource.slice(softwareSource.indexOf('name: "software_go_live"'))).toMatch(/onboarding_status: "live"/);
  });

  it("roles: owner, manager or rep, rep by default", () => {
    expect(loginRole(undefined)).toBe("rep");
    expect(loginRole("Manager")).toBe("manager");
    expect(loginRole("owner")).toBe("owner");
    expect(() => loginRole("admin")).toThrow(/role is one of/);
  });

  it("pages: none named is every live page; an unknown one is an error, never dropped", () => {
    expect(pageGrants(undefined).map((g) => g.capability)).toEqual(LOGIN_PAGES);
    expect(LOGIN_PAGES).not.toContain("billing");
    expect(pageGrants(["inbox", "calendar"])).toEqual([
      { capability: "inbox", view: true, edit: true },
      { capability: "calendar", view: true, edit: true },
    ]);
    expect(() => pageGrants(["inbox", "billing"])).toThrow(/Unknown page billing/);
    expect(() => pageGrants("inbox")).toThrow(/pages is a list/);
  });

  // Which login software_set_password changes: the owner unless an email says
  // otherwise. Two owners and no email is a question, never a guess.
  it("set password: the owner by default, or the login the email names", () => {
    const owner = { id: "s1", email: "jim@willis.com", role: "owner" };
    const rep = { id: "s2", email: "rep@willis.com", role: "rep" };
    expect(pickLogin([rep, owner], "")).toBe(owner);
    expect(pickLogin([rep, owner], "REP@willis.com")).toBe(rep);
    expect(() => pickLogin([rep], "")).toThrow(/no owner login/);
    expect(() => pickLogin([owner], "nobody@willis.com")).toThrow(/no login nobody@willis.com/);
    expect(() => pickLogin([owner, { ...owner, id: "s3", email: "two@willis.com" }], "")).toThrow(/2 owner logins.*email/);
  });

  it("emails are normalized and must look like one", () => {
    expect(loginEmail("  Bob@Willis.COM ")).toBe("bob@willis.com");
    for (const bad of ["", "bob", "bob@", "@x.com", "bob@x", "a b@x.com", 5]) expect(() => loginEmail(bad)).toThrow(/valid email/);
  });

  it("system health keeps what is failing apart from what was never switched on", () => {
    const probe = (state: string, detail = "") => ({ state, detail });
    const r = splitConnections([
      { id: "supabase", configured: true, missing: [], probe: probe("ok") },
      { id: "google-drive", configured: true, missing: [], probe: probe("failed", "No refresh token stored. Never consented.") },
      { id: "telegram-manager", configured: false, missing: ["TELEGRAM_BOT_TOKEN"], probe: probe("skipped") },
      { id: "meta-ads", configured: false, missing: ["META_X"], probe: probe("failed", "Meta returned 401") },
    ]);
    expect(r.ok).toBe(1);
    expect(r.failing.map((c) => c.id)).toEqual(["google-drive", "meta-ads"]);
    expect(r.notSetUp).toEqual([{ id: "telegram-manager", missing: ["TELEGRAM_BOT_TOKEN"] }]);
  });

  it("health lists problems and counts the green", () => {
    const r = problemsOnly([{ state: "ok" }, { state: "missing" }, { state: "unknown" }, { state: "ok" }]);
    expect(r.ok).toBe(2);
    expect(r.problems.map((p) => p.state)).toEqual(["missing", "unknown"]);
  });
});

describe("the connectors", () => {
  it("serve exactly these tools", () => {
    expect(Object.keys(CONNECTORS).sort()).toEqual(["ghl", "meta", "software"]);
    expect(CONNECTORS.software.tools.map((t) => t.name)).toEqual([
      "software_clients", "software_create_client", "software_link_ghl", "software_add_login", "software_set_password",
      "software_client_health", "software_system_health", "software_fix", "software_go_live",
      "software_get_script", "software_set_script", "software_add_creatives", "software_routes", "software_request",
    ]);
    // A bot's script is sanitized like one typed in Settings, before the logged write.
    const set = softwareSource.slice(softwareSource.indexOf('name: "software_set_script"'));
    expect(set.indexOf("await sanitizeScriptHtml(raw)")).toBeGreaterThan(0);
    expect(set.indexOf("await sanitizeScriptHtml(raw)")).toBeLessThan(set.indexOf("return audited("));
    expect(CONNECTORS.ghl.tools.map((t) => t.name)).toEqual(["ghl_clients", "ghl_request", "ghl_agency_request"]);
    expect(CONNECTORS.meta.tools.map((t) => t.name)).toEqual([
      "get_ad_results", "get_ad_structure", "get_ad_assets", "meta_create_campaign", "meta_create_adset", "meta_create_ad",
    ]);
  });

  it("the route re-checks the key itself and serves the connector its path names", () => {
    expect(routeSource).toMatch(/isGrokMcpRequest\(ctx\.request\.method, url\.pathname, ctx\.env\.GROK_MCP_KEY\)/);
    expect(routeSource).toMatch(/const \{ server, tools \} = CONNECTORS\[name\];/);
  });
});
