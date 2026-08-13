import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => ({ getServiceClient: () => (supabaseUp ? fakeClient() : null) }));
vi.mock("@block65/webcrypto-web-push", () => ({
  buildPushPayload: (msg: { data: string }) => {
    sentPayloads.push(JSON.parse(msg.data));
    return Promise.resolve({ method: "POST", headers: {}, body: "" });
  },
}));
vi.mock("./ghl", () => ({
  ghlJson: () => {
    if (ghlThrows) return Promise.reject(new Error("ghl down"));
    return Promise.resolve({ conversations });
  },
}));

import { sendPushForActivity, type PushActivity } from "./push";
import type { Env } from "./env";

let supabaseUp = true;
let subscriptions: Record<string, unknown>[] = [];
let tenantRow: Record<string, unknown> | null = null;
let pushedTo: string[] = [];
let deletedSubIds: number[] = [];
let pushStatus = 201;
let sentPayloads: { title: string; body: string; url: string }[] = [];
let conversations: Record<string, unknown>[] = [];
let ghlThrows = false;

const env = {
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
} as unknown as Env;

const activity: PushActivity = {
  kind: "lead_created",
  summary: "Jane Doe wants a quote",
  opportunity_id: "opp_1",
  contact_id: null,
  assigned_user_id: null,
};

function subscriptionTable() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, value: unknown) => {
      if (col === "id") {
        deletedSubIds.push(value as number);
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: subscriptions, error: null });
    },
    delete: () => q,
  };
  return q;
}

function tenantTable() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    maybeSingle: () => Promise.resolve({ data: tenantRow, error: null }),
  };
  return q;
}

