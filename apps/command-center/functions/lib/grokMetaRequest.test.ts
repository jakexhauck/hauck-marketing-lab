import { describe, it, expect } from "vitest";
import requestSource from "./grokMetaRequest.ts?raw";
import { META_ORIGIN, metaMethod, metaUrl, objectRule, pickPage, scrub, spendCheck } from "./grokMetaRequest";

const refused = (r: ReturnType<typeof spendCheck>) => ("refuse" in r ? r.refuse : null);

describe("metaUrl", () => {
  it("builds a Graph v21.0 URL from a path and a query", () => {
    const u = metaUrl("/act_123/campaigns", { fields: "id,name", limit: 50, skip: null });
    expect(u.origin).toBe(META_ORIGIN);
    expect(u.pathname).toBe("/v21.0/act_123/campaigns");
    expect(u.searchParams.get("fields")).toBe("id,name");
    expect(u.searchParams.get("limit")).toBe("50");
    expect(u.searchParams.has("skip")).toBe(false);
  });

  it("refuses anything that is not a plain Graph path", () => {
    for (const bad of ["act_1", "https://evil.com/x", "//evil.com/x", "/a b", "/a\\b", "/x?access_token=y", "/x#y", "/../../x", undefined, 5]) {
      expect(() => metaUrl(bad, undefined)).toThrow();
    }
    expect(() => metaUrl("/x", "a=b")).toThrow(/query/);
    // Meta decodes a path, so an encoded one could hide an edge from the lock.
    expect(() => metaUrl("/act%5F1/campaigns", undefined)).toThrow();
    expect(() => metaUrl("/1/c%6Fpies", undefined)).toThrow();
    expect(metaUrl("/", { ids: "1,2" }).pathname).toBe("/v21.0/");
    // The bot never supplies a token: its own would be overwritten, the agency's is added at send.
    expect(() => metaUrl("/me", { access_token: "x" })).toThrow(/access_token/);
  });

  it("takes GET, POST and DELETE only", () => {
    expect(metaMethod(undefined)).toBe("GET");
    expect(metaMethod("post")).toBe("POST");
    expect(metaMethod("DELETE")).toBe("DELETE");
    expect(() => metaMethod("PUT")).toThrow();
  });
});

describe("spendCheck: budgets", () => {
  it("refuses a budget or spend cap anywhere in a write", () => {
    for (const key of ["daily_budget", "lifetime_budget", "spend_cap", "bid_amount", "bid_strategy", "budget_schedule_specs"]) {
      expect(refused(spendCheck("POST", "/120000000001", { [key]: "5000" }))).toMatch(/budget|spend/i);
    }
    // Hidden one level down, or deeper, is still a budget.
    expect(refused(spendCheck("POST", "/act_1/adsets", { name: "x", adset_spec: { targeting: {}, daily_budget: 9000 } }))).toMatch(/budget/i);
    expect(refused(spendCheck("POST", "/act_1/campaigns", { items: [{ lifetime_budget: 1 }] }))).toMatch(/budget/i);
    // The whole account's spend cap.
    expect(refused(spendCheck("POST", "/act_1", { spend_cap: "100" }))).toMatch(/spend/i);
  });

  it("refuses the budget schedule and reach and frequency edges", () => {
    expect(refused(spendCheck("POST", "/120000000001/budget_schedules", { time_start: 1 }))).toMatch(/budget/i);
    expect(refused(spendCheck("POST", "/act_1/reachfrequencypredictions", { budget: 1 }))).toMatch(/budget/i);
    expect(refused(spendCheck("POST", "/120000000001", { budget: 100 }))).toMatch(/budget/i);
  });

  it("refuses a budget it cannot read all the way down", () => {
    let deep: unknown = { daily_budget: 1 };
    for (let i = 0; i < 25; i++) deep = { x: deep };
    expect(refused(spendCheck("POST", "/act_1/ads", { spec: deep }))).toMatch(/budget/i);
    // JSON-ish text JSON.parse rejects is still read for a budget key.
    expect(refused(spendCheck("POST", "/120000000001", { spec: "{daily_budget: 5}" }))).toMatch(/budget/i);
    // Ordinary words are not a budget.
    expect(spendCheck("POST", "/act_1/adcreatives", { message: "[Sale] fits any budget" })).toEqual({ ok: true, inject: {} });
  });

  it("lets a read name budget fields", () => {
    expect(spendCheck("GET", "/act_1/campaigns", { fields: "daily_budget,lifetime_budget" })).toEqual({ ok: true, inject: {} });
  });
});

