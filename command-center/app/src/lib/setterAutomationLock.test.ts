import { describe, expect, it } from "vitest";
import {
  LOCK_TIMEOUT_MS,
  lockFor,
  lockedContactIds,
  resolveLocks,
  type AutomationLock,
} from "./setterAutomationLock";
import type { ApiSetterLead } from "./api";

const T0 = 1_700_000_000_000;

function lead(overrides: Partial<ApiSetterLead>): ApiSetterLead {
  return {
    id: "opp-1",
    contactId: "c-1",
    name: "Test Lead",
    phone: "+15550000000",
    city: "",
    stageName: "New Lead",
    createdAt: new Date(T0).toISOString(),
    updatedAt: null,
    attempts: 0,
    firstDialedAt: null,
    contacted: false,
    lastOutcome: null,
    tags: [],
    ...overrides,
  };
}

describe("lockFor", () => {
  it("captures the contact and the stage it was locked in", () => {
    const l = lockFor(lead({ contactId: "c-9", stageName: "Hot Lead" }), T0);
    expect(l).toEqual({ contactId: "c-9", stageName: "Hot Lead", lockedAt: T0 });
  });
});

describe("resolveLocks", () => {
  const lock: AutomationLock = { contactId: "c-1", stageName: "New Lead", lockedAt: T0 };

  it("keeps the lock while the lead sits in the same stage", () => {
    const out = resolveLocks([lock], [lead({})], T0 + 5_000);
    expect(out).toHaveLength(1);
  });

  it("returns the same array reference when nothing changed", () => {
    const locks = [lock];
    expect(resolveLocks(locks, [lead({})], T0 + 5_000)).toBe(locks);
  });

  it("releases when the lead's stage changed", () => {
    const out = resolveLocks([lock], [lead({ stageName: "Hot Lead" })], T0 + 5_000);
    expect(out).toHaveLength(0);
  });

  it("releases when the lead left the board entirely", () => {
    const out = resolveLocks([lock], [], T0 + 5_000);
    expect(out).toHaveLength(0);
  });

  it("releases after the timeout even if the board never changed", () => {
    const out = resolveLocks([lock], [lead({})], T0 + LOCK_TIMEOUT_MS);
    expect(out).toHaveLength(0);
  });

  it("keeps unrelated locks while releasing finished ones", () => {
    const other: AutomationLock = { contactId: "c-2", stageName: "New Lead", lockedAt: T0 };
    const board = [
      lead({ id: "opp-1", contactId: "c-1", stageName: "Hot Lead" }),
      lead({ id: "opp-2", contactId: "c-2", stageName: "New Lead" }),
    ];
    const out = resolveLocks([lock, other], board, T0 + 5_000);
    expect(out).toEqual([other]);
  });

  it("stays locked when another opportunity for the same contact is elsewhere", () => {
    const board = [
      lead({ id: "opp-1", contactId: "c-1", stageName: "New Lead" }),
      lead({ id: "opp-2", contactId: "c-1", stageName: "Hot Lead" }),
    ];
    const out = resolveLocks([lock], board, T0 + 5_000);
    expect(out).toHaveLength(1);
  });
});

describe("lockedContactIds", () => {
  it("collects contact ids", () => {
    const locks: AutomationLock[] = [
      { contactId: "c-1", stageName: "New Lead", lockedAt: T0 },
      { contactId: "c-2", stageName: "New Lead", lockedAt: T0 },
    ];
    expect(lockedContactIds(locks)).toEqual(new Set(["c-1", "c-2"]));
  });
});
