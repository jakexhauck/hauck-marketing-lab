import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GhlConversation } from "../../../lib/ghl";

// The shaping and paging are lib/inboxFeed.ts's and are covered by the Setter
// inbox's tests. What is tested here is the only thing this route adds, and the
// only thing that can go wrong in a way that matters: WHICH ACCOUNT it reads.
// The agency's credentials, never a client's, and a hard stop when they are
// unset rather than a fallback.

vi.mock("../../../lib/ghl", async (importActual) => {
  const actual = await importActual<typeof import("../../../lib/ghl")>();
  return { ...actual, fetchAllConversations: vi.fn() };
});

import { fetchAllConversations } from "../../../lib/ghl";
import { onRequestGet } from "./index";

const AGENCY_ENV = {
  AGENCY_GHL_LOCATION_ID: "loc_agency",
  AGENCY_GHL_TOKEN: "tok_agency",
};

function conv(over: Partial<GhlConversation> = {}): GhlConversation {
  return {
    id: over.id ?? "cv1",
    contactId: over.contactId ?? "ct1",
    fullName: "Jane Doe",
    phone: "+15551234567",
    lastMessageBody: "hello there",
    lastMessageType: "TYPE_SMS",
    lastMessageDate: 1_700_000_000_000,
    unreadCount: 0,
    ...over,
  };
}

function makeCtx(url: string, env: Record<string, unknown> = AGENCY_ENV) {
  return {
    request: new Request(url),
    env,
    data: { admin: { id: "admin-1" } },
  } as unknown as Parameters<typeof onRequestGet>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAllConversations).mockResolvedValue([]);
});

describe("GET /api/admin/inbox", () => {
  it("reads the AGENCY sub-account, not a client's", async () => {
    vi.mocked(fetchAllConversations).mockResolvedValue([conv()]);
    const res = await onRequestGet(makeCtx("https://x/api/admin/inbox"));
    expect(res.status).toBe(200);
    const [passedCtx] = vi.mocked(fetchAllConversations).mock.calls[0];
    expect(passedCtx).toEqual({ locationId: "loc_agency", token: "tok_agency" });
  });

  it("says not_configured, and reads nothing, when the agency pair is unset", async () => {
    const res = await onRequestGet(makeCtx("https://x/api/admin/inbox", {}));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "not_configured" });
    // The whole point: a missing pair must never fall back to a client's
    // credentials, so no CRM traffic happens at all.
    expect(fetchAllConversations).not.toHaveBeenCalled();
  });

  it("does not fetch the whole location unbounded", async () => {
    const res = await onRequestGet(makeCtx("https://x/api/admin/inbox"));
    expect(res.status).toBe(200);
    const [, opts] = vi.mocked(fetchAllConversations).mock.calls[0];
    expect(opts?.maxPages).toBe(1);
  });

  it("filters server-side on q", async () => {
    vi.mocked(fetchAllConversations).mockResolvedValue([
      conv({ id: "a", contactId: "a", fullName: "Jane Doe" }),
      conv({ id: "b", contactId: "b", fullName: "Bob Ross" }),
    ]);
    const res = await onRequestGet(makeCtx("https://x/api/admin/inbox?q=bob"));
    const body = (await res.json()) as { threads: { contactId: string }[] };
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].contactId).toBe("b");
  });

  it("maps a GHL failure to 502", async () => {
    vi.mocked(fetchAllConversations).mockRejectedValue(new Error("GHL GET returned 500"));
    const res = await onRequestGet(makeCtx("https://x/api/admin/inbox"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "ghl_unavailable" });
  });
});
