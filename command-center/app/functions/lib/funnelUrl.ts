import type { Env } from "./env";

// Where the client intake form lives, read two ways from one setting.
//
// FUNNEL_URL is the whole link Jake sends ("https://hauckmarketing.com/onboarding-form").
// CORS needs only its origin ("https://hauckmarketing.com"), because that is what
// a browser puts in the Origin header when the form posts to /api/intake.
//
// Deriving one from the other, rather than configuring both, is the point: two
// settings could disagree, and the failure that causes is a form that looks live
// and silently cannot save.

/** The full link to send a client, or null while the funnel is not published. */
export function funnelUrl(env: Env): string | null {
  const raw = (env.FUNNEL_URL ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    // Only a web address. Anything else is a misconfiguration, and returning it
    // would put a broken link in front of a client.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** The origin CORS should allow, derived from that link. */
export function funnelOrigin(env: Env): string | null {
  const url = funnelUrl(env);
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
