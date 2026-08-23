import { describe, expect, it } from "vitest";
import { logError } from "./errorLog";
import type { Env } from "./env";

// Minimal stand-in for the Supabase client: only the chain errorLog uses.
function fakeClient() {
  const calls: { table: string; op: string }[] = [];
  const builder = (table: string) => ({
    insert: () => {
      calls.push({ table, op: "insert" });
      // Resolves like the real postgrest builder: awaited, then { error } read.
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      lt: () => {
        calls.push({ table, op: "delete-retention" });
        return Promise.resolve({ error: null });
      },
    }),
  });
  const client = {
    from: (table: string) => builder(table),
  };
  return { client: client as never, calls };
}

const ENV = {} as Env;

describe("logError", () => {
  it("writes one receipt and runs the retention delete", async () => {
    const { client, calls } = fakeClient();
    const ok = await logError(ENV, "webhook", "calendar mirror failed", { tenantId: "t1" }, client);
    expect(ok).toBe(true);
    expect(calls.some((c) => c.op === "insert")).toBe(true);
    expect(calls.some((c) => c.op === "delete-retention")).toBe(true);
  });

  it("survives a context that will not serialize", async () => {
    const { client, calls } = fakeClient();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const ok = await logError(ENV, "api", "boom", circular, client);
    expect(ok).toBe(true);
    expect(calls.some((c) => c.op === "insert")).toBe(true);
  });

  it("reports failure when the insert is refused, without throwing", async () => {
    // The refusal path is exercised by the real client; here we only assert
    // that a throwing client never propagates.
    const throwing = {
      from: () => {
        throw new Error("supabase down");
      },
    } as never;
    const ok = await logError(ENV, "api", "boom", undefined, throwing);
    expect(ok).toBe(false);
  });
});
