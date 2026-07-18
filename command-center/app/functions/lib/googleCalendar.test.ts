import { describe, it, expect, vi, beforeEach } from "vitest";
import * as composio from "./composio";
import {
  getConnection,
  getBusy,
  disconnect,
  parseBusy,
  composioUserId,
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
