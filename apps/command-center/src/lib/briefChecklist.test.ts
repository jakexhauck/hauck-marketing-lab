import { describe, expect, it } from "vitest";
import { ACCOUNT_CHECK_SECTION, accountChecksFor } from "./briefChecklist";
import { CHECK_ORDER } from "../../functions/lib/clientAccounts";

describe("ACCOUNT_CHECK_SECTION", () => {
  it("puts every Accounts check in a section", () => {
    expect(Object.keys(ACCOUNT_CHECK_SECTION).sort()).toEqual([...CHECK_ORDER].sort());
  });

  it("sends Meta to Ads, GHL pieces to GHL, the client app to Status", () => {
    expect(accountChecksFor("ads")).toEqual(["meta-ads", "meta-page"]);
    expect(accountChecksFor("ghl")).toEqual(["ghl", "texting", "pipeline", "calendars", "timezone", "owner-links", "owner-phone"]);
    expect(accountChecksFor("csm")).toEqual(["login", "push"]);
    expect(accountChecksFor("research")).toEqual([]);
  });
});

