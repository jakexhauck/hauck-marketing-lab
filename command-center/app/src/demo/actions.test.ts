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
  const jobSnapshot = DEMO_JOBS.map((j) => ({ id: j.id, status: j.status }));
  const leadSnapshot = DEMO_LEADS.map((l) => ({ id: l.id, status: l.status }));

  afterEach(() => {
    for (const s of jobSnapshot) {
      const j = DEMO_JOBS.find((x) => x.id === s.id);
      if (j) j.status = s.status;
    }
    for (const s of leadSnapshot) {
      const l = DEMO_LEADS.find((x) => x.id === s.id);
      if (l) l.status = s.status;
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
});
