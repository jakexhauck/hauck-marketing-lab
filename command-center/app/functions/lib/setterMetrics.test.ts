import { describe, it, expect } from "vitest";
import { rollUpByContact, chunk } from "./setterMetrics";

const dial = (contact: string, at: string, spoke: boolean, outcome: string) =>
  ({ contact_id: contact, dialed_at: at, spoke, outcome });

describe("rollUpByContact", () => {
  it("counts attempts and takes the earliest dial as first call", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T14:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.attempts).toBe(3);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
  });

  it("marks contacted when any dial spoke, regardless of order", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "not_interested"),
      dial("c1", "2026-07-20T10:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
  });

  it("takes the outcome of the most recent dial, not the last in the array", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.lastOutcome).toBe("booked");
  });

  it("keeps contacts separate", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
      dial("c2", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
    expect(r.get("c2")!.contacted).toBe(false);
  });

  it("orders by real instant, not string, across mixed UTC-offset representations", () => {
    // "2026-07-20T23:00:00-04:00" is 2026-07-21T03:00:00Z: chronologically LATER
    // than "2026-07-21T00:30:00Z", even though its string sorts EARLIER (the
    // "20" before "21"). A raw string compare would pick this row as the
    // earliest dial and its outcome as the latest one; both are wrong.
    const r = rollUpByContact([
      dial("c1", "2026-07-20T23:00:00-04:00", false, "no_answer"),
      dial("c1", "2026-07-21T00:30:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-21T00:30:00Z");
    expect(r.get("c1")!.lastOutcome).toBe("no_answer");
  });

  it("treats an unparseable dialed_at as attempted but does not let it win ordering over a real timestamp", () => {
    const r = rollUpByContact([
      dial("c1", "not-a-date", false, "no_answer"),
      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.attempts).toBe(2);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
    expect(r.get("c1")!.lastOutcome).toBe("booked");
  });

  it("falls back to the raw value when no dial for a contact has a parseable timestamp", () => {
    const r = rollUpByContact([dial("c1", "", false, "no_answer")]);
    expect(r.get("c1")!.attempts).toBe(1);
    expect(r.get("c1")!.firstDialedAt).toBe("");
    expect(r.get("c1")!.lastOutcome).toBe("no_answer");
  });
});

describe("chunk", () => {
  // functions/api/admin/setter/leads.ts batches the setter_dials .in() lookup
  // through this, so a pipeline with a few hundred leads never serializes a
  // single CRM-id list long enough for Supabase's edge to reject the URL.

  it("returns an empty array for an empty list", () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it("returns one batch when the list is shorter than the batch size", () => {
    expect(chunk(["a", "b"], 100)).toEqual([["a", "b"]]);
  });

  it("returns exactly one batch when the list is exactly the batch size", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id${i}`);
    const batches = chunk(ids, 100);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(100);
  });

  it("splits into multiple batches, preserving order, when over the batch size", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    const batches = chunk(ids, 100);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(100);
    expect(batches[2]).toHaveLength(50);
    expect(batches.flat()).toEqual(ids);
  });
});
