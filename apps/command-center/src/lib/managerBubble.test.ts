import { describe, expect, it } from "vitest";
import { bubbleOpen, hideBubbleOn } from "./managerBubble";

describe("bubbleOpen", () => {
  it("reopens only on the value it saved", () => {
    expect(bubbleOpen("1")).toBe(true);
    expect(bubbleOpen(null)).toBe(false);
    expect(bubbleOpen("x")).toBe(false);
    expect(bubbleOpen("")).toBe(false);
  });
});

describe("hideBubbleOn", () => {
  it("hides on the Manager's own page, where the full chat is already open", () => {
    expect(hideBubbleOn("/admin/agents/manager")).toBe(true);
    expect(hideBubbleOn("/admin/agents/manager/")).toBe(true);
  });

  it("shows everywhere else in the admin", () => {
    expect(hideBubbleOn("/admin/client/abc/director")).toBe(false);
    expect(hideBubbleOn("/admin")).toBe(false);
    expect(hideBubbleOn("/admin/sops/fulfillment")).toBe(false);
  });
});
