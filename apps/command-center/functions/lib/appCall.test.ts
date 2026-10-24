import { describe, it, expect, vi, beforeEach } from "vitest";

const ghlJson = vi.fn();
vi.mock("./ghl", () => ({ ghlJson: (...a: unknown[]) => ghlJson(...a) }));
const fireCallTag = vi.fn();
vi.mock("./callNowHandler", () => ({ fireCallTag: (...a: unknown[]) => fireCallTag(...a) }));

import { ownerCallTag, startAppCall } from "./appCall";

const gctx = { token: "t", locationId: "loc12345" };

describe("startAppCall", () => {
  beforeEach(() => {
    ghlJson.mockReset();
    fireCallTag.mockReset();
  });

  it("tags dialer app call when calls run from the Tracking workflow", async () => {
    ghlJson.mockResolvedValueOnce({ workflows: [{ id: "wfTrack01", name: "⚡ Tracking", status: "published" }] });
    expect(await startAppCall(gctx, "contact001")).toEqual({ ok: true });
    expect(fireCallTag).toHaveBeenCalledWith(gctx, "contact001", "dialer app call");
    expect(ghlJson).toHaveBeenCalledTimes(1);
  });

  it("says so when Tracking is in draft", async () => {
    ghlJson.mockResolvedValueOnce({ workflows: [{ id: "wfTrack01", name: "Tracking", status: "draft" }] });
    expect(await startAppCall(gctx, "contact001")).toEqual({ ok: false, message: '"Tracking" is in draft in this sub-account. Publish it.' });
    expect(fireCallTag).not.toHaveBeenCalled();
  });

  it("enrols the lead in the published App Call workflow", async () => {
    ghlJson
      .mockResolvedValueOnce({
        workflows: [
          { id: "wfDraft01", name: "App Call", status: "draft" },
          { id: "wfLive001", name: "app call ", status: "published" },
        ],
      })
      .mockResolvedValueOnce({});
    expect(await startAppCall(gctx, "contact001")).toEqual({ ok: true });
    expect(ghlJson.mock.calls[1][1]).toBe("/contacts/contact001/workflow/wfLive001");
    expect(JSON.parse(ghlJson.mock.calls[1][2].body).eventStartTime).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/);
  });

  it("matches the name with an emoji or extra spacing in front", async () => {
    ghlJson
      .mockResolvedValueOnce({ workflows: [{ id: "wfEmoji01", name: "\u{1F4BB} App  Call", status: "published" }] })
      .mockResolvedValueOnce({});
    expect(await startAppCall(gctx, "contact001")).toEqual({ ok: true });
    expect(ghlJson.mock.calls[1][1]).toBe("/contacts/contact001/workflow/wfEmoji01");
  });

  it("prefers Dialer App Call, the snapshot's name since 2026-10-24", async () => {
    ghlJson
      .mockResolvedValueOnce({
        workflows: [
          { id: "wfClient01", name: "\u{1F4BB} Client App Call", status: "published" },
          { id: "wfOld0001", name: "App Call", status: "published" },
          { id: "wfDialer01", name: "\u{1F4BB} Dialer App Call", status: "published" },
        ],
      })
      .mockResolvedValueOnce({});
    expect(await startAppCall(gctx, "contact001")).toEqual({ ok: true });
    expect(ghlJson.mock.calls[1][1]).toBe("/contacts/contact001/workflow/wfDialer01");
  });

  it("never rings the owner through Client App Call", async () => {
    ghlJson.mockResolvedValueOnce({ workflows: [{ id: "wfClient01", name: "Client App Call", status: "published" }] });
    expect(await startAppCall(gctx, "contact001")).toEqual({ ok: false, message: 'No "Dialer App Call" workflow in this sub-account.' });
  });

  it("says so when the workflow is missing or in draft", async () => {
    ghlJson.mockResolvedValueOnce({ workflows: [] });
    expect(await startAppCall(gctx, "contact001")).toEqual({ ok: false, message: 'No "Dialer App Call" workflow in this sub-account.' });
    ghlJson.mockResolvedValueOnce({ workflows: [{ id: "wfDraft01", name: "App Call", status: "draft" }] });
    const res = await startAppCall(gctx, "contact001");
    expect(res.ok).toBe(false);
    expect(ghlJson).toHaveBeenCalledTimes(2);
  });
});

describe("ownerCallTag", () => {
  beforeEach(() => ghlJson.mockReset());

  it("is client app call where Tracking or Client App Call rings the owner", async () => {
    ghlJson.mockResolvedValueOnce({ workflows: [{ id: "a", name: "\u26A1 Tracking", status: "published" }] });
    expect(await ownerCallTag(gctx)).toBe("client app call");
    ghlJson.mockResolvedValueOnce({ workflows: [{ id: "b", name: "\u{1F4BB} Client App Call", status: "published" }] });
    expect(await ownerCallTag(gctx)).toBe("client app call");
  });

  it("stays call now on clients loaded before the restructure, or when the list fails", async () => {
    ghlJson.mockResolvedValueOnce({ workflows: [{ id: "c", name: "\u{1F916} New Lead Auto Call", status: "published" }] });
    expect(await ownerCallTag(gctx)).toBe("call now");
    ghlJson.mockRejectedValueOnce(new Error("down"));
    expect(await ownerCallTag(gctx)).toBe("call now");
  });
});
