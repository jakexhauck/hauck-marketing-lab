import { describe, expect, it } from "vitest";
import { OWNER_LINK_TARGETS, isShortCode, resolveShortCode, shortCode } from "./ownerShortLink";

const LOC_A = "yVfX127fswQ03fydxBQg";
const LOC_B = "OznT3yyuwK3dqVXDsCaD";

describe("shortCode", () => {
  it("is 10 base36 characters, stable, and different per link and per client", async () => {
    const a = await shortCode("s3cret", "call-now", LOC_A);
    expect(isShortCode(a)).toBe(true);
    expect(await shortCode("s3cret", "call-now", LOC_A)).toBe(a);
    expect(await shortCode("s3cret", "lead-outcome", LOC_A)).not.toBe(a);
    expect(await shortCode("s3cret", "call-now", LOC_B)).not.toBe(a);
    expect(await shortCode("other", "call-now", LOC_A)).not.toBe(a);
  });
});

describe("resolveShortCode", () => {
  it("finds the client and link a code belongs to", async () => {
    for (const target of OWNER_LINK_TARGETS) {
      const code = await shortCode("s3cret", target.purpose, LOC_B);
      expect(await resolveShortCode("s3cret", code, [LOC_A, LOC_B])).toEqual({ locationId: LOC_B, target });
    }
  });

  it("rejects unknown, malformed and unsigned codes", async () => {
    const code = await shortCode("s3cret", "call-now", LOC_A);
    expect(await resolveShortCode("s3cret", "aaaaaaaaaa", [LOC_A])).toBeNull();
    expect(await resolveShortCode("s3cret", code.toUpperCase(), [LOC_A])).toBeNull();
    expect(await resolveShortCode("s3cret", code, [LOC_B])).toBeNull();
    expect(await resolveShortCode("", code, [LOC_A])).toBeNull();
  });
});
