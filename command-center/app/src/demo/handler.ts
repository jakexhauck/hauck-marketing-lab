// Request router for the demo client view. api() hands every /api/* call here when
// demoMode() is on; we resolve it against the in-memory store instead of the
// network. Reads return store slices, writes mutate the store and return success,
// so the demo behaves like a live account. Unknown endpoints throw a 404 that
// react-query isolates to the one screen that asked.

import { ApiError } from "../lib/api";
import * as store from "./store";

function parseBody(init: RequestInit): Record<string, unknown> {
  if (!init.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function queryParam(path: string, key: string): string | null {
  const q = path.indexOf("?");
  if (q < 0) return null;
  return new URLSearchParams(path.slice(q)).get(key);
}

const MESSAGE_META = {
  truncated: false,
  defaultChannel: "SMS",
  availableChannels: ["SMS", "Email"],
};

export async function handleDemoRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const clean = path.split("?")[0];
  const seg = clean.split("/").filter(Boolean); // e.g. ["api","leads","123"]
  const body = parseBody(init);
  const d = store.getStore();

  const r = (v: unknown): T => v as T;

  // ----- Collections / top-level -----
  if (clean === "/api/tenant") return r({ tenant: d.tenant });
  if (clean === "/api/pipelines") return r({ pipelines: d.pipelines });
  if (clean === "/api/summary") return r(store.summary());
  if (clean === "/api/activity") return r({ activity: d.activity });
  if (clean === "/api/contacts")
    return r({ contacts: d.contacts, total: d.contacts.length });
  if (clean === "/api/conversations")
    return r({ conversations: d.conversations, total: d.conversations.length });
  if (clean === "/api/calendar/events")
    return r({ events: d.calendar, timezone: "America/New_York" });
  if (clean === "/api/payments/transactions")
    return r({ transactions: d.transactions, total: d.transactions.length });
  if (clean === "/api/entitlements") return r({ capabilities: [] });
  if (clean === "/api/staff") return r({ staff: [] });
  if (clean === "/api/team") return r({ team: [] });

  // ----- Notifications -----
  if (clean === "/api/notifications") {
    const unreadCount = d.notifications.filter((n) => !n.read_at).length;
    return r({ notifications: d.notifications, unreadCount });
  }
  if (clean === "/api/notifications/read" && method === "POST") {
    const unreadCount = store.markNotificationsRead(
      "all" in body ? { all: true } : { id: Number(body.id) },
    );
    return r({ ok: true, unreadCount });
  }

  // ----- Settings -----
  if (clean === "/api/settings/notifications") {
    if (method === "GET") return r({ audience: "all" });
    return r({ ok: true });
  }

  // ----- Leads -----
  if (clean === "/api/leads") {
    if (method === "POST") {
      const lead = store.createLead({
        name: String(body.name ?? "New Lead"),
        phone: body.phone ? String(body.phone) : undefined,
        email: body.email ? String(body.email) : undefined,
      });
      return r({ lead });
    }
    const pipelineId = queryParam(path, "pipelineId");
    const leads = pipelineId
      ? d.leads.filter((l) => l.pipelineId === pipelineId)
      : d.leads;
    return r({ leads, total: leads.length });
  }
  if (seg[0] === "api" && seg[1] === "leads" && seg[2]) {
    const leadId = seg[2];
    // /api/leads/:id/messages
    if (seg[3] === "messages") {
      const lead = d.leads.find((l) => l.id === leadId);
      const messages = lead ? (d.messages[lead.contactId] ?? []) : [];
      return r({ messages, unreadCount: 0, ...MESSAGE_META });
    }
    // /api/leads/:id/sms | /api/leads/:id/send
    if ((seg[3] === "sms" || seg[3] === "send") && method === "POST") {
      const lead = d.leads.find((l) => l.id === leadId);
      if (lead) {
        store.addMessage(
          lead.contactId,
          String(body.body ?? ""),
          seg[3] === "send" ? String(body.channel ?? "SMS") : "SMS",
        );
      }
      return r({ ok: true, messageId: "demo" });
    }
    // /api/leads/:id  (GET single, PATCH update)
    if (!seg[3]) {
      if (method === "PATCH") {
        const lead = store.patchLead(leadId, {
          status: body.status as ApiStatus,
          pipelineStageId: body.pipelineStageId as string | undefined,
          value: body.value as number | null | undefined,
        });
        if (!lead) throw new ApiError(404, "Lead not found", null);
        return r({ lead });
      }
      const lead = d.leads.find((l) => l.id === leadId);
      if (!lead) throw new ApiError(404, "Lead not found", null);
      return r({ lead });
    }
  }

  // ----- Conversations -----
  if (seg[0] === "api" && seg[1] === "conversations" && seg[2]) {
    const contactId = seg[2];
    if (seg[3] === "messages") {
      store.markConversationRead(contactId);
      return r({
        messages: d.messages[contactId] ?? [],
        unreadCount: 0,
        ...MESSAGE_META,
      });
    }
    if ((seg[3] === "sms" || seg[3] === "send") && method === "POST") {
      store.addMessage(
        contactId,
        String(body.body ?? ""),
        seg[3] === "send" ? String(body.channel ?? "SMS") : "SMS",
      );
      return r({ ok: true, messageId: "demo" });
    }
  }

  // ----- Contact notes -----
  if (seg[0] === "api" && seg[1] === "contacts" && seg[2] && seg[3] === "notes") {
    const contactId = seg[2];
    const noteId = seg[4];
    if (!noteId) {
      if (method === "POST")
        return r({ note: store.addNote(contactId, String(body.body ?? "")) });
      return r({ notes: d.notes[contactId] ?? [] });
    }
    if (method === "PUT")
      return r({ note: store.updateNote(contactId, noteId, String(body.body ?? "")) });
    if (method === "DELETE") {
      store.deleteNote(contactId, noteId);
      return r({ ok: true });
    }
  }

  // ----- Contact tasks -----
  if (seg[0] === "api" && seg[1] === "contacts" && seg[2] && seg[3] === "tasks") {
    const contactId = seg[2];
    const taskId = seg[4];
    if (!taskId) {
      if (method === "POST")
        return r({
          task: store.addTask(
            contactId,
            String(body.title ?? ""),
            body.dueDate ? String(body.dueDate) : undefined,
          ),
        });
      return r({ tasks: d.tasks[contactId] ?? [] });
    }
    if (seg[5] === "completed" && method === "PUT")
      return r({ task: store.updateTask(contactId, taskId, { completed: Boolean(body.completed) }) });
    if (method === "PUT")
      return r({
        task: store.updateTask(contactId, taskId, {
          title: String(body.title ?? ""),
          dueDate: body.dueDate ? String(body.dueDate) : undefined,
        }),
      });
    if (method === "DELETE") {
      store.deleteTask(contactId, taskId);
      return r({ ok: true });
    }
  }

  // ----- Invoices -----
  if (clean === "/api/invoices") {
    const statusFilter = queryParam(path, "status");
    const invoices =
      statusFilter && statusFilter !== "all"
        ? d.invoices.filter((i) => i.status === statusFilter)
        : d.invoices;
    return r({ invoices, total: invoices.length });
  }
  if (seg[0] === "api" && seg[1] === "invoices" && seg[2]) {
    const invoice = d.invoiceDetails[seg[2]];
    if (!invoice) throw new ApiError(404, "Invoice not found", null);
    return r({ invoice });
  }

  // ----- Comms (Phase 04): minimal stubs so the screen never crashes -----
  // Null config keeps useChatRealtime from building a Supabase socket (the demo
  // has no realtime backend); the existing `!config` guard bails cleanly.
  if (clean === "/api/chat/config") return r(null);
  if (clean === "/api/chat/roster") return r({ members: [] });
  if (clean === "/api/chat/roles") return r({ roles: [] });
  if (clean === "/api/chat/channels") return r({ channels: [] });
  if (clean === "/api/chat/presence/heartbeat") return r({ ok: true });
  if (seg[0] === "api" && seg[1] === "chat") return r({ ok: true });

  throw new ApiError(404, `Demo: unhandled ${method} ${clean}`, null);
}

type ApiStatus = "open" | "won" | "lost" | undefined;
