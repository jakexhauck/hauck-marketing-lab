import { describe, expect, it } from "vitest";
import {
  OFFER_FAMILIES,
  OFFER_VARIANTS,
  cashLabelFor,
  cleanOffer,
  collectsFor,
  offerSummary,
  offerVariant,
  variantsOfFamily,
} from "../../functions/lib/salesOffers";

describe("the catalogue", () => {
  it("holds the six families Jake sells", () => {
    expect(OFFER_FAMILIES.map((f) => f.id)).toEqual([
      "free_trial",
      "performance",
      "pay_per_lead",
      "pay_per_appointment",
      "paid_in_full",
      "retainer",
    ]);
  });

  it("gives every family at least one variant", () => {
    for (const family of OFFER_FAMILIES) {
      expect(variantsOfFamily(family.id).length, family.id).toBeGreaterThan(0);
    }
  });

  it("has no two variants sharing an id", () => {
    const ids = OFFER_VARIANTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no two terms of one variant sharing a key", () => {
    for (const variant of OFFER_VARIANTS) {
      const keys = variant.terms.map((t) => t.key);
      expect(new Set(keys).size, variant.id).toBe(keys.length);
    }
  });

  it("looks a variant up and refuses one that is not there", () => {
    expect(offerVariant("performance_setup")?.family).toBe("performance");
    expect(offerVariant("made_up")).toBeNull();
    expect(offerVariant(null)).toBeNull();
  });
});

describe("collectsFor", () => {
  it("asks for the retainer's monthly, term and cash", () => {
    expect(collectsFor("retainer_no_guarantee")).toEqual(["monthly", "months", "cash"]);
    expect(collectsFor("retainer_guarantee")).toEqual(["monthly", "months", "cash"]);
  });

  it("asks for nothing on an offer that takes nothing at signing", () => {
    // The whole point of the change: a Monthly box beside a fully performance
    // deal is a box whose only honest answer is blank.
    expect(collectsFor("performance_no_setup")).toEqual([]);
    expect(collectsFor("ppl_no_upfront")).toEqual([]);
    expect(collectsFor("ppa_no_upfront")).toEqual([]);
    expect(collectsFor("free_trial")).toEqual([]);
  });

  it("asks for cash alone where a fee is taken but nothing recurs", () => {
    expect(collectsFor("performance_setup")).toEqual(["cash"]);
    expect(collectsFor("ppl_upfront")).toEqual(["cash"]);
    expect(collectsFor("ppa_upfront")).toEqual(["cash"]);
    expect(collectsFor("paid_in_full")).toEqual(["cash"]);
  });

  it("never puts a monthly on a paid-in-full", () => {
    // $3k up front is not $1k a month for three months, and recording it that
    // way would invent a retainer inside the monthly revenue figure.
    expect(collectsFor("paid_in_full")).not.toContain("monthly");
  });

  it("asks for everything when no offer was picked", () => {
    // Not knowing which offer it was is not the same as knowing it took
    // nothing. Hiding the boxes here would quietly lose a retainer.
    expect(collectsFor("")).toEqual(["monthly", "months", "cash"]);
    expect(collectsFor(null)).toEqual(["monthly", "months", "cash"]);
    expect(collectsFor("retired_variant")).toEqual(["monthly", "months", "cash"]);
  });

  it("only ever asks for a term where there is a monthly to run it", () => {
    for (const variant of OFFER_VARIANTS) {
      if (variant.collects.includes("months")) {
        expect(variant.collects, variant.id).toContain("monthly");
      }
    }
  });
});

describe("cashLabelFor", () => {
  it("names the cash box after what the offer actually takes", () => {
    expect(cashLabelFor("performance_setup")).toBe("Setup collected");
    expect(cashLabelFor("ppa_upfront")).toBe("Upfront collected");
    expect(cashLabelFor("paid_in_full")).toBe("Paid today");
  });

  it("falls back to plain cash", () => {
    expect(cashLabelFor("retainer_no_guarantee")).toBe("Cash today");
    expect(cashLabelFor("")).toBe("Cash today");
  });
});

describe("cleanOffer", () => {
  it("keeps the numbers actually quoted", () => {
    expect(cleanOffer("performance_setup", { setup: 300, rate: 7 })).toEqual({
      variant: "performance_setup",
      terms: { setup: 300, rate: 7 },
    });
  });

  it("reads numbers typed as strings", () => {
    expect(cleanOffer("retainer_no_guarantee", { monthly: "1500" })?.terms).toEqual({
      monthly: 1500,
    });
  });

  it("refuses an unknown variant outright", () => {
    expect(cleanOffer("something_else", { rate: 7 })).toBeNull();
    expect(cleanOffer(undefined, {})).toBeNull();
  });

  it("drops a term the variant does not have", () => {
    // A browser on an older bundle. Losing one number beats losing the outcome.
    expect(cleanOffer("free_trial", { days: 30, rate: 7 })?.terms).toEqual({ days: 30 });
  });

  it("leaves a blank term out rather than storing zero", () => {
    // "He did not write it down" and "he quoted nothing" are different facts.
    expect(cleanOffer("performance_setup", { setup: "", rate: 7 })?.terms).toEqual({ rate: 7 });
    expect(cleanOffer("performance_setup", {})?.terms).toEqual({});
  });

  it("keeps a real zero, because $0 upfront is a thing he says", () => {
    expect(cleanOffer("ppl_upfront", { upfront: 0, perLead: 50 })?.terms).toEqual({
      upfront: 0,
      perLead: 50,
    });
  });

  it("drops nonsense rather than storing it", () => {
    expect(cleanOffer("ppl_no_upfront", { perLead: -25 })?.terms).toEqual({});
    expect(cleanOffer("ppl_no_upfront", { perLead: "nine" })?.terms).toEqual({});
  });

  it("survives terms that are not an object at all", () => {
    expect(cleanOffer("free_trial", null)).toEqual({ variant: "free_trial", terms: {} });
    expect(cleanOffer("free_trial", "30 days")).toEqual({ variant: "free_trial", terms: {} });
  });
});

describe("offerSummary", () => {
  it("says what was quoted", () => {
    expect(offerSummary(cleanOffer("performance_setup", { setup: 300, rate: 7 }))).toBe(
      "Performance based: setup $300, cut 7%",
    );
  });

  it("writes money with separators and percent with a sign", () => {
    expect(offerSummary(cleanOffer("retainer_guarantee", { monthly: 1500, appointments: 15, refundPerAppt: 100 }))).toBe(
      "Monthly retainer: a month $1,500, appts 15, back each $100",
    );
  });

  it("falls back to the variant when no numbers were typed", () => {
    expect(offerSummary(cleanOffer("free_trial", {}))).toBe(
      "Free trial: Free, they cover ad spend",
    );
  });

  it("is empty when there is no offer", () => {
    expect(offerSummary(null)).toBe("");
  });
});
