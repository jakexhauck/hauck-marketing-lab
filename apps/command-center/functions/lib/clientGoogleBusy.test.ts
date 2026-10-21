import { describe, it, expect } from "vitest";
import { dropBusySlots } from "./clientGoogleBusy";

describe("dropBusySlots", () => {
  const busy = [{ start: "2026-10-23T14:00:00Z", end: "2026-10-23T15:00:00Z" }];

  it("drops a slot that overlaps a Google event, keeps ones that only touch it", () => {
    const slots = [
      "2026-10-23T13:00:00Z", // ends 13:30, clear
      "2026-10-23T13:45:00Z", // runs into 14:00
      "2026-10-23T14:30:00Z", // inside
      "2026-10-23T15:00:00Z", // starts as it ends
    ];
    expect(dropBusySlots(slots, busy, 30)).toEqual(["2026-10-23T13:00:00Z", "2026-10-23T15:00:00Z"]);
  });

  it("keeps everything when nothing is busy", () => {
    expect(dropBusySlots(["2026-10-23T14:00:00Z"], [], 60)).toEqual(["2026-10-23T14:00:00Z"]);
  });
});
