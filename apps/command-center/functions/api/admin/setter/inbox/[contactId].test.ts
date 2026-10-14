import { describe, it, expect, vi, beforeEach } from "vitest";

// The send path is the riskiest write in the Suite: it messages a client's
// real customers under that client's name, with no approval step and no undo.
// So these tests stub only the transport (ghlJson) and the audit sink, and
// exercise the REAL sendChannelMessage validation and the REAL
// logAdminAction call site. Mocking sendChannelMessage would have made the
// "email without a subject is rejected" and "a failed send writes no audit
// row" assertions test the mock instead of the route.

vi.mock("../../../../lib/ghl", async (importActual) => {
  const actual = await importActual<typeof import("../../../../lib/ghl")>();
  return { ...actual, ghlJson: vi.fn(), ghlFetch: vi.fn() };
});
vi.mock("../../../../lib/messaging", async (importActual) => {
  const actual = await importActual<typeof import("../../../../lib/messaging")>();
  // sendChannelMessage stays REAL; only the thread read is stubbed.
  return { ...actual, fetchContactThread: vi.fn() };
});
vi.mock("../../../../lib/tenantGhl", async (importActual) => {
  const actual = await importActual<typeof import("../../../../lib/tenantGhl")>();
  return { ...actual, getGhlContextForTenant: vi.fn() };
});
vi.mock("../../../../lib/supabase", () => ({ getServiceClient: vi.fn() }));
vi.mock("../../../../lib/adminAuth", () => ({ logAdminAction: vi.fn() }));

import { ghlJson, ghlFetch } from "../../../../lib/ghl";
import { fetchContactThread } from "../../../../lib/messaging";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import { getServiceClient } from "../../../../lib/supabase";
import { logAdminAction } from "../../../../lib/adminAuth";
import { onRequestGet, onRequestPost, shapeMessages } from "./[contactId]";

const GCTX = { token: "tok_tenant_real", locationId: "loc_tenant_real", slug: "test-client", mode: "live" as const };
const FAKE_CLIENT = { from: vi.fn() } as unknown as ReturnType<typeof getServiceClient>;

function contactResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getCtx(url: string, contactId = "ct1") {
  return {
    request: new Request(url),
    env: {} as Record<string, unknown>,
    params: { contactId },
    data: { admin: { id: "admin-1" } },
  } as unknown as Parameters<typeof onRequestGet>[0];
}

function postCtx(body: unknown, contactId = "ct1") {
  return {
    request: new Request("https://x/api/admin/setter/inbox/ct1", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    env: {} as Record<string, unknown>,
    params: { contactId },
    data: { admin: { id: "admin-1" } },
  } as unknown as Parameters<typeof onRequestPost>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhlContextForTenant).mockResolvedValue(GCTX);
  vi.mocked(getServiceClient).mockReturnValue(FAKE_CLIENT);
});

describe("shapeMessages", () => {
  it("renames the lib's shape onto the API contract", () => {
    expect(
      shapeMessages([
        { id: "m1", body: "hi", direction: "inbound", type: "SMS", at: "2026-07-01T10:00:00.000Z" },
      ]),
    ).toEqual([
      {
        id: "m1",
        direction: "inbound",
        channel: "SMS",
        body: "hi",
        sentAt: "2026-07-01T10:00:00.000Z",
      },
    ]);
  });
});

