import { describe, expect, it } from "vitest";
import { computeSetterRateStrip } from "./setterRates";

type Lead = { contacted: boolean; lastOutcome: string | null };

const lead = (contacted: boolean, lastOutcome: string | null): Lead => ({ contacted, lastOutcome });

function tile(tiles: ReturnType<typeof computeSetterRateStrip>, key: string) {
  const found = tiles.find((t) => t.key === key);
  if (!found) throw new Error(`no tile ${key}`);
  return found;
}

describe("computeSetterRateStrip", () => {
  it("orders and words the five tiles exactly per the client's spec", () => {
    const tiles = computeSetterRateStrip([], "ready");
    expect(tiles.map((t) => t.key)).toEqual([
      "totalLeads",
      "contactRate",
      "bookingRate",
      "showRate",
      "closeRate",
    ]);
    expect(tile(tiles, "totalLeads")).toMatchObject({ label: "Total leads in", formula: "count of leads" });
    expect(tile(tiles, "contactRate")).toMatchObject({ label: "Contact rate", formula: "contacted / leads" });
    expect(tile(tiles, "bookingRate")).toMatchObject({ label: "Booking rate", formula: "booked / leads" });
    expect(tile(tiles, "showRate")).toMatchObject({ label: "Show rate", formula: "showed / booked" });
    expect(tile(tiles, "closeRate")).toMatchObject({ label: "Close rate", formula: "won / showed" });
  });

  it("show rate and close rate are always pending, never a number, never zero, in the ready state", () => {
    // Non-empty, fully-contacted, fully-booked input: if show/close were
    // ever derived by accident, this is the input that would produce a
    // fake non-zero number instead of a fake zero, so it exercises both
    // failure modes.
    const leads = [lead(true, "booked"), lead(true, "booked")];
    const tiles = computeSetterRateStrip(leads, "ready");
    const show = tile(tiles, "showRate");
    const close = tile(tiles, "closeRate");
    expect(show.pending).toBe(true);
    expect(show.value).toBe("");
    expect(show.pendingReason).toBe("Needs close-out flow");
    expect(close.pending).toBe(true);
    expect(close.value).toBe("");
    expect(close.pendingReason).toBe("Needs close-out flow");
  });

  it("show rate and close rate keep their own reason in the loading state, not a generic loading message", () => {
    const tiles = computeSetterRateStrip([], "loading");
    expect(tile(tiles, "showRate")).toMatchObject({ pending: true, value: "", pendingReason: "Needs close-out flow" });
    expect(tile(tiles, "closeRate")).toMatchObject({ pending: true, value: "", pendingReason: "Needs close-out flow" });
  });

  it("show rate and close rate keep their own reason in the failed state too, not the fetch-failure copy", () => {
    const leads = [lead(true, "booked"), lead(true, "booked")];
    const tiles = computeSetterRateStrip(leads, "failed");
    expect(tile(tiles, "showRate")).toMatchObject({ pending: true, value: "", pendingReason: "Needs close-out flow" });
    expect(tile(tiles, "closeRate")).toMatchObject({ pending: true, value: "", pendingReason: "Needs close-out flow" });
  });

  it("total leads in is a real count, including zero, only in the ready state", () => {
    expect(tile(computeSetterRateStrip([], "ready"), "totalLeads")).toMatchObject({ pending: false, value: "0" });
    const leads = [lead(false, null), lead(true, "booked"), lead(false, "no_answer")];
    expect(tile(computeSetterRateStrip(leads, "ready"), "totalLeads")).toMatchObject({ pending: false, value: "3" });
  });

  it("computes contact rate from the contacted flag as a rounded percent", () => {
    const leads = [lead(true, null), lead(true, null), lead(false, null), lead(false, null)];
    const contact = tile(computeSetterRateStrip(leads, "ready"), "contactRate");
    expect(contact.pending).toBe(false);
    expect(contact.value).toBe("50%");
  });

  it("computes booking rate from lastOutcome === 'booked', not from contacted", () => {
    const leads = [
      lead(true, "booked"),
      lead(true, "no_answer"), // contacted but never booked
      lead(false, null),
    ];
    const booking = tile(computeSetterRateStrip(leads, "ready"), "bookingRate");
    expect(booking.pending).toBe(false);
    expect(booking.value).toBe("33%");
  });

  it("does not let a zero-lead denominator render NaN, Infinity, or a fake zero", () => {
    const tiles = computeSetterRateStrip([], "ready");
    const contact = tile(tiles, "contactRate");
    const booking = tile(tiles, "bookingRate");
    expect(contact.value).not.toBe("NaN%");
    expect(contact.value).not.toBe("Infinity%");
    expect(contact.pending).toBe(true);
    expect(contact.value).toBe("");
    expect(contact.pendingReason).toBe("No leads yet");
    expect(booking.pending).toBe(true);
    expect(booking.value).toBe("");
    expect(booking.pendingReason).toBe("No leads yet");
  });

  it("a real zero (leads exist, none contacted or booked yet) is a genuine 0%, not pending", () => {
    const leads = [lead(false, null), lead(false, "no_answer")];
    const tiles = computeSetterRateStrip(leads, "ready");
    expect(tile(tiles, "contactRate")).toMatchObject({ pending: false, value: "0%" });
    expect(tile(tiles, "bookingRate")).toMatchObject({ pending: false, value: "0%" });
  });

  it("marks totalLeads, contactRate and bookingRate pending when the leads fetch failed, never a synthetic zero", () => {
    // Same non-empty input as the "would produce a fake number" case above:
    // if the status were ignored, this would render real-looking numbers
    // straight through a failed fetch instead of "we don't know".
    const leads = [lead(true, "booked"), lead(true, "booked")];
    const tiles = computeSetterRateStrip(leads, "failed");
    for (const key of ["totalLeads", "contactRate", "bookingRate"]) {
      const t = tile(tiles, key);
      expect(t.pending).toBe(true);
      expect(t.value).toBe("");
    }
  });

  it("a failed fetch is never mistaken for the honest zero-leads case: the copy differs", () => {
    const failed = tile(computeSetterRateStrip([], "failed"), "totalLeads");
    const empty = tile(computeSetterRateStrip([], "ready"), "contactRate");
    expect(failed.pendingReason).not.toBe(empty.pendingReason);
    expect(failed.pendingReason).toMatch(/could not load/i);
  });

  it("an empty leads array without a failure is still the honest zero, not the failure copy", () => {
    const tiles = computeSetterRateStrip([], "ready");
    expect(tile(tiles, "totalLeads")).toMatchObject({ pending: false, value: "0" });
    expect(tile(tiles, "contactRate").pendingReason).toBe("No leads yet");
  });

  // --- Loading state: the fetch is in flight and `leads` is `[]` because no
  // response has landed yet. This is the exact shape that used to slip
  // through as a confident "0" (the bug this pass exists to close): loading
  // and genuinely-empty both hand computeSetterRateStrip an empty array, so
  // only the explicit status argument can tell them apart.
  it("never shows a number, including zero, while the leads fetch is loading", () => {
    const tiles = computeSetterRateStrip([], "loading");
    for (const key of ["totalLeads", "contactRate", "bookingRate"]) {
      const t = tile(tiles, key);
      expect(t.pending).toBe(true);
      expect(t.value).toBe("");
    }
    expect(tile(tiles, "totalLeads").pendingReason).not.toBe(null);
  });

  it("loading and failed read differently to a user: distinct copy on every affected tile", () => {
    const loading = tile(computeSetterRateStrip([], "loading"), "totalLeads");
    const failed = tile(computeSetterRateStrip([], "failed"), "totalLeads");
    expect(loading.pendingReason).not.toBe(failed.pendingReason);
    expect(failed.pendingReason).toMatch(/could not load/i);
    expect(loading.pendingReason).not.toMatch(/could not load/i);
  });

  it("loading never renders a number even when a non-empty array is passed in (e.g. stale cached data mid-refetch)", () => {
    const leads = [lead(true, "booked"), lead(true, "booked")];
    const tiles = computeSetterRateStrip(leads, "loading");
    for (const key of ["totalLeads", "contactRate", "bookingRate"]) {
      const t = tile(tiles, key);
      expect(t.pending).toBe(true);
      expect(t.value).toBe("");
    }
  });

  it("defaults to the ready state when no status is passed", () => {
    expect(tile(computeSetterRateStrip([]), "totalLeads")).toMatchObject({ pending: false, value: "0" });
  });
});
