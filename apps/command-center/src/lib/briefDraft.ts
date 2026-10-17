// One Client Brief section being edited in the app: the text in the box, the
// server copy it was based on, and what happens when someone else saved first.
//
// Pure, so the rules are tested here and the component only wires events:
//   - autosave: a save is due when the box differs from the base and nothing
//     is in flight (the component debounces);
//   - the version lock: a stale save (409), or a newer copy arriving from the
//     poll while there is unsaved text, puts the NEWER text in the box and
//     keeps Jake's draft aside to reapply. Nothing is overwritten silently in
//     either direction;
//   - a failed save waits for the next keystroke rather than retrying forever;
//   - `external` counts the times the box was refilled from outside (a newer
//     copy, a conflict, Use mine). The editor reloads its content only then,
//     never on Jake's own typing, so his cursor stays where it is.

import type { BriefSection } from "./agentWire";

export interface DraftState {
  base: BriefSection;
  draft: string;
  saving: boolean;
  conflict: { theirs: BriefSection; mine: string } | null;
  error: string | null;
  external: number;
}

export type DraftEvent =
  | { t: "edit"; text: string }
  | { t: "saving" }
  | { t: "saved"; section: BriefSection }
  | { t: "stale"; section: BriefSection }
  | { t: "failed"; error: string }
  | { t: "server"; section: BriefSection }
  | { t: "reapply" }
  | { t: "discard" };

export function initDraft(section: BriefSection): DraftState {
  return { base: section, draft: section.body, saving: false, conflict: null, error: null, external: 0 };
}

export function needsSave(s: DraftState): boolean {
  return !s.saving && !s.conflict && !s.error && s.draft !== s.base.body;
}

function clash(s: DraftState, theirs: BriefSection, mine: string): DraftState {
  return { ...s, base: theirs, draft: theirs.body, saving: false, conflict: { theirs, mine }, external: s.external + 1 };
}

export function briefDraft(s: DraftState, e: DraftEvent): DraftState {
  switch (e.t) {
    case "edit":
      return { ...s, draft: e.text, error: null };
    case "saving":
      return { ...s, saving: true, error: null };
    case "saved":
      return { ...s, saving: false, base: e.section.version >= s.base.version ? e.section : s.base };
    case "stale":
      return clash(s, e.section, s.draft);
    case "failed":
      return { ...s, saving: false, error: e.error };
    case "server": {
      if (e.section.version <= s.base.version) return s;
      // Our own save, seen by the poll before its answer: nothing to resolve.
      if (e.section.body === s.draft) return { ...s, base: e.section };
      if (s.draft === s.base.body && !s.conflict) {
        return { ...s, base: e.section, draft: e.section.body, external: s.external + 1 };
      }
      return clash(s, e.section, s.conflict?.mine ?? s.draft);
    }
    case "reapply":
      return s.conflict ? { ...s, draft: s.conflict.mine, conflict: null, external: s.external + 1 } : s;
    case "discard":
      return { ...s, conflict: null };
  }
}
