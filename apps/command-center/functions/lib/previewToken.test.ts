import { describe, expect, it } from "vitest";
import {
  PREVIEW_TOKEN_MAX_AGE_SECONDS,
  mintAdminSessionToken,
  mintPreviewSessionToken,
  mintSessionToken,
  verifySession,
} from "./session";
import type { Env } from "./env";

// The Software tab (Fulfillment) frames the live client app inside an admin
// page. The frame authenticates with a short-lived preview token delivered in a
// header, never a cookie, so the surrounding admin session survives. These tests
// pin the properties that make that safe.

const env = { SESSION_SECRET: "test-secret-value-for-preview-tokens" } as unknown as Env;

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/activity", { headers });
}

describe("preview token transport", () => {
  it("authenticates from the x-preview-token header with no cookie present", async () => {
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const session = await verifySession(reqWith({ "x-preview-token": token }), env);

    expect(session).not.toBeNull();
    expect(session!.preview).toBe(true);
    expect(session!.tenantId).toBe("tenant-1");
    expect(session!.adminId).toBe("admin-1");
  });

  it("lets the header win over a cookie, so a framed app is the client and not the admin", async () => {
    // This is the whole point: the iframe is same-origin, so the browser sends
    // the admin's hml_session cookie whether we like it or not. The header must
    // take precedence or the frame renders as the admin against the wrong tenant.
    const adminCookieToken = await mintPreviewSessionToken(env, "admin-1", "OTHER-tenant");
    const headerToken = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const session = await verifySession(
      reqWith({
        cookie: `hml_session=${adminCookieToken}`,
        "x-preview-token": headerToken,
      }),
      env,
    );

    expect(session!.tenantId).toBe("tenant-1");
  });

  it("still falls back to the cookie when no preview header is sent", async () => {
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const session = await verifySession(reqWith({ cookie: `hml_session=${token}` }), env);

    expect(session!.tenantId).toBe("tenant-1");
  });

  it("rejects a tampered token", async () => {
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");
    const [payload] = token.split(".");
    const forged = `${payload}.not-a-real-signature`;

    expect(await verifySession(reqWith({ "x-preview-token": forged }), env)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const otherEnv = { SESSION_SECRET: "a-completely-different-secret" } as unknown as Env;
    const token = await mintPreviewSessionToken(otherEnv, "admin-1", "tenant-1");

    expect(await verifySession(reqWith({ "x-preview-token": token }), env)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1", undefined, -60);

    expect(await verifySession(reqWith({ "x-preview-token": token }), env)).toBeNull();
  });

  it("never resolves to a plain admin session, so it cannot reach /api/admin/*", async () => {
    // _middleware gates /api/admin/* on `adminId && !preview`. A preview token
    // carries an adminId, so the preview branch MUST be the one that matches.
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const session = await verifySession(reqWith({ "x-preview-token": token }), env);

    expect(session!.preview).toBe(true);
    expect(session!.tenantId).toBeTruthy();
  });

  it("mints the short frame TTL when asked, leaving the 2h cookie preview alone", async () => {
    expect(PREVIEW_TOKEN_MAX_AGE_SECONDS).toBe(15 * 60);

    const now = Math.floor(Date.now() / 1000);
    const short = await mintPreviewSessionToken(
      env,
      "admin-1",
      "tenant-1",
      undefined,
      PREVIEW_TOKEN_MAX_AGE_SECONDS,
    );
    const standard = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const expOf = (t: string) =>
      Number(JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).e);

    expect(expOf(short) - now).toBeLessThanOrEqual(15 * 60);
    expect(expOf(standard) - now).toBeGreaterThan(60 * 60);
  });

  it("refuses a valid ADMIN token presented in the preview header", async () => {
    // Defence in depth. The header is for preview tokens only; it must not
    // become a second front door for an admin session.
    const adminToken = await mintAdminSessionToken(env, "admin-1");

    expect(await verifySession(reqWith({ "x-preview-token": adminToken }), env)).toBeNull();
  });

  it("refuses a valid CLIENT token presented in the preview header", async () => {
    const clientToken = await mintSessionToken(env, "live", { tenantId: "tenant-1" });

    expect(await verifySession(reqWith({ "x-preview-token": clientToken }), env)).toBeNull();
  });

  it("marks a header-borne session so privilege-trading routes can refuse it", async () => {
    // The escalation this closes: /api/auth/exit-preview is a public path that
    // verifies its own session and mints a fresh 30-day ADMIN cookie from the
    // adminId inside a preview token. A cookie preview is HttpOnly and safe to
    // trade back; a header token is readable by JavaScript and is NOT, or a
    // leaked 15-minute read-only token becomes full cross-tenant admin.
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const viaHeader = await verifySession(reqWith({ "x-preview-token": token }), env);
    const viaCookie = await verifySession(reqWith({ cookie: `hml_session=${token}` }), env);

    expect(viaHeader!.viaPreviewHeader).toBe(true);
    expect(viaCookie!.viaPreviewHeader).toBeUndefined();
  });

  it("cannot forge viaPreviewHeader from inside the token", async () => {
    // The flag describes how the request arrived, so it must be derived per
    // request, never read from signed claims.
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1");

    const session = await verifySession(reqWith({ cookie: `hml_session=${token}` }), env);

    expect(session!.viaPreviewHeader).toBeUndefined();
  });

  it("carries a staff POV through the header path", async () => {
    const token = await mintPreviewSessionToken(env, "admin-1", "tenant-1", "staff-9");

    const session = await verifySession(reqWith({ "x-preview-token": token }), env);

    expect(session!.staffId).toBe("staff-9");
  });
});
