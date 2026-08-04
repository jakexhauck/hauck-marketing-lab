// Shared response helpers.
//
// The page and this API are served from the same Pages project, so there is no
// CORS layer here on purpose: same origin, no preflight, nothing to misconfigure.

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function fail(message: string, status: number): Response {
  return json({ error: message }, status);
}

// Trimmed and length capped. The cap is about what lands in her calendar,
// not about escaping: the page escapes everything it renders.
export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Deliberately loose. Rejecting a valid address costs a booking, and a wrong
// address bounces visibly either way.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
