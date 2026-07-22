import { describe, it, expect } from "vitest";
import { shouldPersistQuery, PERSIST_CACHE_BUSTER } from "./queryClient";

// shouldPersistQuery is the only thing standing between a query answer and
// plain localStorage. Two classes of answer must never reach disk: a bearer
// credential (preview-token) and a client's customer correspondence
// (setter-inbox, the Setter Suite's whole-inbox read).

describe("shouldPersistQuery", () => {
  it("persists an ordinary successful read", () => {
    expect(shouldPersistQuery(["ads", "insights"], "success")).toBe(true);
  });

  it("refuses to persist a setter inbox thread list", () => {
    expect(shouldPersistQuery(["setter-inbox", "tenant-1"], "success")).toBe(false);
  });

  it("refuses to persist a single setter inbox thread", () => {
    expect(shouldPersistQuery(["setter-inbox", "tenant-1", "contact-9"], "success")).toBe(false);
  });

  it("still refuses the preview token", () => {
    expect(shouldPersistQuery(["preview-token", "tenant-1"], "success")).toBe(false);
  });

  it("matches the blocked stem anywhere in the key, not only first", () => {
    expect(shouldPersistQuery(["admin", "setter-inbox"], "success")).toBe(false);
  });

  // REGRESSION. The audit log carries the setter.send payload, which embeds the
  // full outbound message body, and one page of it spans EVERY tenant. The
  // first cut of this blocked the inbox but not the audit log, which leaked
  // strictly more than it protected: one client's threads versus every
  // client's messages. These use the real key shape from useAdminAuditQuery.
  it("refuses to persist the audit log, which carries sent message bodies", () => {
    expect(shouldPersistQuery(["admin", "audit", 50, 0, null, null], "success")).toBe(false);
  });

  it("refuses the audit log when filtered to sends", () => {
    expect(
      shouldPersistQuery(["admin", "audit", 200, 0, "tenant-1", "setter.send"], "success"),
    ).toBe(false);
  });

  it("never persists a non-success query, blocked stem or not", () => {
    expect(shouldPersistQuery(["ads", "insights"], "error")).toBe(false);
    expect(shouldPersistQuery(["ads", "insights"], "pending")).toBe(false);
  });

  it("ignores non-string key parts without throwing", () => {
    expect(shouldPersistQuery(["ads", 7, null, { from: "2026-01-01" }], "success")).toBe(true);
  });
});

describe("PERSIST_CACHE_BUSTER", () => {
  // Adding a stem to NEVER_PERSIST_KEYS only stops FUTURE writes. Snapshots
  // already on disk rehydrate unless the buster changes, so the bump is part
  // of the fix, not decoration.
  // Pinned to the exact value on purpose: adding a stem without bumping this
  // leaves the old snapshot on disk, so the test failing IS the reminder.
  it("was bumped past every earlier value so old snapshots are discarded", () => {
    expect(PERSIST_CACHE_BUSTER).not.toBe("2026-07-19.no-credential-persist");
    expect(PERSIST_CACHE_BUSTER).not.toBe("2026-07-21.no-inbox-persist");
    expect(PERSIST_CACHE_BUSTER).toBe("2026-07-21.no-inbox-or-audit-persist");
  });
});
