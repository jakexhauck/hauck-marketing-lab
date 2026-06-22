import { describe, it, expect } from "vitest";
import { highestRole, isOnline, validateAttachment, unreadCount } from "./chatLogic";

// Local role shape matches the ChatRole contract from 00-INDEX (Phase 04 adds it to api.ts).
type RoleFixture = { id: string; name: string; color: string; isPreset: boolean; sortOrder: number };

const role = (name: string, sort: number, color = "#fff"): RoleFixture =>
  ({ id: name, name, color, isPreset: true, sortOrder: sort });

describe("highestRole", () => {
  it("returns the role with the greatest sortOrder", () => {
    expect(highestRole([role("Rep", 20), role("Owner", 40)])?.name).toBe("Owner");
  });
  it("returns null for no roles", () => {
    expect(highestRole([])).toBeNull();
  });
});

describe("isOnline", () => {
  it("true when a presence id is in the live set", () => {
    expect(isOnline("staff:1", new Set(["staff:1"]))).toBe(true);
  });
  it("false otherwise", () => {
    expect(isOnline("staff:2", new Set(["staff:1"]))).toBe(false);
  });
});

describe("validateAttachment", () => {
  it("accepts a png under the limit", () => {
    expect(validateAttachment("image/png", 1_000_000).ok).toBe(true);
  });
  it("rejects an unsupported type", () => {
    expect(validateAttachment("application/x-msdownload", 10).ok).toBe(false);
  });
  it("rejects oversized files", () => {
    expect(validateAttachment("image/png", 30_000_000).ok).toBe(false);
  });
});

describe("unreadCount", () => {
  it("counts messages after last_read_at", () => {
    const msgs = [{ createdAt: "2026-06-22T10:00:00Z" }, { createdAt: "2026-06-22T11:00:00Z" }];
    expect(unreadCount(msgs, "2026-06-22T10:30:00Z")).toBe(1);
  });
  it("counts all when never read", () => {
    const msgs = [{ createdAt: "2026-06-22T10:00:00Z" }];
    expect(unreadCount(msgs, null)).toBe(1);
  });
});
