// Joining a path from parts the model had a hand in (a card id, a site name,
// a clip name). Every caller already checks the part against a strict
// pattern; this is the lock behind that check, so one pattern loosened later
// still cannot reach outside the root.

import { isAbsolute, relative, resolve } from "node:path";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** root joined with parts, resolved. Throws unless it lands strictly inside root. */
export function within(root: string, ...parts: string[]): string {
  const base = resolve(root);
  const full = resolve(base, ...parts);
  const rel = relative(base, full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`${parts.join("/")} is not inside ${base}`);
  return full;
}