describe("spendCheck: batches", () => {
  it("refuses Meta's batch call, which could carry a budget past the lock", () => {
    expect(refused(spendCheck("POST", "/", { batch: "[]" }))).toMatch(/batch/i);
    expect(refused(spendCheck("POST", "/act_1/campaigns", { batch: "[]" }))).toMatch(/batch/i);
    expect(refused(spendCheck("POST", "/act_1/async_batch_requests", { adbatch: [] }))).toMatch(/batch/i);
  });
});

describe("spendCheck: Meta's switches", () => {
  it("refuses Meta's method switch, which turns a GET into a write", () => {
    expect(refused(spendCheck("GET", "/120000000001", { method: "post", status: "ACTIVE" }))).toMatch(/method/i);
    expect(refused(spendCheck("POST", "/act_1/campaigns", { method: "delete", delete_strategy: "DELETE_ANY" }))).toMatch(/method/i);
  });

  it("refuses ad rules, which change budgets and switch ads by themselves", () => {
    expect(refused(spendCheck("POST", "/act_1/adrules_library", { name: "x" }))).toMatch(/rule/i);
    expect(refused(spendCheck("POST", "/120000000001", { execution_spec: { execution_type: "UNPAUSE" } }))).toMatch(/rule/i);
  });

  it("never hands a token back", () => {
    expect(refused(spendCheck("GET", "/me", { fields: "accounts{id,access_token.as(t)}" }))).toMatch(/token/i);
  });
});

describe("spendCheck: on and off", () => {
  it("creates campaigns, ad sets and ads paused", () => {
    expect(spendCheck("POST", "/act_1/ads", { name: "x" })).toEqual({ ok: true, inject: { status: "PAUSED" } });
    expect(spendCheck("POST", "/act_1/adsets", { status: "PAUSED" })).toEqual({ ok: true, inject: { status: "PAUSED" } });
    expect(refused(spendCheck("POST", "/act_1/campaigns", { status: "ACTIVE" }))).toMatch(/on/i);
    expect(refused(spendCheck("POST", "/act_1/ads", { configured_status: "ACTIVE" }))).toMatch(/on/i);
  });

  it("copies paused", () => {
    expect(spendCheck("POST", "/120000000001/copies", { deep_copy: true })).toEqual({ ok: true, inject: { status_option: "PAUSED" } });
    expect(refused(spendCheck("POST", "/120000000001/copies", { status_option: "INHERITED_FROM_SOURCE" }))).toMatch(/on/i);
  });

  it("looks up the object before a status or schedule change to it", () => {
    for (const body of [{ status: "ACTIVE" }, { status: "PAUSED" }, { end_time: "2026-11-01" }, { adset_schedule: [] }]) {
      expect(spendCheck("POST", "/120000000001", body)).toEqual({ lookup: "120000000001", deleting: false });
    }
    expect(spendCheck("POST", "/120000000001", { status: "DELETED" })).toEqual({ lookup: "120000000001", deleting: true });
    expect(spendCheck("DELETE", "/120000000001", {})).toEqual({ lookup: "120000000001", deleting: true });
  });

  it("refuses deleting a whole account's campaigns, ad sets or ads", () => {
    for (const edge of ["campaigns", "adsets", "ads"]) {
      expect(refused(spendCheck("DELETE", `/act_1/${edge}`, { delete_strategy: "DELETE_ANY" }))).toMatch(/delete/i);
    }
  });

  it("leaves everything else alone", () => {
    expect(spendCheck("POST", "/120000000001", { name: "New name" })).toEqual({ ok: true, inject: {} });
    expect(spendCheck("POST", "/act_1/adcreatives", { name: "x", object_story_spec: {} })).toEqual({ ok: true, inject: {} });
    expect(spendCheck("DELETE", "/act_1/adimages", { hash: "abc" })).toEqual({ ok: true, inject: {} });
    expect(spendCheck("POST", "/1287325351122457/feed", { message: "hi" })).toEqual({ ok: true, inject: {} });
  });
});