describe("GET /api/admin/setter/inbox/:contactId", () => {
  it("400s without a tenantId", async () => {
    const res = await onRequestGet(getCtx("https://x/api/admin/setter/inbox/ct1"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_tenant_id" });
    expect(ghlFetch).not.toHaveBeenCalled();
  });

  it("rejects placeholder credentials rather than falling back to env creds", async () => {
    vi.mocked(getGhlContextForTenant).mockRejectedValue(
      new TenantGhlError(400, "ghl_not_connected", "Connect this client first."),
    );
    const res = await onRequestGet(getCtx("https://x/api/admin/setter/inbox/ct1?tenantId=t1"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "ghl_not_connected" });
    expect(ghlFetch).not.toHaveBeenCalled();
    expect(fetchContactThread).not.toHaveBeenCalled();
  });

  it("404s when the contact does not exist in this client's CRM", async () => {
    vi.mocked(ghlFetch).mockResolvedValue(contactResponse(404, { message: "not found" }));
    const res = await onRequestGet(getCtx("https://x/api/admin/setter/inbox/ct1?tenantId=t1"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "contact_not_found" });
    expect(fetchContactThread).not.toHaveBeenCalled();
  });

  it("returns the thread newest last, using this tenant's creds", async () => {
    vi.mocked(ghlFetch).mockResolvedValue(
      contactResponse(200, { contact: { id: "ct1", firstName: "Jane", lastName: "Doe" } }),
    );
    vi.mocked(fetchContactThread).mockResolvedValue({
      conversationId: "cv1",
      truncated: false,
      unreadCount: 2,
      messages: [
        { id: "m1", body: "hi", direction: "inbound", type: "SMS", at: "2026-07-01T10:00:00.000Z" },
        { id: "m2", body: "hello", direction: "outbound", type: "SMS", at: "2026-07-01T10:05:00.000Z" },
      ],
    });
    const res = await onRequestGet(getCtx("https://x/api/admin/setter/inbox/ct1?tenantId=t1"));
    expect(res.status).toBe(200);
    expect(getGhlContextForTenant).toHaveBeenCalledWith(expect.anything(), "t1");
    expect(vi.mocked(fetchContactThread).mock.calls[0][0]).toEqual(GCTX);
    await expect(res.json()).resolves.toEqual({
      contactId: "ct1",
      name: "Jane Doe",
      messages: [
        { id: "m1", direction: "inbound", channel: "SMS", body: "hi", sentAt: "2026-07-01T10:00:00.000Z" },
        { id: "m2", direction: "outbound", channel: "SMS", body: "hello", sentAt: "2026-07-01T10:05:00.000Z" },
      ],
      // The fixture contact carries no DND fields at all, which is "we do not
      // know" rather than "reachable". Null is the honest answer and the UI
      // renders it as no claim either way.
      dnd: null,
    });
  });

  // The composer's warning has to come from the record the SEND will hit, not
  // from the list's cached copy, which is why this handler reports it.
  it("reports a per-channel block off the contact record", async () => {
    vi.mocked(ghlFetch).mockResolvedValue(
      contactResponse(200, {
        contact: {
          id: "ct1",
          firstName: "Jane",
          dnd: false,
          dndSettings: { SMS: { status: "active", message: "TWILIO_ERROR_CODE: 30006" } },
        },
      }),
    );
    vi.mocked(fetchContactThread).mockResolvedValue({
      conversationId: "cv1",
      truncated: false,
      unreadCount: 0,
      messages: [],
    });
    const res = await onRequestGet(getCtx("https://x/api/admin/setter/inbox/ct1?tenantId=t1"));
    const body = (await res.json()) as { dnd: { all: boolean; channels: string[] } | null };
    expect(body.dnd).toEqual({
      all: false,
      channels: ["SMS"],
      reasons: { SMS: "TWILIO_ERROR_CODE: 30006" },
    });
  });

  it("maps a GHL failure to 502", async () => {
    vi.mocked(ghlFetch).mockResolvedValue(contactResponse(200, { contact: { id: "ct1" } }));
    vi.mocked(fetchContactThread).mockRejectedValue(new Error("GHL GET returned 500"));
    const res = await onRequestGet(getCtx("https://x/api/admin/setter/inbox/ct1?tenantId=t1"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "ghl_unavailable" });
  });
});

describe("POST /api/admin/setter/inbox/:contactId", () => {
  it("400s on a malformed JSON body", async () => {
    const res = await onRequestPost(postCtx("{not json"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_json" });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("400s without a tenantId", async () => {
    const res = await onRequestPost(postCtx({ channel: "SMS", body: "hi" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_tenant_id" });
    expect(ghlJson).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("rejects placeholder credentials rather than falling back to env creds", async () => {
    vi.mocked(getGhlContextForTenant).mockRejectedValue(
      new TenantGhlError(400, "ghl_not_connected", "Connect this client first."),
    );
    const res = await onRequestPost(postCtx({ tenantId: "t1", channel: "SMS", body: "hi" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "ghl_not_connected" });
    // Nothing was sent to anyone, and nothing was logged as if it had been.
    expect(ghlJson).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("rejects an empty body as missing_body", async () => {
    const res = await onRequestPost(postCtx({ tenantId: "t1", channel: "SMS", body: "   " }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_body" });
    expect(ghlJson).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("rejects an unknown channel", async () => {
    const res = await onRequestPost(
      postCtx({ tenantId: "t1", channel: "Telegram", body: "hi" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_channel" });
    expect(ghlJson).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("rejects an Email send with no subject", async () => {
    const res = await onRequestPost(
      postCtx({ tenantId: "t1", channel: "Email", body: "hi there" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_subject" });
    expect(ghlJson).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("rejects an Email send whose subject is only whitespace", async () => {
    const res = await onRequestPost(
      postCtx({ tenantId: "t1", channel: "Email", body: "hi there", subject: "  " }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_subject" });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("sends and writes exactly one audit row", async () => {
    vi.mocked(ghlJson).mockResolvedValue({ messageId: "msg_1", conversationId: "cv1" });
    const res = await onRequestPost(
      postCtx({ tenantId: "t1", channel: "SMS", body: "on my way" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: true, messageId: "msg_1" });

    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith(
      FAKE_CLIENT,
      "admin-1",
      "setter.send",
      "t1",
      expect.objectContaining({
        tenantId: "t1",
        contactId: "ct1",
        channel: "SMS",
        body: "on my way",
      }),
    );
  });

  it("sends on this tenant's credentials only", async () => {
    vi.mocked(ghlJson).mockResolvedValue({ messageId: "msg_1" });
    await onRequestPost(postCtx({ tenantId: "t1", channel: "SMS", body: "hi" }));
    expect(getGhlContextForTenant).toHaveBeenCalledWith(expect.anything(), "t1");
    expect(vi.mocked(ghlJson).mock.calls[0][0]).toEqual(GCTX);
  });

  it("records the subject for an Email send", async () => {
    vi.mocked(ghlJson).mockResolvedValue({ messageId: "msg_2" });
    await onRequestPost(
      postCtx({ tenantId: "t1", channel: "Email", body: "<p>hi</p>", subject: "Your estimate" }),
    );
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logAdminAction).mock.calls[0][4]).toMatchObject({
      channel: "Email",
      subject: "Your estimate",
    });
  });

  it("502s on a failed send and writes NO audit row", async () => {
    vi.mocked(ghlJson).mockRejectedValue(new Error("GHL POST returned 422"));
    const res = await onRequestPost(
      postCtx({ tenantId: "t1", channel: "SMS", body: "on my way" }),
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "send_failed" });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("still sends when Supabase is unavailable, rather than blocking on the audit sink", async () => {
    vi.mocked(getServiceClient).mockReturnValue(null);
    vi.mocked(ghlJson).mockResolvedValue({ messageId: "msg_3" });
    const res = await onRequestPost(postCtx({ tenantId: "t1", channel: "SMS", body: "hi" }));
    expect(res.status).toBe(200);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
