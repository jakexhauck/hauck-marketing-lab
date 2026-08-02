import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ghlJson } from "../../lib/ghl";
import { createAppointment, listCalendarEvents } from "./appointments";

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

// Who names the appointment.
//
// Every GoHighLevel calendar carries its own event title, and a booking made
// inside GHL gets that name. The cold call calendar's is
// "{{contact.name}} x Hauck Marketing". Sending a title of our own overrides it,
// so the same meeting was called one thing when Jake booked it and another when
// the app did. Omitting the field is what hands the naming back to the calendar,
// which is why "no title in the payload" is a contract and not an accident.
describe("createAppointment titling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "appt_1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sentBody(): Record<string, unknown> {
    return JSON.parse(String(fetchMock.mock.calls[0][1].body));
  }

  const INPUT = {
    calendarId: "cal_cold",
    contactId: "k1",
    startTime: "2026-08-03T15:00:00-04:00",
    endTime: "2026-08-03T15:30:00-04:00",
  };

  it("sends no title at all when the caller does not name the meeting", async () => {
    const result = await createAppointment(GCTX, INPUT);
    expect(result).toEqual({ ok: true, id: "appt_1" });
    // Not "title: undefined" and not an empty string: the key must be absent, or
    // GHL takes it as the name and the calendar's own template never applies.
    expect(sentBody()).not.toHaveProperty("title");
  });

  it("still sends a title when a caller has one, so client bookings are unchanged", async () => {
    // Jobs, handoffs and onboarding name their own appointments on purpose. This
    // helper is shared, so dropping the cold call title must not silence them.
    await createAppointment(GCTX, { ...INPUT, title: "Home Estimate - Ruth Okafor" });
    expect(sentBody().title).toBe("Home Estimate - Ruth Okafor");
  });

  it("treats an empty title as no title rather than as a blank name", async () => {
    await createAppointment(GCTX, { ...INPUT, title: "" });
    expect(sentBody()).not.toHaveProperty("title");
  });
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

    const { events, failedCalendarIds } = await listCalendarEvents(
      GCTX,
      Date.parse("2026-07-20T00:00:00Z"),
      Date.parse("2026-07-27T00:00:00Z"),
    );

    expect(events.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(events[1].contactName).toBe("Tom Beckett");
    expect(failedCalendarIds).toEqual([]);
  });

  it("returns an empty result when the client has no active calendars", async () => {
    routeGhl({ calendars: { calendars: [] } });
    const result = await listCalendarEvents(GCTX, 0, 1);
    expect(result).toEqual({ events: [], failedCalendarIds: [] });
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
    const { events } = await listCalendarEvents(GCTX, 0, 1);
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
    const {
      events: [ev],
    } = await listCalendarEvents(GCTX, 0, 1);
    expect(ev).toEqual({
      id: "e9",
      title: "Appointment",
      startTime: "2026-07-24T10:00:00Z",
      endTime: null,
      status: "booked",
      contactId: "",
      contactName: "",
      // The calendar it came off (0066). This one has no name in GHL, which is
      // allowed: an empty label is honest, and the id still groups it.
      calendarId: "c1",
      calendarName: "",
    });
  });

  it("lowercases appointmentStatus, preferring it over status", async () => {
    routeGhl({
      calendars: { calendars: [{ id: "c1" }] },
      events: () => ({
        events: [{ id: "e1", appointmentStatus: "Confirmed", status: "booked" }],
      }),
    });
    const {
      events: [ev],
    } = await listCalendarEvents(GCTX, 0, 1);
    expect(ev.status).toBe("confirmed");
  });

  it("drops an event with no usable id rather than emitting a blank one", async () => {
    routeGhl({
      calendars: { calendars: [{ id: "c1" }] },
      events: () => ({ events: [{ title: "Ghost" }, E1] }),
    });
    const { events } = await listCalendarEvents(GCTX, 0, 1);
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
    await expect(listCalendarEvents(GCTX, 0, 1)).resolves.toEqual({
      events: [],
      failedCalendarIds: [],
    });
  });
});