function fakeClient() {
  return {
    from(table: string) {
      if (table === "push_subscriptions") return subscriptionTable();
      if (table === "tenants") return tenantTable();
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function sub(id: number, ghlUserId: string | null = null) {
  return {
    id,
    endpoint: `https://push.example/${id}`,
    p256dh: "p",
    auth: "a",
    ghl_user_id: ghlUserId,
  };
}

beforeEach(() => {
  supabaseUp = true;
  subscriptions = [sub(1)];
  tenantRow = {
    notify_audience: "everyone",
    notify_push_enabled: true,
    ghl_token: "tok",
    ghl_location_id: "loc1",
  };
  pushedTo = [];
  deletedSubIds = [];
  pushStatus = 201;
  sentPayloads = [];
  conversations = [];
  ghlThrows = false;
  globalThis.fetch = vi.fn((url: unknown) => {
    pushedTo.push(String(url));
    return Promise.resolve({ status: pushStatus } as Response);
  }) as unknown as typeof fetch;
});

describe("sendPushForActivity", () => {
  it("buzzes every subscribed device when push is on", async () => {
    subscriptions = [sub(1), sub(2)];
    await sendPushForActivity(env, "t1", activity);
    expect(pushedTo).toEqual([
      "https://push.example/1",
      "https://push.example/2",
    ]);
  });

  // The owner's master switch in Settings. Before this was enforced the switch
  // saved and reloaded correctly but every push still went out.
  it("sends nothing when the owner has switched push off", async () => {
    tenantRow = { notify_audience: "everyone", notify_push_enabled: false };
    await sendPushForActivity(env, "t1", activity);
    expect(pushedTo).toEqual([]);
  });

  it("still sends when the switch has never been set", async () => {
    tenantRow = { notify_audience: "everyone" };
    await sendPushForActivity(env, "t1", activity);
    expect(pushedTo).toHaveLength(1);
  });

  // A missing tenant row must not silence a lead alert.
  it("still sends when the tenant row cannot be read", async () => {
    tenantRow = null;
    await sendPushForActivity(env, "t1", activity);
    expect(pushedTo).toHaveLength(1);
  });

  it("routes to the assigned rep only when the owner picked 'assigned'", async () => {
    subscriptions = [sub(1, "user_a"), sub(2, "user_b")];
    tenantRow = { notify_audience: "assigned", notify_push_enabled: true };
    await sendPushForActivity(env, "t1", { ...activity, assigned_user_id: "user_b" });
    expect(pushedTo).toEqual(["https://push.example/2"]);
  });

  it("falls back to everyone when no device matches the assignee", async () => {
    subscriptions = [sub(1, "user_a"), sub(2, "user_b")];
    tenantRow = { notify_audience: "assigned", notify_push_enabled: true };
    await sendPushForActivity(env, "t1", { ...activity, assigned_user_id: "user_z" });
    expect(pushedTo).toHaveLength(2);
  });

  it("prunes a dead subscription", async () => {
    pushStatus = 410;
    await sendPushForActivity(env, "t1", activity);
    expect(deletedSubIds).toEqual([1]);
  });

  it("is inert without VAPID keys", async () => {
    await sendPushForActivity({} as Env, "t1", activity);
    expect(pushedTo).toEqual([]);
  });

  it("is inert without Supabase", async () => {
    supabaseUp = false;
    await sendPushForActivity(env, "t1", activity);
    expect(pushedTo).toEqual([]);
  });
});

// The InboundMessage webhook carries only type, contactId and locationId, so
// the sender and their words are looked up. Without this the owner reads
// "New message" and has to open the app to learn whether it mattered.
describe("inbound message notifications", () => {
  const message = {
    kind: "message_in",
    summary: "Inbound message",
    opportunity_id: null,
    contact_id: "c1",
    assigned_user_id: null,
  } as PushActivity;

  it("says who wrote and what they said", async () => {
    conversations = [
      {
        contactId: "c1",
        fullName: "Donna Hoffmann",
        lastMessageBody: "Can you come Tuesday?",
        lastMessageDirection: "inbound",
      },
    ];
    await sendPushForActivity(env, "t1", message);
    expect(sentPayloads[0].title).toBe("New message");
    expect(sentPayloads[0].body).toBe("Donna Hoffmann: Can you come Tuesday?");
  });

  // An instant auto-reply overtakes the lead's text on the thread. Quoting our
  // own automation back at the owner is worse than saying nothing.
  it("gives the name only when an auto-reply has overtaken the thread", async () => {
    conversations = [
      {
        contactId: "c1",
        fullName: "Donna Hoffmann",
        lastMessageBody: "It's the team at Willis Windows!",
        lastMessageDirection: "outbound",
      },
    ];
    await sendPushForActivity(env, "t1", message);
    expect(sentPayloads[0].body).toBe("Donna Hoffmann");
  });

  it("falls back to the bare summary when GHL is unreachable", async () => {
    ghlThrows = true;
    await sendPushForActivity(env, "t1", message);
    expect(pushedTo).toHaveLength(1);
    expect(sentPayloads[0].body).toBe("Inbound message");
  });

  it("still notifies when the contact has no conversation", async () => {
    conversations = [];
    await sendPushForActivity(env, "t1", message);
    expect(sentPayloads[0].body).toBe("Inbound message");
  });

  it("picks the conversation belonging to this contact", async () => {
    conversations = [
      { contactId: "other", fullName: "Someone Else", lastMessageBody: "nope", lastMessageDirection: "inbound" },
      { contactId: "c1", fullName: "Donna Hoffmann", lastMessageBody: "yes", lastMessageDirection: "inbound" },
    ];
    await sendPushForActivity(env, "t1", message);
    expect(sentPayloads[0].body).toBe("Donna Hoffmann: yes");
  });

  it("truncates a long message rather than filling the lock screen", async () => {
    conversations = [
      { contactId: "c1", lastMessageBody: "x".repeat(300), lastMessageDirection: "inbound" },
    ];
    await sendPushForActivity(env, "t1", message);
    expect(sentPayloads[0].body).toHaveLength(140);
    expect(sentPayloads[0].body.endsWith("...")).toBe(true);
  });

  it("does not spend a GHL call on a new lead", async () => {
    conversations = [
      { contactId: "c1", fullName: "Donna", lastMessageBody: "hi", lastMessageDirection: "inbound" },
    ];
    await sendPushForActivity(env, "t1", activity);
    expect(sentPayloads[0].body).toBe("Jane Doe wants a quote");
  });

  it("deep-links to the conversation when there is no opportunity", async () => {
    await sendPushForActivity(env, "t1", message);
    expect(sentPayloads[0].url).toBe("/conversations/c1");
  });
});
