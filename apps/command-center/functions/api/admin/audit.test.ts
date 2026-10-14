import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ApiData } from "../../lib/env";

// The audit log has been written to since migration 0008 and never had a
// reader. It is the ONLY record of who messaged a client's customers (the
// Setter Suite sends with no approval step and no per-setter accounts), so
// this endpoint's filters are the difference between "an admin did this" and
// an accountable trail. Tests cover the query parser and the handler driven
// against a fake Supabase builder that records the chain it was given.

const supabaseMock = vi.hoisted(() => ({ getServiceClient: vi.fn() }));
vi.mock("../../lib/supabase", () => supabaseMock);

import { onRequestGet, parseAuditQuery, shapeAuditRow, MAX_LIMIT } from "./audit";

interface Recorded {
  table?: string;
  select?: { sel: string; opts?: unknown };
  eq: [string, unknown][];
  order: [string, unknown][];
  range?: [number, number];
}

function fakeClient(rows: unknown[], count: number | null, error: { message: string } | null = null) {
  const calls: Recorded = { eq: [], order: [] };
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: (sel: string, opts?: unknown) => {
      calls.select = { sel, opts };
      return builder;
    },
    eq: (col: string, val: unknown) => {
      calls.eq.push([col, val]);
      return builder;
    },
    order: (col: string, opts?: unknown) => {
      calls.order.push([col, opts]);
      return builder;
    },
    range: (from: number, to: number) => {
      calls.range = [from, to];
      return Promise.resolve({ data: rows, count, error });
    },
  });
  const client = { from: (table: string) => ((calls.table = table), builder) };
  return { client, calls };
}

const ADMIN = { id: "adm-1", email: "jake@example.test", name: "Jake", status: "active" as const };

function call(url: string, opts: { admin?: typeof ADMIN | null } = {}) {
  const request = new Request(url);
  const data = { admin: opts.admin === undefined ? ADMIN : opts.admin } as unknown as ApiData;
  return onRequestGet({
    request,
    env: {} as Env,
    data,
  } as never) as Promise<Response>;
}

const ROW = {
  id: 42,
  admin_id: "adm-1",
  action: "setter.send",
  target_tenant_id: "ten-1",
  payload: { channel: "SMS", contactId: "c1", body: "hello" },
  created_at: "2026-07-21T10:00:00Z",
  admin_accounts: { name: "Jake", email: "jake@example.test" },
  tenants: { name: "Willis" },
};

beforeEach(() => {
  supabaseMock.getServiceClient.mockReset();
});

describe("parseAuditQuery", () => {
  it("defaults to the first page of 50 with no filters", () => {
    const q = parseAuditQuery(new URL("https://x.test/api/admin/audit"));
    expect(q).toEqual({ limit: 50, offset: 0, tenantId: null, action: null });
  });

  it("caps limit at MAX_LIMIT so one request can never pull the whole log", () => {
    expect(parseAuditQuery(new URL("https://x.test/a?limit=5000")).limit).toBe(MAX_LIMIT);
    expect(MAX_LIMIT).toBe(200);
  });

  it("floors a zero, negative or non-numeric limit back to the default", () => {
    expect(parseAuditQuery(new URL("https://x.test/a?limit=0")).limit).toBe(50);
    expect(parseAuditQuery(new URL("https://x.test/a?limit=-3")).limit).toBe(50);
    expect(parseAuditQuery(new URL("https://x.test/a?limit=abc")).limit).toBe(50);
  });

  it("never accepts a negative offset", () => {
    expect(parseAuditQuery(new URL("https://x.test/a?offset=-10")).offset).toBe(0);
    expect(parseAuditQuery(new URL("https://x.test/a?offset=100")).offset).toBe(100);
  });

  it("reads the tenant and action filters, treating blanks as absent", () => {
    const q = parseAuditQuery(new URL("https://x.test/a?tenantId=ten-1&action=setter.send"));
    expect(q.tenantId).toBe("ten-1");
    expect(q.action).toBe("setter.send");
    const blank = parseAuditQuery(new URL("https://x.test/a?tenantId=%20&action="));
    expect(blank.tenantId).toBeNull();
    expect(blank.action).toBeNull();
  });
});

