import { describe, it, expect, vi, afterEach } from "vitest";
import * as ghl from "./ghl";
import {
  resolveLocationUserId,
  readSocialAccounts,
  oauthStartUrl,
} from "./connections";

afterEach(() => vi.restoreAllMocks());

const CTX = { token: "t", locationId: "L1" };

describe("resolveLocationUserId", () => {
  it("returns the first user id for the location", async () => {
    vi.spyOn(ghl, "ghlJson").mockResolvedValue({
      users: [{ id: "U1" }, { id: "U2" }],
    } as never);
    expect(await resolveLocationUserId(CTX)).toBe("U1");
  });

  it("throws a white-label error when the location has no users", async () => {
    vi.spyOn(ghl, "ghlJson").mockResolvedValue({ users: [] } as never);
    await expect(resolveLocationUserId(CTX)).rejects.toThrow(
      "No user available to attach the connection",
    );
  });
});

describe("readSocialAccounts", () => {
  it("maps connected platforms (nested under results.accounts) to connected", async () => {
    vi.spyOn(ghl, "ghlJson").mockResolvedValue({
      results: { accounts: [{ platform: "facebook" }, { platform: "google" }] },
    } as never);
    const s = await readSocialAccounts(CTX);
    expect(s.facebook).toBe("connected");
    expect(s.google).toBe("connected");
    expect(s.instagram).toBe("action_needed");
  });

  it("treats an empty account list as all action_needed", async () => {
    vi.spyOn(ghl, "ghlJson").mockResolvedValue({
      results: { accounts: [], groups: [] },
    } as never);
    const s = await readSocialAccounts(CTX);
    expect(s.facebook).toBe("action_needed");
    expect(s.instagram).toBe("action_needed");
    expect(s.google).toBe("action_needed");
  });

  it("recognizes a Google Business Profile / gmb platform string as google", async () => {
    vi.spyOn(ghl, "ghlJson").mockResolvedValue({
      results: { accounts: [{ platform: "gmb" }] },
    } as never);
    expect((await readSocialAccounts(CTX)).google).toBe("connected");
  });
});

describe("oauthStartUrl", () => {
  it("returns the provider consent URL from the 302 Location header", async () => {
    vi.spyOn(ghl, "ghlFetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://www.facebook.com/dialog/oauth?x=1" },
      }),
    );
    const url = await oauthStartUrl(CTX, "facebook", "U1");
    expect(url).toBe("https://www.facebook.com/dialog/oauth?x=1");
  });

  it("returns null when no redirect is issued", async () => {
    vi.spyOn(ghl, "ghlFetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    expect(await oauthStartUrl(CTX, "google", "U1")).toBeNull();
  });
});
