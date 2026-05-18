import type { ProfileFormValues } from "./clientProfile";
import { api } from "./tauri";

export type PlaybookBenchmarks = {
  cpl_target?: number | null;
  cpm_min?: number | null;
  cpm_max?: number | null;
  ctr_floor?: number | null;
  roas_target?: number | null;
};

export type PlaybookSummary = {
  slug: string;
  display_name: string;
  complete: boolean;
  missing: string[];
};

export type PlaybookContent = {
  slug: string;
  display_name: string;
  audience: string;
  offers: string;
  angles: string;
  creative_brief: string;
  competitors: string;
  benchmarks: PlaybookBenchmarks;
  missing: string[];
};

export type PlaybookSaveInput = {
  slug: string;
  display_name?: string | null;
  audience: string;
  offers: string;
  angles: string;
  creative_brief: string;
  competitors: string;
  benchmarks: PlaybookBenchmarks;
};

/** Form-field key → playbook field name. The playbook field is the slug used
 *  by `read_playbook_field` (audience | offers | angles | creative-brief |
 *  competitors). Forms that opt in via `prefillFromPlaybook` map a form key
 *  to one of these so the prefill loader knows which playbook file to read. */
export type PlaybookFieldKey =
  | "audience"
  | "offers"
  | "angles"
  | "creative-brief"
  | "competitors";

/** Light parser for Profile.md frontmatter. The frontend already does YAML
 *  parsing implicitly via the Rust read_vault_note command; this helper just
 *  pulls a single `niche:` line from a raw note body if it exists. */
export function extractNicheFromFront(
  front: Record<string, unknown> | null | undefined,
): string | null {
  if (!front) return null;
  const candidate =
    (front as { niche?: unknown; extra?: { niche?: unknown } }).niche ??
    (front as { extra?: { niche?: unknown } }).extra?.niche;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

/** Resolved source for a prefilled field. UI renders a small inline badge
 *  using this to make precedence visible before Jake clicks Generate. */
export type PrefillSource =
  | { kind: "profile" }
  | { kind: "playbook"; slug: string };

/** Result of resolving prefill for one field. */
export type ResolvedPrefill = {
  value: string;
  source: PrefillSource;
};

/** Pull prefill values for a set of form fields, honouring precedence:
 *  Profile.md value > playbook default > undefined. The caller passes the
 *  parsed Profile values + a mapping of form-field key → ProfileFormValues key,
 *  plus an optional playbook mapping. Returns a map of form-field key →
 *  ResolvedPrefill (only entries that have a value land in the map). */
export async function resolvePrefills(args: {
  root: string;
  niche: string | null;
  profile: ProfileFormValues | null;
  profileMap?: Partial<Record<string, keyof ProfileFormValues>>;
  playbookMap?: Partial<Record<string, PlaybookFieldKey>>;
}): Promise<Record<string, ResolvedPrefill>> {
  const out: Record<string, ResolvedPrefill> = {};
  const { root, niche, profile, profileMap, playbookMap } = args;

  // Pass 1: Profile.md values take precedence.
  if (profile && profileMap) {
    for (const [fieldKey, profileKey] of Object.entries(profileMap)) {
      if (!profileKey) continue;
      const v = profile[profileKey];
      if (typeof v === "string" && v.trim().length > 0) {
        out[fieldKey] = { value: v, source: { kind: "profile" } };
      }
    }
  }

  // Pass 2: fill remaining keys from the playbook.
  if (niche && playbookMap) {
    for (const [fieldKey, playbookField] of Object.entries(playbookMap)) {
      if (!playbookField) continue;
      if (out[fieldKey]) continue;
      try {
        const body = await api.readPlaybookField(root, niche, playbookField);
        if (body && body.trim().length > 0) {
          out[fieldKey] = {
            value: body,
            source: { kind: "playbook", slug: niche },
          };
        }
      } catch {
        // Playbook missing or unreadable; silently skip.
      }
    }
  }

  return out;
}

export function emptyBenchmarks(): PlaybookBenchmarks {
  return {
    cpl_target: null,
    cpm_min: null,
    cpm_max: null,
    ctr_floor: null,
    roas_target: null,
  };
}

export function emptyPlaybookSaveInput(): PlaybookSaveInput {
  return {
    slug: "",
    audience: "",
    offers: "",
    angles: "",
    creative_brief: "",
    competitors: "",
    benchmarks: emptyBenchmarks(),
  };
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
