// In-memory mutable store for the demo client view. Seeded once from buildDemoData
// and mutated by handler.ts as the user clicks around, so actions (move a lead,
// mark won, send a message, complete a task) stick until the tab closes. Nothing
// here persists: a reload re-seeds from scratch.

import type {
  ApiLead,
  ApiMessage,
  ApiSummary,
  ApiNote,
  ApiTask,
  ApiRecurrence,
  PipelineSummary,
} from "../lib/api";
import { buildDemoData, type DemoData } from "./data";

let data: DemoData | null = null;

export function getStore(): DemoData {
  if (!data) data = buildDemoData();
  return data;
}

// Test-only: drop the seeded data so each case starts clean.
export function __resetStore(): void {
  data = null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

// Cross-pipeline counts for the Home dashboard, recomputed from current leads
// and conversations so KPIs reflect any mutations made during the session.
export function summary(): ApiSummary {
  const d = getStore();
  const pipelines: PipelineSummary[] = d.pipelines.map((p) => {
    const inPipeline = d.leads.filter((l) => l.pipelineId === p.id);
    return {
      id: p.id,
      name: p.name,
      total: inPipeline.length,
      open: inPipeline.filter((l) => l.status === "open").length,
    };
  });
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const newToday = d.leads.filter(
    (l) => new Date(l.createdAt).getTime() >= startOfDay.getTime(),
  ).length;
  const unreadConversations = d.conversations.reduce(
    (n, c) => n + (c.unreadCount > 0 ? 1 : 0),
    0,
  );
  return { pipelines, newToday, unreadConversations };
}

export function patchLead(
  leadId: string,
  patch: Partial<Pick<ApiLead, "status" | "pipelineStageId" | "value">> & {
    notes?: string | null;
  },
): ApiLead | null {
  const d = getStore();
  const lead = d.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  if (patch.status !== undefined) lead.status = patch.status;
  if (patch.pipelineStageId !== undefined)
    lead.pipelineStageId = patch.pipelineStageId;
  if (patch.value !== undefined) lead.value = patch.value;
  lead.lastActivityAt = nowIso();
  return lead;
}

export function addMessage(
  contactId: string,
  body: string,
  channel = "SMS",
): ApiMessage {
  const d = getStore();
  const msg: ApiMessage = {
    id: newId("demo-msg"),
    body,
    direction: "outbound",
    type: channel,
    at: nowIso(),
  };
  (d.messages[contactId] ??= []).push(msg);
  const conv = d.conversations.find((c) => c.contactId === contactId);
  if (conv) {
    conv.preview = body;
    conv.lastMessageType = channel;
    conv.lastMessageAt = msg.at;
    conv.unreadCount = 0;
  }
  return msg;
}

export function markConversationRead(contactId: string): void {
  const d = getStore();
  const conv = d.conversations.find((c) => c.contactId === contactId);
  if (conv) conv.unreadCount = 0;
}

export function markNotificationsRead(input: { id: number } | { all: true }): number {
  const d = getStore();
  const now = nowIso();
  for (const n of d.notifications) {
    if ("all" in input || n.id === input.id) n.read_at ??= now;
  }
  return d.notifications.filter((n) => !n.read_at).length;
}

export function addNote(contactId: string, body: string): ApiNote {
  const d = getStore();
  const note: ApiNote = { id: newId("demo-note"), body, dateAdded: nowIso() };
  (d.notes[contactId] ??= []).unshift(note);
  return note;
}

export function updateNote(
  contactId: string,
  noteId: string,
  body: string,
): ApiNote | null {
  const d = getStore();
  const note = d.notes[contactId]?.find((n) => n.id === noteId);
  if (!note) return null;
  note.body = body;
  return note;
}

export function deleteNote(contactId: string, noteId: string): void {
  const d = getStore();
  if (d.notes[contactId]) {
    d.notes[contactId] = d.notes[contactId].filter((n) => n.id !== noteId);
  }
}

export function addTask(
  contactId: string,
  title: string,
  dueDate?: string,
): ApiTask {
  const d = getStore();
  const task: ApiTask = { id: newId("demo-task"), title, dueDate, completed: false };
  (d.tasks[contactId] ??= []).push(task);
  return task;
}

export function updateTask(
  contactId: string,
  taskId: string,
  patch: Partial<Pick<ApiTask, "title" | "dueDate" | "completed">>,
): ApiTask | null {
  const d = getStore();
  const task = d.tasks[contactId]?.find((t) => t.id === taskId);
  if (!task) return null;
  if (patch.title !== undefined) task.title = patch.title;
  if (patch.dueDate !== undefined) task.dueDate = patch.dueDate;
  if (patch.completed !== undefined) task.completed = patch.completed;
  return task;
}

export function deleteTask(contactId: string, taskId: string): void {
  const d = getStore();
  if (d.tasks[contactId]) {
    d.tasks[contactId] = d.tasks[contactId].filter((t) => t.id !== taskId);
  }
}

// Recurring schedule upsert/delete, mirroring the real /api/recurrence
// Function (Task 4) so the demo tab persists schedule edits for the tab's
// lifetime.
export function upsertRecurrence(r: ApiRecurrence): ApiRecurrence {
  const store = getStore();
  const i = store.recurrences.findIndex((x) => x.contactId === r.contactId);
  if (i >= 0) store.recurrences[i] = r;
  else store.recurrences.push(r);
  return r;
}

export function deleteRecurrence(contactId: string): void {
  const store = getStore();
  store.recurrences = store.recurrences.filter((x) => x.contactId !== contactId);
}

// New lead from the "Add lead" sheet: lands in the first stage of the first
// pipeline with a matching contact so it shows up everywhere immediately.
export function createLead(input: {
  name: string;
  phone?: string;
  email?: string;
}): ApiLead {
  const d = getStore();
  const id = newId("demo-lead");
  const contactId = newId("demo-contact");
  const now = nowIso();
  const pipeline = d.pipelines[0];
  const lead: ApiLead = {
    id,
    name: input.name,
    phone: input.phone ?? "",
    email: input.email ?? "",
    contactId,
    pipelineId: pipeline.id,
    pipelineStageId: pipeline.stages[0].id,
    status: "open",
    value: null,
    createdAt: now,
    lastActivityAt: now,
    assignedUserId: null,
    attribution: null,
    tags: [],
  };
  d.leads.unshift(lead);
  d.contacts.unshift({
    id: contactId,
    name: input.name,
    phone: input.phone ?? "",
    email: input.email ?? "",
    source: "Manual",
    tags: [],
    createdAt: now,
    lastActivityAt: now,
  });
  return lead;
}
