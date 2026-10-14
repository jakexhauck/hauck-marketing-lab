import { describe, it, expect } from "vitest";
import { cleanDatasetId, cleanToken, maskToken } from "./capiValues";

describe("cleanDatasetId", () => {
  it("accepts digits, trims, and allows clearing", () => {
    expect(cleanDatasetId(" 982737334630926 ")).toBe("982737334630926");
    expect(cleanDatasetId("")).toBe("");
  });
  it("rejects anything else", () => {
    expect(cleanDatasetId("act_123456")).toBeNull();
    expect(cleanDatasetId("12")).toBeNull();
    expect(cleanDatasetId(42)).toBeNull();
  });
});

describe("cleanToken", () => {
  it("accepts a token-shaped string and allows clearing", () => {
    expect(cleanToken(" EAAGabcdefghijklmnopqrstuvwxyz0123 ")).toBe("EAAGabcdefghijklmnopqrstuvwxyz0123");
    expect(cleanToken("")).toBe("");
  });
  it("rejects spaces, short strings and non-strings", () => {
    expect(cleanToken("EAAG abc defghijklmnopqrstuvwxyz")).toBeNull();
    expect(cleanToken("short")).toBeNull();
    expect(cleanToken(null)).toBeNull();
  });
});

describe("maskToken", () => {
  it("keeps the first 6 and last 4", () => {
    expect(maskToken("EAAGabcdefghijklmnopqrstuvwxyz0123")).toBe("EAAGab...0123");
  });
  it("hides short values entirely", () => {
    expect(maskToken("abc")).toBe("••••");
    expect(maskToken("")).toBe("");
  });
});
