import { describe, expect, it } from "vitest";
import { parseSelfDialBody, selfDialPatch } from "./selfDial";

describe("parseSelfDialBody", () => {
  it("takes a real boolean", () => {
    expect(parseSelfDialBody({ on: true })).toEqual({ on: true });
    expect(parseSelfDialBody({ on: false })).toEqual({ on: false });
  });

  it("refuses anything that is not a boolean", () => {
    // "false" as a string is truthy: coercing it would switch the client ON.
    expect(parseSelfDialBody({ on: "false" })).toEqual({ error: "on must be true or false" });
    expect(parseSelfDialBody({})).toEqual({ error: "on must be true or false" });
    expect(parseSelfDialBody(null)).toEqual({ error: "on must be true or false" });
  });
});

describe("selfDialPatch", () => {
  it("moves both switches and the Software setup answer together", () => {
    expect(selfDialPatch(true)).toEqual({
      manual_lead_status: true,
      inbox_show_ad_leads: true,
      onboarding_dialer: "client",
    });
    expect(selfDialPatch(false)).toEqual({
      manual_lead_status: false,
      inbox_show_ad_leads: false,
      onboarding_dialer: "agency",
    });
  });
});
