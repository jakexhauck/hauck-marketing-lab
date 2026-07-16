import type { DemoRoute } from "./index";
import { DEMO_COMPLETED_STAGE_ID } from "../data";

// Demo close-out. Each route matches its own exact path, never a prefix, so the
// count endpoint can never swallow the prefill one.
//
// The count is DERIVED from the store's leads rather than a hardcoded id list:
// the badge must land on the same cards the board is showing in Job Completed,
// and a fixed list drifts the moment the demo data changes (it already put a
// red "Needs close-out" badge on a New Lead).
export const routes: DemoRoute[] = [
  {
    match: (clean) => clean === "/api/sales/close-outs/count",
    respond: ({ store }) => {
      const ids = store.leads
        .filter((l) => l.pipelineStageId === DEMO_COMPLETED_STAGE_ID)
        .map((l) => l.id);
      return { count: ids.length, opportunityIds: ids };
    },
  },
  {
    match: (clean, seg) =>
      seg.length === 4 && clean.startsWith("/api/sales/close-outs/") && seg[3] !== "count",
    respond: ({ seg, store }) => {
      const lead = store.leads.find((l) => l.id === seg[3]);
      return {
        opportunityId: seg[3],
        contactId: lead?.contactId ?? "demo-contact-1",
        name: lead?.name ?? "Unknown",
        phone: lead?.phone ?? "",
        email: lead?.email ?? "",
        valueCents: Math.round((lead?.value ?? 0) * 100),
        existingCustomer: null,
        alreadyClosedOut: false,
      };
    },
  },
  {
    match: (clean) => clean === "/api/sales/close-outs",
    respond: ({ body }) => ({ ok: true, contactId: String(body.opportunityId ?? "") }),
  },
];
