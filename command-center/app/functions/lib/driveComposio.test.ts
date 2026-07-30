import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listChildrenOfMany } from "./driveComposio";
import type { Env } from "./env";

// The transport's two jobs, both of which the SOPs tab depends on:
//
//  1. Reading many folders in ONE Drive query and handing each folder back its
//     own children. Getting the grouping wrong would silently reparent SOPs.
//  2. Treating a Composio throttle as "ask again", not as an error to print.
//     Composio meters against a quota shared with every other customer, so 429
//     is a normal event; it reached Jake's screen as a raw JSON envelope.

const env = { COMPOSIO_API_KEY: "test-key" } as Env;
const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";

/** What Composio's proxy answers: Google's body wrapped in an envelope. */
function proxyOk(body: unknown) {
  return new Response(JSON.stringify({ data: body, status: 200 }), { status: 200 });
}

function driveFile(id: string, name: string, mimeType: string, parents: string[]) {
  return { id, name, mimeType, parents };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The `q` parameter of the nth Drive call, dug out of the proxy payload. */
function queryOf(call: number): string {
  const payload = JSON.parse(fetchMock.mock.calls[call][1].body as string);
  return new URL(`https://x${payload.endpoint}`).searchParams.get("q") ?? "";
}

describe("listChildrenOfMany", () => {
  it("asks for every folder in one query and files each child under its parent", async () => {
    fetchMock.mockResolvedValueOnce(
      proxyOk({
        files: [
          driveFile("d1", "1. Dialling SOP", DOC, ["a"]),
          driveFile("d2", "2. Pixel SOP", DOC, ["b"]),
          driveFile("f1", "Cold Email", FOLDER, ["a"]),
        ],
      }),
    );

    const out = await listChildrenOfMany(env, "ca_1", ["a", "b"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queryOf(0)).toBe("('a' in parents or 'b' in parents) and trashed = false");
    expect(out.get("a")?.map((f) => f.name)).toEqual(["1. Dialling SOP", "Cold Email"]);
    expect(out.get("b")?.map((f) => f.name)).toEqual(["2. Pixel SOP"]);
  });

  it("gives an empty entry for a folder with nothing in it", async () => {
    fetchMock.mockResolvedValueOnce(proxyOk({ files: [driveFile("d1", "SOP", DOC, ["a"])] }));
    const out = await listChildrenOfMany(env, "ca_1", ["a", "b"]);
    // Present and empty, never missing: the walk reads it without checking.
    expect(out.has("b")).toBe(true);
    expect(out.get("b")).toEqual([]);
  });

  it("ignores a parent outside the folders it asked about", async () => {
    fetchMock.mockResolvedValueOnce(
      proxyOk({ files: [driveFile("d1", "Shared", DOC, ["a", "somewhere-else"])] }),
    );
    const out = await listChildrenOfMany(env, "ca_1", ["a"]);
    expect(out.size).toBe(1);
    expect(out.get("a")?.map((f) => f.name)).toEqual(["Shared"]);
  });

  it("follows Drive's paging", async () => {
    fetchMock
      .mockResolvedValueOnce(
        proxyOk({ files: [driveFile("d1", "One", DOC, ["a"])], nextPageToken: "p2" }),
      )
      .mockResolvedValueOnce(proxyOk({ files: [driveFile("d2", "Two", DOC, ["a"])] }));

    const out = await listChildrenOfMany(env, "ca_1", ["a"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.get("a")?.map((f) => f.name)).toEqual(["One", "Two"]);
  });

  it("splits more than 25 folders across queries rather than one giant one", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `f${i}`);
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(() => Promise.resolve(proxyOk({ files: [] })));

    await listChildrenOfMany(env, "ca_1", ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryOf(0).match(/in parents/g)).toHaveLength(25);
    expect(queryOf(1).match(/in parents/g)).toHaveLength(5);
  });

  it("makes no call at all for no folders", async () => {
    const out = await listChildrenOfMany(env, "ca_1", []);
    expect(out.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a folder id that is not a Drive id", async () => {
    await expect(listChildrenOfMany(env, "ca_1", ["a' or '1"])).rejects.toThrow(/invalid folder id/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("throttling", () => {
  it("retries a 429 and succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(proxyOk({ files: [driveFile("d1", "SOP", DOC, ["a"])] }));

    const pending = listChildrenOfMany(env, "ca_1", ["a"]);
    await vi.runAllTimersAsync();
    const out = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.get("a")?.map((f) => f.name)).toEqual(["SOP"]);
  });

  it("gives up after three attempts, in English rather than raw JSON", async () => {
    vi.useFakeTimers();
    // The exact envelope Jake saw on screen.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { message: "Too many requests. Try again shortly.", slug: "HTTP_TooManyRequests" } }),
          { status: 429 },
        ),
      ),
    );

    const pending = listChildrenOfMany(env, "ca_1", ["a"]).catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const err = (await pending) as Error;

    // This string is rendered on the SOPs tab, so it has to mean something.
    expect(err.message).toMatch(/rate limited through Composio/);
    expect(err.message).not.toMatch(/HTTP_TooManyRequests/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("waits as long as Retry-After asks", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(proxyOk({ files: [] }));

    const pending = listChildrenOfMany(env, "ca_1", ["a"]);

    // Composio said two seconds, so one is not enough.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await pending;
  });

  it("retries a gateway blip too", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(proxyOk({ files: [] }));

    const pending = listChildrenOfMany(env, "ca_1", ["a"]);
    await vi.runAllTimersAsync();
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a refusal, which would only repeat itself", async () => {
    fetchMock.mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(listChildrenOfMany(env, "ca_1", ["a"])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a Drive-level error carried inside a 200 envelope", async () => {
    // Composio answers 200 whatever Google said; the upstream status is in the body.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { error: "no access" }, status: 403 }), { status: 200 }),
    );
    await expect(listChildrenOfMany(env, "ca_1", ["a"])).rejects.toThrow(/\(403\)/);
  });
});
