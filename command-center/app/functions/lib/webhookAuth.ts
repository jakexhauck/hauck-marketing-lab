// Shared-secret auth for endpoints GHL calls (workflow webhook actions). GHL
// cannot produce a signature we can verify, so these endpoints authenticate
// with a token embedded in the URL (?token=<secret>) or an x-webhook-token
// header, compared against an env secret. Digests are compared, not raw
// strings, so neither length nor prefix leaks timing.

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

export async function tokenMatches(
  supplied: string,
  secret: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(supplied), sha256(secret)]);
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

// Read the caller's token from either the URL query or the x-webhook-token
// header. Empty string when neither is present.
export function readToken(request: Request): string {
  const url = new URL(request.url);
  return (
    url.searchParams.get("token") ||
    request.headers.get("x-webhook-token") ||
    ""
  );
}
