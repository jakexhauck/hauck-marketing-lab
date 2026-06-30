import { describe, expect, it } from "vitest";
import { classifyOrigin, normalizeChannel } from "./origin";

describe("classifyOrigin", () => {
  it("maps website form sources to form", () => {
    expect(classifyOrigin("Website Form", [])).toBe("form");
    expect(classifyOrigin("Estimate Request", [])).toBe("form");
  });
  it("maps chat widget sources to chat", () => {
    expect(classifyOrigin("Chat Widget", [])).toBe("chat");
    expect(classifyOrigin("website chat", [])).toBe("chat");
  });
  it("maps ad / utm sources to paid", () => {
    expect(classifyOrigin("Facebook Ad", [])).toBe("paid");
    expect(classifyOrigin("utm_campaign spring", [])).toBe("paid");
  });
  it("maps reactivation tags to react before anything else", () => {
    expect(classifyOrigin("Website Form", ["reactivation"])).toBe("react");
    expect(classifyOrigin("", ["win-back"])).toBe("react");
  });
  it("maps inbound call sources to call", () => {
    expect(classifyOrigin("Inbound Call", [])).toBe("call");
  });
  it("maps plain social sources to social, not paid", () => {
    expect(classifyOrigin("Instagram", [])).toBe("social");
    expect(classifyOrigin("Facebook", [])).toBe("social");
  });
  it("falls back to other for empty or unknown", () => {
    expect(classifyOrigin("", [])).toBe("other");
    expect(classifyOrigin("Manual", [])).toBe("other");
    expect(classifyOrigin(null, undefined)).toBe("other");
  });
});

describe("normalizeChannel", () => {
  it("normalizes GHL message types", () => {
    expect(normalizeChannel("TYPE_SMS")).toBe("sms");
    expect(normalizeChannel("Email")).toBe("email");
    expect(normalizeChannel("Instagram")).toBe("ig");
    expect(normalizeChannel("Facebook")).toBe("messenger");
    expect(normalizeChannel("")).toBe("other");
    expect(normalizeChannel(null)).toBe("other");
  });
});
