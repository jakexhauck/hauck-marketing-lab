import type { DemoRoute } from "./index";
import { applyMoveLocally, stageKeyOf, type BoardLead, type BoardStage, type MoveRequest } from "../../lib/leadBoard";

// Demo Leads board: the Test v2 "Sales Pipeline" with a sample book of leads,
// held in memory for the tab. Moves apply the same local rules the live board
// uses optimistically, so the demo behaves like a real account. Times are
// relative to when the tab opened, so "overdue" and "today" always have
// something in them.

const STAGES: BoardStage[] = [
  { id: "demo-s-lead", name: "Lead", color: "#6E8EF5", key: "lead" },
  { id: "demo-s-est", name: "Estimate Booked", color: "#E8935A", key: "estimate" },
  { id: "demo-s-job", name: "Job Booked", color: "#F2B05E", key: "job" },
  { id: "demo-s-won", name: "Job Completed", color: "#4DBB83", key: "won" },
  { id: "demo-s-fu", name: "Follow Up", color: "#5BA4E6", key: "followUp" },
  { id: "demo-s-ltn", name: "Long Term Nurture", color: "#9AA3B2", key: "nurture" },
  { id: "demo-s-cxl", name: "Job/Estimate Cancelled", color: "#C77DDB", key: "cancelled" },
  { id: "demo-s-lost", name: "Lost", color: "#E5646E", key: "lost" },
  { id: "demo-s-trash", name: "Trash", color: "#7B8494", key: "trash" },
];

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const at = (dayOffset: number, h: number, m = 0) => {
  const t = new Date();
  t.setDate(t.getDate() + dayOffset);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
};

