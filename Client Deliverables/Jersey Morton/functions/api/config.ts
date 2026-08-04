// GET /api/config
//
// The handful of public values the page needs at runtime. Keeping the
// Turnstile site key here rather than in index.html means rotating the key
// pair is an environment change, not an edit and redeploy of the page.
//
// Site keys are public by design. The secret half never leaves the Function.

import { CONTACT_PHONE_FALLBACK, TIMEZONE } from "../lib/config.ts";
import { type TurnstileEnv } from "../lib/turnstile.ts";
import { json } from "../lib/http.ts";

export function onRequestGet(context: { env: TurnstileEnv & { CONTACT_PHONE?: string } }): Response {
  return json({
    timezone: TIMEZONE,
    turnstileSiteKey: context.env.TURNSTILE_SITE_KEY ?? "",
    // Shown only when the page has no times to offer. Empty means the page
    // says nothing about phoning rather than inventing a number.
    contactPhone: context.env.CONTACT_PHONE ?? CONTACT_PHONE_FALLBACK,
  });
}
