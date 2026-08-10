// The prompt the Conversion Assets screen hands over, and the list of what is
// still missing.
//
// THIS IS THE SCREEN'S WHOLE OUTPUT. Jake copies it, pastes it into Claude, and
// gets the page file back. Nothing else reads it, so it has to be complete on
// its own: whoever runs it has no vault, no skill loaded, no repo open and no
// memory of this conversation.
//
// That is why the build rules and the gotchas are written out in full below
// rather than referenced. A prompt that says "follow the conversion-asset
// skill" is a prompt that produces a page with a backtick in the stylesheet.
//
// Order matters. The MANDATE comes before the content: a builder who reads the
// photos first can put a calendar on the page that must not have one and never
// notice they were not asked for it.

import {
  ASSET_KIND_JOB,
  ASSET_KIND_LABELS,
  ASSET_KIND_SENT,
  COLOR_SOURCE_LABELS,
  DESIGN_SOURCE_LABELS,
  JOB_CAP,
  asksForBooking,
  contentIsComplete,
  hasTrust,
  needsColors,
  wholeJobs,
  type ConversionAsset,
} from "../../functions/lib/conversionAssets";

const NOT_ANSWERED = "NOT ANSWERED";

// The mount id, derived the same way the stub derives it. Two clients sharing
// one id on a single GHL account would fight, so it carries the client.
export function mountId(clientSlug: string): string {
  return `${clientSlug.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()}fu`;
}

