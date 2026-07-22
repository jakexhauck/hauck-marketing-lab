import type { DemoRoute } from "./index";
import { DEMO_JOBS } from "../../lib/jobsPipeline";
import { DEMO_LEADS } from "../../lib/leadsHub";

// Demo cases for the wired write actions on the Jobs + Leads surfaces. These
// endpoints are NOT matched inline in handler.ts, so they fall through to here.
// Each mutates its feature's own demo array in place, so the next read of
// /api/sales/jobs or /api/sales/leads (same array reference) reflects the write
// and the demo behaves like a live account without touching a real client.
//
// Only reads happen against the shared arrays elsewhere, so mutating an element
// here is safe. Kept in this feature file per the build's isolation contract;
// handler.ts and data.ts are never edited.

// POST /api/sales/jobs/:id/complete -> flip a booked demo job to completed.
const completeJob: DemoRoute = {
  match: (_clean, seg) =>
    seg[0] === "api" &&
    seg[1] === "sales" &&
    seg[2] === "jobs" &&
    seg[4] === "complete",
  respond: ({ seg, method }) => {
    if (method !== "POST") return { ok: false };
    const job = DEMO_JOBS.find((j) => j.id === seg[3]);
    if (job) job.status = "completed";
    return { ok: true, status: "completed" };
  },
};

// POST /api/sales/leads/:id/stage -> work a demo lead the way the Job Console
// does: move its stage, record the job amount, and/or land an outcome. A won
// lead carries its price + "won" outcome; a lost/abandoned lead parks (our
// "cold" status) and takes the raw outcome. Mutations mirror the live write so
// the demo feed reflects the change on the next read.
const moveLeadStage: DemoRoute = {
  match: (_clean, seg) =>
    seg[0] === "api" &&
    seg[1] === "sales" &&
    seg[2] === "leads" &&
    seg[4] === "stage",
  respond: ({ seg, method, body }) => {
    if (method !== "POST") return { ok: false };
    const lead = DEMO_LEADS.find((l) => l.id === seg[3]);
    if (lead) {
      if (typeof body.monetaryValue === "number") lead.value = body.monetaryValue;
      if (typeof body.stageName === "string" && body.stageName) {
        lead.stageName = body.stageName;
      }
      if (body.status === "won") {
        lead.outcome = "won";
        lead.status = "won";
      } else if (body.status === "lost" || body.status === "abandoned") {
        lead.outcome = body.status;
        lead.status = "cold";
      }
    }
    return { ok: true };
  },
};

// GET /api/appointments/slots -> a few future days of fake open times, so the
// booking picker is walkable in demo. Offset ISO strings (-04:00) so the picker's
// wall-time labels read correctly regardless of the viewer's timezone.
const appointmentSlots: DemoRoute = {
  match: (clean) => clean === "/api/appointments/slots",
  respond: () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const base = new Date();
    const days = [1, 2, 3].map((i) => {
      const d = new Date(base.getTime() + i * 86_400_000);
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const slots = [10, 12, 14, 16].map((h) => `${date}T${pad(h)}:00:00-04:00`);
      return { date, slots };
    });
    return { ok: true, timezone: "America/New_York", days };
  },
};

// POST /api/appointments -> pretend-book. The surface flips its own status
// optimistically, so this only needs to succeed.
const createAppointment: DemoRoute = {
  match: (clean) => clean === "/api/appointments",
  respond: ({ method }) =>
    method === "POST" ? { ok: true, id: "demo-appt" } : { ok: false },
};

// PUT /api/appointments/:eventId -> pretend-reschedule.
const rescheduleAppointment: DemoRoute = {
  match: (_clean, seg) =>
    seg[0] === "api" &&
    seg[1] === "appointments" &&
    seg.length === 3 &&
    seg[2] !== "slots",
  respond: ({ method }) => (method === "PUT" ? { ok: true } : { ok: false }),
};

// POST /api/sales/jobs/:id/payment -> flip a demo job to paid.
const recordPayment: DemoRoute = {
  match: (_clean, seg) =>
    seg[0] === "api" &&
    seg[1] === "sales" &&
    seg[2] === "jobs" &&
    seg[4] === "payment",
  respond: ({ seg, method }) => {
    if (method !== "POST") return { ok: false };
    const job = DEMO_JOBS.find((j) => j.id === seg[3]);
    if (job) job.paid = true;
    return { ok: true, paid: true };
  },
};

export const routes: DemoRoute[] = [
  completeJob,
  moveLeadStage,
  appointmentSlots,
  createAppointment,
  rescheduleAppointment,
  recordPayment,
];
