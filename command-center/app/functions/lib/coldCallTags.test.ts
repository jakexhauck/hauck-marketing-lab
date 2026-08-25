import { describe, expect, it } from "vitest";
import {
  BOOK_TAGS,
  leavesTheDialer,
  OWNED_TAGS,
  planContactTags,
  tagForStatus,
} from "./coldCallTags";
import { ALL_CC_TAGS, CC_TAGS } from "./agencyGhl";
import { NEW_LEAD_TAG } from "./leadScraper";

describe("tagForStatus", () => {
  it("names one tag per page of the book", () => {
    expect(tagForStatus("New Lead")).toBe(NEW_LEAD_TAG);
    expect(tagForStatus("No Answer Day 1")).toBe(CC_TAGS.noAnswerDay1);
    expect(tagForStatus("No Answer Day 2")).toBe(CC_TAGS.noAnswerDay2);
    expect(tagForStatus("Call Back")).toBe(CC_TAGS.callBack);
    expect(tagForStatus("Not Interested")).toBe(CC_TAGS.notInterested);
  });

  it("gives Booked no tag at all, so it appears in no dialing list", () => {
    expect(tagForStatus("Booked")).toBeNull();
  });

  it("is undefined for a status the book does not have, rather than a guess", () => {
    expect(tagForStatus("Brushed Off")).toBeUndefined();
    expect(tagForStatus("")).toBeUndefined();
  });
});

describe("the tags stay exclusive", () => {
  it("owns every tag the outcome push writes", () => {
    for (const tag of Object.values(CC_TAGS)) expect(BOOK_TAGS).toContain(tag);
  });

  it("owns the import tag, which is what makes New Lead trustworthy", () => {
    expect(BOOK_TAGS).toContain(NEW_LEAD_TAG);
  });

  it("agrees with the outcome push about what may be removed", () => {
    // Both paths write tags onto the same contacts. If one strips a tag the
    // other leaves behind, a contact ends up in two lists.
    expect([...OWNED_TAGS].sort()).toEqual([...ALL_CC_TAGS].sort());
  });
});

describe("planContactTags", () => {
  it("applies the tag to a contact that has none", () => {
    expect(planContactTags("Call Back", [])).toEqual({
      apply: [CC_TAGS.callBack],
      remove: [],
    });
  });

  it("does nothing when the contact is already right", () => {
    expect(planContactTags("Call Back", [CC_TAGS.callBack])).toEqual({
      apply: [],
      remove: [],
    });
  });

  it("strips the tag of the page they have left", () => {
    const plan = planContactTags("No Answer Day 2", [CC_TAGS.noAnswerDay1]);
    expect(plan.apply).toEqual([CC_TAGS.noAnswerDay2]);
    expect(plan.remove).toEqual([CC_TAGS.noAnswerDay1]);
  });

  it("strips cc new lead off a prospect who has now been called", () => {
    const plan = planContactTags("No Answer Day 1", [NEW_LEAD_TAG]);
    expect(plan.apply).toEqual([CC_TAGS.noAnswerDay1]);
    expect(plan.remove).toEqual([NEW_LEAD_TAG]);
  });

  it("leaves a booked prospect with no cold call tag whatsoever", () => {
    const plan = planContactTags("Booked", [NEW_LEAD_TAG, CC_TAGS.callBack]);
    expect(plan.apply).toEqual([]);
    expect(plan.remove.sort()).toEqual([CC_TAGS.callBack, NEW_LEAD_TAG].sort());
  });

  it("never touches somebody else's tags", () => {
    const plan = planContactTags("Call Back", ["hvac", "detroit", "willis client"]);
    expect(plan.apply).toEqual([CC_TAGS.callBack]);
    expect(plan.remove).toEqual([]);
  });

  it("matches the tags GoHighLevel hands back, which are lowercased", () => {
    expect(planContactTags("Call Back", ["CC Call Back"])).toEqual({
      apply: [],
      remove: [],
    });
  });

  it("cleans a retired tag off a contact still carrying it", () => {
    const plan = planContactTags("Call Back", [CC_TAGS.callBack, "cc brush off"]);
    expect(plan.apply).toEqual([]);
    expect(plan.remove).toEqual(["cc brush off"]);
  });

  it("does nothing at all for a status outside the book", () => {
    expect(planContactTags("Customer", [NEW_LEAD_TAG])).toEqual({ apply: [], remove: [] });
  });

  it("shrugs off blank tags rather than counting them", () => {
    expect(planContactTags("Call Back", ["", "  "])).toEqual({
      apply: [CC_TAGS.callBack],
      remove: [],
    });
  });
});

describe("leavesTheDialer", () => {
  // Live evidence, 2026-08-25. The dialer's list is a filter on the `Power
  // Dialer` tag and nothing ever took that tag off again, so every company ever
  // sent stayed on it for ever: of the 685 companies on the list, 559 had
  // already been rung. 302 of those were a flat no, 15 had agreed a callback
  // and 5 had booked. Jake was being handed the same businesses over and over.
  it("takes a company off the list once the call is finished with", () => {
    expect(leavesTheDialer("not_qualified")).toBe(true);
    expect(leavesTheDialer("opener_no")).toBe(true);
    expect(leavesTheDialer("pitch_no")).toBe(true);
    expect(leavesTheDialer("not_in_niche")).toBe(true);
    expect(leavesTheDialer("gatekeeper")).toBe(true);
    expect(leavesTheDialer("booked")).toBe(true);
  });

  it("takes a company off the list when a callback is agreed", () => {
    // The callback is a task in GoHighLevel at the agreed hour. Leaving them on
    // the dialer as well would ring them at some other time instead, which is
    // the one thing a caller has just promised not to do.
    expect(leavesTheDialer("callback")).toBe(true);
  });

  it("LEAVES a no answer on the list, because they are still owed a call", () => {
    // Nobody picked up, so the conversation has not happened. 233 of the 559
    // were exactly this, and taking them off would end the second attempt
    // rather than end the duplicates.
    expect(leavesTheDialer("no_answer")).toBe(false);
  });

  it("leaves a company alone when the outcome means nothing here", () => {
    // A new button, or a typo. Neither is a reason to quietly clear somebody
    // out of a queue Jake is working.
    expect(leavesTheDialer("pending")).toBe(false);
    expect(leavesTheDialer("")).toBe(false);
    expect(leavesTheDialer("brush_off")).toBe(false);
  });
});