// One calendar 4xxing used to reject the whole promise, so the setter's
// Calendar tab went blank on a 502. Carrying on is only half the fix: this
// surface BOOKS, so a partial grid silently presented as complete is how a
// setter double-books a customer on top of a real appointment. The failed ids
// come back with the events so the caller can say so.
describe("listCalendarEvents partial failure", () => {
  // Same router as above, but a handler may throw the way ghlJson does on a
  // non-2xx: a plain Error carrying the status and body.
  function routeGhlThrowing(handlers: {
    calendars: unknown;
    events: (calendarId: string) => unknown;
  }) {
    vi.mocked(ghlJson).mockImplementation(async (_ctx, path: string) => {
      if (path.startsWith("/calendars/events")) {
        const id = new URLSearchParams(path.split("?")[1] ?? "").get("calendarId") ?? "";
        return handlers.events(id) as never;
      }
      return handlers.calendars as never;
    });
  }

  it("keeps the events of the calendars that did answer when one 4xxs", async () => {
    routeGhlThrowing({
      calendars: {
        calendars: [
          { id: "cBad", isActive: true },
          { id: "cGood", isActive: true },
        ],
      },
      events: (id) => {
        if (id === "cBad") throw new Error("GHL 422 /calendars/events");
        return { events: [E1, E2] };
      },
    });

    const { events } = await listCalendarEvents(GCTX, 0, 1);
    expect(events.map((e) => e.id)).toEqual(["e2", "e1"]);
  });

  it("reports the calendar it could not read, so the caller can flag the grid", async () => {
    routeGhlThrowing({
      calendars: {
        calendars: [
          { id: "cBad", isActive: true },
          { id: "cGood", isActive: true },
        ],
      },
      events: (id) => {
        if (id === "cBad") throw new Error("GHL 422 /calendars/events");
        return { events: [E1] };
      },
    });

    const { failedCalendarIds } = await listCalendarEvents(GCTX, 0, 1);
    expect(failedCalendarIds).toEqual(["cBad"]);
  });

  it("reports every failed calendar, not just the first", async () => {
    routeGhlThrowing({
      calendars: {
        calendars: [
          { id: "cBad1", isActive: true },
          { id: "cGood", isActive: true },
          { id: "cBad2", isActive: true },
        ],
      },
      events: (id) => {
        if (id.startsWith("cBad")) throw new Error("GHL 404 /calendars/events");
        return { events: [E1] };
      },
    });

    const { events, failedCalendarIds } = await listCalendarEvents(GCTX, 0, 1);
    expect(failedCalendarIds).toEqual(["cBad1", "cBad2"]);
    expect(events.map((e) => e.id)).toEqual(["e1"]);
  });

  it("warns with the failed calendar id, matching how the client route logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    routeGhlThrowing({
      calendars: { calendars: [{ id: "cBad", isActive: true }] },
      events: () => {
        throw new Error("GHL 422 /calendars/events");
      },
    });

    await listCalendarEvents(GCTX, 0, 1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("cBad");
    warn.mockRestore();
  });

  // Every calendar failing is NOT "this client has no bookings". The caller has
  // to be able to tell those apart, or an empty grid reads as a free week.
  it("still reports the failures when no calendar answered at all", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    routeGhlThrowing({
      calendars: { calendars: [{ id: "cBad", isActive: true }] },
      events: () => {
        throw new Error("GHL 500 /calendars/events");
      },
    });

    const { events, failedCalendarIds } = await listCalendarEvents(GCTX, 0, 1);
    expect(events).toEqual([]);
    expect(failedCalendarIds).toEqual(["cBad"]);
    vi.mocked(console.warn).mockRestore?.();
  });

  // The calendar LIST failing is different: there is nothing to be partial
  // about, and the caller cannot distinguish a client with no calendars from a
  // CRM outage. That still throws, so the route can 502.
  it("rethrows when the calendar list itself fails", async () => {
    vi.mocked(ghlJson).mockRejectedValue(new Error("GHL 401 /calendars/"));
    await expect(listCalendarEvents(GCTX, 0, 1)).rejects.toThrow("GHL 401");
  });
});
