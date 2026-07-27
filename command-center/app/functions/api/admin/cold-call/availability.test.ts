import { describe, expect, it } from "vitest";
import { resolveTarget } from "./availability";
import type { ApiData } from "../../../lib/env";

// Who a request is allowed to touch. The rest of the endpoint is a read and an
// upsert; this is the part that decides whose week is on screen, so it is
// pinned down on its own.

function ctxFor(role: string, id: string) {
  return { data: { admin: { id, role } } as unknown as ApiData };
}

describe("resolveTarget", () => {
  it("pins a cold caller to themselves", () => {
    expect(resolveTarget(ctxFor("cold_caller", "zach"), null)).toBe("zach");
  });

  it("ignores a callerId a cold caller sends for someone else", () => {
    // The whole point: a hand-rolled request naming a colleague gets the
    // sender's own week back, not a refusal to argue with and not theirs.
    expect(resolveTarget(ctxFor("cold_caller", "zach"), "jake")).toBe("zach");
    expect(resolveTarget(ctxFor("cold_caller", "zach"), "  jake  ")).toBe("zach");
  });

  it("pins a setter to themselves too", () => {
    // A setter cannot reach this route at all (adminRoles), but if that ever
    // changes, "not an owner" must keep meaning "yourself".
    expect(resolveTarget(ctxFor("setter", "sam"), "zach")).toBe("sam");
  });

  it("lets an owner name anyone", () => {
    expect(resolveTarget(ctxFor("owner", "jake"), "zach")).toBe("zach");
  });

  it("falls back to the owner themselves when no one is named", () => {
    expect(resolveTarget(ctxFor("owner", "jake"), null)).toBe("jake");
    expect(resolveTarget(ctxFor("owner", "jake"), "")).toBe("jake");
    // "Everyone" arrives as blank-ish; it must not become a lookup for a person
    // whose id is whitespace.
    expect(resolveTarget(ctxFor("owner", "jake"), "   ")).toBe("jake");
  });

  it("refuses when there is no admin on the request at all", () => {
    expect(resolveTarget({ data: {} as ApiData }, "zach")).toBeNull();
  });
});
