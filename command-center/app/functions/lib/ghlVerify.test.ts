import { describe, it, expect, vi, afterEach } from "vitest";
import { credsShapeError, verifyGhlCreds } from "./ghlVerify";

// The ladder exists because a Private Integration token only carries the scopes
// it was ticked for, so "cannot read /locations" and "does not work" are two
// different answers. These assert the difference, since collapsing them is what
// would send an operator off to regenerate a token that was fine.

afterEach(() => {
  vi.unstubAllGlobals();
});

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("verifyGhlCreds", () => {
  it("takes the location name from the first probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(res(200, { location: { name: "Willis Windows" } })),
    );
    await expect(verifyGhlCreds("pit-abc", "loc-1")).resolves.toEqual({
      ok: true,
      locationName: "Willis Windows",
    });
  });

  it("passes on a token that cannot read locations but can read the account", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(403, { message: "missing scope locations.readonly" }))
      .mockResolvedValueOnce(res(200, { pipelines: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGhlCreds("pit-abc", "loc-1")).resolves.toEqual({
      ok: true,
      locationName: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops at a 401 rather than asking two more questions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(401, { message: "Invalid JWT" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyGhlCreds("pit-dead", "loc-1")).resolves.toEqual({
      ok: false,
      error: "Invalid JWT",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the first refusal, not the last", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(res(404, { message: "Location not found" }))
        .mockResolvedValueOnce(res(422, {}))
        .mockResolvedValueOnce(res(422, {})),
    );
    await expect(verifyGhlCreds("pit-abc", "wrong-id")).resolves.toEqual({
      ok: false,
      error: "Location not found",
    });
  });

  it("replaces GHL's one-word 403 with the two things to check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(res(403, { message: "Forbidden resource" })),
    );
    const result = await verifyGhlCreds("pit-abc", "someone-elses-location");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/location id/);
  });

  it("does not read a network failure as a rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(verifyGhlCreds("pit-abc", "loc-1")).resolves.toEqual({
      ok: false,
      error: "network down",
    });
  });
});

describe("credsShapeError", () => {
  it("refuses a pasted label", () => {
    expect(credsShapeError("pit-abc def", "loc-1")).toMatch(/spaces/);
    expect(credsShapeError("pit-abc", "loc 1")).toMatch(/spaces/);
  });

  it("passes a clean pair", () => {
    expect(credsShapeError(" pit-abc ", " loc-1 ")).toBeNull();
  });
});
