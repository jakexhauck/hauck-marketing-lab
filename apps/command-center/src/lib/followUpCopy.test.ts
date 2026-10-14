import { describe, it, expect } from "vitest";
import { aiKeys, normaliseItems } from "./followUpCopy";

describe("aiKeys", () => {
  it("lists what Claude writes", () => {
    expect(aiKeys("ltn")).toEqual(["sms1", "sms2", "sms3", "sms4"]);
    expect(aiKeys("lead_fu")).toEqual(["first", "sms3", "sms3Photo", "hailMary"]);
  });
});

describe("normaliseItems", () => {
  it("orders and drops unknown keys", () => {
    const items = normaliseItems(
      "lead_fu",
      [
        { key: "hailMary", text: "Last try" },
        { key: "junk", text: "x" },
        { key: "first", text: "Hi" },
      ],
    );
    expect(items.map((i) => i.key)).toEqual(["first", "sms3", "sms3Photo", "hailMary"]);
    expect(items[0].text).toBe("Hi");
    expect(items[1].text).toBe("");
  });
});
