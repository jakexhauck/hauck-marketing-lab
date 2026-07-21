// Per-stage cockpit configuration for the Setter Suite.
//
// The lead cockpit (components/admin/setter/SetterCockpit.tsx) is not the same
// for every stage. A stage listed here renders a purpose-built dialing panel:
// dial checkboxes, outcome buttons that each apply one CRM tag, and a Book
// appointment control. Applying the tag is the whole job of the app; that
// client's GHL automation is what moves the lead to the next stage (app tags,
// GHL moves).
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

// The three outcomes shared by every dialing stage. Each only ADDS its tag; the
// client's GHL automations own any tag removal and the stage move.
const BASE_ACTIONS: StageAction[] = [
  { label: "Unqualified", tag: "services unqualified", variant: "subtle" },
  { label: "Uninterested", tag: "services uninterested", variant: "subtle" },
  { label: "Follow Up", tag: "lead form follow up", variant: "secondary", promptTask: true },
];

// A dialing stage: the shared outcomes plus, optionally, a No Answer button
// whose tag advances the lead one "no answer" day. The last no-answer stage
// passes no tag, so it has no No Answer button at all: the setter still dials,
// and GHL rolls the lead into Long Term Nurture on its own if they never
// respond.
function dialingStage(noAnswerTag?: string): StageActionConfig {
  const actions = [...BASE_ACTIONS];
  if (noAnswerTag) {
    actions.push({ label: "No Answer", tag: noAnswerTag, variant: "secondary" });
  }
  return { dials: 3, actions };
}

// Keyed by the GHL stage name, normalized (trimmed + lower-cased). Stage names
// in the Lead Form Pipeline are specific enough that the name alone is a safe
// key. The No Answer button advances the day at each stage; day 4 drops it.
const STAGE_ACTIONS: Record<string, StageActionConfig> = {
  "opted in (needs dialing)": dialingStage("no answer day 1"),
  "no answer day 1 (needs dialing)": dialingStage("no answer day 2"),
  "no answer day 2 (needs dialing)": dialingStage("no answer day 3"),
  "no answer day 3 (needs dialing)": dialingStage("no answer day 4"),
  "no answer day 4 (needs dialing)": dialingStage(),
};

export function stageActionsFor(stageName: string | undefined | null): StageActionConfig | null {
  if (!stageName) return null;
  return STAGE_ACTIONS[stageName.trim().toLowerCase()] ?? null;
}