function seed(): BoardLead[] {
  const base = { contactId: null, value: null, bookings: [], followUp: null, lostReason: null, attempts: 0 };
  const L = (p: Partial<BoardLead> & Pick<BoardLead, "id" | "name" | "phone" | "createdAt" | "stageId">): BoardLead => ({
    ...base,
    ...p,
  });
  return [
    L({ id: "d1", name: "Marcus Bell", phone: "(313) 555-0142", createdAt: minsAgo(12), stageId: "demo-s-lead" }),
    L({ id: "d2", name: "Dana Ortiz", phone: "(734) 555-0187", createdAt: minsAgo(140), stageId: "demo-s-lead" }),
    L({ id: "d3", name: "Kevin Shaw", phone: "(248) 555-0119", createdAt: at(-1, 10), stageId: "demo-s-lead" }),
    L({ id: "d4", name: "Priya Nair", phone: "(313) 555-0163", createdAt: minsAgo(35), stageId: "demo-s-lead" }),
    L({ id: "d5", name: "Tom Becker", phone: "(734) 555-0101", createdAt: at(-2, 10), stageId: "demo-s-est", bookings: [{ kind: "estimate", at: at(-1, 11) }] }),
    L({ id: "d6", name: "Angela Ruiz", phone: "(586) 555-0177", createdAt: at(-3, 10), stageId: "demo-s-est", bookings: [{ kind: "estimate", at: at(0, 23, 30) }] }),
    L({ id: "d7", name: "Nina Walsh", phone: "(248) 555-0108", createdAt: at(-2, 15), stageId: "demo-s-est", bookings: [{ kind: "estimate", at: at(2, 15) }] }),
    L({ id: "d8", name: "Chris Dolan", phone: "(313) 555-0124", createdAt: at(-4, 10), stageId: "demo-s-job", bookings: [{ kind: "job", at: at(0, 9) }] }),
    L({ id: "d9", name: "Omar Haddad", phone: "(734) 555-0160", createdAt: at(-5, 9), stageId: "demo-s-job", bookings: [{ kind: "job", at: at(3, 9) }] }),
    L({ id: "d10", name: "Lena Fischer", phone: "(248) 555-0155", createdAt: at(-6, 10), stageId: "demo-s-won", value: 4200 }),
    L({ id: "d11", name: "Rob Wallace", phone: "(734) 555-0138", createdAt: at(-7, 10), stageId: "demo-s-won", value: 890 }),
    L({ id: "d12", name: "Sofia Greco", phone: "(313) 555-0199", createdAt: at(-5, 10), stageId: "demo-s-fu", attempts: 2, followUp: { at: at(-1, 14), note: "Wants spouse on the call" } }),
    L({ id: "d13", name: "Ben Carter", phone: "(734) 555-0129", createdAt: at(-3, 12), stageId: "demo-s-fu", followUp: { at: at(2, 10, 30), note: "" } }),
    L({ id: "d18", name: "Grace Kim", phone: "(248) 555-0133", createdAt: at(-4, 9), stageId: "demo-s-fu", attempts: 1, followUp: { at: at(0, 9, 30), note: "Call after 9, on night shift" } }),
    L({ id: "d19", name: "Derek Moss", phone: "(313) 555-0181", createdAt: at(-2, 16), stageId: "demo-s-fu", followUp: { at: at(0, 16), note: "Send photos of the opener first" } }),
    L({ id: "d20", name: "Paula Jensen", phone: "(586) 555-0190", createdAt: at(-6, 11), stageId: "demo-s-fu", attempts: 3, followUp: { at: at(1, 11), note: "" } }),
    L({ id: "d14", name: "Jamal Price", phone: "(586) 555-0112", createdAt: at(-12, 10), stageId: "demo-s-ltn" }),
    L({ id: "d21", name: "Irene Novak", phone: "(734) 555-0158", createdAt: at(-20, 10), stageId: "demo-s-ltn" }),
    L({ id: "d22", name: "Sam Okafor", phone: "(313) 555-0107", createdAt: at(-31, 10), stageId: "demo-s-ltn" }),
    L({ id: "d23", name: "Wes Turner", phone: "(248) 555-0196", createdAt: at(-45, 10), stageId: "demo-s-ltn" }),
    L({ id: "d15", name: "Heather Lyons", phone: "(248) 555-0171", createdAt: at(-9, 10), stageId: "demo-s-lost", lostReason: "price" }),
    L({ id: "d16", name: "Victor Mendes", phone: "(734) 555-0146", createdAt: at(-8, 10), stageId: "demo-s-cxl" }),
    L({ id: "d17", name: "Spam Test", phone: "(000) 555-0000", createdAt: at(-10, 10), stageId: "demo-s-trash" }),
  ];
}

let leads: BoardLead[] | null = null;
const book = () => (leads ??= seed());

function move(id: string, m: MoveRequest) {
  const key = stageKeyOf(STAGES, m.stageId);
  leads = book().map((l) => (l.id === id ? applyMoveLocally(l, key, m) : l));
}

export const routes: DemoRoute[] = [
  {
    match: (clean) => clean === "/api/pipeline-board",
    respond: () => ({ stages: STAGES, leads: book(), timezone: "America/Detroit" }),
  },
  {
    match: (clean, seg) => seg.length === 4 && clean.startsWith("/api/pipeline-board/") && seg[3] === "move",
    respond: ({ seg, body }) => {
      move(seg[2], { ...(body as unknown as MoveRequest), id: seg[2] });
      return { ok: true, reminderCopied: true };
    },
  },
  {
    match: (clean, seg) => seg.length === 4 && clean.startsWith("/api/pipeline-board/") && seg[3] === "no-answer",
    respond: ({ seg }) => {
      const lead = book().find((l) => l.id === seg[2]);
      const attempts = (lead?.attempts ?? 0) + 1;
      const followUpAt = at(1, 10);
      move(seg[2], { id: seg[2], stageId: "demo-s-fu", at: followUpAt, note: `No answer (${attempts})` });
      leads = book().map((l) => (l.id === seg[2] ? { ...l, attempts } : l));
      return { ok: true, attempts, followUpAt };
    },
  },
];
