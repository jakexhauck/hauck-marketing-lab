import { describe, it, expect } from "vitest";
import { adminReturnPath } from "./loginReturn";

describe("adminReturnPath", () => {
  it("returns the admin page the login interrupted", () => {
    expect(adminReturnPath({ from: "/admin/book" })).toBe("/admin/book");
    expect(adminReturnPath({ from: "/admin/setter?tab=inbox" })).toBe("/admin/setter?tab=inbox");
  });
  it("ignores anything that is not an admin path", () => {
    expect(adminReturnPath({ from: "/home" })).toBeNull();
    expect(adminReturnPath({ from: "/administrator" })).toBeNull();
    expect(adminReturnPath({ from: "//evil.com/admin" })).toBeNull();
    expect(adminReturnPath({ from: "https://evil.com/admin/book" })).toBeNull();
  });
  it("handles no state at all", () => {
    expect(adminReturnPath(null)).toBeNull();
    expect(adminReturnPath(undefined)).toBeNull();
    expect(adminReturnPath({ from: 42 })).toBeNull();
  });
});
