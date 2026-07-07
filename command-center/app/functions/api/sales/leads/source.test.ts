import { describe, it, expect } from "vitest";
import { classifySource } from "./source";

describe("classifySource", () => {
  it("classifies chat-widget leads", () => {
    expect(classifySource("Chat Widget")).toBe("chat");
    expect(classifySource("website chat")).toBe("chat");
  });

  it("classifies paid-ad leads", () => {
    expect(classifySource("Facebook")).toBe("ad");
    expect(classifySource("Instagram Lead Ad")).toBe("ad");
    expect(classifySource("paid social")).toBe("ad");
    expect(classifySource("Meta")).toBe("ad");
  });

  it("defaults everything else to a form", () => {
    expect(classifySource("Website Form")).toBe("form");
    expect(classifySource("")).toBe("form");
    expect(classifySource(null)).toBe("form");
    expect(classifySource(undefined)).toBe("form");
  });

  it("does not false-positive on ordinary words containing fb/ig", () => {
    expect(classifySource("Signup Form")).toBe("form");
    expect(classifySource("Digital Form")).toBe("form");
    expect(classifySource("Original Inquiry")).toBe("form");
  });
});
