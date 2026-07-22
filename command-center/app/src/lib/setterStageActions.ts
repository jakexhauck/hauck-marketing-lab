// Per-stage cockpit configuration for the Setter Suite.
//
// EVERY stage renders the purpose-built dialing panel
// (components/admin/setter/StageActions.tsx): dial checkboxes, outcome
// buttons that each apply one CRM tag, and a Book appointment control.
// Applying the tag is the whole job of the app; that client's GHL automation
// is what moves the lead to the next stage (app tags, GHL moves).
//
// Two things vary by context:
// - The Follow Up tag is per PIPELINE: the funnel's follow-up automation
//   listens on its own tag, everything else uses the lead form's.
// - The No Answer button exists only on the no-answer chain stages, and its
//   tag advances the lead one "no answer" day per stage. Day 4 has no button
//   at all: the setter still dials, and GHL rolls the lead into Long Term
//   Nurture on its own if they never respond.
//
// The old generic cockpit (log call / tag editor / book an estimate / call
// history) only renders for a lead whose stage name failed to resolve.

export interface StageAction {
  label: string;
  // The CRM tag this button adds to the contact. Must match the tag the
  // client's GHL automation listens for.
  tag: string;
  variant?: "primary" | "secondary" | "subtle" | "danger";
  // When true, after the tag is applied the setter is prompted to add a
  // follow-up task to the contact.
  promptTask?: boolean;
  // When true, the lead's tracked appointment is cancelled in the CRM after
  // the tag lands (the SOP's "DELETE their appointment").
  cancelAppointment?: boolean;
  // When true, after the tag (and any cancel) the cockpit jumps straight
  // into the booking flow so the setter rebooks a new time.
  bookAfter?: boolean;
}

export interface StageActionConfig {
  // How many visual "dial attempt" checkboxes to show (purely visual, not
  // persisted). Omit or 0 for none.
  dials?: number;
  actions: StageAction[];
}

// The no-answer chain, keyed by the GHL stage name normalized (trimmed +
// lower-cased). These stage names exist VERBATIM in both the Lead Form and
// Funnel pipelines, which is fine: the day tags are shared by both pipelines'
// no-answer automations. null = a chain stage with no No Answer button.
const NO_ANSWER_CHAIN: Record<string, string | null> = {
  "opted in (needs dialing)": "no answer day 1",
  "survey completed no call booked (needs dialing)": "no answer day 1",
  "no answer day 1 (needs dialing)": "no answer day 2",
  "no answer day 2 (needs dialing)": "no answer day 3",
  "no answer day 3 (needs dialing)": "no answer day 4",
  "no answer day 4 (needs dialing)": null,
};

function followUpTagFor(pipelineName: string): string {
  return /funnel/i.test(pipelineName) ? "funnel follow up" : "lead form follow up";
}

export function stageActionsFor(
  stageName: string | undefined | null,
  pipelineName: string,
): StageActionConfig | null {
  if (!stageName || !stageName.trim()) return null;
  const key = stageName.trim().toLowerCase();

  // Phone Appt Confirmed: the setter is ON the confirmed call. Per the SOP,
  // reschedule and cancel both kill the existing booking; reschedule rolls
  // straight into booking a new time, cancel prompts a follow-up task. A
  // qualified lead is booked onto the estimate calendar via the cockpit's
  // Appointment section (that booking auto-confirms).
  if (key.includes("appt confirmed") || key.includes("appointment confirmed")) {
    return {
      dials: 3,
      actions: [
        { label: "Unqualified", tag: "services unqualified", variant: "subtle" },
        { label: "Uninterested", tag: "services uninterested", variant: "subtle" },
        {
          label: "Reschedule",
          tag: "cancelled-call-rescheduling",
          variant: "secondary",
          cancelAppointment: true,
          bookAfter: true,
        },
        {
          label: "Cancel + Follow Up",
          tag: "cancelled-call-follow-up",
          variant: "secondary",
          cancelAppointment: true,
          promptTask: true,
        },
      ],
    };
  }

  const actions: StageAction[] = [
    { label: "Unqualified", tag: "services unqualified", variant: "subtle" },
    { label: "Uninterested", tag: "services uninterested", variant: "subtle" },
  ];
  // A lead already sitting in a follow-up stage (Opted In Follow Up, Survey
  // Follow Up) has nothing to gain from a Follow Up button: tagging it again
  // would just re-fire the automation that put it there.
  if (!key.includes("follow up")) {
    actions.push({
      label: "Follow Up",
      tag: followUpTagFor(pipelineName),
      variant: "secondary",
      promptTask: true,
    });
  }
  const noAnswerTag = NO_ANSWER_CHAIN[key];
  if (noAnswerTag) {
    actions.push({ label: "No Answer", tag: noAnswerTag, variant: "secondary" });
  }
  return { dials: 3, actions };
}
