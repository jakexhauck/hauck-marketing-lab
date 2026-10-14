// Per-stage cockpit configuration for the Setter Suite.
//
// Rebuilt 2026-07-28 for the four-pipeline CRM structure (1) Leads,
// 2) No Answer, 3) Sales, 4) Trash). The old build keyed everything on stage
// names carrying a "(needs dialing)" marker that no longer exists, so every
// No Answer button silently disappeared. Nothing here matches on that marker.
//
// The dialing panel (components/admin/setter/StageActions.tsx) renders dial
// checkboxes, outcome buttons that each apply ONE CRM tag, and a Book control.
// Applying the tag is the whole job of the app; the client's automation is what
// moves the lead. App tags, CRM moves. Nothing here writes a stage.
//
// Three things vary by context:
// - Only leads in a DIALING pipeline (1) Leads, 2) No Answer) get the panel.
//   A lead in Sales, Trash, Reviews or Reactivation is not setter work, so it
//   falls through to the generic cockpit instead of being offered buttons that
//   would drag a won job back into the follow-up queue.
// - The Follow Up tag depends on where the lead came FROM, which is now carried
//   by the contact's own tags rather than by the pipeline it sits in: the funnel
//   and the lead form share one pipeline now.
// - The No Answer button walks the seven-day chain, one day per press.

export interface StageAction {
  label: string;
  // The CRM tag this button adds to the contact. Must match the tag the
  // client's automation listens for.
  tag: string;
  variant?: "primary" | "secondary" | "subtle" | "danger";
  // When true, after the tag is applied the setter is prompted to add a
  // follow-up task to the contact.
  promptTask?: boolean;
  // When true, the lead's tracked appointment is cancelled by the APP after
  // the tag lands. Left off for the three "cancelled appointment" tags: the
  // client's Phone Appointment Cancelled automation already cancels the
  // booking, and two systems cancelling the same appointment is how a
  // calendar ends up lying.
  cancelAppointment?: boolean;
  // When true, after the tag the cockpit jumps straight into the booking flow
  // so the setter rebooks a new time.
  bookAfter?: boolean;
}

export interface StageActionConfig {
  // How many visual "dial attempt" checkboxes to show (purely visual, not
  // persisted). Omit or 0 for none.
  dials?: number;
  actions: StageAction[];
}

// Lowercase, strip anything that is not a letter or digit to a single space.
// CRM stage names carry emoji, numeric prefixes and the odd double space, so
// this is load-bearing rather than cosmetic.
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The pipelines a setter actually works. Everything else (Sales, Trash,
// Google Reviews, Reactivation, Organic, News Channel) is somebody else's
// board and gets no dialing panel.
export function isDialingPipeline(pipelineName: string): boolean {
  const p = normalize(pipelineName);
  return /\bleads?\b/.test(p) || p.includes("no answer");
}

// The no-answer chain, keyed by normalized stage name: which day tag the No
// Answer button applies from that stage. The opt-in and follow-up stages start
// the chain at day 1; each No Answer day advances one. Day 7 is the end of the
// chain, so it has no button: the lead rolls into long-term nurture on the
// CRM's own schedule rather than inventing a day 8 nobody built.
//
// The parking stages (Slow Burn, Long Term Nurture) are deliberately absent.
// A lead sitting there is not on a dialing clock, and restarting the chain
// from one would re-fire seven days of automation.
const NO_ANSWER_CHAIN: Record<string, string> = {
  "lead form opt in": "no answer day 1",
  "funnel opt in": "no answer day 1",
  "lead follow up": "no answer day 1",
  "no answer day 1": "no answer day 2",
  "no answer day 2": "no answer day 3",
  "no answer day 3": "no answer day 4",
  "no answer day 4": "no answer day 5",
  "no answer day 5": "no answer day 6",
  "no answer day 6": "no answer day 7",
  "no answer day 7": "",
};

// Which follow-up automation this lead belongs to. The funnel and the lead
// form now share the "1) Leads" pipeline, so the pipeline name can no longer
// tell them apart. The contact's own origin tag can: New Lead Follow Ups
// stamps "lead form" or "funnel survey completed" on the way in. The stage
// name is the fallback ("Funnel Opt In"), and lead form is the default,
// because it is the larger of the two and the safer place to land.
export function followUpTagFor(stageName: string, tags?: string[] | null): string {
  const t = (tags ?? []).map(normalize);
  if (t.includes("funnel survey completed") || t.includes("funnel")) return "funnel follow up";
  if (t.includes("lead form")) return "lead form follow up";
  return normalize(stageName).includes("funnel") ? "funnel follow up" : "lead form follow up";
}

// The one stage a phone appointment lives in now. Booked, confirmed and
// unqualified used to be three stages; they are tags on this one stage today.
export function isPhoneApptStage(stageName: string): boolean {
  const s = normalize(stageName);
  return s.includes("phone appt") || s.includes("phone appointment");
}

export function stageActionsFor(
  stageName: string | undefined | null,
  pipelineName: string,
  tags?: string[] | null,
): StageActionConfig | null {
  if (!stageName || !stageName.trim()) return null;
  if (!isDialingPipeline(pipelineName)) return null;
  const key = normalize(stageName);

  const unqualified: StageAction = {
    label: "Unqualified",
    tag: "services unqualified",
    variant: "subtle",
  };

  // The setter is on a call about a booked appointment: either confirming it
  // in the final 24 hours, or working the confirmed call itself. Both need
  // the same four outcomes, so the panel is the stage's, not the tag's; the
  // booked-vs-confirmed tags drive the manual-confirm ALERT (setterApptConfirm)
  // rather than which buttons exist.
  //
  // Uninterested uses the cancelled-appointment tag rather than the plain one,
  // because this lead HAS a booking: that automation cancels it and trashes
  // the lead in one move. Unqualified has no cancelled-appointment equivalent,
  // so the app cancels the booking itself.
  if (isPhoneApptStage(stageName)) {
    return {
      dials: 3,
      actions: [
        { ...unqualified, cancelAppointment: true },
        {
          label: "Uninterested",
          tag: "cancelled appointment uninterested",
          variant: "subtle",
        },
        {
          label: "Reschedule",
          tag: "cancelled appointment rescheduling",
          variant: "secondary",
          bookAfter: true,
        },
        {
          label: "Cancel + Follow Up",
          tag: "cancelled appointment follow up",
          variant: "secondary",
          promptTask: true,
        },
      ],
    };
  }

  const actions: StageAction[] = [
    unqualified,
    { label: "Uninterested", tag: "services uninterested", variant: "subtle" },
  ];

  // A lead already sitting in a follow-up stage has nothing to gain from a
  // Follow Up button: tagging it again just re-fires the automation that put
  // it there.
  if (!key.includes("follow up")) {
    actions.push({
      label: "Follow Up",
      tag: followUpTagFor(stageName, tags),
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
