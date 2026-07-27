import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => ({ getServiceClient: () => (supabaseUp ? fakeClient() : null) }));
vi.mock("@block65/webcrypto-web-push", () => ({
  buildPushPayload: () => Promise.resolve({ method: "POST", headers: {}, body: "" }),
}));

import { recordAndAlert } from "./healthWatch";
import type { Env } from "./env";
import type { HealthResponse } from "../../src/lib/connectionHealth";

let supabaseUp = true;
let storedRuns: { run_id: string; rows: Record<string, unknown>[] }[] = [];
let subscriptions: Record<string, unknown>[] = [];
let insertShouldFail = false;
let inserted: Record<string, unknown>[][] = [];
let pushedTo: string[] = [];
let selectedParticipantKind: string | null = null;
let deletedSubIds: number[] = [];
let pruneCutoffs: string[] = [];

const env = {
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
} as unknown as Env;

function fakeClient() {
  return {
    from(table: string) {
      if (table === "connection_health_snapshots") return snapshotTable();
      if (table === "push_subscriptions") return subscriptionTable();
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function snapshotTable() {
  const q: Record<string, unknown> = {
    select: () => q,
    // The two-step read: newest run_id, then that run's rows.
    order: () => q,
    limit: () =>
      Promise.resolve({
        data: storedRuns.length ? [{ run_id: storedRuns[storedRuns.length - 1].run_id }] : [],
        error: null,
      }),
    eq: (_col: string, runId: string) =>
      Promise.resolve({
        data: storedRuns.find((r) => r.run_id === runId)?.rows ?? [],
        error: null,
      }),
    insert: (rows: Record<string, unknown>[]) => {
      if (insertShouldFail) return Promise.resolve({ error: { message: "insert exploded" } });
      inserted.push(rows);
      storedRuns.push({ run_id: rows[0].run_id as string, rows });
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      lt: (_col: string, cutoff: string) => {
        pruneCutoffs.push(cutoff);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return q;
}

function subscriptionTable() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, value: string) => {
      selectedParticipantKind = col === "participant_kind" ? value : null;
      return Promise.resolve({
        data: subscriptions.filter((s) => s[col] === value),
        error: null,
      });
    },
    delete: () => ({
      eq: (_col: string, id: number) => {
        deletedSubIds.push(id);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return q;
}

function response(metaOk: boolean): HealthResponse {
  return {
    environment: "production",
    checkedAt: "2026-07-27T12:00:00.000Z",
    connections: [
      {
        id: "meta-ads",
        configured: true,
        missing: [],
        credentials: [],
        probe: metaOk
          ? { state: "ok", detail: "Token accepted by Meta" }
          : { state: "failed", detail: "Meta returned 400" },
      },
    ],
    clients: [],
  };
}

beforeEach(() => {
  supabaseUp = true;
  storedRuns = [];
  subscriptions = [];
  insertShouldFail = false;
  inserted = [];
  pushedTo = [];
  selectedParticipantKind = null;
  deletedSubIds = [];
  pruneCutoffs = [];
  vi.stubGlobal("fetch", async (url: string) => {
    pushedTo.push(url);
    return new Response("", { status: 201 });
  });
});

describe("recordAndAlert", () => {
  it("records the run", async () => {
    const result = await recordAndAlert(env, response(true), "run-1");
    expect(result.recorded).toBe(1);
    expect(inserted[0][0]).toMatchObject({ connection_id: "meta-ads", state: "live" });
  });

  it("says nothing on the very first run, even if things are broken", async () => {
    // No previous snapshot means no flip. Otherwise turning the watchdog on
    // would immediately page about the entire estate.
    subscriptions = [{ id: 1, participant_kind: "admin", endpoint: "https://push/1", p256dh: "a", auth: "b" }];
    const result = await recordAndAlert(env, response(false), "run-1");
    expect(result.broke).toEqual([]);
    expect(pushedTo).toEqual([]);
  });

  it("alerts when a working connection breaks", async () => {
    subscriptions = [{ id: 1, participant_kind: "admin", endpoint: "https://push/1", p256dh: "a", auth: "b" }];
    await recordAndAlert(env, response(true), "run-1");
    const result = await recordAndAlert(env, response(false), "run-2");
    expect(result.broke).toEqual(["meta-ads"]);
    expect(result.notified).toBe(1);
    expect(pushedTo).toEqual(["https://push/1"]);
  });

  it("stays quiet while it stays broken", async () => {
    subscriptions = [{ id: 1, participant_kind: "admin", endpoint: "https://push/1", p256dh: "a", auth: "b" }];
    await recordAndAlert(env, response(true), "run-1");
    await recordAndAlert(env, response(false), "run-2");
    pushedTo = [];
    const third = await recordAndAlert(env, response(false), "run-3");
    expect(third.broke).toEqual([]);
    expect(pushedTo).toEqual([]);
  });

  it("notices a recovery but does not buzz anyone about it", async () => {
    subscriptions = [{ id: 1, participant_kind: "admin", endpoint: "https://push/1", p256dh: "a", auth: "b" }];
    await recordAndAlert(env, response(false), "run-1");
    await recordAndAlert(env, response(false), "run-2");
    pushedTo = [];
    const back = await recordAndAlert(env, response(true), "run-3");
    expect(back.recovered).toEqual(["meta-ads"]);
    expect(pushedTo).toEqual([]);
  });

  it("never sends an agency alert to a client's phone", async () => {
    // The single most embarrassing possible failure of this feature.
    subscriptions = [
      { id: 1, participant_kind: "admin", endpoint: "https://push/admin", p256dh: "a", auth: "b" },
      { id: 2, participant_kind: "staff", endpoint: "https://push/staff", p256dh: "a", auth: "b" },
      { id: 3, participant_kind: null, endpoint: "https://push/client", p256dh: "a", auth: "b" },
    ];
    await recordAndAlert(env, response(true), "run-1");
    await recordAndAlert(env, response(false), "run-2");
    expect(selectedParticipantKind).toBe("admin");
    expect(pushedTo).toEqual(["https://push/admin"]);
  });

  it("prunes a dead subscription instead of retrying it forever", async () => {
    subscriptions = [{ id: 7, participant_kind: "admin", endpoint: "https://push/gone", p256dh: "a", auth: "b" }];
    vi.stubGlobal("fetch", async () => new Response("", { status: 410 }));
    await recordAndAlert(env, response(true), "run-1");
    const result = await recordAndAlert(env, response(false), "run-2");
    expect(deletedSubIds).toEqual([7]);
    expect(result.notified).toBe(0);
  });

  it("keeps the alert delayed rather than lost when the write fails", async () => {
    // Nothing stored means the next run compares against the same previous
    // snapshot and reports the same flip.
    await recordAndAlert(env, response(true), "run-1");
    insertShouldFail = true;
    const failed = await recordAndAlert(env, response(false), "run-2");
    expect(failed.recorded).toBe(0);
    insertShouldFail = false;
    subscriptions = [{ id: 1, participant_kind: "admin", endpoint: "https://push/1", p256dh: "a", auth: "b" }];
    const retried = await recordAndAlert(env, response(false), "run-3");
    expect(retried.broke).toEqual(["meta-ads"]);
  });

  it("prunes snapshots older than a week", async () => {
    await recordAndAlert(env, response(true), "run-1");
    expect(pruneCutoffs).toHaveLength(1);
    const days = (Date.now() - new Date(pruneCutoffs[0]).getTime()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("is inert rather than fatal when Supabase is unconfigured", async () => {
    // This runs inside a request whose real job is returning the snapshot. A
    // watchdog that can 500 the page it watches is worse than no watchdog.
    supabaseUp = false;
    const result = await recordAndAlert(env, response(false), "run-1");
    expect(result).toEqual({ recorded: 0, broke: [], recovered: [], notified: 0 });
  });

  it("records without sending when VAPID keys are absent", async () => {
    await recordAndAlert({} as Env, response(true), "run-1");
    const result = await recordAndAlert({} as Env, response(false), "run-2");
    expect(result.broke).toEqual(["meta-ads"]);
    expect(result.notified).toBe(0);
    expect(pushedTo).toEqual([]);
  });
});
