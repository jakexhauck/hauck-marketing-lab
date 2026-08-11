import { describe, expect, it } from "vitest";
import { emptyConversionAsset, type ConversionAsset } from "../../functions/lib/conversionAssets";
import { asPatch, PATCH_KEYS } from "./conversionAssetPatch";

// The bug this file exists to stop.
//
// asPatch used to be a hand-written list of keys living inside the wizard
// component. Migration 0098 added mechanism_name, mechanism_notes and the three
// coupon columns, and nobody added them to that list. Every key on
// ConversionAssetPatch is optional, so TypeScript was happy, and the server
// treats an absent key as "leave this column alone", which is correct for a
// patch. The result was silent: the operator typed a page of steering notes,
// the save succeeded, the column stayed empty, and the generated prompt said
// "none given". Nothing anywhere reported a failure.
//
// So the test is not "does it carry mechanismNotes". It is "does it carry
// EVERYTHING", checked against the server's own type, so the next column to be
// added fails here instead of silently dropping a field a client typed.

describe("asPatch", () => {
  it("carries every field the operator can type in the wizard", () => {
    // Typed, not cast. A cast here would have let the test keep passing while
    // drifting away from the real row shape, which is the same class of mistake
    // the module itself exists to stop.
    const filled: ConversionAsset = {
      ...emptyConversionAsset("t1", "unique-mechanism"),
      slug: "our-process",
      designSource: "kit",
      designRef: "https://example.com/ref",
      colorSource: "custom",
      colors: ["#C38D33"],
      designKitUrl: "https://example.com/kit.pdf",
      logoUrl: "https://example.com/logo.jpg",
      ownerName: "Seamus",
      ownerPhotoUrl: "https://example.com/o.jpg",
      storyNotes: "started three seasons ago",
      couponOffer: "10 percent off the first job",
      couponCode: "MADEBETTER",
      couponTerms: "one per household",
      mechanismName: "The Michigan Base Method",
      mechanismNotes: "the base is the differentiator, not the brick",
      jobs: [{ before: "https://x/b.jpg", after: "https://x/a.jpg", caption: "Front walk" }],
      reviews: [{ text: "great crew", name: "Michael G", stars: 5 }],
      trust: {
        licensed: true,
        insured: true,
        years: "3",
        jobsCompleted: "50",
        warranty: "",
        serviceArea: "Metro Detroit",
      },
      appointmentType: "home estimate",
      calendarEmbed: '<iframe src="https://go.example.com/widget"></iframe>',
      status: "draft",
    };

    const out = asPatch(filled);

    for (const key of PATCH_KEYS) {
      expect(out, `asPatch dropped ${key}`).toHaveProperty(key);
      expect(out[key], `asPatch blanked ${key}`).toEqual(filled[key]);
    }
  });

  // The two that were actually lost, named, so a regression reads as itself in
  // the runner output rather than as "some key is missing".
  it("carries the mechanism steering notes the operator typed", () => {
    const filled = {
      ...emptyConversionAsset("t1", "unique-mechanism"),
      mechanismName: "The Michigan Base Method",
      mechanismNotes: "line one\nline two",
    };
    expect(asPatch(filled).mechanismName).toBe("The Michigan Base Method");
    expect(asPatch(filled).mechanismNotes).toBe("line one\nline two");
  });

  it("carries the gift the owner-story text already promised", () => {
    const filled = {
      ...emptyConversionAsset("t1", "owner-story"),
      couponOffer: "10 percent off",
      couponCode: "HELLO",
      couponTerms: "one per household",
    };
    expect(asPatch(filled).couponOffer).toBe("10 percent off");
    expect(asPatch(filled).couponCode).toBe("HELLO");
    expect(asPatch(filled).couponTerms).toBe("one per household");
  });

  // pageSource is the built file body. The server writes it and never sends it
  // to the browser, so the wizard has nothing to send back and must not blank
  // it by sending an empty string.
  it("does not send the page body back", () => {
    expect(asPatch(emptyConversionAsset("t1", "recent-work"))).not.toHaveProperty("pageSource");
  });
});
