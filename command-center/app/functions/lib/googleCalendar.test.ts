import { describe, it, expect, vi, beforeEach } from "vitest";
import * as composio from "./composio";
import {
  getConnection,
  getBusy,
  disconnect,
  parseBusy,
  parseBusyEvents,
  composioUserId,
  mirrorAppointment,
} from "./googleCalendar";

// Mock the transport wholesale rather than spying: the domain layer imports
// these bindings directly, so replacing the module is the reliable seam.
vi.mock("./composio", () => ({
  composioConfigured: vi.fn(() => true),
  listConnectedAccounts: vi.fn(),
  deleteConnectedAccount: vi.fn(),
  executeTool: vi.fn(),
  proxyCall: vi.fn(),
}));

const env = {
  COMPOSIO_API_KEY: "sk_test",
  COMPOSIO_GCAL_AUTH_CONFIG_ID: "ac_test",
} as never;

const WINDOW = {
  timeMin: "2026-07-18T00:00:00Z",
  timeMax: "2026-07-25T00:00:00Z",
  timezone: "America/Detroit",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(composio.composioConfigured).mockReturnValue(true);
});

describe("composioUserId", () => {
  it("keys the grant by tenant slug", () => {
    expect(composioUserId({ slug: "willis-windows", mode: "live" })).toBe("live:willis-windows");
  });

  it("keeps test and live workspaces on separate grants", () => {
    const live = composioUserId({ slug: "willis-windows", mode: "live" });
    const test = composioUserId({ slug: "willis-windows", mode: "test" });
    expect(live).not.toBe(test);
  });
});

describe("getConnection", () => {
  it("reports not_configured when Composio has no credentials", async () => {
    vi.mocked(composio.composioConfigured).mockReturnValue(false);
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: false,
      accountId: null,
      status: "not_configured",
    });
    expect(composio.listConnectedAccounts).not.toHaveBeenCalled();
  });

  it("reports connected for an ACTIVE account", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: true,
      accountId: "ca_1",
      status: "ACTIVE",
    });
  });

  it("prefers the ACTIVE account when a stale one is also present", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_dead", status: "EXPIRED" },
      { id: "ca_live", status: "ACTIVE" },
    ]);
    expect(await getConnection(env, "tenant-1")).toMatchObject({
      connected: true,
      accountId: "ca_live",
    });
  });

  it("reports not connected but keeps the status for a half-finished link", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "INITIATED" },
    ]);
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: false,
      accountId: "ca_1",
      status: "INITIATED",
    });
  });

  it("reports none when the client has never linked", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([]);
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: false,
      accountId: null,
      status: "none",
    });
  });

  it("never throws when Composio is down", async () => {
    vi.mocked(composio.listConnectedAccounts).mockRejectedValue(new Error("boom"));
    expect(await getConnection(env, "tenant-1")).toEqual({
      connected: false,
      accountId: null,
      status: "error",
    });
  });

  it("scopes the lookup to the tenant, which is how clients stay isolated", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([]);
    await getConnection(env, "tenant-42");
    expect(composio.listConnectedAccounts).toHaveBeenCalledWith(env, "tenant-42");
  });
});

describe("parseBusy", () => {
  it("flattens busy intervals across calendars", () => {
    expect(
      parseBusy({
        response_data: {
          calendars: {
            primary: { busy: [{ start: "2026-07-20T14:00:00Z", end: "2026-07-20T15:00:00Z" }] },
          },
        },
      }),
    ).toEqual([{ start: "2026-07-20T14:00:00Z", end: "2026-07-20T15:00:00Z" }]);
  });

  it("reads the same shape when the tool omits the response_data wrapper", () => {
    expect(
      parseBusy({
        calendars: {
          primary: { busy: [{ start: "2026-07-20T14:00:00Z", end: "2026-07-20T15:00:00Z" }] },
        },
      }),
    ).toEqual([{ start: "2026-07-20T14:00:00Z", end: "2026-07-20T15:00:00Z" }]);
  });

  it("returns an empty array for any unexpected shape rather than throwing", () => {
    expect(parseBusy({})).toEqual([]);
    expect(parseBusy(null)).toEqual([]);
    expect(parseBusy("nope")).toEqual([]);
    expect(parseBusy({ response_data: { calendars: { primary: { busy: "no" } } } })).toEqual([]);
  });

  it("drops malformed intervals but keeps good ones", () => {
    expect(
      parseBusy({
        calendars: {
          primary: {
            busy: [
              { start: "2026-07-20T14:00:00Z" },
              { start: "2026-07-20T16:00:00Z", end: "2026-07-20T17:00:00Z" },
            ],
          },
        },
      }),
    ).toEqual([{ start: "2026-07-20T16:00:00Z", end: "2026-07-20T17:00:00Z" }]);
  });
});

describe("getBusy", () => {
  it("returns an empty array when the client has not linked", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([]);
    expect(await getBusy(env, "tenant-1", WINDOW)).toEqual([]);
    expect(composio.executeTool).not.toHaveBeenCalled();
  });

  it("asks Composio for the primary calendar over the requested window", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockResolvedValue({
      response_data: { calendars: { primary: { busy: [] } } },
    } as never);

    await getBusy(env, "tenant-1", WINDOW);

    expect(composio.executeTool).toHaveBeenCalledWith(
      env,
      "GOOGLECALENDAR_FIND_FREE_SLOTS",
      "tenant-1",
      {
        items: ["primary"],
        time_min: WINDOW.timeMin,
        time_max: WINDOW.timeMax,
        timezone: WINDOW.timezone,
      },
    );
  });

  it("returns the parsed intervals", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockResolvedValue({
      response_data: {
        calendars: {
          primary: { busy: [{ start: "2026-07-20T13:00:00Z", end: "2026-07-20T14:00:00Z" }] },
        },
      },
    } as never);

    expect(await getBusy(env, "tenant-1", WINDOW)).toEqual([
      { start: "2026-07-20T13:00:00Z", end: "2026-07-20T14:00:00Z" },
    ]);
  });

  it("degrades to empty rather than taking the Jobs tab down", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockRejectedValue(new Error("rate limited"));
    expect(await getBusy(env, "tenant-1", WINDOW)).toEqual([]);
  });
});

