import { Check, Clock } from "lucide-react";
import { Panel, Badge, EmptyState } from "../ui";
import { formatMoney, isoToLocalDate } from "../../lib/jobsPipeline";
import type { CustomerWithSchedule } from "../../lib/customers";

// Presentational job history for the selected customer: a reverse-chronological
// list (data arrives newest-first) of completed work, each row showing the
// service, its date, a paid / unpaid badge and the amount in the ledger gold.
// Mirrors the "Job history" card in the Variant C master-detail mockup.

function shortDate(iso: string): string {
  return isoToLocalDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CustomerJobHistory({
  customer,
}: {
  customer: CustomerWithSchedule;
}) {
  const jobs = customer.jobs;
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-divider px-4 py-3.5">
        <Clock size={16} className="text-brand-text" aria-hidden />
        <span className="font-display text-[14.5px] font-semibold text-text">
          Job history
        </span>
        <span className="ml-auto text-[12px] text-faint">
          {customer.jobCount} total
        </span>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Completed jobs for this customer will show up here."
        />
      ) : (
        <div className="py-1.5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3.5 border-b border-divider px-4 py-3 last:border-b-0"
            >
              <div
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-positive-tint text-positive"
                aria-hidden
              >
                <Check size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-text">
                  {job.service}
                </div>
                <div className="mt-px text-[11.5px] text-faint">
                  {shortDate(job.date)}
                </div>
              </div>
              <Badge tone={job.paid ? "positive" : "warning"}>
                {job.paid ? "Paid" : "Unpaid"}
              </Badge>
              <div className="font-data text-[13px] font-semibold text-ledger tabular-nums">
                {formatMoney(job.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