export function buildPrompt(
  asset: ConversionAsset,
  clientName: string,
  clientSlug: string,
): string {
  const lines: string[] = [];
  const say = (label: string, value: string) => lines.push(`${label}: ${value || NOT_ANSWERED}`);
  const kind = asset.kind;
  const books = kind ? asksForBooking(kind) : false;
  const mount = mountId(clientSlug || "client");
  const path = asset.slug || "your-page";

  lines.push(
    `Build one conversion asset page for ${clientName}, a home services business.`,
  );
  lines.push("");
  lines.push(
    "Return the COMPLETE file and nothing else. No explanation, no summary, no " +
      "questions. If something below is marked NOT ANSWERED, make a sensible " +
      "choice and carry on rather than stopping to ask.",
  );
  lines.push("");

  // ---------------------------------------------------------------- mandate
  lines.push("## What this page is");
  lines.push("");
  say("Asset", kind ? ASSET_KIND_LABELS[kind] : "");
  say("Sent", kind ? ASSET_KIND_SENT[kind] : "");
  say("Job of the page", kind ? ASSET_KIND_JOB[kind] : "");
  lines.push("");
  lines.push(
    "The lead arrives from a text message. They already know who this company " +
      "is. This is not a cold landing page and it must not open by introducing " +
      "the business as if they had never heard of it.",
  );
  lines.push("");
  if (books) {
    lines.push(
      "IT ENDS ON THE CALENDAR. The lead reads the page and books ON it, so the " +
        "calendar embed sits in the page itself rather than behind a link.",
    );
  } else {
    lines.push(
      "IT ASKS FOR NOTHING. Everybody reading this already has an appointment " +
        "booked, because it goes out inside the estimate reminders. NO calendar, " +
        "NO booking button, NO phone number, NO form. It ends on a short 'what to " +
        "expect at the estimate' block: what happens, how long it takes, what to " +
        "have ready. Its whole job is to make somebody who has an appointment " +
        "want to keep it.",
    );
  }
  lines.push("");

  // ------------------------------------------------------------------ file
  lines.push("## The file");
  lines.push("");
  lines.push(`Path: command-center/app/public/sites/${clientSlug || "<client>"}/fu/${path}.js`);
  lines.push(`It is loaded by this stub, which is pasted into a GoHighLevel page:`);
  lines.push("");
  lines.push(`    <div id="${mount}"></div>`);
  lines.push(
    `    <script src="https://app.hauckmarketing.com/sites/${clientSlug || "<client>"}/fu/${path}.js"></script>`,
  );
  lines.push("");
  lines.push("So the file must:");
  lines.push("");
  lines.push("- Be one self-contained IIFE. No imports, no build step, no dependencies.");
  lines.push(`- Find the element with id "${mount}" and render everything inside it.`);
  lines.push("- Inject its own stylesheet, scoped under that id.");
  lines.push("- Do nothing at all if the mount element is not on the page.");
  lines.push("");

  // ----------------------------------------------------------------- rules
  lines.push("## Rules that are not negotiable");
  lines.push("");
  lines.push(
    "Every one of these has already cost a real debugging session on a live page:",
  );
  lines.push("");
  lines.push(
    "- The CSS lives in a JavaScript template literal. A backtick character " +
      "anywhere inside it, EVEN IN A CSS COMMENT, silently ends the string and " +
      "the whole file stops parsing. Do not use one.",
  );
  lines.push(
    "- GoHighLevel's theme CSS carries !important, so an unweighted reset loses. " +
      "But once your reset is !important it flattens your own p and button " +
      "margins, so every element that wants spacing must restate it at the same " +
      "weight.",
  );
  lines.push(
    "- Media queries must be written as @media (...) { #id .x {...} }. Writing " +
      "#id @media(...) is dead CSS and silently does nothing.",
  );
  lines.push(
    "- GoHighLevel builders strip link tags, so load fonts with @import inside " +
      "the stylesheet, never with a link element.",
  );
  lines.push(
    "- A background shorthand with !important nukes background-image and " +
      "outranks an inline poster, so every image set that way vanishes silently.",
  );
  lines.push(
    "- Inputs need font-size 16px minimum or iOS Safari zooms on focus and never " +
      "zooms back out.",
  );
  lines.push(
    "- Never use the 100vw breakout trick. It counts the scrollbar and the " +
      "measurement is circular. Use width 100% plus ancestor flattening.",
  );
  lines.push(
    "- Use min-height 100vh, not 100dvh. dvh shrinks as mobile Safari's toolbar " +
      "slides away and the backdrop visibly resizing looks broken.",
  );
  if (books) {
    lines.push(
      "- The calendar embed needs a floor height of its own. GoHighLevel's " +
        "form_embed.js sizes it, and ad blockers eat that script on exactly the " +
        "traffic that arrives from an ad. Set a min-height that is usable without it.",
    );
  }
  lines.push(
    "- No phone number anywhere on the page. Book or reply, nothing else. A " +
      "number belongs in an error state only.",
  );
  lines.push(
    "- It must work at 320px, 390px and 1440px wide with no horizontal overflow " +
      "at any of them.",
  );
  lines.push("");

  // ---------------------------------------------------------------- design
  lines.push("## Design");
  lines.push("");
  const design =
    asset.designSource === "website"
      ? `${DESIGN_SOURCE_LABELS.website} (${asset.designRef || "NO URL GIVEN"})`
      : DESIGN_SOURCE_LABELS[asset.designSource];
  say("Where the look comes from", design);
  if (asset.designSource === "kit") {
    say("Design kit", asset.designKitUrl);
  } else if (asset.designSource === "website" && asset.colorSource === "website") {
    say("Colours", COLOR_SOURCE_LABELS.website);
  } else {
    say("Colours", asset.colors.join(", "));
  }
  say("Logo", asset.logoUrl);
  lines.push("");
  lines.push(
    "Light page, generous spacing, one accent colour used sparingly. It has to " +
      "look like it belongs to this company and not like a template.",
  );
  lines.push("");

  // --------------------------------------------------------------- content
  lines.push("## What goes on it");
  lines.push("");
  lines.push(...contentLines(asset));
  lines.push("");

  // --------------------------------------------------------------- closing
  if (books) {
    lines.push("## The booking");
    lines.push("");
    say("The appointment is", asset.appointmentType);
    lines.push("");
    if (asset.calendarEmbed) {
      // Pasted in whole rather than described. The prompt is the only thing
      // leaving this screen, so "the embed is provided separately" means a
      // generated file with a hole in it that somebody has to patch by hand.
      lines.push("Drop this calendar embed into the page exactly as it is, unedited:");
      lines.push("");
      for (const line of asset.calendarEmbed.split("\n")) lines.push(`    ${line}`);
    } else {
      lines.push(
        `Calendar embed: ${NOT_ANSWERED}. Leave a clearly marked placeholder ` +
          "comment where it will be pasted, sized with a real min-height.",
      );
    }
    lines.push("");
    lines.push(
      "Every call to action on the page has to read grammatically for that " +
        "appointment type. Some clients quote over the phone, others send " +
        "somebody out, and the copy cannot assume either.",
    );
    lines.push("");
  }

  lines.push("## Copy");
  lines.push("");
  lines.push(
    "Write it in the owner's voice: first person, plain words, short sentences. " +
      "No marketing throat-clearing, no superlatives, no exclamation marks, no " +
      "em dashes. Never invent a statistic, a certification, an award or a " +
      "guarantee that is not written above.",
  );

  return lines.join("\n").trimEnd();
}

