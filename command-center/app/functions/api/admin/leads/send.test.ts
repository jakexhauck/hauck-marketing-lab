import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ApiData } from "../../../lib/env";

// What this file is really guarding is a NUMBER.
//
// Pages Functions on the free plan cut a request off at fifty outbound calls.
// This handler used to spend six per lead (a contact upsert, the run's tags, a
// second tags call for the dialer, a lookup against the book, an insert, and a
// stamp), so a batch of ten asked for sixty-five and died two thirds of the way
// through with the leads before it already in GoHighLevel and no record here that
// they had gone (Jake, 21 August 2026).
//
// The fix was to stop doing per-lead work that could be done per batch. Nothing
// about that is visible in a type or caught by a linter: someone adds one more
// await inside the loop, it multiplies by the batch size, and the send starts
// failing again for a reason nobody would connect to the change. So the budget is
// asserted directly, by counting every Supabase query and every GoHighLevel call
// the handler makes.

const supabaseMock = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock("../../../lib/supabase", () => supabaseMock);

const ghlMock = vi.hoisted(() => ({ ghlJson: vi.fn(), ghlFetch: vi.fn() }));
vi.mock("../../../lib/ghl", () => ghlMock);

vi.mock("../../../lib/adminAuth", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }));

import { onRequestPost } from "./send";
import { ghlJson } from "../../../lib/ghl";
import { POWER_DIALER_TAG } from "../../../lib/coldCallTags";

const ADMIN = { id: "adm-1", email: "jake@example.test", name: "Jake", status: "active" as const };

const ENV = {
  AGENCY_GHL_LOCATION_ID: "loc-1",
  AGENCY_GHL_TOKEN: "tok-1",
} as unknown as Env;

function leadRow(n: number) {
  return {
    id: `l${n}`,
    business_name: `Garage Co ${n}`,
    phone_e164: `+1214555${String(1000 + n)}`,
    city: "Plano",
    state: "TX",
    website: "https://garage.example",
    rating: 4.6,
    review_count: 30,
    // Null on purpose. Every CSV-imported lead has no score, and the send must
    // take it: the score stopped gating anything on 20 August.
    icp_score: null,
    icp_flags: [],
    send_status: "pending",
    sent_to: null,
    line_type: "wireless",
    run_id: "run-1",
    niche_id: "garage_doors",
  };
}

// Counts one query per `.from()`, which is exactly one HTTP request to
// PostgREST, and records what each chain did so the shape can be asserted too.
function fakeSupabase(rows: unknown[]) {
  const log: { table: string; op: string; rows?: unknown[] }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, op: "select" } as { table: string; op: string; rows?: unknown[] };
      log.push(entry);
      const settle = () => {
        if (entry.op === "select" && table === "cold_sms_outreach_numbers") {
          return Promise.resolve({ data: rows, error: null });
        }
        // Nothing is in the book and no runs are read back beyond their ids.
        if (entry.op === "select") return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: null, error: null });
      };
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        insert: (inserted: unknown[]) => {
          entry.op = "insert";
          entry.rows = inserted;
          return builder;
        },
        update: () => {
          entry.op = "update";
          return builder;
        },
        eq: () => builder,
        in: () => builder,
        is: () => builder,
        maybeSingle: () => Promise.resolve({ data: { sent_count: 0 }, error: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          settle().then(res, rej),
      });
      return builder;
    },
  };
  return { client, log };
}

function send(ids: string[], powerDialer = true) {
  const request = new Request("https://x.test/api/admin/leads/send", {
    method: "POST",
    body: JSON.stringify({ ids, channel: "cold_call", powerDialer }),
  });
  return onRequestPost({
    request,
    env: ENV,
    data: { admin: ADMIN } as unknown as ApiData,
  } as never) as Promise<Response>;
}

beforeEach(() => {
  supabaseMock.getServiceClient.mockReset();
  ghlMock.ghlJson.mockReset();
  // The contact upsert answers with an id; every tag call answers with nothing.
  ghlMock.ghlJson.mockImplementation((_ctx: unknown, path: string) =>
    path === "/contacts/upsert"
      ? Promise.resolve({ contact: { id: `c-${ghlMock.ghlJson.mock.calls.length}` } })
      : Promise.resolve({}),
  );
});

describe("a power dialer send", () => {
  it("stays inside the free plan's fifty outbound calls for a full batch", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => leadRow(i));
    const { client, log } = fakeSupabase(rows);
    supabaseMock.getServiceClient.mockReturnValue(client);

    const res = await send(rows.map((r) => r.id));
    expect(res.status).toBe(200);

    const outbound = log.length + vi.mocked(ghlJson).mock.calls.length;
    expect(outbound).toBeLessThan(50);
    // Named rather than left as "under the cap", so a change that doubles the
    // cost still passes the ceiling but fails here and has to be looked at.
    expect(outbound).toBeLessThanOrEqual(30);
  });

  it("spends two GoHighLevel calls per lead, never three", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => leadRow(i));
    const { client } = fakeSupabase(rows);
    supabaseMock.getServiceClient.mockReturnValue(client);

    await send(rows.map((r) => r.id));

    // The dialer's tag used to be a third call of its own.
    expect(vi.mocked(ghlJson).mock.calls).toHaveLength(16);
    const tagCalls = vi.mocked(ghlJson).mock.calls.filter(([, path]) => path.endsWith("/tags"));
    expect(tagCalls).toHaveLength(8);
    for (const call of tagCalls) {
      const body = JSON.parse((call[2] as RequestInit).body as string) as { tags: string[] };
      expect(body.tags).toContain(POWER_DIALER_TAG);
    }
  });

  it("writes the book and the stamp once each for the whole batch", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => leadRow(i));
    const { client, log } = fakeSupabase(rows);
    supabaseMock.getServiceClient.mockReturnValue(client);

    await send(rows.map((r) => r.id));

    const inserts = log.filter((e) => e.table === "leads" && e.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(8);

    const stamps = log.filter((e) => e.table === "cold_sms_outreach_numbers" && e.op === "update");
    expect(stamps).toHaveLength(1);
  });

  it("sends an unscored lead, because a CSV import has no score at all", async () => {
    const rows = [leadRow(1)];
    const { client } = fakeSupabase(rows);
    supabaseMock.getServiceClient.mockReturnValue(client);

    const res = await send(["l1"]);
    const body = (await res.json()) as { sent: number; skipped: unknown[] };
    expect(body.sent).toBe(1);
    expect(body.skipped).toHaveLength(0);
  });

  it("stops asking after GoHighLevel says it is not connected", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => leadRow(i));
    const { client } = fakeSupabase(rows);
    supabaseMock.getServiceClient.mockReturnValue(client);

    const res = await onRequestPost({
      request: new Request("https://x.test/api/admin/leads/send", {
        method: "POST",
        body: JSON.stringify({ ids: rows.map((r) => r.id), channel: "cold_call", powerDialer: true }),
      }),
      env: {} as Env,
      data: { admin: ADMIN } as unknown as ApiData,
    } as never) as Response;

    const body = (await res.json()) as { notConfigured: boolean; sent: number };
    expect(body.notConfigured).toBe(true);
    expect(body.sent).toBe(0);
    // One refusal, not eight, and no attempt to tag the rest either.
    expect(vi.mocked(ghlJson)).not.toHaveBeenCalled();
  });
});
