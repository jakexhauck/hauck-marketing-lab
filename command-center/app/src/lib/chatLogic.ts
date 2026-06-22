// Pure chat helpers. No I/O. Tested in chatLogic.test.ts.
//
// ChatRole is defined in src/lib/api.ts in Phase 04. Until then, highestRole
// is generic over any object with a sortOrder field so this file compiles
// without that import and the test can pass role-shaped literals directly.

const ATTACH_MAX_BYTES = 25 * 1024 * 1024;
const ATTACH_ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
]);

export function highestRole<T extends { sortOrder: number }>(roles: T[]): T | null {
  if (roles.length === 0) return null;
  return roles.reduce((a, b) => (b.sortOrder > a.sortOrder ? b : a));
}

export function isOnline(presenceId: string, live: Set<string>): boolean {
  return live.has(presenceId);
}

export function validateAttachment(
  mimeType: string, sizeBytes: number,
): { ok: boolean; reason?: string } {
  if (!ATTACH_ALLOWED.has(mimeType)) return { ok: false, reason: "unsupported_type" };
  if (sizeBytes > ATTACH_MAX_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true };
}

export function unreadCount(
  msgs: { createdAt: string }[], lastReadAt: string | null,
): number {
  if (!lastReadAt) return msgs.length;
  const cutoff = Date.parse(lastReadAt);
  return msgs.filter((m) => Date.parse(m.createdAt) > cutoff).length;
}
