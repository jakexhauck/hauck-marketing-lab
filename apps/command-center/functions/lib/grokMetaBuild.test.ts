import { describe, it, expect } from "vitest";
import {
  ENHANCEMENTS_OFF,
  FORM_HAND_STEPS,
  adStorySpec,
  budgetProblem,
  leadFormBody,
  nextMidnight,
  planDailySpend,
  targetingSpec,
  zipKeys,
} from "./grokMetaBuild";
import type { AdsPage } from "../../src/lib/briefPages";

const form = {
  company: "Willis Window Washing",
  headline: "Answer 2 quick questions for your free estimate",
  checks: ["✅ Licensed & insured", "Streak-free or we come back", "Same-week booking"],
  phone: "(313) 766-2171",
  privacyUrl: "https://example.com/privacy",
  endTitle: "You are all set",
  endBody: "We will call you shortly.",
};

describe("leadFormBody", () => {
  it("is Jake's OG Form", () => {
    const b = leadFormBody(form);
    expect(b.name).toBe("Willis Window Washing | OG Form, More Volume");
    expect(b.is_optimized_for_quality).toBe(false);
    expect(b.context_card).toEqual({
      title: form.headline,
      style: "LIST_STYLE",
      content: ["✅ Licensed & insured", "✅ Streak-free or we come back", "✅ Same-week booking"],
    });
    const qs = b.questions as Record<string, unknown>[];
    expect(qs.map((q) => q.type)).toEqual(["CUSTOM", "CUSTOM", "FULL_NAME", "PHONE"]);
    expect((qs[0].options as { value: string }[]).map((o) => o.value)).toEqual(["YES", "NO"]);
    expect((qs[1].options as { value: string }[]).map((o) => o.value)).toEqual(["ASAP", "Within a week", "Within a month", "30 Days+"]);
    expect(b.thank_you_page).toMatchObject({ button_type: "CALL_BUSINESS", business_phone_number: "+1 313-766-2171", country_code: "US" });
    expect(FORM_HAND_STEPS).toHaveLength(3);
  });

  it("refuses what Meta would refuse", () => {
    expect(() => leadFormBody({ ...form, checks: ["one", "two"] })).toThrow(/exactly 3/);
    expect(() => leadFormBody({ ...form, phone: "12" })).toThrow(/phone/);
    expect(() => leadFormBody({ ...form, privacyUrl: "privacy" })).toThrow(/privacy/);
  });
});

describe("budget", () => {
  const plan = (spends: (number | null)[]) => ({ campaigns: spends.map((dailySpend) => ({ dailySpend })) }) as unknown as AdsPage;

  it("reads the plan's highest daily spend", () => {
    expect(planDailySpend(null)).toBeNull();
    expect(planDailySpend(plan([null, 0]))).toBeNull();
    expect(planDailySpend(plan([40, 60, null]))).toBe(60);
  });

  it("caps at the plan, or $100 without one, never over $500", () => {
    expect(budgetProblem(60, 60)).toBeNull();
    expect(budgetProblem(61, 60)).toMatch(/Ads plan/);
    expect(budgetProblem(100, null)).toBeNull();
    expect(budgetProblem(101, null)).toMatch(/\$100/);
    expect(budgetProblem(600, 1000)).toMatch(/\$500/);
    expect(budgetProblem(2, null)).toMatch(/at least 5/);
    expect(budgetProblem(Number.NaN, null)).toMatch(/at least 5/);
  });
});

describe("targeting", () => {
  it("takes 1 to 20 unique 5-digit zips", () => {
    expect(zipKeys(["48101", "48101", " 48102 "])).toEqual([{ key: "US:48101" }, { key: "US:48102" }]);
    expect(() => zipKeys([])).toThrow();
    expect(() => zipKeys(["4810"])).toThrow(/5-digit/);
    expect(() => zipKeys(Array.from({ length: 21 }, (_, i) => String(48100 + i)))).toThrow(/20/);
    expect(() => zipKeys("48101")).toThrow();
  });

  it("is Jake's spec: 18 to 65, FB and IG feeds, stories, reels, Advantage audience off", () => {
    expect(targetingSpec([{ key: "US:48101" }])).toMatchObject({
      age_min: 18,
      age_max: 65,
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "story", "facebook_reels"],
      instagram_positions: ["stream", "story", "reels"],
      targeting_automation: { advantage_audience: 0 },
    });
  });

  it("starts at the next midnight in the account's zone", () => {
    // 23:30 in Detroit (UTC-4) on the 26th is 03:30 UTC on the 27th.
    expect(nextMidnight(Date.UTC(2026, 9, 27, 3, 30), -4)).toBe("2026-10-27T00:00:00-0400");
    expect(nextMidnight(Date.UTC(2026, 9, 26, 12, 0), -5)).toBe("2026-10-27T00:00:00-0500");
    expect(nextMidnight(Date.UTC(2026, 11, 31, 12, 0), 5.5)).toBe("2027-01-01T00:00:00+0530");
  });
});

describe("adStorySpec", () => {
  const copy = { formId: "123", message: "Primary", headline: "Head", description: null, cta: "GET_QUOTE" as const };

  it("an image ad goes to the lead form", () => {
    expect(adStorySpec("9", "77", { kind: "image", hash: "abc" }, copy)).toEqual({
      page_id: "9",
      instagram_user_id: "77",
      link_data: {
        image_hash: "abc",
        link: "http://fb.me/",
        message: "Primary",
        name: "Head",
        call_to_action: { type: "GET_QUOTE", value: { lead_gen_form_id: "123" } },
      },
    });
  });

  it("a video ad carries its thumbnail and the form", () => {
    const s = adStorySpec("9", null, { kind: "video", videoId: "5", thumb: "https://t" }, { ...copy, description: "Desc" });
    expect(s.instagram_user_id).toBeUndefined();
    expect(s.video_data).toMatchObject({ video_id: "5", image_url: "https://t", title: "Head", link_description: "Desc" });
  });

  it("turns every creative enhancement off", () => {
    expect(Object.values(ENHANCEMENTS_OFF).every((v) => v.enroll_status === "OPT_OUT")).toBe(true);
  });
});
