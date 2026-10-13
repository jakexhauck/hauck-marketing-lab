import { describe, it, expect } from "vitest";
import { landed, stillPending, type PendingText } from "./coldSmsChat";

const at = "2026-10-13T15:00:00.000Z";
const p = (over: Partial<PendingText> = {}): PendingText => ({ tempId: "t1", body: "Hey Bob", at, status: "sent", ...over });
const msg = (over: Partial<{ id: string; body: string; direction: string; at: string }> = {}) => ({
  id: "m1",
  body: "Hey Bob",
  direction: "outbound",
  at: "2026-10-13T15:00:01.000Z",
  ...over,
});

describe("landed", () => {
  it("matches by the id GHL gave the send", () => {
    expect(landed(p({ messageId: "m1" }), [msg({ body: "different" })])).toBe(true);
  });
  it("falls back to same words, outbound, around the same time", () => {
    expect(landed(p(), [msg({ id: "x" })])).toBe(true);
    expect(landed(p(), [msg({ id: "x", direction: "inbound" })])).toBe(false);
    expect(landed(p(), [msg({ id: "x", at: "2026-10-12T15:00:00.000Z" })])).toBe(false);
  });
  it("never clears a text that is still sending or failed", () => {
    expect(landed(p({ status: "sending" }), [msg()])).toBe(false);
    expect(landed(p({ status: "failed" }), [msg()])).toBe(false);
  });
  it("does not clear when the thread lacks it", () => {
    expect(landed(p({ messageId: "m9" }), [msg({ id: "m1", body: "older text" })])).toBe(false);
  });
});

describe("stillPending", () => {
  it("drops only the ones that landed", () => {
    const a = p({ tempId: "a", messageId: "m1" });
    const b = p({ tempId: "b", body: "Second", status: "sending" });
    expect(stillPending([a, b], [msg()]).map((x) => x.tempId)).toEqual(["b"]);
  });
});
