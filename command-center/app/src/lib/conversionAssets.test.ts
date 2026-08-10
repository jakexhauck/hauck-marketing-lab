import { describe, expect, it } from "vitest";
import {
  ASSET_KINDS,
  ASSET_KIND_PATHS,
  DEFAULT_COUPON_OFFER,
  JOB_CAP,
  asksForBooking,
  cleanJobs,
  cleanReviews,
  cleanTrust,
  contentIsComplete,
  emptyConversionAsset,
  jobIsWhole,
  stepIsComplete,
  stepsFor,
  wholeJobs,
  type AssetKind,
  type ConversionAsset,
} from "../../functions/lib/conversionAssets";

// A draft of one kind with whatever this test needs on top of it.
function asset(kind: AssetKind, over: Partial<ConversionAsset> = {}): ConversionAsset {
  return { ...emptyConversionAsset("t1", kind), ...over };
}

const PAIR = { before: "https://x/b.jpg", after: "https://x/a.jpg", caption: "" };

describe("the three assets", () => {
  it("is exactly three, in send order", () => {
    expect(ASSET_KINDS).toEqual(["recent-work", "owner-story", "unique-mechanism"]);
  });

  it("gives every kind its own fixed path", () => {
    const paths = Object.values(ASSET_KIND_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("sets the path from the kind, so it is never typed", () => {
    expect(asset("recent-work").slug).toBe("recent-work");
    expect(asset("owner-story").slug).toBe("meet-the-owner");
    expect(asset("unique-mechanism").slug).toBe("our-process");
  });

  // The single most load-bearing rule in the model. The mechanism page rides
  // along with the estimate reminders, so its reader already has an
  // appointment.
  it("does not book on unique-mechanism, and does on the other two", () => {
    expect(asksForBooking("unique-mechanism")).toBe(false);
    expect(asksForBooking("recent-work")).toBe(true);
    expect(asksForBooking("owner-story")).toBe(true);
  });
});

describe("stepsFor", () => {
  it("leaves the booking step out of unique-mechanism entirely", () => {
    const ids = stepsFor("unique-mechanism").map((s) => s.id);
    expect(ids).not.toContain("booking");
    expect(ids).toEqual(["design", "content", "link", "review"]);
  });

  it("keeps it for the two that book", () => {
    expect(stepsFor("recent-work").map((s) => s.id)).toContain("booking");
    expect(stepsFor("owner-story")).toHaveLength(5);
  });
});

describe("content completeness", () => {
  it("needs one whole job on recent-work, and counts only the whole ones", () => {
    const mixed = [PAIR, { before: "https://x/b2.jpg", after: "", caption: "" }];
    expect(wholeJobs(mixed)).toHaveLength(1);
    expect(contentIsComplete(asset("recent-work", { jobs: mixed }))).toBe(true);
    expect(contentIsComplete(asset("recent-work"))).toBe(false);
  });

  // Half a pair is an upload that was interrupted, not a job.
  it("does not count a job that is missing its after photo", () => {
    const half = { before: "https://x/b.jpg", after: "", caption: "" };
    expect(jobIsWhole(half)).toBe(false);
    expect(contentIsComplete(asset("recent-work", { jobs: [half] }))).toBe(false);
  });

  it("does not need reviews or trust facts to be complete", () => {
    expect(contentIsComplete(asset("recent-work", { jobs: [PAIR] }))).toBe(true);
  });

  // The text that sends them there promises a gift by name, so a page without
  // it is a broken promise rather than a thinner page.
  it("wants the photo, the notes AND the gift on the owner story", () => {
    const withPerson = asset("owner-story", {
      ownerPhotoUrl: "https://x/o.jpg",
      storyNotes: "started in 2011",
    });
    expect(contentIsComplete(withPerson)).toBe(true);
    expect(contentIsComplete({ ...withPerson, couponOffer: "" })).toBe(false);
    expect(contentIsComplete({ ...withPerson, ownerPhotoUrl: "" })).toBe(false);
    expect(contentIsComplete({ ...withPerson, storyNotes: "" })).toBe(false);
  });

  it("pre-fills the gift on the owner story and nowhere else", () => {
    expect(asset("owner-story").couponOffer).toBe(DEFAULT_COUPON_OFFER);
    expect(asset("recent-work").couponOffer).toBe("");
  });

  // Deliberate. The client may have no photos and no documented process, and
  // the page is built out of positioning either way.
  it("requires nothing at all on unique-mechanism", () => {
    expect(contentIsComplete(asset("unique-mechanism"))).toBe(true);
  });
});

describe("stepIsComplete", () => {
  it("answers booking as done for unique-mechanism, which never asks it", () => {
    expect(stepIsComplete("booking", asset("unique-mechanism"))).toBe(true);
    expect(stepIsComplete("booking", asset("recent-work"))).toBe(false);
  });

  it("wants both halves of the booking answer on the kinds that book", () => {
    const half = asset("recent-work", { appointmentType: "Phone estimate" });
    expect(stepIsComplete("booking", half)).toBe(false);
    expect(stepIsComplete("booking", { ...half, calendarEmbed: "<iframe />" })).toBe(true);
  });

  it("treats a design kit as the whole design answer", () => {
    expect(stepIsComplete("design", asset("recent-work", { designSource: "kit" }))).toBe(false);
    expect(
      stepIsComplete(
        "design",
        asset("recent-work", { designSource: "kit", designKitUrl: "https://x/k.pdf" }),
      ),
    ).toBe(true);
  });
});

describe("cleaners", () => {
  it("caps jobs at five", () => {
    const many = Array.from({ length: 9 }, () => PAIR);
    expect(cleanJobs(many)).toHaveLength(5);
    expect(JOB_CAP["recent-work"]).toBe(5);
  });

  it("gives the two pageless kinds no jobs at all", () => {
    expect(JOB_CAP["owner-story"]).toBe(0);
    expect(JOB_CAP["unique-mechanism"]).toBe(0);
  });

  // The operator uploads the before, the row saves, the after arrives a moment
  // later. Dropping the half row on the way through would delete the first
  // upload in front of them.
  it("keeps a half-filled job rather than losing the photo already uploaded", () => {
    const cleaned = cleanJobs([{ before: "https://x/b.jpg", after: "", caption: "" }]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].before).toBe("https://x/b.jpg");
  });

  it("drops a job row with nothing in it at all", () => {
    expect(cleanJobs([{ before: "", after: "", caption: "" }])).toHaveLength(0);
  });

  it("drops a review with no words and clamps the stars", () => {
    const cleaned = cleanReviews([
      { text: "", name: "Ann", stars: 5 },
      { text: "They were great", name: "Bob", stars: 99 },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].stars).toBe(5);
  });

  it("reads a missing trust object as nothing rather than throwing", () => {
    expect(cleanTrust(undefined).licensed).toBe(false);
    expect(cleanTrust({ licensed: "yes" }).licensed).toBe(false);
    expect(cleanTrust({ licensed: true }).licensed).toBe(true);
  });
});