describe("disconnect", () => {
  it("revokes every account the tenant has linked", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
      { id: "ca_2", status: "EXPIRED" },
    ]);
    await disconnect(env, "tenant-1");
    expect(composio.deleteConnectedAccount).toHaveBeenCalledWith(env, "ca_1");
    expect(composio.deleteConnectedAccount).toHaveBeenCalledWith(env, "ca_2");
  });

  it("is a no-op when nothing is linked", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([]);
    await disconnect(env, "tenant-1");
    expect(composio.deleteConnectedAccount).not.toHaveBeenCalled();
  });
});

describe("mirrorAppointment", () => {
  const appt = {
    appointmentId: "appt-1",
    title: "Tom Willis, full exterior",
    startIso: "2026-07-20T09:00:00-04:00",
    endIso: "2026-07-20T11:00:00-04:00",
    location: "Rochester Hills, 48307",
  };

  it("does nothing when the client has not linked a calendar", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([]);
    expect(await mirrorAppointment(env, "live:willis", appt)).toEqual({ mirrored: false });
    expect(composio.proxyCall).not.toHaveBeenCalled();
  });

  it("creates a new event stamped with the appointment id", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockResolvedValue({ items: [] } as never);
    vi.mocked(composio.proxyCall).mockResolvedValue({} as never);

    expect(await mirrorAppointment(env, "live:willis", appt)).toEqual({ mirrored: true });

    const call = vi.mocked(composio.proxyCall).mock.calls[0][1];
    expect(call.method).toBe("POST");
    expect(call.endpoint).toBe("/calendars/primary/events");
    expect((call.body as Record<string, unknown>).extendedProperties).toEqual({
      private: { hmlAppointmentId: "appt-1" },
    });
  });

  it("moves the existing event on reschedule instead of creating a duplicate", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockResolvedValue({
      items: [{ id: "gcal-event-1" }],
    } as never);
    vi.mocked(composio.proxyCall).mockResolvedValue({} as never);

    await mirrorAppointment(env, "live:willis", appt);

    const call = vi.mocked(composio.proxyCall).mock.calls[0][1];
    expect(call.method).toBe("PATCH");
    expect(call.endpoint).toContain("gcal-event-1");
  });

  it("looks the event up by our private marker, not by title", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockResolvedValue({ items: [] } as never);
    vi.mocked(composio.proxyCall).mockResolvedValue({} as never);

    await mirrorAppointment(env, "live:willis", appt);

    expect(composio.executeTool).toHaveBeenCalledWith(
      env,
      "GOOGLECALENDAR_EVENTS_LIST",
      "live:willis",
      expect.objectContaining({
        privateExtendedProperty: "hmlAppointmentId=appt-1",
      }),
    );
  });

  it("still creates the event when the lookup fails", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockRejectedValue(new Error("throttled"));
    vi.mocked(composio.proxyCall).mockResolvedValue({} as never);

    expect(await mirrorAppointment(env, "live:willis", appt)).toEqual({ mirrored: true });
    expect(vi.mocked(composio.proxyCall).mock.calls[0][1].method).toBe("POST");
  });

  it("reports failure rather than throwing when the write fails", async () => {
    vi.mocked(composio.listConnectedAccounts).mockResolvedValue([
      { id: "ca_1", status: "ACTIVE" },
    ]);
    vi.mocked(composio.executeTool).mockResolvedValue({ items: [] } as never);
    vi.mocked(composio.proxyCall).mockRejectedValue(new Error("denied"));

    expect(await mirrorAppointment(env, "live:willis", appt)).toEqual({ mirrored: false });
  });
});

describe("parseBusyEvents", () => {
  const timed = (summary: string, extra: Record<string, unknown> = {}) => ({
    summary,
    start: { dateTime: "2026-07-22T14:00:00-04:00" },
    end: { dateTime: "2026-07-22T15:00:00-04:00" },
    ...extra,
  });

  it("maps timed events to intervals with their titles", () => {
    const out = parseBusyEvents({ items: [timed("Roof measure - Hartman")] });
    expect(out).toEqual([
      {
        start: "2026-07-22T14:00:00-04:00",
        end: "2026-07-22T15:00:00-04:00",
        title: "Roof measure - Hartman",
      },
    ]);
  });

  it("unwraps the response_data envelope Composio sometimes adds", () => {
    const out = parseBusyEvents({ response_data: { items: [timed("Standup")] } });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Standup");
  });

  it("skips cancelled, transparent, and all-day events", () => {
    const out = parseBusyEvents({
      items: [
        timed("Cancelled thing", { status: "cancelled" }),
        timed("Marked free", { transparency: "transparent" }),
        { summary: "All day", start: { date: "2026-07-22" }, end: { date: "2026-07-23" } },
        timed("Kept"),
      ],
    });
    expect(out.map((e) => e.title)).toEqual(["Kept"]);
  });

  it("keeps an untitled event with an empty title rather than dropping the block", () => {
    const out = parseBusyEvents({ items: [timed(undefined as unknown as string)] });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("");
  });

  it("returns empty on garbage shapes", () => {
    expect(parseBusyEvents(null)).toEqual([]);
    expect(parseBusyEvents({})).toEqual([]);
    expect(parseBusyEvents({ items: "nope" })).toEqual([]);
  });
});
