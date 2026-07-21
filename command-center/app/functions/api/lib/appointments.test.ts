import { describe, it, expect, vi, beforeEach } from "vitest";
import { ghlJson } from "../../lib/ghl";
import { listCalendarEvents } from "./appointments";

// The GHL transport is mocked one level BELOW listCalendars (ghlJson, not the
// appointments module itself) so the active-only calendar filter and the
// per-calendar fan-out actually execute under test rather than being stubbed
// out. This matches the mocking style the setter route tests already use.
vi.mock("../../lib/ghl", () => ({ ghlJson: vi.fn() }));

const GCTX = { token: "tok", locationId: "loc_tenant_own" };

// Route a mocked ghlJson call by the path it was given, so a test only has to
// describe the shape GHL would return for each endpoint.
function routeGhl(handlers: {
  calendars: unknown;
  events?: (calendarId: string) => unknown;
}) {
  vi.mocked(ghlJson).mockImplementation(async (_ctx, path: string) => {
    if (path.startsWith("/calendars/events")) {
      const id = new URLSearchParams(path.split("?")[1] ?? "").get("calendarId") ?? "";
      return (handlers.events?.(id) ?? { events: [] }) as never;
    }
    return handlers.calendars as never;
  });
}

const E1 = {
  id: "e1",
  title: "Estimate",
  startTime: "2026-07-24T13:00:00Z",
  endTime: "2026-07-24T14:00:00Z",
  contactId: "k1",
  contactName: "Tom Beckett",
};
const E2 = {
  id: "e2",
  title: "Phone",
  startTime: "2026-07-24T09:00:00Z",
  endTime: "2026-07-24T09:30:00Z",
  contactId: "k2",
  contactName: "Ruth Okafor",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCalendarEvents", () => {
  it("lists events across every active calendar and dedupes by id", async () => {
    routeGhl({
      calendars: {
        calendars: [
          { id: "c1", isActive: true },
          { id: "c2", isActive: true },
        ],
      },
      events: (id) => (id === "c1" ? { events: [E1] } : { events: [E1, E2] }),
    });

    const events = await listCalendarEvents(
      GCTX,
      Date.parse("2026-07-20T00:00:00Z"),
      Date.parse("2026-07-27T00:00:00Z"),
    );

    expect(events.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(events[1].contactName).toBe("Tom Beckett");
  });

  it("returns an empty array when the client has no active calendars", async () => {
    routeGhl({ calendars: { calendars: [] } });
    const events = await listCalendarEvents(GCTX, 0, 1);
    expect(events).toEqual([]);
    // The calendar list is the only call: no window is ever queried.
    expect(vi.mocked(ghlJson)).toHaveBeenCalledTimes(1);
  });

  it("skips calendars GHL flags inactive, so no event of theirs is listed", async () => {
    routeGhl({
      calendars: {
        calendars: [
          { id: "c1", isActive: true },
          { id: "cRetired", isActive: false },
        ],
      },
      events: (id) => (id === "c1" ? { events: [E1] } : { events: [E2] }),
    });
    const events = await listCalendarEvents(GCTX, 0, 1);
    expect(events.map((e) => e.id)).toEqual(["e1"]);
  });

  it("sends the window as epoch ms and scopes to the tenant's own location", async () => {
    routeGhl({ calendars: { calendars: [{ id: "c1", isActive: true }] } });
    await listCalendarEvents(GCTX, 1700000000000, 1700600000000);

    const path = vi.mocked(ghlJson).mock.calls[1][1];
    expect(path).toContain("locationId=loc_tenant_own");
    expect(path).toContain("calendarId=c1");
    // GHL's events route wants epoch ms on startTime/endTime, not ISO.
    expect(path).toContain("startTime=1700000000000");
    expect(path).toContain("endTime=1700600000000");
  });

  it("accepts _id, and fills the gaps GHL leaves on a sparse event", async () => {
    routeGhl({
      calendars: { calendars: [{ id: "c1" }] },
      events: () => ({ events: [{ _id: "e9", startTime: "2026-07-24T10:00:00Z" }] }),
    });
    const [ev] = await listCalendarEvents(GCTX, 0, 1);
    expect(ev).toEqual({
      id: "e9",
      title: "Appointment",
      startTime: "2026-07-24T10:00:00Z",
      endTime: null,
      status: "booked",
      contactId: "",
      contactName: "",
    });
  });

  it("lowercases appointmentStatus, preferring it over status", async () => {
    routeGhl({
      calendars: { calendars: [{ id: "c1" }] },
      events: () => ({
        events: [{ id: "e1", appointmentStatus: "Confirmed", status: "booked" }],
      }),
    });
    const [ev] = await listCalendarEvents(GCTX, 0, 1);
    expect(ev.status).toBe("confirmed");
  });

  it("drops an event with no usable id rather than emitting a blank one", async () => {
    routeGhl({
      calendars: { calendars: [{ id: "c1" }] },
      events: () => ({ events: [{ title: "Ghost" }, E1] }),
    });
    const events = await listCalendarEvents(GCTX, 0, 1);
    expect(events.map((e) => e.id)).toEqual(["e1"]);
  });

  it("does not pull the contact list to fill names in", async () => {
    routeGhl({
      calendars: { calendars: [{ id: "c1" }] },
      events: () => ({ events: [E1] }),
    });
    await listCalendarEvents(GCTX, 0, 1);
    // functions/api/calendar/events.ts builds a name map from up to 1000
    // contacts per request. That cost is not acceptable on a route a setter
    // hits every time they change week, so this helper must never do it.
    const paths = vi.mocked(ghlJson).mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p.startsWith("/contacts"))).toBe(false);
  });

  it("tolerates a response with no events key at all", async () => {
    routeGhl({ calendars: { calendars: [{ id: "c1" }] }, events: () => ({}) });
    await expect(listCalendarEvents(GCTX, 0, 1)).resolves.toEqual([]);
  });
});