function contentLines(asset: ConversionAsset): string[] {
  const out: string[] = [];

  switch (asset.kind) {
    case "owner-story":
      out.push(`Owner: ${asset.ownerName || NOT_ANSWERED}`);
      out.push(`Photo of them: ${asset.ownerPhotoUrl || NOT_ANSWERED}`);
      out.push("");
      out.push("Notes about them. YOU write the story from these, they are raw material:");
      if (asset.storyNotes.trim()) {
        for (const line of asset.storyNotes.split("\n")) out.push(`  ${line}`);
      } else {
        out.push(`  ${NOT_ANSWERED}`);
      }
      out.push("");
      // Stated as a promise already made, not as a block to place. The text
      // that sends them here says there is a gift on the website.
      out.push("THE GIFT. The text that sent them here already promised this, so the");
      out.push("page has to hand it over high up and unmissably, above the booking:");
      out.push(`  Offer: ${asset.couponOffer || NOT_ANSWERED}`);
      if (asset.couponCode) out.push(`  Code: ${asset.couponCode}`);
      if (asset.couponTerms) out.push(`  Terms: ${asset.couponTerms}`);
      return out;

    case "unique-mechanism":
      out.push(
        `Method name: ${asset.mechanismName || "NOT GIVEN, invent one that fits the trade and sounds like theirs rather than like an agency's"}`,
      );
      out.push("");
      out.push("Steering notes:");
      if (asset.mechanismNotes.trim()) {
        for (const line of asset.mechanismNotes.split("\n")) out.push(`  ${line}`);
      } else {
        out.push("  none given, build it from the trade alone");
      }
      out.push("");
      out.push("THIS PAGE IS POSITIONING, NOT A RECORD OF FACT.");
      out.push("");
      out.push(
        "Its job is to make their process feel like a named, deliberate method " +
          "that nobody else runs. Three or four named steps, each with a name and " +
          "a sentence. Say what the usual way gets wrong and what they do instead.",
      );
      out.push("");
      out.push(
        "Nothing on it may be a claim anybody could check: NO statistics, NO " +
          "percentages, NO certifications, NO awards, NO named guarantee, NO " +
          "'voted best'. Frame, sequence and language are what make it land, and " +
          "none of those can be wrong. Assume there are no photos to use.",
      );
      return out;

    case "recent-work": {
      const jobs = wholeJobs(asset.jobs);
      const cap = JOB_CAP[asset.kind];
      if (jobs.length === 0) {
        out.push(`Jobs: ${NOT_ANSWERED}`);
      } else {
        out.push(`${jobs.length} job${jobs.length === 1 ? "" : "s"} (up to ${cap}), each a`);
        out.push("before and after pair. Draw each as a slider or a labelled pair, and");
        out.push("keep them in this order. The first url is BEFORE, the second is AFTER:");
        jobs.forEach((job, i) => {
          out.push(`  ${i + 1}. before: ${job.before}`);
          out.push(`     after:  ${job.after}`);
          if (job.caption) out.push(`     caption: ${job.caption}`);
        });
      }
      out.push("");

      if (asset.reviews.length === 0) {
        out.push("Reviews: none given, leave the section out entirely.");
      } else {
        out.push(`Reviews (${asset.reviews.length}), quoted exactly as written:`);
        for (const review of asset.reviews) {
          out.push(`  "${review.text}"`);
          const by = [review.name, review.stars ? `${review.stars} stars` : ""]
            .filter(Boolean)
            .join(", ");
          if (by) out.push(`    ${by}`);
        }
      }
      out.push("");
      out.push(
        `Trust: ${hasTrust(asset.trust) ? trustLine(asset) : "none given, leave the strip out entirely"}`,
      );
      return out;
    }

    default:
      out.push(NOT_ANSWERED);
      return out;
  }
}

function trustLine(asset: ConversionAsset): string {
  const t = asset.trust;
  const parts: string[] = [];
  if (t.licensed) parts.push("licensed");
  if (t.insured) parts.push("insured");
  if (t.years) parts.push(`${t.years} years in business`);
  if (t.jobsCompleted) parts.push(`${t.jobsCompleted} jobs completed`);
  if (t.warranty) parts.push(`warranty: ${t.warranty}`);
  if (t.serviceArea) parts.push(`serves ${t.serviceArea}`);
  return parts.join(", ");
}

// Everything the wizard still needs, in the order it was asked for. Drives the
// review screen, so "what is missing" is one list rather than a hunt back
// through four screens.
export function missingFields(asset: ConversionAsset): string[] {
  const missing: string[] = [];

  if (asset.designSource === "website" && !asset.designRef) missing.push("Website to pull from");
  if (asset.designSource === "kit" && !asset.designKitUrl) missing.push("Design kit");
  // Only when the colour question was actually asked: a kit carries its own,
  // and "use the site's colours" is an answer rather than a gap.
  if (needsColors(asset.designSource, asset.colorSource) && asset.colors.length === 0) {
    missing.push("Colours");
  }

  // unique-mechanism is never listed: it requires nothing by design, so there
  // is nothing it can be short of.
  if (!contentIsComplete(asset)) {
    if (asset.kind === "owner-story") {
      if (!asset.ownerPhotoUrl || !asset.storyNotes.trim()) missing.push("Owner photo and notes");
      if (!asset.couponOffer.trim()) missing.push("The gift the text promised");
    } else {
      missing.push("A whole before/after job");
    }
  }

  if (asset.kind && asksForBooking(asset.kind)) {
    if (!asset.appointmentType) missing.push("Appointment type");
    if (!asset.calendarEmbed) missing.push("Calendar embed");
  }

  if (!asset.slug) missing.push("Path");
  return missing;
}
