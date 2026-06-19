import type { Env } from "../../lib/env";
import {
  mintSessionCookie,
  mintSessionToken,
  type SessionMode,
} from "../../lib/session";
import {
  clientIp,
  isLoginRateLimited,
  recordLoginFailure,
} from "../../lib/ratelimit";
import { getServiceClient } from "../../lib/supabase";
import { loadLiveTenantForHost } from "../../lib/tenantResolve";
import { verifyPassword } from "../../lib/password";

interface Body {
  password?: string;
  mode?: SessionMode;
}

// Compare SHA-256 digests rather than the raw strings: digests have a fixed
// length, so neither password length nor a common prefix leaks via timing.
async function passwordMatches(
  supplied: string,
  expected: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(supplied)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  let r = 0;
  for (let i = 0; i < ua.length; i++) r |= ua[i] ^ ub[i];
  return r === 0;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const supplied = (body.password ?? "").trim();
  if (!supplied) {
    return Response.json({ error: "incorrect password" }, { status: 401 });
  }

  const ip = clientIp(ctx.request);
  if (await isLoginRateLimited(ctx.env, ip)) {
    return Response.json(
      { error: "too many attempts, try again later" },
      { status: 429 },
    );
  }

  let mode: SessionMode;
  let tenantId: string | undefined;
  if (body.mode === "test") {
    const testPassword = ctx.env.TEST_APP_PASSWORD;
    if (!testPassword) {
      return Response.json(
        { error: "TEST_APP_PASSWORD not configured" },
        { status: 500 },
      );
    }
    if (!(await passwordMatches(supplied, testPassword))) {
      await recordLoginFailure(ctx.env, ip);
      return Response.json({ error: "incorrect password" }, { status: 401 });
    }
    mode = "test";
  } else {
    // Per-client owner password from the tenant row (set in the admin console),
    // resolved by request host. Falls back to the APP_PASSWORD env var for
    // single-tenant deploys and clients not yet given their own password.
    const svc = getServiceClient(ctx.env);
    const tenant = svc
      ? await loadLiveTenantForHost(svc, ctx.env, ctx.request.headers.get("host"))
      : null;

    let ok: boolean;
    if (tenant?.owner_password_hash) {
      ok = await verifyPassword(supplied, tenant.owner_password_hash);
    } else if (ctx.env.APP_PASSWORD) {
      ok = await passwordMatches(supplied, ctx.env.APP_PASSWORD);
    } else {
      return Response.json(
        { error: "APP_PASSWORD not configured" },
        { status: 500 },
      );
    }
    if (!ok) {
      await recordLoginFailure(ctx.env, ip);
      return Response.json({ error: "incorrect password" }, { status: 401 });
    }
    mode = "live";
    // Bind the resolved client into the session so the middleware scopes by it
    // instead of re-resolving from the host. Absent on a bare single-tenant
    // deploy (no tenant row), where the host/env fallback still applies.
    tenantId = tenant?.id;
  }

  // Mint the token once; the cookie wraps the same value. Web clients use the
  // HttpOnly cookie and ignore `token`; bearer clients (desktop) read `token`
  // from the body and store it in the OS keychain.
  const token = await mintSessionToken(ctx.env, mode, { tenantId });
  const cookie = await mintSessionCookie(ctx.env, mode, { tenantId });
  return new Response(JSON.stringify({ ok: true, mode, token }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": cookie,
    },
  });
};
