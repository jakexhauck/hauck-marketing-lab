import { afterEach, describe, expect, it } from "vitest";
import { handleDemoRequest } from "./handler";
import { DEMO_JOBS } from "../lib/jobsPipeline";
import { DEMO_LEADS } from "../lib/leadsHub";

// Demo cases for the wired write actions (src/demo/handlers/actions.ts). This
// lives OUTSIDE src/demo/handlers/ on purpose: that folder is glob-imported into
// the app bundle, so a *.test.ts there would ship vitest to the browser.
//
// The action routes mutate the shared demo arrays in place (that is how the demo
// reflects a write), so snapshot and restore the touched rows around each test.

describe("demo action routes", () => {
  const jobSnapshot = DEMO_JOBS.map((j) => ({ id: j.id, status: j.status, paid: j.paid }));
  const leadSnapshot = DEMO_LEADS.map((l) => ({
    id: l.id,
    status: l.status,
    value: l.value,
    stageName: l.stageName,
    outcome: l.outcome,
  }));

  afterEach(() => {
    for (const s of jobSnapshot) {
      const j = DEMO_JOBS.find((x) => x.id === s.id);
      if (j) {
        j.status = s.status;
        j.paid = s.paid;
      }
    }
    for (const s of leadSnapshot) {
      const l = DEMO_LEADS.find((x) => x.id === s.id);
      if (l) {
        l.status = s.status;
        l.value = s.value;
        l.stageName = s.stageName;
        l.outcome = s.outcome;
      }
    }
  });

  it("POST /api/sales/jobs/:id/complete flips a booked job to completed", async () => {
    const booked = DEMO_JOBS.find((j) => j.status === "booked")!;

    const res = await handleDemoRequest<{ ok: boolean; status: string }>(
      `/api/sales/jobs/${booked.id}/complete`,
      { method: "POST" },
    );
    expect(res.ok).toBe(true);
    expect(res.status).toBe("completed");

    // The next read of the jobs feed reflects the write (same array reference).
    const after = await handleDemoRequest<{ jobs: { id: string; status: string }[] }>(
      "/api/sales/jobs",
    );
    expect(after.jobs.find((j) => j.id === booked.id)?.status).toBe("completed");
  });

  it("POST /api/sales/leads/:id/stage with status lost parks the lead", async () => {
    const active = DEMO_LEADS.find((l) => l.status !== "cold")!;

    const res = await handleDemoRequest<{ ok: boolean }>(
      `/api/sales/leads/${active.id}/stage`,
      { method: "POST", body: JSON.stringify({ status: "lost" }) },
    );
    expect(res.ok).toBe(true);

    const after = await handleDemoRequest<{ leads: { id: string; status: string }[] }>(
      "/api/sales/leads",
    );
    expect(after.leads.find((l) => l.id === active.id)?.status).toBe("cold");
  });

  it("POST /api/sales/leads/:id/stage with status won records the amount + outcome", async () => {
    const active = DEMO_LEADS.find((l) => l.status !== "cold" && l.status !== "won")!;

    const res = await handleDemoRequest<{ ok: boolean }>(
      `/api/sales/leads/${active.id}/stage`,
      { method: "POST", body: JSON.stringify({ status: "won", monetaryValue: 750 }) },
    );
    expect(res.ok).toBe(true);

    const after = await handleDemoRequest<{
      leads: { id: string; outcome?: string; value?: number | null }[];
    }>("/api/sales/leads");
    const row = after.leads.find((l) => l.id === active.id);
    expect(row?.outcome).toBe("won");
    expect(row?.value).toBe(750);
  });

  it("POST /api/sales/leads/:id/stage with a stageName moves the lead", async () => {
    const active = DEMO_LEADS.find((l) => l.status !== "cold")!;

    const res = await handleDemoRequest<{ ok: boolean }>(
      `/api/sales/leads/${active.id}/stage`,
      { method: "POST", body: JSON.stringify({ stageName: "Contacted" }) },
    );
    expect(res.ok).toBe(true);

    const after = await handleDemoRequest<{
      leads: { id: string; stageName?: string }[];
    }>("/api/sales/leads");
    expect(after.leads.find((l) => l.id === active.id)?.stageName).toBe("Contacted");
  });

  it("GET /api/appointments/slots returns future days with slots", async () => {
    const res = await handleDemoRequest<{
      ok: boolean;
      days: { date: string; slots: string[] }[];
    }>("/api/appointments/slots?calendarName=Home%20Estimate");
    expect(res.ok).toBe(true);
    expect(res.days.length).toBeGreaterThan(0);
    expect(res.days[0].slots.length).toBeGreaterThan(0);
    // Offset ISO so the picker's wall-time label is timezone-stable.
    expect(res.days[0].slots[0]).toMatch(/T\d{2}:\d{2}:\d{2}-\d{2}:\d{2}$/);
  });

  it("POST /api/appointments succeeds with an id", async () => {
    const res = await handleDemoRequest<{ ok: boolean; id: string }>(
      "/api/appointments",
      {
        method: "POST",
        body: JSON.stringify({
          contactId: "c1",
          calendarName: "Home Estimate",
          startTime: "2026-07-08T12:00:00-04:00",
          endTime: "2026-07-08T12:20:00-04:00",
        }),
      },
    );
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();
  });

  it("PUT /api/appointments/:eventId reschedules", async () => {
    const res = await handleDemoRequest<{ ok: boolean }>(
      "/api/appointments/evt-1",
      {
        method: "PUT",
        body: JSON.stringify({
          startTime: "2026-07-09T14:00:00-04:00",
          endTime: "2026-07-09T15:00:00-04:00",
        }),
      },
    );
    expect(res.ok).toBe(true);
  });

  it("POST /api/sales/jobs/:id/payment flips a job to paid", async () => {
    const unpaid = DEMO_JOBS.find((j) => j.status === "completed" && !j.paid)
      ?? DEMO_JOBS[0];

    const res = await handleDemoRequest<{ ok: boolean; paid: boolean }>(
      `/api/sales/jobs/${unpaid.id}/payment`,
      { method: "POST", body: JSON.stringify({ contactId: "c1", amount: 500 }) },
    );
    expect(res.ok).toBe(true);
    expect(res.paid).toBe(true);

    const after = await handleDemoRequest<{ jobs: { id: string; paid: boolean }[] }>(
      "/api/sales/jobs",
    );
    expect(after.jobs.find((j) => j.id === unpaid.id)?.paid).toBe(true);
  });
});
