import { describe, expect, it } from "vitest";
import { onRequestPost } from "./exit-preview";
import { mintPreviewSessionToken } from "../../lib/session";
import type { Env } from "../../lib/env";

// Regression test for a real escalation found in review.
//
// /api/auth/exit-preview is a PUBLIC path: the middleware's auth block, and with
// it the read-only-preview gate, never runs. The handler verifies its own
// session and mints a fresh 30-DAY ADMIN cookie from the adminId embedded in a
// preview token. Once verifySession also accepted a preview token from a
// JavaScript-readable header, that turned this route into an escalation oracle:
//
//   curl -X POST /api/auth/exit-preview -H "x-preview-token: <15-min token>"
//     -> Set-Cookie: hml_session=<full cross-tenant admin, 30 days>
//
// which would have defeated read-only, the tenant scoping and the short TTL all
// at once. The handler now refuses any header-borne session outright.
//
// SESSION_SECRET is set but Supabase is not, so a request that gets PAST the
// guard fails later at the admin lookup with 503. The 403-vs-not-403 contrast is
// what proves the guard is doing the work, rather than the request simply
// failing for an unrelated reason.
//
// 503 rather than 401 since the dialer fix: an admin lookup that could not RUN
// is not a revoked admin, and this route clears the session cookie on its 401
// branch. Reading "Supabase is unconfigured" as "no such admin" would have
// signed a real admin out of the console over an outage.
const env = { SESSION_SECRET: "test-secret-value-for-preview-tokens" } as unknown as Env;

function call(headers: Record<string, string>) {
  const request = new Request("https://example.test/api/auth/exit-preview", {
    method: "POST",
    headers,
  });
  return onRequestPost({ request, env } as never) as Promise<Response>;
}

describe("exit-preview cannot be driven by a header-borne preview token", () => {
  it("refuses a valid preview token presented in x-preview-token", async () => {
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const res = await call({ "x-preview-token": token });

    expect(res.status).toBe(403);
    // Critically: no cookie is minted, and no cookie is cleared either (the
    // caller may be a legitimate admin whose session must not be collateral).
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("still lets the cookie preview through to the admin lookup", async () => {
    // Same token, delivered as the HttpOnly cookie: it must NOT be rejected by
    // the guard. It gets as far as the admin lookup, which fails only because
    // Supabase is unconfigured here.
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const res = await call({ cookie: `hml_session=${token}` });

    expect(res.status).toBe(503);
    expect(res.status).not.toBe(403);
    // And it must not take the session down on the way: an outage is not a
    // reason to clear an admin's cookie.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("refuses an unauthenticated request", async () => {
    const res = await call({});

    expect(res.status).toBe(401);
  });
});
