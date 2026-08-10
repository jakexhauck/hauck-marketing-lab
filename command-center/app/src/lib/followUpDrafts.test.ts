import { describe, it, expect } from "vitest";
import {
  GALLERY_MINIMUM,
  cleanAssets,
  cleanColor,
  cleanColors,
  cleanSlug,
  cleanStep,
  emptyFollowupPage,
  mediaIsComplete,
  needsColors,
  nextStep,
  requirementText,
  sequenceIsFull,
  slotsFor,
  smsSegments,
  stepIsComplete,
  type FollowupPage,
} from "../../functions/lib/followupPages";
import { SMS_STARTERS, buildBrief, carryForward, missingFields } from "./followUpDrafts";

// A page filled in far enough to be worth asserting against.
function page(over: Partial<FollowupPage> = {}): FollowupPage {
  return {
    ...emptyFollowupPage("t1"),
    smsBody: "Hey {{contact.first_name}}!",
    pageType: "recent-job",
    colors: ["#4dbb83"],
    appointmentType: "Phone estimate",
    calendarEmbed: "<iframe></iframe>",
    slug: "recent-cleaning",
    ...over,
  };
}

describe("cleanSlug", () => {
  it("normalises what actually gets pasted", () => {
    expect(cleanSlug("/Phone Estimate")).toBe("phone-estimate");
    expect(cleanSlug("recent_cleaning_217709")).toBe("recent-cleaning-217709");
    expect(cleanSlug("  --Hello--World--  ")).toBe("hello-world");
  });

  it("cannot produce a slug that is only punctuation", () => {
    expect(cleanSlug("///")).toBe("");
    expect(cleanSlug("!!!")).toBe("");
  });
});

describe("cleanColor", () => {
  it("takes hex with or without the hash, and expands the short form", () => {
    expect(cleanColor("#4DBB83")).toBe("#4dbb83");
    expect(cleanColor("4dbb83")).toBe("#4dbb83");
    expect(cleanColor("#abc")).toBe("#aabbcc");
  });

  it("drops anything that is not a colour rather than storing it", () => {
    expect(cleanColor("green")).toBe("");
    expect(cleanColor("#12345")).toBe("");
    expect(cleanColor(null)).toBe("");
  });

  it("does not keep the same colour twice", () => {
    expect(cleanColors(["#4dbb83", "4DBB83", "#fff"])).toEqual(["#4dbb83", "#ffffff"]);
  });
});

describe("the new-leads cap", () => {
  it("gives a first page step 1 and a second page step 2", () => {
    expect(nextStep([], "new-leads")).toBe(1);
    expect(nextStep([page({ step: 1 })], "new-leads")).toBe(2);
  });

  it("calls the sequence full at two, and never caps estimate assets", () => {
    const two = [page({ step: 1 }), page({ step: 2 })];
    expect(sequenceIsFull(two, "new-leads")).toBe(true);
    expect(sequenceIsFull(two, "estimate-assets")).toBe(false);
  });

  it("clamps a step past the cap instead of rejecting the save", () => {
    expect(cleanStep(7, "new-leads")).toBe(2);
    expect(cleanStep(7, "estimate-assets")).toBe(7);
    expect(cleanStep(0, "new-leads")).toBe(1);
  });

  it("counts only the sequence being asked about", () => {
    const mixed = [
      page({ step: 1, followupType: "new-leads" }),
      page({ step: 1, followupType: "estimate-assets" }),
    ];
    expect(nextStep(mixed, "new-leads")).toBe(2);
  });
});

describe("the message is the gate", () => {
  it("holds the SMS step until there is both a message and an angle", () => {
    const p = emptyFollowupPage("t1");
    expect(stepIsComplete("sms", p)).toBe(false);
    expect(stepIsComplete("sms", { ...p, smsBody: "Hey!" })).toBe(false);
    expect(stepIsComplete("sms", { ...p, smsBody: "Hey!", pageType: "recent-job" })).toBe(true);
  });

  it("will not pass a message that is only whitespace", () => {
    const p = { ...emptyFollowupPage("t1"), smsBody: "   \n  ", pageType: "guarantee" as const };
    expect(stepIsComplete("sms", p)).toBe(false);
  });
});

