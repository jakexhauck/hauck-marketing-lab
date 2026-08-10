import { describe, expect, it } from "vitest";
import {
  emptyConversionAsset,
  type AssetKind,
  type ConversionAsset,
} from "../../functions/lib/conversionAssets";
import { buildPrompt, missingFields, mountId } from "./conversionAssetPrompt";

function asset(kind: AssetKind, over: Partial<ConversionAsset> = {}): ConversionAsset {
  return { ...emptyConversionAsset("t1", kind), ...over };
}

function prompt(kind: AssetKind, over: Partial<ConversionAsset> = {}): string {
  return buildPrompt(asset(kind, over), "Willis Windows", "willis-windows");
}

const PAIR = { before: "https://x/b.jpg", after: "https://x/a.jpg", caption: "Front of house" };
const PERSON = { ownerPhotoUrl: "https://x/o.jpg", storyNotes: "started in 2011" };

describe("buildPrompt", () => {
  it("never mentions an SMS, because the app no longer holds one", () => {
    expect(prompt("recent-work", { jobs: [PAIR] }).toLowerCase()).not.toContain("sms");
  });

  // It gets pasted into a Claude with no repo open, so the file path and the
  // mount id have to be IN it rather than looked up.
  it("is self-contained: it carries the file path, the mount id and the stub", () => {
    const out = prompt("recent-work", { jobs: [PAIR] });
    expect(out).toContain("public/sites/willis-windows/fu/recent-work.js");
    expect(out).toContain(mountId("willis-windows"));
    expect(out).toContain("app.hauckmarketing.com");
  });

  it("writes the build rules out in full rather than pointing at the skill", () => {
    const out = prompt("recent-work", { jobs: [PAIR] });
    expect(out).toContain("backtick");
    expect(out).toContain("!important");
    expect(out).not.toContain("conversion-asset skill");
  });

  // A prompt containing a backtick would break the stylesheet it is warning
  // about, which would be a fine joke and a real outage.
  it("contains no backtick of its own", () => {
    expect(prompt("owner-story", PERSON)).not.toContain("`");
  });

  it("carries no em dash, and says not to write one", () => {
    const out = prompt("recent-work", { jobs: [PAIR] });
    expect(out).not.toContain("—");
    expect(out).toContain("no em dashes");
  });

  // The line that stops a calendar appearing on the page that must not have
  // one. Stated before the content, not inferred from a missing field.
  it("tells the builder in words that the mechanism page books nothing", () => {
    const out = prompt("unique-mechanism");
    expect(out).toContain("IT ASKS FOR NOTHING");
    expect(out).toContain("NO calendar");
    expect(out).not.toContain("The booking");
  });

  it("asks for the calendar on the kinds that do book", () => {
    const out = prompt("recent-work", { jobs: [PAIR], appointmentType: "Phone estimate" });
    expect(out).toContain("IT ENDS ON THE CALENDAR");
    expect(out).toContain("The appointment is: Phone estimate");
  });

  // Nothing else leaves this screen, so an embed that is described rather than
  // pasted is a generated file with a hole somebody has to patch by hand.
  it("pastes the calendar embed in whole rather than describing it", () => {
    const out = prompt("recent-work", {
      jobs: [PAIR],
      appointmentType: "Phone estimate",
      calendarEmbed: '<iframe src="https://api.leadconnectorhq.com/widget/booking/abc"></iframe>',
    });
    expect(out).toContain("widget/booking/abc");
    expect(out).not.toContain("provided separately");
  });

  it("hands over the story notes as raw material, not as finished copy", () => {
    const out = prompt("owner-story", {
      ownerName: "Dave",
      storyNotes: "started in 2011\nhates upselling",
    });
    expect(out).toContain("YOU write the story from these");
    expect(out).toContain("hates upselling");
  });

  it("puts the gift in as a promise already made", () => {
    const out = prompt("owner-story", { ...PERSON, couponCode: "HELLO10" });
    expect(out).toContain("THE GIFT");
    expect(out).toContain("10% off");
    expect(out).toContain("HELLO10");
  });

  // The whole reason this page is safe to ship for any niche.
  it("forbids checkable claims on the mechanism page, in the prompt itself", () => {
    const out = prompt("unique-mechanism");
    expect(out).toContain("POSITIONING, NOT A RECORD OF FACT");
    expect(out).toContain("NO statistics");
  });

  it("tells the builder to invent a method name when none was given", () => {
    expect(prompt("unique-mechanism")).toContain("invent one");
    expect(prompt("unique-mechanism", { mechanismName: "The Coastal Seal" })).toContain(
      "The Coastal Seal",
    );
  });

  it("labels the before and the after so a pair cannot be drawn backwards", () => {
    const out = prompt("recent-work", { jobs: [PAIR] });
    expect(out).toContain("The first url is BEFORE");
    expect(out).toContain(`before: ${PAIR.before}`);
    expect(out).toContain(`after:  ${PAIR.after}`);
  });

  it("says to leave empty sections out rather than drawing them blank", () => {
    const out = prompt("recent-work", { jobs: [PAIR] });
    expect(out).toContain("Reviews: none given, leave the section out entirely.");
    expect(out).toContain("leave the strip out entirely");
  });

  it("says NOT ANSWERED rather than leaving a field blank to be guessed at", () => {
    expect(prompt("recent-work")).toContain("NOT ANSWERED");
  });

  it("tells the builder to carry on rather than stopping to ask", () => {
    expect(prompt("recent-work")).toContain("rather than stopping to ask");
  });
});

describe("missingFields", () => {
  it("never asks the mechanism page for anything", () => {
    expect(missingFields(asset("unique-mechanism", { colors: ["#123456"] }))).toHaveLength(0);
  });

  it("asks the booking kinds for both halves", () => {
    const missing = missingFields(asset("recent-work", { jobs: [PAIR], colors: ["#123456"] }));
    expect(missing).toContain("Appointment type");
    expect(missing).toContain("Calendar embed");
  });

  it("names the gift separately from the person", () => {
    const missing = missingFields(
      asset("owner-story", { ...PERSON, couponOffer: "", colors: ["#123456"] }),
    );
    expect(missing).toContain("The gift the text promised");
    expect(missing).not.toContain("Owner photo and notes");
  });

  it("names what the owner story is short of", () => {
    expect(missingFields(asset("owner-story", { colors: ["#123456"] }))).toContain(
      "Owner photo and notes",
    );
  });

  it("does not ask for colours when the site's own are being used", () => {
    const missing = missingFields(
      asset("unique-mechanism", {
        designSource: "website",
        designRef: "https://williswindows.com",
        colorSource: "website",
      }),
    );
    expect(missing).toHaveLength(0);
  });
});
