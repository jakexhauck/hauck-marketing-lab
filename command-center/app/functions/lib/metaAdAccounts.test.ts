import { describe, it, expect } from "vitest";
import { shapeAdAccounts, type GraphAdAccount } from "./metaAdAccounts";

// A Graph row as /me/adaccounts really returns it (verified against the live
// system-user token: name, account_id, account_status, currency, timezone_name
// and a nested last_30d insights edge).
function row(over: Partial<GraphAdAccount> = {}): GraphAdAccount {
  return {
    id: "act_100",
    account_id: "100",
    name: "Willis Windows",
    account_status: 1,
    currency: "USD",
    timezone_name: "EST",
    insights: { data: [{ spend: "743.27", impressions: "19793" }] },
    ...over,
  };
}

describe("shapeAdAccounts", () => {
  it("reads name, ids, currency, timezone and last-30-day spend", () => {
    const [a] = shapeAdAccounts([row()], [], "t1");
    expect(a).toMatchObject({
      id: "act_100",
      accountId: "100",
      name: "Willis Windows",
      currency: "USD",
      timezone: "EST",
      spend30d: 743.27,
      impressions30d: 19793,
      status: "active",
      linkedTenantId: null,
      linkedToThisClient: false,
    });
  });

  it("falls back to act_<account_id> when Graph omits the object id", () => {
    const [a] = shapeAdAccounts([row({ id: undefined })], [], "t1");
    expect(a.id).toBe("act_100");
  });

  it("reads zero spend when the account has never run an ad", () => {
    const [a] = shapeAdAccounts([row({ insights: undefined })], [], "t1");
    expect(a.spend30d).toBe(0);
    expect(a.impressions30d).toBe(0);
  });

  it("names the account status rather than passing Meta's number through", () => {
    const statuses = [1, 2, 3, 101, 999].map(
      (s) => shapeAdAccounts([row({ account_status: s })], [], "t1")[0].status,
    );
    expect(statuses).toEqual(["active", "disabled", "unsettled", "closed", "unknown"]);
  });

  // The whole point of the guard: linking an account another client already
  // holds is how one client ends up seeing another's spend.
  it("labels an account that already belongs to a different client", () => {
    const tenants = [{ id: "t2", name: "Acme Roofing", meta_ad_account_id: "act_100" }];
    const [a] = shapeAdAccounts([row()], tenants, "t1");
    expect(a.linkedTenantId).toBe("t2");
    expect(a.linkedTenantName).toBe("Acme Roofing");
    expect(a.linkedToThisClient).toBe(false);
  });

  it("marks the account this client is already on, and does not call it taken", () => {
    const tenants = [{ id: "t1", name: "Willis", meta_ad_account_id: "act_100" }];
    const [a] = shapeAdAccounts([row()], tenants, "t1");
    expect(a.linkedToThisClient).toBe(true);
    expect(a.linkedTenantId).toBe("t1");
  });

  // A tenant row saved before normalising (bare digits, or a stray case/space)
  // still has to match, or the picker offers an account that is in fact taken.
  it("matches a stored account id however it was saved", () => {
    const tenants = [{ id: "t2", name: "Acme", meta_ad_account_id: " 100 " }];
    expect(shapeAdAccounts([row()], tenants, "t1")[0].linkedTenantId).toBe("t2");
  });

  it("ignores tenants with no ad account at all", () => {
    const tenants = [
      { id: "t2", name: "Acme", meta_ad_account_id: null },
      { id: "t3", name: "Beta", meta_ad_account_id: "" },
    ];
    expect(shapeAdAccounts([row()], tenants, "t1")[0].linkedTenantId).toBeNull();
  });

  // Ordering is the ease-of-use: the one you want is at the top, the ones you
  // must not touch are at the bottom.
  it("puts this client's account first, then free accounts by spend, taken last", () => {
    const rows = [
      row({ id: "act_1", account_id: "1", name: "Quiet", insights: { data: [{ spend: "10" }] } }),
      row({ id: "act_2", account_id: "2", name: "Busy", insights: { data: [{ spend: "900" }] } }),
      row({ id: "act_3", account_id: "3", name: "Taken", insights: { data: [{ spend: "5000" }] } }),
      row({ id: "act_4", account_id: "4", name: "Mine", insights: { data: [{ spend: "1" }] } }),
    ];
    const tenants = [
      { id: "t2", name: "Acme", meta_ad_account_id: "act_3" },
      { id: "t1", name: "Willis", meta_ad_account_id: "act_4" },
    ];
    expect(shapeAdAccounts(rows, tenants, "t1").map((a) => a.name)).toEqual([
      "Mine",
      "Busy",
      "Quiet",
      "Taken",
    ]);
  });

  it("survives a row with nothing but an id", () => {
    const [a] = shapeAdAccounts(
      [{ id: "act_7" } as GraphAdAccount],
      [],
      "t1",
    );
    expect(a).toMatchObject({ id: "act_7", accountId: "7", name: "act_7", spend30d: 0 });
  });
});