describe("design always asks for colours", () => {
  it("blocks the default look until a colour is chosen", () => {
    const p = { ...emptyFollowupPage("t1"), designSource: "default" as const };
    expect(stepIsComplete("design", p)).toBe(false);
    expect(stepIsComplete("design", { ...p, colors: ["#4dbb83"] })).toBe(true);
  });

  it("also wants the site when the look is being pulled from one", () => {
    const p = {
      ...emptyFollowupPage("t1"),
      designSource: "website" as const,
      colors: ["#4dbb83"],
    };
    expect(stepIsComplete("design", p)).toBe(false);
    expect(stepIsComplete("design", { ...p, designRef: "https://williswindows.com" })).toBe(true);
  });
});

describe("the colour question is only asked when it is a question", () => {
  it("skips it for a design kit, which carries its own colours", () => {
    expect(needsColors("kit", "custom")).toBe(false);
    expect(needsColors("kit", "website")).toBe(false);
  });

  it("skips it when the site's own colours are being used", () => {
    expect(needsColors("website", "website")).toBe(false);
    expect(needsColors("website", "custom")).toBe(true);
  });

  it("still asks on the default, because a default is not a decision", () => {
    expect(needsColors("default", "custom")).toBe(true);
  });

  it("gates the design step on the kit rather than on colours", () => {
    const kit = { ...emptyFollowupPage("t1"), designSource: "kit" as const };
    expect(stepIsComplete("design", kit)).toBe(false);
    expect(
      stepIsComplete("design", { ...kit, designKitUrl: "https://x.test/kit.pdf" }),
    ).toBe(true);
  });

  it("lets a website page through on the site's colours with none picked", () => {
    const site = {
      ...emptyFollowupPage("t1"),
      designSource: "website" as const,
      designRef: "https://williswindows.com",
      colorSource: "website" as const,
    };
    expect(site.colors).toEqual([]);
    expect(stepIsComplete("design", site)).toBe(true);
  });
});

describe("what each media treatment needs", () => {
  it("asks for the before and the after by name, in that order", () => {
    const slots = slotsFor("before-after");
    expect(slots.map((s) => s.slot)).toEqual(["before", "after"]);
    expect(slots.map((s) => s.label)).toEqual(["Before photo", "After photo"]);
    expect(slots.every((s) => s.required)).toBe(true);
  });

  it("says the count out loud", () => {
    expect(requirementText("before-after")).toContain("2 photos");
    expect(requirementText("photo")).toContain("1 photo");
    expect(requirementText("gallery")).toContain(String(GALLERY_MINIMUM));
    expect(requirementText("video")).toContain("video link");
  });

  it("will not call a slider complete with half a pair", () => {
    const before = [{ slot: "before" as const, url: "https://x.test/b.jpg", label: "" }];
    const after = [{ slot: "after" as const, url: "https://x.test/a.jpg", label: "" }];
    expect(mediaIsComplete("before-after", [])).toBe(false);
    expect(mediaIsComplete("before-after", before)).toBe(false);
    expect(mediaIsComplete("before-after", [...before, ...after])).toBe(true);
  });

  it("holds a gallery to its minimum", () => {
    const shot = (n: number) => ({
      slot: "gallery" as const,
      url: `https://x.test/${n}.jpg`,
      label: "",
    });
    const two = [shot(1), shot(2)];
    expect(mediaIsComplete("gallery", two)).toBe(false);
    expect(mediaIsComplete("gallery", [...two, shot(3)])).toBe(true);
  });

  it("does not count photos in the wrong slot toward the requirement", () => {
    const extras = [
      { slot: "extra" as const, url: "https://x.test/1.jpg", label: "" },
      { slot: "extra" as const, url: "https://x.test/2.jpg", label: "" },
      { slot: "extra" as const, url: "https://x.test/3.jpg", label: "" },
    ];
    expect(mediaIsComplete("gallery", extras)).toBe(false);
  });

  it("lets a single-photo page ship on the logo alone", () => {
    expect(mediaIsComplete("photo", [])).toBe(true);
    expect(stepIsComplete("assets", emptyFollowupPage("t1"))).toBe(true);
  });

  it("blocks the assets step when the treatment is missing its pair", () => {
    const slider = { ...emptyFollowupPage("t1"), mediaTreatment: "before-after" as const };
    expect(stepIsComplete("assets", slider)).toBe(false);
  });
});

