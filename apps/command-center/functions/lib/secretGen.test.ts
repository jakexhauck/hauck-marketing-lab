import { describe, it, expect } from "vitest";
import { hex32, vapidPair, generateFor } from "./secretGen";

describe("hex32", () => {
  it("clears the 32-character floor both cron gates enforce", () => {
    expect(hex32()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => hex32()));
    expect(seen.size).toBe(50);
  });
});

describe("vapidPair", () => {
  it("returns a 65-byte uncompressed public point, base64url", async () => {
    const { publicKey } = await vapidPair();
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    // 65 bytes -> 87 base64url characters with the padding stripped. A shorter
    // key here means the export used the wrong format and browsers will reject
    // it at subscribe time rather than here.
    expect(publicKey.length).toBe(87);
    const bytes = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
    expect(bytes.charCodeAt(0)).toBe(0x04);
    expect(bytes.length).toBe(65);
  });

  it("returns a 32-byte private scalar, base64url", async () => {
    const { privateKey } = await vapidPair();
    expect(privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("generates a fresh pair each time", async () => {
    const a = await vapidPair();
    const b = await vapidPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.privateKey).not.toBe(b.privateKey);
  });
});

describe("generateFor", () => {
  it("returns one value for a hex key", async () => {
    const out = await generateFor("SESSION_SECRET", "hex32");
    expect(Object.keys(out.values)).toEqual(["SESSION_SECRET"]);
  });

  it("returns both VAPID halves whichever one is asked for", async () => {
    // Both halves, always. Generating them separately yields a public key that
    // does not match the private one, and that failure only shows up later as
    // pushes that silently never arrive.
    const fromPublic = await generateFor("VAPID_PUBLIC_KEY", "vapid", "VAPID_PRIVATE_KEY");
    expect(Object.keys(fromPublic.values).sort()).toEqual([
      "VAPID_PRIVATE_KEY",
      "VAPID_PUBLIC_KEY",
    ]);

    const fromPrivate = await generateFor("VAPID_PRIVATE_KEY", "vapid", "VAPID_PUBLIC_KEY");
    expect(Object.keys(fromPrivate.values).sort()).toEqual([
      "VAPID_PRIVATE_KEY",
      "VAPID_PUBLIC_KEY",
    ]);
    expect(fromPrivate.values.VAPID_PUBLIC_KEY.length).toBe(87);
    expect(fromPrivate.values.VAPID_PRIVATE_KEY.length).toBe(43);
  });
});
