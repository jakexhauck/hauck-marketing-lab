import { describe, it, expect } from "vitest";
import { agencyAlert, aiKeys, clientAlert, normaliseItems } from "./followUpCopy";
import { checkSms } from "./smsRules";

describe("alerts", () => {
  it("names the client in the agency alert", () => {
    expect(agencyAlert("Made Better LC")).toContain("New Lead For Made Better LC");
  });
  it("keep their merge fields and pass the SMS checks", () => {
    expect(clientAlert()).toContain("{{contact.phone}}");
    expect(checkSms(agencyAlert("Willis Windows"), { maxSegments: 4 })).toEqual([]);
  });
});

describe("aiKeys", () => {
  it("lists what Claude writes", () => {
    expect(aiKeys("ltn")).toEqual(["sms1", "sms2", "sms3", "sms4"]);
    expect(aiKeys("lead_fu")).toEqual(["first", "sms3", "sms3Photo", "hailMary"]);
  });
});

describe("normaliseItems", () => {
  it("orders, drops unknown keys and fills the templates", () => {
    const items = normaliseItems(
      "lead_fu",
      [
        { key: "hailMary", text: "Last try" },
        { key: "junk", text: "x" },
        { key: "first", text: "Hi" },
      ],
      "AAG",
    );
    expect(items.map((i) => i.key)).toEqual(["first", "sms3", "sms3Photo", "hailMary", "clientAlert", "agencyAlert"]);
    expect(items[0].text).toBe("Hi");
    expect(items[1].text).toBe("");
    expect(items[5].text).toContain("New Lead For AAG");
  });
});
