// POST /api/admin/login
//
// Turnstile first, then the passcode, then a signed cookie. Turnstile is what
// stops a script trying passcodes at machine speed, since there is no KV here
// to count attempts in.

import { type AdminEnv, constantTimeEqual, issueSession, sessionCookie } from "../../lib/adminAuth.ts";
import { cleanText, fail } from "../../lib/http.ts";
import { type TurnstileEnv, verifyTurnstile } from "../../lib/turnstile.ts";

export async function onRequestPost(context: {
  request: Request;
  env: AdminEnv & TurnstileEnv;
}): Promise<Response> {
  const env = context.env;
  if (!env.HOURS_PASSCODE || !env.ADMIN_KEY) {
    return fail("The hours page is not set up yet", 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return fail("Bad request body", 400);
  }

  const human = await verifyTurnstile(
    env,
    payload.turnstileToken,
    context.request.headers.get("CF-Connecting-IP"),
  );
  if (!human) return fail("Please complete the check below and try again.", 403);

  const given = cleanText(payload.passcode, 200);
  if (!constantTimeEqual(given, env.HOURS_PASSCODE)) {
    // Deliberately says nothing about which part was wrong.
    return fail("That passcode is not right.", 401);
  }

  const token = await issueSession(env, Date.now());
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(token) },
  });
}
