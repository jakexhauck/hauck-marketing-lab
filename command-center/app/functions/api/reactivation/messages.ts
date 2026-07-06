import type { Env, ApiData } from "../../lib/env";
import { fetchAllConversations, fetchAllContacts } from "../../lib/ghl";
import { classifyOrigin, normalizeChannel } from "../../lib/origin";

// GET /api/reactivation/messages: the recent SMS + email exchanged with
// reactivation customers (their latest touch each), scoped to
// reactivation-origin contacts. Read-only reporting for the client-facing
// Reactivation > Messages tab: no sending, no automations. Reuses the same
// conversation + contact fetch and origin classification as the Unified Inbox
// (functions/api/conversations/index.ts), then keeps only the reactivation
// origin and the two channels the win-back campaign uses (SMS + email).

export interface ReactivationMessage {
  id: string;
  contactId: string;
  name: string;
  channel: "sms" | "email";
  preview: string;
  at: string;
}

export interface ReactivationMessagesData {
  messages: ReactivationMessage[];
  configError?: string;
}

// GHL folds opportunity/activity system rows into the conversation feed; those
// carry no customer-facing body, so drop them (same guard as the inbox).
function isSystemActivity(t?: string | number): boolean {
  if (typeof t !== "string" || !t) return false;
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  const [all, contacts] = await Promise.all([
    fetchAllConversations(gctx),
    fetchAllContacts(gctx),
  ]);

  const byContact = new Map(contacts.map((c) => [c.id, c]));

  const messages: ReactivationMessage[] = [];
  for (const c of all) {
    if (!c.contactId) continue;
    const contact = byContact.get(c.contactId);
    // Only reactivation-origin customers.
    if (classifyOrigin(contact?.source, contact?.tags) !== "react") continue;

    const lastType = typeof c.lastMessageType === "string" ? c.lastMessageType : "";
    const channel = normalizeChannel(lastType);
    // The win-back campaign only reaches out over SMS + email.
    if (channel !== "sms" && channel !== "email") continue;

    const preview = isSystemActivity(c.lastMessageType) ? "" : (c.lastMessageBody ?? "");
    if (!preview.trim()) continue;

    const atMs =
      typeof c.lastMessageDate === "number"
        ? c.lastMessageDate
        : c.lastMessageDate
          ? +new Date(c.lastMessageDate)
          : NaN;
    const name = c.fullName || c.contactName || c.email || c.phone || "Customer";

    messages.push({
      id: c.id,
      contactId: c.contactId,
      name,
      channel,
      preview,
      at: Number.isFinite(atMs) ? new Date(atMs).toISOString() : new Date().toISOString(),
    });
  }

  messages.sort((a, b) => b.at.localeCompare(a.at));

  return Response.json({ messages } satisfies ReactivationMessagesData);
};
