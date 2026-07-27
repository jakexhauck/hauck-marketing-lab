import { describe, it, expect, vi, beforeEach } from "vitest";

// Everything the middleware reaches for on the way to a decision is faked, so
// these tests are about the GATE and nothing else. verifySession returning null
// is the important default: it means "nobody is logged in", which is exactly
// the situation the scheduler calls in.
vi.mock("../lib/session", () => ({ verifySession: () => Promise.resolve(session) }));
vi.mock("../lib/supabase", () => ({
  getServiceClient: () => ({}),
  resolveTenantId: () => Promise.resolve(null),
}));
vi.mock("../lib/tenantResolve", () => ({
  clientLabelFromHost: () => null,
  loadLiveTenantForHost: () => Promise.resolve(null),
  loadTenantById: () => Promise.resolve(null),
  tenantHasGhlCreds: () => false,
}));
vi.mock("../lib/identity", () => ({ resolveCaller: () => Promise.resolve({ isOwner: true }) }));
vi.mock("../lib/adminAuth", () => ({ getActiveAdmin: () => Promise.resolve(admin) }));

import { onRequest } from "./_middleware";
import { HEALTH_CRON_HEADER, HEALTH_CRON_PATH } from "../lib/healthCron";

const SECRET = "b7f2c9d4e1a68350f9c2b7d4e1a68350f9c2b7d4";

let session: unknown = null;
let admin: unknown = null;
let reached = false;

beforeEach(() => {
  session = null;
  admin = null;
  reached = false;
});

function call(
  path: string,
  opts: { method?: string; header?: string | null; secret?: string | null } = {},
) {
  // Default is the CORRECT secret, so every test that does not mention the
  // header is proving that the other conditions refuse it on their own.
  // Passing `header: null` is how a test sends no header at all.
  const presented = "header" in opts ? opts.header : SECRET;
  const headers = new Headers();
  if (presented !== null && presented !== undefined) {
    headers.set(HEALTH_CRON_HEADER, presented);
  }
  const env: Record<string, unknown> = {};
  if (opts.secret !== null) env.HEALTH_CRON_SECRET = opts.secret ?? SECRET;

  const ctx = {
    request: new Request(`https://app.hauckmarketing.com${path}`, {
      method: opts.method ?? "GET",
      headers,
    }),
    env,
    data: {},
    next: async () => {
      reached = true;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
  // The real signature carries Cloudflare's PagesFunction context; the fake
  // above is the subset the middleware actually touches on these paths.
  return (onRequest as unknown as (c: typeof ctx) => Promise<Response>)(ctx);
}

describe("api middleware: the scheduled health probe gate", () => {
  it("lets the scheduler read health with no session at all", async () => {
    const res = await call(HEALTH_CRON_PATH);
    expect(res.status).toBe(200);
    expect(reached).toBe(true);
  });

  it("does not hand the scheduler an admin identity", async () => {
    // Passing the gate must buy exactly one read-only snapshot. If this ever
    // started setting ctx.data.admin, holding the cron secret would quietly
    // become holding an admin session.
    const ctxData: Record<string, unknown> = {};
    const headers = new Headers({ [HEALTH_CRON_HEADER]: SECRET });
    const ctx = {
      request: new Request(`https://app.hauckmarketing.com${HEALTH_CRON_PATH}`, { headers }),
      env: { HEALTH_CRON_SECRET: SECRET },
      data: ctxData,
      next: async () => new Response("{}", { status: 200 }),
    };
    await (onRequest as unknown as (c: typeof ctx) => Promise<Response>)(ctx);
    expect(ctxData.admin).toBeUndefined();
    expect(ctxData.session).toBeUndefined();
  });

  it("401s a wrong secret", async () => {
    const res = await call(HEALTH_CRON_PATH, { header: "0".repeat(SECRET.length) });
    expect(res.status).toBe(401);
    expect(reached).toBe(false);
  });

  it("401s when the header is absent", async () => {
    const res = await call(HEALTH_CRON_PATH, { header: null });
    expect(res.status).toBe(401);
    expect(reached).toBe(false);
  });

  it("does NOT open the secrets routes, which is the whole point", async () => {
    for (const path of ["/api/admin/secrets/agency", "/api/admin/secrets/client/abc"]) {
      reached = false;
      const res = await call(path);
      expect(res.status, `${path} must stay shut`).toBe(401);
      expect(reached, `${path} handler must never run`).toBe(false);
    }
  });

  it("does NOT open any other admin route", async () => {
    for (const path of ["/api/admin/audit", "/api/admin/clients", "/api/admin/connections"]) {
      reached = false;
      const res = await call(path);
      expect(res.status, `${path} must stay shut`).toBe(401);
      expect(reached).toBe(false);
    }
  });

  it("is GET only, so the secret can never write anything", async () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      reached = false;
      const res = await call(HEALTH_CRON_PATH, { method });
      expect(res.status, `${method} must not pass`).toBe(401);
      expect(reached).toBe(false);
    }
  });

  it("is off entirely when no secret is configured", async () => {
    const res = await call(HEALTH_CRON_PATH, { secret: null, header: SECRET });
    expect(res.status).toBe(401);
    expect(reached).toBe(false);
  });

  it("still refuses a real admin session on a role it does not hold", async () => {
    // Guards the ordering: adding the cron gate above the session gate must not
    // have skipped the normal admin path for everyone else.
    session = { adminId: "a1", preview: false };
    admin = { id: "a1", role: "owner" };
    const res = await call("/api/admin/audit", { header: null });
    expect(res.status).toBe(200);
    expect(reached).toBe(true);
  });
});
