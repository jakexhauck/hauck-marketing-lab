import { describe, it, expect } from "vitest";
import { firstTouchAttribution, type GhlAttribution } from "./adAttribution";

// Verbatim from a live Willis contact pulled 2026-07-19. Both the isFirst and
// isLast entries carry the same ad, which is the common case.
const LIVE_FACEBOOK: GhlAttribution[] = [
  {
    utmSessionSource: "Paid Social",
    adSource: "facebook",
    utmCampaign: "7/15/26 | Lead Form | Willis Windows",
    utmMedium: "7/15/26 | Images & Videos",
    utmCampaignId: "120250713877980415",
    isFirst: true,
    medium: "facebook",
    mediumId: "2096724421227172",
    utmAdId: "120251336167710415",
    utmSource: "facebook",
    utmContent: "SIGN 1 | $100 OFF | 7/15/2026",
  },
  {
    utmSessionSource: "Paid Social",
    isLast: true,
    adSource: "facebook",
    utmCampaign: "7/15/26 | Lead Form | Willis Windows",
    utmMedium: "7/15/26 | Images & Videos",
    utmCampaignId: "120250713877980415",
    medium: "facebook",
    mediumId: "2096724421227172",
    utmAdId: "120251336167710415",
    utmSource: "facebook",
    utmContent: "SIGN 1 | $100 OFF | 7/15/2026",
  },
];

// Also verbatim: a survey respondent. No ad anywhere.
const LIVE_SURVEY: GhlAttribution[] = [
  {
    utmSessionSource: "Direct traffic",
    medium: "survey",
    mediumId: "7KLs4NLywWDEl0vftXXV",
    pageUrl: "https://williswindows.com/rate-us-3467",
    isFirst: true,
  },
  {
    utmSessionSource: "Direct traffic",
    medium: "survey",
    mediumId: "7KLs4NLywWDEl0vftXXV",
    pageUrl: "https://williswindows.com/rate-us-3467",
    isLast: true,
  },
];

describe("firstTouchAttribution", () => {
  it("reads the ad id, campaign id and display names off a live Facebook contact", () => {
    expect(firstTouchAttribution(LIVE_FACEBOOK)).toEqual({
      adId: "120251336167710415",
      campaignId: "120250713877980415",
      campaignName: "7/15/26 | Lead Form | Willis Windows",
      adsetName: "7/15/26 | Images & Videos",
      adName: "SIGN 1 | $100 OFF | 7/15/2026",
    });
  });

  it("returns null when nothing in the array carries an ad", () => {
    expect(firstTouchAttribution(LIVE_SURVEY)).toBeNull();
  });

  it("returns null for an absent or empty array", () => {
    expect(firstTouchAttribution(undefined)).toBeNull();
    expect(firstTouchAttribution([])).toBeNull();
  });

  it("prefers isFirst over isLast when the two disagree", () => {
    const split: GhlAttribution[] = [
      { utmAdId: "last-ad", isLast: true },
      { utmAdId: "first-ad", isFirst: true },
    ];
    expect(firstTouchAttribution(split)?.adId).toBe("first-ad");
  });

  it("falls back to the earliest ad entry when no isFirst flag is set", () => {
    const unflagged: GhlAttribution[] = [{ utmAdId: "earliest" }, { utmAdId: "later" }];
    expect(firstTouchAttribution(unflagged)?.adId).toBe("earliest");
  });

  it("skips a non-ad first touch and credits the first ad actually touched", () => {
    // Found us organically, came back through an ad, converted. For an AD
    // tracker the ad is the only touch that can be attributed at all.
    const mixed: GhlAttribution[] = [
      { utmSessionSource: "Organic Search", medium: "form", isFirst: true },
      { utmAdId: "the-ad", adSource: "facebook", isLast: true },
    ];
    expect(firstTouchAttribution(mixed)?.adId).toBe("the-ad");
  });

  it("treats a blank ad id as absent rather than joining on an empty string", () => {
    expect(firstTouchAttribution([{ utmAdId: "" }, { utmAdId: "   " }])).toBeNull();
  });

  it("tolerates missing display names, since only the ids are load-bearing", () => {
    const bare: GhlAttribution[] = [{ utmAdId: "a1", isFirst: true }];
    expect(firstTouchAttribution(bare)).toEqual({
      adId: "a1",
      campaignId: null,
      campaignName: null,
      adsetName: null,
      adName: null,
    });
  });
});
