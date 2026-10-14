import type { DemoRoute } from "./index";
import { DEMO_CUSTOMERS } from "../../lib/customers";

// Demo customer detail. Derived from DEMO_CUSTOMERS so the detail can never
// contradict the row that was clicked to reach it.
//
// The job history is synthesised from the customer's jobCount and totalCents:
// the list fixture only carries the totals, and inventing a separate job fixture
// would let the two drift (a customer showing "3 jobs · $9,100" whose detail
// lists two jobs worth $4,000).

function findCustomer(contactId: string) {
  for (const col of DEMO_CUSTOMERS.columns) {
    const hit = col.customers.find((c) => c.contactId === contactId);
    if (hit) return { customer: hit, recurring: col.recurring };
  }
  return null;
}

const WORK = ["Full house wash", "Gutter clean", "Window wash", "Screen repair", "Storm clean-up"];

export const routes: DemoRoute[] = [
  {
    match: (_clean, seg) => seg.length === 3 && seg[0] === "api" && seg[1] === "customers",
    respond: ({ seg }) => {
      const found = findCustomer(seg[2]);
      if (!found) throw new Error("Demo: unknown customer");
      const { customer, recurring } = found;

      // Split the real total across the real job count, remainder on the newest,
      // so the rows always sum to the total the list showed.
      const each = customer.jobCount > 0 ? Math.floor(customer.totalCents / customer.jobCount) : 0;
      // Walk BACK from the customer's own lastJobOn, three months a job. Anchoring
      // to the fixture means job 0 is exactly the date the list showed, and no
      // job can land in the future — which a completed job never can, and which
      // the close-out form rejects outright.
      const jobs = Array.from({ length: customer.jobCount }, (_, i) => {
        const when = customer.lastJobOn ? new Date(`${customer.lastJobOn}T00:00:00`) : new Date();
        when.setMonth(when.getMonth() - i * 3);
        const pad = (n: number) => String(n).padStart(2, "0");
        return {
          id: `${customer.contactId}-job-${i}`,
          description: WORK[i % WORK.length],
          valueCents: i === 0 ? customer.totalCents - each * (customer.jobCount - 1) : each,
          completedOn: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
          addedManually: false,
        };
      });

      return {
        contactId: customer.contactId,
        opportunityId: customer.opportunityId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        type: recurring ? "recurring" : "one-time",
        stageId: customer.stageId,
        stageName: customer.stageName,
        jobs,
        totalCents: customer.totalCents,
        nextServiceAt: customer.nextServiceAt,
        serviceState: customer.serviceState,
      };
    },
  },
  {
    match: (_clean, seg) =>
      seg[0] === "api" && seg[1] === "customers" && (seg[3] === "jobs" || seg[3] === "plan"),
    respond: () => ({ ok: true }),
  },
];
