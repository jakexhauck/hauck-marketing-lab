import type { SopCategory, SopEntry } from "./sopHub";

// Pure helpers for the SOP Hub triage checkboxes. Kept separate from the
// component so the search + "selected only" filtering and per-category counts
// are unit-testable without rendering. A flag is identified by its category key
// and slug; `considered` is a Set of those composite keys.
//
// Both keys now come from the Drive tree rather than a hardcoded seed, but their
// shape is unchanged, so the admin_sop_flags rows written before the Drive
// migration still match.

export function flagKey(catKey: string, slug: string): string {
  return `${catKey}/${slug}`;
}

export interface TriageGroup {
  cat: SopCategory;
  sops: SopEntry[];
}

// Build the visible category groups for the hub list, applying the text search
// and the "show selected only" filter. Categories with no matching SOPs are
// dropped so empty cards never render. The search also matches the category
// name, so typing "sales" surfaces that whole section.
export function buildGroups(
  categories: readonly SopCategory[],
  query: string,
  considered: ReadonlySet<string>,
  selectedOnly: boolean,
): TriageGroup[] {
  const q = query.trim().toLowerCase();
  return categories
    .map((cat) => {
      const catMatches = q ? cat.name.toLowerCase().includes(q) : false;
      return {
        cat,
        sops: cat.sops.filter((s) => {
          if (q && !catMatches && !s.title.toLowerCase().includes(q)) return false;
          if (selectedOnly && !considered.has(flagKey(cat.key, s.slug))) return false;
          return true;
        }),
      };
    })
    .filter((g) => g.sops.length > 0);
}

// How many SOPs in a category are currently considered.
export function selectedCount(cat: SopCategory, considered: ReadonlySet<string>): number {
  return cat.sops.reduce(
    (n, s) => n + (considered.has(flagKey(cat.key, s.slug)) ? 1 : 0),
    0,
  );
}
