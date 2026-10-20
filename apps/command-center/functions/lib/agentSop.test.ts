import { describe, expect, it } from "vitest";
import type { ClaimResponse } from "../../src/lib/agentWire";
import { sopForAgent } from "../../src/lib/sopPrompt";
import { withSop } from "./agentSop";

const claim = (agent: string) => ({ chat: { agent } }) as unknown as ClaimResponse;

describe("withSop", () => {
  it("passes no claim through", () => {
    expect(withSop(null)).toBeNull();
  });

  it("attaches the agent's map as its SOP", () => {
    expect(withSop(claim("ghl"))!.sop).toEqual(sopForAgent("ghl"));
  });

  it("leaves an unknown agent without an SOP rather than failing the claim", () => {
    const c = claim("nobody");
    expect(withSop(c)).toBe(c);
  });
});
