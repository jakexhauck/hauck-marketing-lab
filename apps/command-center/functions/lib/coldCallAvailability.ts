// The slot vocabulary for Cold Call availability (0057), server side.
//
// Mirrors the guard in src/lib/availabilityWeek.ts, the same way adminRoles.ts
// is mirrored: Functions cannot import from src/, and this is the boundary that
// decides what reaches the table, so it lives where the write happens rather
// than being trusted to arrive already clean.

// A slot is a 30-minute index from local midnight: 0 = 00:00, 47 = 23:30.
export const SLOTS_PER_DAY = 48;

// A clean, sorted, unique list of in-range slots. Anything else is dropped
// rather than stored.
export function normalizeSlots(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const raw of value) {
    // Coerce only from a number or a non-blank string. Number(null) is 0 and
    // Number([]) is 0, so a bare Number() here would quietly turn junk into
    // midnight, which is both in range and a whole number.
    let slot: number;
    if (typeof raw === "number") slot = raw;
    else if (typeof raw === "string" && raw.trim() !== "") slot = Number(raw);
    else continue;
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_DAY) continue;
    seen.add(slot);
  }
  return [...seen].sort((a, b) => a - b);
}
