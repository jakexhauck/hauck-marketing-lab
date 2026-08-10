// The copywriting brief the Generate button sends, and the parsing of what
// comes back.
//
// Pure on purpose. The prompt IS the feature here: it carries the voice rules
// that make a follow-up SMS sound like the owner rather than a business, and
// those rules need to be readable and testable without a browser or a CLI.
//
// Generation runs through the local `claude -p` CLI (see the dev-only plugin in
// vite-plugins/followupCopy.ts), so there is no API key anywhere and the tokens
// come out of Jake's existing Claude allowance. That also means generation only
// exists on localhost: a Cloudflare Worker cannot spawn a process, so in
// production the same button copies this prompt to the clipboard instead.

import {
  PAGE_TYPE_LABELS,
  type FollowupPage,
  type PageType,
} from "../../functions/lib/followupPages";

// What each angle is actually trying to do, said to the copywriter rather than
// to the operator. PAGE_TYPE_LABELS are UI labels; these are the briefs.
const ANGLE_BRIEFS: Record<PageType, string> = {
  "objection-killer":
    "Name the one thing quietly stopping them from booking and dissolve it. Do not sell, just remove the friction.",
  "recent-job":
    "Show a job you have just finished near them. Personal, almost like showing a mate a photo. Proof, not a pitch.",
  "how-it-works":
    "Take the uncertainty out of booking by telling them exactly what happens next. Calm and matter of fact.",
  "pricing-transparency":
    "Answer what it costs before they have to ask. Confident, no hedging, no 'it depends'.",
  "owner-story":
    "Introduce the owner as a person. Who they actually are and why they do it. Warm, not a CV.",
  guarantee:
    "Take the risk off them entirely. State the guarantee plainly, no asterisks and no small print voice.",
  "seasonal-urgency":
    "Give a real reason why now rather than later. Honest scarcity only, never manufactured panic.",
};

export interface CopyPromptInput {
  clientName: string;
  // The client's trade, from the tenant record. Empty is survivable; the brief
  // says so rather than inventing one.
  niche: string;
  pageType: PageType;
  appointmentType: string;
  // Anything Jake wants to steer this particular generation with.
  notes: string;
}

// Everything the wizard knows, shaped into a brief. The two live Willis
// messages are included verbatim because they are the only examples that have
// actually been sent, and a pattern beats an adjective.
export function buildCopyPrompt(input: CopyPromptInput): string {
  const trade = input.niche.trim() || "a local home services business";
  const lines: string[] = [];

  lines.push(
    "You are writing SMS follow-ups for a home services business, in the voice of the owner.",
    "",
    `Business: ${input.clientName} (${trade})`,
    `Angle: ${PAGE_TYPE_LABELS[input.pageType]}. ${ANGLE_BRIEFS[input.pageType]}`,
  );

  if (input.appointmentType.trim()) {
    lines.push(`What they are being booked into: ${input.appointmentType.trim()}`);
  }
  if (input.notes.trim()) {
    lines.push(`Extra direction: ${input.notes.trim()}`);
  }

  lines.push(
    "",
    "These go to people who enquired through a Facebook ad and did not book. They are warm, not cold, and they have heard from this business before.",
    "",
    "The two messages below are live for a window cleaning client and are the pattern to follow:",
    "",
    "Hey {{contact.first_name}}! Did you know that we give home estimates over the phone? If you are interested in finding out how exactly we quote houses (and apply the $100 discount), Click here to give this a read",
    "",
    "{{contact.first_name}}, this one's one of my favorites! A recent full window cleaning near you. Check it out and when you are ready send us a reply and we can get started!",
    "",
    "Rules:",
    "- First person, the owner talking. Never 'we at [business] pride ourselves'.",
    "- Open on {{contact.first_name}}, spelled exactly like that.",
    "- ONE idea per message. A question or a claim, never both.",
    "- Casual punctuation. No offer stack, no urgency stack, no capitals for emphasis.",
    "- Never use an em dash. Use commas, full stops or brackets.",
    "- No phone numbers and no prices unless the direction above gives you one.",
    "- Each message ends after the last sentence. Do NOT write a link or a URL: the page address is added afterwards.",
    "- Around 200 to 320 characters. Long enough to say something, short enough to read on a lock screen.",
    "- The three must differ in ANGLE, not just wording. A question, a piece of proof, and a plain statement beats three rewrites of one sentence.",
    "",
    'Return ONLY minified JSON on a single line, no prose and no code fence: {"variation_1":"...","variation_2":"...","variation_3":"..."}',
  );

  return lines.join("\n");
}

// How many the button always returns. Three, always: one is not a choice and
// five is a reading task.
export const VARIATION_COUNT = 3;

// Pull the three messages out of whatever came back.
//
// The model is told to return bare JSON, and usually does. It occasionally
// wraps it in a code fence anyway, so the fence is stripped before parsing
// rather than failing in front of the operator over a formatting habit.
export function parseVariations(raw: string): string[] {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const row = parsed as Record<string, unknown>;
  const out: string[] = [];
  for (let i = 1; i <= VARIATION_COUNT; i += 1) {
    const value = row[`variation_${i}`];
    // A blank slot is dropped rather than rendered as an empty card: three
    // cards where one is empty reads as a bug, two good ones reads as two
    // good ones.
    if (typeof value === "string" && value.trim()) out.push(value.trim());
  }
  return out;
}

// The prompt for a page as the wizard currently holds it. Kept beside the
// builder so the panel never assembles this by hand.
export function promptForDraft(
  draft: FollowupPage,
  clientName: string,
  niche: string,
  notes: string,
): string | null {
  // No angle, no brief. The button is disabled in that state anyway; this is
  // the second lock so a future caller cannot generate against nothing.
  if (!draft.pageType) return null;
  return buildCopyPrompt({
    clientName,
    niche,
    pageType: draft.pageType,
    appointmentType: draft.appointmentType,
    notes,
  });
}
