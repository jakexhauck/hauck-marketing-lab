// Cloudflare Turnstile verification.
//
// This is the only thing standing between a public booking endpoint and a
// script writing a few hundred events into her real calendar, each one
// emailing a Google invite FROM her Gmail address. The calendar mess is
// annoying; the invite spam is what gets an account restricted.
//
// Verified BEFORE anything is read or written, so an abusive request costs us
// one call to Cloudflare and never reaches Composio or Google.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileEnv {
  // Cloudflare's documented test keys are the default while real ones are
  // pending, so the guard is wired and provable rather than switched off:
  //   1x0000000000000000000000000000000AA  always passes
  //   2x0000000000000000000000000000000AA  always fails
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
}

export function turnstileConfigured(env: TurnstileEnv): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
}

// Fails closed. If Cloudflare cannot be reached, or the response is not the
// shape we expect, the booking is refused. A refused booking is recoverable by
// pressing the button again; an unguarded endpoint is not.
export async function verifyTurnstile(
  env: TurnstileEnv,
  token: unknown,
  remoteIp: string | null,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return false;
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return false;

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (remoteIp) form.append("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form });
    if (!res.ok) return false;
    const body = (await res.json()) as { success?: boolean };
    return body?.success === true;
  } catch {
    return false;
  }
}
