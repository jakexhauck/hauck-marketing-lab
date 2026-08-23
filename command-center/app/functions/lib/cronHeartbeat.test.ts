import { describe, it, expect } from "vitest";
import { heartbeatAgeMinutes, judgeHeartbeat } from "./cronHeartbeat";

const NOW = Date.parse("2026-08-22T12:00:00Z");

describe("heartbeatAgeMinutes", () => {
  it("returns null for a job that has never run", () => {
    expect(heartbeatAgeMinutes(null, NOW)).toBeNull();
    expect(heartbeatAgeMinutes(undefined, NOW)).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(heartbeatAgeMinutes("not-a-date", NOW)).toBeNull();
  });

  it("measures whole minutes since the last run", () => {
    const last = new Date(NOW - 5.5 * 60000).toISOString();
    expect(heartbeatAgeMinutes(last, NOW)).toBe(5);
  });

  it("never goes negative on clock skew", () => {
    const last = new Date(NOW + 5 * 60000).toISOString();
    expect(heartbeatAgeMinutes(last, NOW)).toBe(0);
  });
});

describe("judgeHeartbeat", () => {
  it("fails a job that has never recorded success", () => {
    const s = judgeHeartbeat("ads-sync", null, NOW);
    expect(s.state).toBe("failed");
    expect(s.detail).toMatch(/never/i);
  });

  it("passes a fresh dialer sync", () => {
    const row = { job: "cold-call-sync", last_ok_at: new Date(NOW - 2 * 60000).toISOString() };
    expect(judgeHeartbeat("cold-call-sync", row, NOW).state).toBe("ok");
  });

  it("fails a dialer sync silent for longer than its budget", () => {
    // 10 minute budget; 11 minutes is three missed firings plus change.
    const row = { job: "cold-call-sync", last_ok_at: new Date(NOW - 11 * 60000).toISOString() };
    const s = judgeHeartbeat("cold-call-sync", row, NOW);
    expect(s.state).toBe("failed");
    expect(s.detail).toMatch(/stopped/);
  });

  it("gives the nightly ads sync its one-missed-night budget", () => {
    const fresh = { job: "ads-sync", last_ok_at: new Date(NOW - 20 * 60 * 60000).toISOString() };
    expect(judgeHeartbeat("ads-sync", fresh, NOW).state).toBe("ok");
    const stale = { job: "ads-sync", last_ok_at: new Date(NOW - 27 * 60 * 60000).toISOString() };
    expect(judgeHeartbeat("ads-sync", stale, NOW).state).toBe("failed");
  });

  it("treats exactly-at-budget as still alive (strictly greater fails)", () => {
    const row = { job: "calendar-sync", last_ok_at: new Date(NOW - 45 * 60000).toISOString() };
    expect(judgeHeartbeat("calendar-sync", row, NOW).state).toBe("ok");
  });
});
