import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanAttachments, sendChannelMessage } from "./messaging";

const ctx = { token: "tok", locationId: "loc" };

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const fetchMock = vi.fn(async () => Response.json({ messageId: "m1", conversationId: "c1" }));
  vi.stubGlobal("fetch", fetchMock);
  // The JSON body of the one GHL call made.
  return () => JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
}

describe("cleanAttachments", () => {
  it("keeps https strings only, five at most", () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://x.test/${i}.jpg`);
    expect(cleanAttachments(["http://a.test/1.jpg", 3, "javascript:x", ...urls])).toEqual(urls.slice(0, 5));
  });
  it("treats anything but an array as none", () => {
    expect(cleanAttachments(undefined)).toEqual([]);
    expect(cleanAttachments("https://x.test/a.jpg")).toEqual([]);
  });
});

describe("sendChannelMessage with photos", () => {
  it("sends a photo-only text as an MMS", async () => {
    const sent = stubFetch();
    const r = await sendChannelMessage(ctx, "contact1", { channel: "SMS", body: "", attachments: ["https://x.test/a.jpg"] });
    expect("error" in r).toBe(false);
    expect(sent()).toEqual({ type: "SMS", contactId: "contact1", message: "", attachments: ["https://x.test/a.jpg"] });
  });

  it("still refuses a text with no words and no photo", async () => {
    stubFetch();
    const r = await sendChannelMessage(ctx, "contact1", { channel: "SMS", body: "  " });
    expect(r).toEqual({ error: { code: "empty_message", status: 400 } });
  });

  it("never puts photos on an email", async () => {
    const sent = stubFetch();
    await sendChannelMessage(ctx, "contact1", { channel: "Email", body: "hi", subject: "s", attachments: ["https://x.test/a.jpg"] });
    expect(sent().attachments).toBeUndefined();
  });

  it("leaves a plain text exactly as it was", async () => {
    const sent = stubFetch();
    await sendChannelMessage(ctx, "contact1", { channel: "SMS", body: "hello" });
    expect(sent()).toEqual({ type: "SMS", contactId: "contact1", message: "hello" });
  });
});
