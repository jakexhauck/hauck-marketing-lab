// The Follow Up Creation wizard's pure parts: the starter messages, the build
// brief, and what carries from page one to page two.
//
// Kept out of the panel so the copy patterns and the brief format can be tested
// without a browser, and so changing a starter is a one-line edit in a file
// that reads as copy rather than as JSX.

import {
  FOLLOWUP_TYPE_LABELS,
  PAGE_TYPE_LABELS,
  DESIGN_SOURCE_LABELS,
  COLOR_SOURCE_LABELS,
  MEDIA_TREATMENT_LABELS,
  mediaIsComplete,
  needsColors,
  requirementText,
  type FollowupPage,
  type FollowupPagePatch,
  type PageType,
} from "../../functions/lib/followupPages";

// A starting point for each angle, not a finished message. Every one is built
// from what makes the two live Willis messages work:
//
//   first person, the owner talking, never the business broadcasting
//   opens on {{contact.first_name}}
//   ONE idea. A question or a claim, never both.
//   the link last, on its own line, behind an arrow
//   casual punctuation, no offer stack, no urgency, no capitals
//
// The box is never blank, because a blank box gets a generic message written
// into it and a starter gets edited into a good one.
export const SMS_STARTERS: Record<PageType, string> = {
  "objection-killer":
    "Hey {{contact.first_name}}! Did you know that we can do this without you having to take time off work? If you want to see exactly how it works, click here to give this a read\n\n\u{1F449} ",
  "recent-job":
    "{{contact.first_name}}, this one's one of my favorites! A recent job we finished near you. Check it out and when you are ready send us a reply and we can get started!\n\n\u{1F449} ",
  "how-it-works":
    "Hey {{contact.first_name}}! A lot of people ask what actually happens once they book, so I put the whole thing on one page. Takes about a minute to read\n\n\u{1F449} ",
  "pricing-transparency":
    "{{contact.first_name}}, I know the first thing everyone wants to know is what it costs. I'd rather just show you than make you ask\n\n\u{1F449} ",
  "owner-story":
    "Hey {{contact.first_name}}! Figured I'd introduce myself properly since you'll be dealing with me directly. Here's who you'd actually be hiring\n\n\u{1F449} ",
  guarantee:
    "{{contact.first_name}}, one thing I should have mentioned: if you aren't happy with it, you don't pay. Here's exactly what that means\n\n\u{1F449} ",
  "seasonal-urgency":
    "Hey {{contact.first_name}}! This is the busiest stretch of our year and the calendar is filling up faster than usual. Here's what that means for booking\n\n\u{1F449} ",
};

// What page two of a sequence inherits from page one. The client, the look,
// the colours, the logo, the appointment and the calendar are settled once and
// asking again would be asking Jake to repeat himself.
//
// Deliberately NOT carried: the message, the page type, the assets and the
// slug. Those are the whole difference between the two pages.
export function carryForward(page: FollowupPage): FollowupPagePatch {
  return {
    followupType: page.followupType,
    designSource: page.designSource,
    designRef: page.designRef,
    colorSource: page.colorSource,
    colors: page.colors,
    designKitUrl: page.designKitUrl,
    logoUrl: page.logoUrl,
    appointmentType: page.appointmentType,
    calendarEmbed: page.calendarEmbed,
  };
}

// The brief the followup-page skill is run from. It is the wizard's whole
// output: everything the skill's intake asks for, in the order it asks, so the
// answers do not have to be dug back out of a chat transcript.
//
// The calendar embed is described rather than pasted. It can be 20k of markup,
// nobody reads it, and a brief that has to be scrolled past a wall of iframe is
// a brief that gets skimmed.
export function buildBrief(page: FollowupPage, clientName: string): string {
  const lines: string[] = [];
  const say = (label: string, value: string) => lines.push(`${label}: ${value || "NOT ANSWERED"}`);

  lines.push(`Follow-up page brief: ${clientName}`);
  lines.push("");
  say("Client", clientName);
  say("Follow-up", FOLLOWUP_TYPE_LABELS[page.followupType]);
  say("Step", String(page.step));
  say("Page type", page.pageType ? PAGE_TYPE_LABELS[page.pageType] : "");
  say("Slug", page.slug ? `/${page.slug}` : "");
  lines.push("");

  lines.push("The SMS:");
  lines.push(page.smsBody || "NOT ANSWERED");
  lines.push("");

  const design =
    page.designSource === "website"
      ? `${DESIGN_SOURCE_LABELS.website} (${page.designRef || "NO URL GIVEN"})`
      : DESIGN_SOURCE_LABELS[page.designSource];
  say("Design", design);
  // A kit answers the colour question, so the brief says that rather than
  // printing an empty Colours line the builder would have to interpret.
  if (page.designSource === "kit") {
    say("Design kit", page.designKitUrl);
  } else if (page.designSource === "website" && page.colorSource === "website") {
    say("Colours", COLOR_SOURCE_LABELS.website);
  } else {
    say("Colours", page.colors.join(", "));
  }
  say("Logo", page.logoUrl);
  lines.push("");

  lines.push(`Media: ${MEDIA_TREATMENT_LABELS[page.mediaTreatment]}`);
  lines.push(`  ${requirementText(page.mediaTreatment)}`);
  if (!mediaIsComplete(page.mediaTreatment, page.assets)) {
    lines.push("  STILL MISSING PHOTOS");
  }
  if (page.assets.length === 0) {
    lines.push("  nothing uploaded yet");
  } else {
    // Grouped by slot, so a before/after pair reads in the order it is drawn.
    for (const asset of page.assets) {
      lines.push(`  ${asset.slot}: ${asset.url}${asset.label ? ` (${asset.label})` : ""}`);
    }
  }
  lines.push("");

  say("Appointment", page.appointmentType);
  // Presence, not contents. See the note above.
  say("Calendar embed", page.calendarEmbed ? "provided, read it off the page row" : "");

  return lines.join("\n");
}

// Everything the wizard still needs, in the order it was asked for. Drives the
// review screen, so "what is missing" is one list rather than a hunt back
// through seven screens.
export function missingFields(page: FollowupPage): string[] {
  const missing: string[] = [];
  if (!page.smsBody.trim()) missing.push("The SMS");
  if (!page.pageType) missing.push("Page type");
  if (page.designSource === "website" && !page.designRef) missing.push("Website to pull from");
  if (page.designSource === "kit" && !page.designKitUrl) missing.push("Design kit");
  // Only when the colour question was actually asked: a kit carries its own,
  // and "use the site's colours" is an answer rather than a gap.
  if (needsColors(page.designSource, page.colorSource) && page.colors.length === 0) {
    missing.push("Colours");
  }
  if (!mediaIsComplete(page.mediaTreatment, page.assets)) missing.push("Photos");
  if (!page.appointmentType) missing.push("Appointment type");
  if (!page.calendarEmbed) missing.push("Calendar embed");
  if (!page.slug) missing.push("Slug");
  return missing;
}
