import { describe, it, expect } from "vitest";
import { checkSms, segmentInfo, withSampleValues } from "./smsRules";

describe("segmentInfo", () => {
  it("counts a plain text as one segment up to 160", () => {
    expect(segmentInfo("a".repeat(160))).toEqual({ chars: 160, segments: 1, unicode: false });
    expect(segmentInfo("a".repeat(161)).segments).toBe(2);
  });

  it("drops to 70 a segment once an emoji appears", () => {
    expect(segmentInfo("hi 😀").unicode).toBe(true);
    expect(segmentInfo("😀" + "a".repeat(70)).segments).toBe(2);
  });

  it("counts extension characters twice", () => {
    expect(segmentInfo("€".repeat(80)).segments).toBe(1);
    expect(segmentInfo("€".repeat(81)).segments).toBe(2);
  });
});

describe("checkSms", () => {
  it("passes a clean text", () => {
    expect(checkSms("Hey {{contact.first_name}}, want a free quote?\n\n- {{custom_values.user_first_name}}")).toEqual([]);
  });

  it("flags dashes", () => {
    expect(checkSms("Hey \u2014 there")).toContain("Has a dash; use a comma or full stop");
  });

  it("flags an unknown merge field", () => {
    expect(checkSms("Hi {{contact.firstname}}")).toContain("Unknown merge field {{contact.firstname}}");
  });

  it("judges length with merge fields filled, not as literal braces", () => {
    const text = "Hey {{contact.first_name}}, " + "a".repeat(120) + "\n\n- {{custom_values.user_first_name}}";
    expect(checkSms(text)).toEqual([]);
    expect(segmentInfo(withSampleValues(text)).segments).toBe(1);
  });

  it("flags a text that is too long", () => {
    expect(checkSms("a".repeat(400))[0]).toMatch(/3 texts long/);
  });

  it("flags a claim about where the lead lives", () => {
    expect(checkSms("We just finished a job near you!")).toContain("Claims to know where they live");
  });
});
