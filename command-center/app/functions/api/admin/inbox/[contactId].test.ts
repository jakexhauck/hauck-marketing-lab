import { describe, it, expect, vi, beforeEach } from "vitest";

// The send is the risky half: it texts a real person as Hauck Marketing, with
// no approval step and no undo. So only the transport (ghlJson / ghlFetch) and
// the audit sink are stubbed; the REAL sendChannelMessage validation and the
// REAL logAdminAction call site are exercised, or "an empty body is rejected"
// and "a failed send writes no audit row" would be testing a mock.

vi.mock("../../../lib/ghl", async (importActual) => {
  const actual = await importActual<typeof import("../../../lib/ghl")>();
  return { ...actual, ghlJson: vi.fn(), ghlFetch: vi.fn() };
});
vi.mock("../../../lib/messaging", async (importActual) => {
  const actual = await importActual<typeof import("../../../lib/messaging")>();
  // sendChannelMessage stays REAL; only the thread read is stubbed.
  return { ...actual, fetchContactThread: vi.fn() };
});
vi.mock("../../../lib/supabase", () => ({ getServiceClient: vi.fn() }));
vi.mock("../../../lib/adminAuth", () => ({ logAdminAction: vi.fn() }));

import { ghlJson, ghlFetch } from "../../../lib/ghl";
import { fetchContactThread } from "../../../lib/messaging";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { onRequestGet, onRequestPost } from "./[contactId]";

const AGENCY_ENV = {
  AGENCY_GHL_LOCATION_ID: "loc_agency",
  AGENCY_GHL_TOKEN: "tok_agency",
};
const AGENCY_CTX = { locationId: "loc_agency", token: "tok_agency" };
const FAKE_CLIENT = { from: vi.fn() } as unknown as ReturnType<typeof getServiceClient>;

function getCtx(env: Record<string, unknown> = AGENCY_ENV, contactId = "ct1") {
  return {
    request: new Request("https://x/api/admin/inbox/ct1"),
    env,
    params: { contactId },
    data: { admin: { id: "admin-1" } },
  } as unknown as Parameters<typeof onRequestGet>[0];
}

function postCtx(body: unknown, env: Record<string, unknown> = AGENCY_ENV) {
  return {
    request: new Request("https://x/api/admin/inbox/ct1", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    env,
    params: { contactId: "ct1" },
    data: { admin: { id: "admin-1" } },
  } as unknown as Parameters<typeof onRequestPost>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue(FAKE_CLIENT);
  vi.mocked(logAdminAction).mockResolvedValue(true);
  vi.mocked(ghlJson).mockResolvedValue({ messageId: "m1" } as never);
  vi.mocked(ghlFetch).mockResolvedValue(
    new Response(JSON.stringify({ contact: { id: "ct1", contactName: "Jane Doe", phone: "+15551234567" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.mocked(fetchContactThread).mockResolvedValue({
    conversationId: "cv1",
    messages: [{ id: "m0", direction: "inbound", type: "SMS", body: "hi", at: "2026-08-14T10:00:00.000Z" }],
    truncated: false,
    unreadCount: 0,
  } as never);
});

describe("GET /api/admin/inbox/:contactId", () => {
  it("reads the thread out of the agency account and carries the number", async () => {
    const res = await onRequestGet(getCtx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      contactId: "ct1",
      name: "Jane Doe",
      phone: "+15551234567",
      messages: [{ id: "m0", channel: "SMS", body: "hi" }],
    });
    expect(vi.mocked(ghlFetch).mock.calls[0][0]).toEqual(AGENCY_CTX);
  });

  it("503s without reading anything when the agency pair is unset", async () => {
    const res = await onRequestGet(getCtx({}));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "not_configured" });
    expect(ghlFetch).not.toHaveBeenCalled();
  });

  it("404s on a contact this account does not hold", async () => {
    vi.mocked(ghlFetch).mockResolvedValue(new Response("", { status: 404 }));
    const res = await onRequestGet(getCtx());
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "contact_not_found" });
  });
});

describe("POST /api/admin/inbox/:contactId", () => {
  it("sends a text as the agency and audits it against no tenant", async () => {
    const res = await onRequestPost(postCtx({ body: "on my way" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: true, messageId: "m1", audited: true });

    const [ctx, path, init] = vi.mocked(ghlJson).mock.calls[0];
    expect(ctx).toEqual(AGENCY_CTX);
    expect(path).toBe("/conversations/messages");
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "SMS",
      contactId: "ct1",
      message: "on my way",
    });

    expect(logAdminAction).toHaveBeenCalledWith(
      FAKE_CLIENT,
      "admin-1",
      "agency_inbox.send",
      null,
      expect.objectContaining({ contactId: "ct1", channel: "SMS", body: "on my way" }),
    );
  });

  it("rejects an empty message without sending or auditing", async () => {
    const res = await onRequestPost(postCtx({ body: "   " }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_body" });
    expect(ghlJson).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses to send at all when the agency pair is unset", async () => {
    const res = await onRequestPost(postCtx({ body: "hello" }, {}));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "not_configured" });
    expect(ghlJson).not.toHaveBeenCalled();
  });

  it("writes no audit row when the send itself failed", async () => {
    vi.mocked(ghlJson).mockRejectedValue(new Error("GHL POST returned 500"));
    const res = await onRequestPost(postCtx({ body: "hello" }));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "send_failed" });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // The text is already gone, so this stays a 200. It must not read as an
  // unqualified success though: the audit log is the only record it happened.
  it("reports audited:false when the send landed but the log did not", async () => {
    vi.mocked(logAdminAction).mockResolvedValue(false);
    const res = await onRequestPost(postCtx({ body: "hello" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ sent: true, audited: false });
  });
});
