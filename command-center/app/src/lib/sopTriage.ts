import type { SopCategory, Sop } from "./sopData";

// Pure helpers for the SOP Hub triage checkboxes. Kept separate from the
// component so the search + "selected only" filtering and per-category counts
// are unit-testable without rendering. A flag is identified by its category key
// and slug; `considered` is a Set of those composite keys.

export function flagKey(catKey: string, slug: string): string {
  return `${catKey}/${slug}`;
}

export interface TriageGroup {
  cat: SopCategory;
  sops: Sop[];
}

// Build the visible category groups for the hub list, applying the text search
// and the "show selected only" filter. Categories with no matching SOPs are
// dropped so empty cards never render.
export function buildGroups(
  categories: readonly SopCategory[],
  query: string,
  considered: ReadonlySet<string>,
  selectedOnly: boolean,
): TriageGroup[] {
  const q = query.trim().toLowerCase();
  return categories
    .map((cat) => ({
      cat,
      sops: cat.sops.filter((s) => {
        if (q && !`${s.title} ${s.desc ?? ""}`.toLowerCase().includes(q)) return false;
        if (selectedOnly && !considered.has(flagKey(cat.key, s.slug))) return false;
        return true;
      }),
    }))
    .filter((g) => g.sops.length > 0);
}

// How many SOPs in a category are currently considered.
export function selectedCount(cat: SopCategory, considered: ReadonlySet<string>): number {
  return cat.sops.reduce(
    (n, s) => n + (considered.has(flagKey(cat.key, s.slug)) ? 1 : 0),
    0,
  );
}