describe("cleanAssets", () => {
  it("keeps the slot so a pair cannot end up the wrong way round", () => {
    expect(
      cleanAssets([
        { slot: "after", url: "https://x.test/a.jpg", label: "" },
        { slot: "before", url: "https://x.test/b.jpg", label: "" },
      ]).map((a) => a.slot),
    ).toEqual(["after", "before"]);
  });

  it("files an unknown slot under extra rather than dropping the photo", () => {
    expect(cleanAssets([{ slot: "nonsense", url: "https://x.test/a.jpg" }])[0].slot).toBe(
      "extra",
    );
  });

  it("drops a row with no url, which is an upload that never finished", () => {
    expect(cleanAssets([{ slot: "hero", url: "", label: "a caption" }])).toEqual([]);
  });
});

describe("smsSegments", () => {
  it("counts a plain message in 160s", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ chars: 160, segments: 1, unicode: false });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
  });

  it("drops to 70 the moment an emoji is in it", () => {
    const withEmoji = `${"a".repeat(80)}\u{1F449}`;
    const seg = smsSegments(withEmoji);
    expect(seg.unicode).toBe(true);
    expect(seg.segments).toBeGreaterThan(1);
  });

  it("counts an emoji as one character, not two", () => {
    expect(smsSegments("\u{1F449}").chars).toBe(1);
  });

  it("says nothing about an empty box", () => {
    expect(smsSegments("")).toEqual({ chars: 0, segments: 0, unicode: false });
  });
});

describe("the starters", () => {
  it("every angle has one, and all of them open on the first name", () => {
    for (const [type, starter] of Object.entries(SMS_STARTERS)) {
      expect(starter, type).toContain("{{contact.first_name}}");
      expect(starter, type).toContain("\u{1F449}");
    }
  });
});

describe("carryForward", () => {
  it("carries the settled things and none of the per-page ones", () => {
    const one = page({ logoUrl: "https://x.test/logo.webp", designRef: "https://x.test" });
    const carried = carryForward(one);
    expect(carried.appointmentType).toBe("Phone estimate");
    expect(carried.colors).toEqual(["#4dbb83"]);
    expect(carried.logoUrl).toBe("https://x.test/logo.webp");
    // The whole difference between page one and page two.
    expect(carried).not.toHaveProperty("smsBody");
    expect(carried).not.toHaveProperty("pageType");
    expect(carried).not.toHaveProperty("slug");
    expect(carried).not.toHaveProperty("assets");
  });
});

describe("buildBrief", () => {
  it("names what has not been answered rather than leaving a blank", () => {
    const brief = buildBrief(emptyFollowupPage("t1"), "Willis Windows");
    expect(brief).toContain("NOT ANSWERED");
  });

  it("never pastes the calendar embed into the brief", () => {
    const brief = buildBrief(page({ calendarEmbed: "<iframe src='secret'></iframe>" }), "Willis");
    expect(brief).not.toContain("iframe");
    expect(brief).toContain("provided");
  });

  it("carries the message and the slug", () => {
    const brief = buildBrief(page(), "Willis Windows");
    expect(brief).toContain("Hey {{contact.first_name}}!");
    expect(brief).toContain("/recent-cleaning");
    expect(brief).toContain("Recent job near them");
  });
});

describe("missingFields", () => {
  it("is empty for a page that is ready", () => {
    expect(missingFields(page())).toEqual([]);
  });

  it("lists every gap in the order it was asked for", () => {
    expect(missingFields(emptyFollowupPage("t1"))).toEqual([
      "The SMS",
      "Page type",
      "Colours",
      "Appointment type",
      "Calendar embed",
      "Slug",
    ]);
  });
});
