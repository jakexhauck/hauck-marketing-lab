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
    const tiles = computeSetterRateStrip([]);
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

  it("show rate and close rate are always pending, never a number, never zero", () => {
    // Non-empty, fully-contacted, fully-booked input: if show/close were
    // ever derived by accident, this is the input that would produce a
    // fake non-zero number instead of a fake zero, so it exercises both
    // failure modes.
    const leads = [lead(true, "booked"), lead(true, "booked")];
    const tiles = computeSetterRateStrip(leads);
    const show = tile(tiles, "showRate");
    const close = tile(tiles, "closeRate");
    expect(show.pending).toBe(true);
    expect(show.value).toBe("");
    expect(show.pendingReason).toBe("Needs close-out flow");
    expect(close.pending).toBe(true);
    expect(close.value).toBe("");
    expect(close.pendingReason).toBe("Needs close-out flow");
  });

  it("total leads in is a real count, including zero", () => {
    expect(tile(computeSetterRateStrip([]), "totalLeads")).toMatchObject({ pending: false, value: "0" });
    const leads = [lead(false, null), lead(true, "booked"), lead(false, "no_answer")];
    expect(tile(computeSetterRateStrip(leads), "totalLeads")).toMatchObject({ pending: false, value: "3" });
  });

  it("computes contact rate from the contacted flag as a rounded percent", () => {
    const leads = [lead(true, null), lead(true, null), lead(false, null), lead(false, null)];
    const contact = tile(computeSetterRateStrip(leads), "contactRate");
    expect(contact.pending).toBe(false);
    expect(contact.value).toBe("50%");
  });

  it("computes booking rate from lastOutcome === 'booked', not from contacted", () => {
    const leads = [
      lead(true, "booked"),
      lead(true, "no_answer"), // contacted but never booked
      lead(false, null),
    ];
    const booking = tile(computeSetterRateStrip(leads), "bookingRate");
    expect(booking.pending).toBe(false);
    expect(booking.value).toBe("33%");
  });

  it("does not let a zero-lead denominator render NaN, Infinity, or a fake zero", () => {
    const tiles = computeSetterRateStrip([]);
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
    const tiles = computeSetterRateStrip(leads);
    expect(tile(tiles, "contactRate")).toMatchObject({ pending: false, value: "0%" });
    expect(tile(tiles, "bookingRate")).toMatchObject({ pending: false, value: "0%" });
  });
});
