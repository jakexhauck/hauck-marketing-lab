import { beforeEach, describe, expect, it } from "vitest";
import * as store from "./store";

beforeEach(() => store.__resetStore());

describe("demo store seed", () => {
  it("seeds coherent leads with matching contacts", () => {
    const d = store.getStore();
    expect(d.leads.length).toBeGreaterThan(0);
    const contactIds = new Set(d.contacts.map((c) => c.id));
    for (const lead of d.leads) {
      expect(contactIds.has(lead.contactId)).toBe(true);
    }
  });

  it("summary counts match the seeded leads", () => {
    const d = store.getStore();
    const s = store.summary();
    const total = s.pipelines.reduce((n, p) => n + p.total, 0);
    expect(total).toBe(d.leads.length);
    const open = s.pipelines.reduce((n, p) => n + p.open, 0);
    expect(open).toBe(d.leads.filter((l) => l.status === "open").length);
  });
});

describe("demo store mutations stick", () => {
  it("patchLead updates status and is reflected in summary", () => {
    const d = store.getStore();
    const openLead = d.leads.find((l) => l.status === "open");
    expect(openLead).toBeTruthy();
    const before = store.summary().pipelines.reduce((n, p) => n + p.open, 0);

    store.patchLead(openLead!.id, { status: "won", value: 9000 });

    expect(d.leads.find((l) => l.id === openLead!.id)!.status).toBe("won");
    const after = store.summary().pipelines.reduce((n, p) => n + p.open, 0);
    expect(after).toBe(before - 1);
  });

  it("markNotificationsRead drops the unread count to zero", () => {
    const d = store.getStore();
    expect(d.notifications.some((n) => !n.read_at)).toBe(true);
    const remaining = store.markNotificationsRead({ all: true });
    expect(remaining).toBe(0);
    expect(d.notifications.every((n) => n.read_at)).toBe(true);
  });

  it("addMessage appends to the thread and clears the conversation unread", () => {
    const d = store.getStore();
    const conv = d.conversations[0];
    const before = (d.messages[conv.contactId] ?? []).length;

    store.addMessage(conv.contactId, "Thanks, see you then!");

    expect(d.messages[conv.contactId].length).toBe(before + 1);
    expect(d.conversations[0].unreadCount).toBe(0);
    expect(d.conversations[0].preview).toBe("Thanks, see you then!");
  });

  it("createLead lands a new open lead with a matching contact", () => {
    const d = store.getStore();
    const lead = store.createLead({ name: "Test Person", phone: "(555) 111-2222" });
    expect(lead.status).toBe("open");
    expect(d.leads[0].id).toBe(lead.id);
    expect(d.contacts.some((c) => c.id === lead.contactId)).toBe(true);
  });
});
