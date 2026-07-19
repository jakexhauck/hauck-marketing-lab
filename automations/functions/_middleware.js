// Fail-closed password gate for the internal Automation Library.
//
// The password is read from the AUTOMATIONS_PASSWORD environment variable
// (set it as a Secret on the Cloudflare Pages project). If it is NOT set,
// the site refuses to serve anything, so it can never be public by accident.
//
// This matters more here than on most internal docs: every workflow block on
// the page names GoHighLevel, which never appears in front of a client.
//
// Any username works; only the password is checked. To rotate the password,
// update the AUTOMATIONS_PASSWORD secret and redeploy.

export async function onRequest(context) {
  const { request, env, next } = context;
  const expected = env.AUTOMATIONS_PASSWORD;

  // No password configured -> stay locked. Never serve unguarded.
  if (!expected) {
    return new Response("Automation Library locked. Set AUTOMATIONS_PASSWORD on this Pages project.", {
      status: 503,
    });
  }

  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = "";
    }
    const idx = decoded.indexOf(":");
    const supplied = idx >= 0 ? decoded.slice(idx + 1) : decoded;
    if (timingSafeEqual(supplied, expected)) {
      return next();
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Hauck Automation Library", charset="UTF-8"' },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
