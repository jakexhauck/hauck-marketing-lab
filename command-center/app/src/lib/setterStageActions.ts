// Per-stage cockpit configuration for the Setter Suite.
//
// The lead cockpit (components/admin/setter/SetterCockpit.tsx) is not the same
// for every stage. A stage listed here renders a purpose-built dialing panel:
// a row of visual dial checkboxes plus outcome buttons that each apply one CRM
// tag. Applying the tag is the whole job of the app; that client's GHL
// automation is what moves the lead to the next stage (app tags, GHL moves).
//
// A stage NOT listed here falls back to the original cockpit (log call, tags,
// book an estimate, call history). We fill this table one stage at a time.

export interface StageAction {
  label: string;
  // The CRM tag this button adds to the contact. Must match the tag the
  // client's GHL automation listens for.
  tag: string;
  variant?: "primary" | "secondary" | "subtle" | "danger";
  // When true, after the tag is applied the setter is prompted to add a
  // follow-up task to the contact.
  promptTask?: boolean;
}

export interface StageActionConfig {
  // How many visual "dial attempt" checkboxes to show (purely visual, not
  // persisted). Omit or 0 for none.
  dials?: number;
  actions: StageAction[];
}

// Keyed by the GHL stage name, normalized (trimmed + lower-cased). Stage names
// in the Lead Form Pipeline are specific enough that the name alone is a safe
// key.
const STAGE_ACTIONS: Record<string, StageActionConfig> = {
  // 1) Lead Form Pipeline · stage 1
  "opted in (needs dialing)": {
    dials: 3,
    actions: [
      { label: "Unqualified", tag: "services unqualified", variant: "subtle" },
      { label: "Uninterested", tag: "services uninterested", variant: "subtle" },
      { label: "Follow Up", tag: "lead form follow up", variant: "secondary", promptTask: true },
      { label: "No Answer", tag: "no answer day 1", variant: "secondary" },
    ],
  },
};

export function stageActionsFor(stageName: string | undefined | null): StageActionConfig | null {
  if (!stageName) return null;
  return STAGE_ACTIONS[stageName.trim().toLowerCase()] ?? null;
}
