import { describe, expect, it } from "vitest";
import { ALL_SC_TAGS, SC_TAGS, SC_TAG_PREFIX, tagsForSalesCall } from "./salesCallTags";
import { SALES_CALL_OUTCOMES } from "./salesCalls";

// The tags are the whole interface to GoHighLevel now: the app applies one and
// Jake's workflow moves the card. A tag that is missing, misspelled or left
// behind on a contact is a workflow that does not fire or one that fires twice,
// so the rules below are the ones worth pinning down.

describe("tagsForSalesCall", () => {
  it("has a tag for every outcome, and one for a booking", () => {
    // A button with no tag is a button that appears to do nothing. This is the
    // test that fails the moment somebody adds a sixth outcome and forgets.
    for (const outcome of Object.keys(SALES_CALL_OUTCOMES)) {
      expect(tagsForSalesCall(outcome)?.tag, outcome).toBeTruthy();
    }
    expect(tagsForSalesCall("booked")?.tag).toBe(SC_TAGS.booked);
  });

  it("leaves exactly one tag on the contact and removes the rest", () => {
    // Without the removals a contact accumulates every tag it has ever earned,
    // so a filter on "sc no show" keeps returning somebody who has since
    // closed, and a workflow keyed to the tag being present re-fires.
    const result = tagsForSalesCall("closed");
    expect(result?.tag).toBe(SC_TAGS.closed);
    expect(result?.removeTags).toEqual(
      ALL_SC_TAGS.filter((t) => t !== SC_TAGS.closed),
    );
    expect(result?.removeTags).not.toContain(SC_TAGS.closed);
  });

  it("gives a no-close and a not-a-fit different tags", () => {
    // The two outcomes exist precisely so they can drive different automations.
    // One tag for both would make the split pointless.
    expect(tagsForSalesCall("not_interested")?.tag).not.toBe(tagsForSalesCall("not_qualified")?.tag);
  });

  it("refuses an event it has no meaning for, rather than guessing", () => {
    // Applying the nearest-looking tag would fire the wrong workflow. A button
    // that does nothing is easier to notice than one that does the wrong thing.
    expect(tagsForSalesCall("showed")).toBeNull();
    expect(tagsForSalesCall("")).toBeNull();
    expect(tagsForSalesCall("cancelled")).toBeNull();
  });
});

describe("the tag list itself", () => {
  it("has no duplicates, so one tag can never mean two outcomes", () => {
    expect(ALL_SC_TAGS).toEqual([...new Set(ALL_SC_TAGS)]);
  });

  it("prefixes every tag, so a tag of ours is never confused with anyone's", () => {
    // The prefix is what makes the removals safe: this app only ever strips
    // tags it wrote, never one applied by a workflow, a form or by hand.
    for (const tag of ALL_SC_TAGS) expect(tag.startsWith(SC_TAG_PREFIX)).toBe(true);
  });

  it("keeps every tag lowercase and unpadded", () => {
    // GoHighLevel lowercases tags on the way in. A tag written here with a
    // capital or a stray space would never match the one stored, so the
    // removals would silently stop working.
    for (const tag of ALL_SC_TAGS) expect(tag).toBe(tag.toLowerCase().trim());
  });
});