describe("shapeAuditRow", () => {
  it("camelCases the row and flattens the joined admin and tenant names", () => {
    expect(shapeAuditRow(ROW)).toEqual({
      id: "42",
      createdAt: "2026-07-21T10:00:00Z",
      adminId: "adm-1",
      adminName: "Jake",
      adminEmail: "jake@example.test",
      action: "setter.send",
      tenantId: "ten-1",
      tenantName: "Willis",
      payload: { channel: "SMS", contactId: "c1", body: "hello" },
    });
  });

  it("survives an agency-wide row with no tenant and a deleted admin join", () => {
    const shaped = shapeAuditRow({
      ...ROW,
      target_tenant_id: null,
      payload: null,
      admin_accounts: null,
      tenants: null,
    });
    expect(shaped.tenantId).toBeNull();
    expect(shaped.tenantName).toBeNull();
    expect(shaped.adminName).toBeNull();
    expect(shaped.payload).toBeNull();
  });
});

describe("GET /api/admin/audit", () => {
  it("401s an unauthenticated request rather than leaking the log", async () => {
    supabaseMock.getServiceClient.mockReturnValue(fakeClient([], 0).client);
    const res = await call("https://x.test/api/admin/audit", { admin: null });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns newest first with paging metadata", async () => {
    const { client, calls } = fakeClient([ROW], 137);
    supabaseMock.getServiceClient.mockReturnValue(client);

    const res = await call("https://x.test/api/admin/audit");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(calls.table).toBe("admin_audit_log");
    expect(calls.order[0][0]).toBe("created_at");
    expect(calls.order[0][1]).toEqual({ ascending: false });
    expect(body).toMatchObject({ total: 137, limit: 50, offset: 0, hasMore: true });
    expect((body.entries as unknown[]).length).toBe(1);
  });

  it("translates limit and offset into the matching supabase range", async () => {
    const { client, calls } = fakeClient([], 137);
    supabaseMock.getServiceClient.mockReturnValue(client);

    await call("https://x.test/api/admin/audit?limit=25&offset=50");

    expect(calls.range).toEqual([50, 74]);
  });

  it("reports hasMore false on the last page", async () => {
    supabaseMock.getServiceClient.mockReturnValue(fakeClient([ROW], 51).client);
    const res = await call("https://x.test/api/admin/audit?limit=50&offset=50");
    expect((await res.json()) as { hasMore: boolean }).toMatchObject({ hasMore: false, total: 51 });
  });

  it("applies the tenant filter to target_tenant_id", async () => {
    const { client, calls } = fakeClient([], 0);
    supabaseMock.getServiceClient.mockReturnValue(client);

    await call("https://x.test/api/admin/audit?tenantId=ten-9");

    expect(calls.eq).toEqual([["target_tenant_id", "ten-9"]]);
  });

  it("applies the action filter so setter.send can be isolated", async () => {
    const { client, calls } = fakeClient([], 0);
    supabaseMock.getServiceClient.mockReturnValue(client);

    await call("https://x.test/api/admin/audit?action=setter.send");

    expect(calls.eq).toEqual([["action", "setter.send"]]);
  });

  it("applies both filters together", async () => {
    const { client, calls } = fakeClient([], 0);
    supabaseMock.getServiceClient.mockReturnValue(client);

    await call("https://x.test/api/admin/audit?tenantId=ten-1&action=setter.send");

    expect(calls.eq).toEqual([
      ["target_tenant_id", "ten-1"],
      ["action", "setter.send"],
    ]);
  });

  it("503s when supabase is not configured", async () => {
    supabaseMock.getServiceClient.mockReturnValue(null);
    const res = await call("https://x.test/api/admin/audit");
    expect(res.status).toBe(503);
  });

  it("500s on a query error instead of returning an empty log that looks clean", async () => {
    supabaseMock.getServiceClient.mockReturnValue(fakeClient([], null, { message: "boom" }).client);
    const res = await call("https://x.test/api/admin/audit");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
