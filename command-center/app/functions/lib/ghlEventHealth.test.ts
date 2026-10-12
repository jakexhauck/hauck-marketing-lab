import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eventSourceForTenant } from "./ghlEventHealth";

function fake(row: unknown, error: unknown = null): SupabaseClient {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error }) };
  return { from: () => q } as unknown as SupabaseClient;
}

describe("eventSourceForTenant", () => {
  it("is the Marketplace app unless the row says workflow outright", async () => {
    expect(await eventSourceForTenant(fake({ ghl_event_source: "app" }), "t")).toBe("app");
    expect(await eventSourceForTenant(fake({ ghl_event_source: null }), "t")).toBe("app");
    expect(await eventSourceForTenant(fake(null), "t")).toBe("app");
    expect(await eventSourceForTenant(fake(null, { message: "down" }), "t")).toBe("app");
    expect(await eventSourceForTenant(fake({ ghl_event_source: "workflow" }), "t")).toBe("workflow");
  });
});