describe("objectRule", () => {
  it("anything that is not a campaign, ad set, ad or rule is not the lock's business", () => {
    expect(objectRule({ kind: "other" }, false)).toBeNull();
    expect(objectRule({ kind: "other" }, true)).toBeNull();
  });

  it("never switches a campaign, ad set or ad on or off", () => {
    expect(objectRule({ kind: "ad", status: "PAUSED" }, false)).toMatch(/on or off/);
    expect(objectRule({ kind: "ad", status: "ACTIVE" }, false)).toMatch(/on or off/);
  });

  it("deletes or archives one only while it is off", () => {
    expect(objectRule({ kind: "ad", status: "PAUSED" }, true)).toBeNull();
    expect(objectRule({ kind: "ad", status: "ARCHIVED" }, true)).toBeNull();
    expect(objectRule({ kind: "ad", status: "ACTIVE" }, true)).toMatch(/on/);
  });

  it("leaves ad rules alone entirely", () => {
    expect(objectRule({ kind: "rule" }, false)).toMatch(/rule/i);
    expect(objectRule({ kind: "rule" }, true)).toMatch(/rule/i);
  });
});

describe("pickPage", () => {
  const pages = [
    { id: "1287325351122457", name: "Made Better Landscapes & Co" },
    { id: "1305104222696589", name: "Clear Choice Owensboro" },
    { id: "377819705421762", name: "Above All Garage Doors" },
    { id: "1442184775634816", name: "TNT Garage Doors" },
  ];
  it("finds a Page by id, name or a unique part of it", () => {
    expect(pickPage(pages, "1305104222696589").name).toBe("Clear Choice Owensboro");
    expect(pickPage(pages, "made better").id).toBe("1287325351122457");
  });
  it("never guesses", () => {
    expect(() => pickPage(pages, "garage")).toThrow(/Above All Garage Doors, TNT Garage Doors/);
    expect(() => pickPage(pages, "willis")).toThrow(/No Page called "willis"/);
  });
});

describe("scrub", () => {
  it("hides the tokens, wherever Meta echoes them", () => {
    const out = scrub(
      '{"data":[{"access_token":"PAGE1"}],"paging":{"next":"https://graph.facebook.com/v21.0/x?access_token=SYS123&after=Q"}} SYS123',
      ["SYS123", "PAGE1"],
    );
    expect(out).not.toMatch(/SYS123|PAGE1/);
    expect(out).toContain("after=Q");
  });

  it("hides anything shaped like a Meta token, even under another name", () => {
    expect(scrub('{"tok":"EAABwzLixnjYBOZBcdef1234567890abcdefXYZ"}', [])).toBe('{"tok":"[hidden]"}');
  });
});

describe("meta_request", () => {
  it("checks the lock before the log, and logs before it sends", () => {
    const run = requestSource.slice(requestSource.indexOf('name: "meta_request"'));
    const check = run.indexOf("spendCheck(");
    const log = run.indexOf("audited(");
    expect(check).toBeGreaterThan(0);
    expect(log).toBeGreaterThan(check);
    // The only fetch to Meta takes a URL built by metaUrl.
    expect(requestSource.match(/fetch\(/g)?.length).toBe(1);
    // What the lock reads is what is sent: one copy of every field, query folded in.
    expect(run).toMatch(/url\.search = "";/);
    // An object is looked up with the agency's token, never a Page's.
    expect(run).toMatch(/findObject\(sys, /);
  });
});
