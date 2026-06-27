// The Lead Tracker tab from the sheet: every lead, with an editable Status
// dropdown and Value field (the daily job). Status and Value changes bubble up
// so the parent can recompute the funnel live. Attribution (which ad the lead
// came from) is shown but not editable.

import { LEAD_STATUSES, type AdsLead, type LeadStatus } from "../../lib/adsTracker";

const TH =
  "border-y border-divider px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.01em] text-faint";
const TD = "px-4 py-3 text-[13.5px] text-text align-top";

// A status colour cue so the table is scannable: sales green, lost muted,
// in-progress brand, untouched faint.
function statusClass(status: LeadStatus): string {
  if (status === "Sold") return "text-positive";
  if (status === "Lost") return "text-faint line-through";
  if (status === "New Lead" || status === "No Contact") return "text-muted";
  return "text-brand-text";
}

export default function LeadTrackerTable({
  leads,
  onStatusChange,
  onValueChange,
}: {
  leads: AdsLead[];
  onStatusChange: (index: number, status: LeadStatus) => void;
  onValueChange: (index: number, value: number | null) => void;
}) {
  return (
    <section className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Date</th>
            <th className={TH}>Name</th>
            <th className={TH}>Lead Information</th>
            <th className={TH}>Status</th>
            <th className={TH}>Value</th>
            <th className={TH}>Notes</th>
            <th className={TH}>Ad</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => (
            <tr key={i} className="border-b border-divider last:border-0 hover:bg-surface-2">
              <td className={TD + " whitespace-nowrap tabular-nums text-muted"}>{lead.date}</td>
              <td className={TD}>
                <div className="font-medium">{lead.name}</div>
                <div className="text-[12px] text-faint">{lead.number}</div>
              </td>
              <td className={TD + " max-w-[220px] text-muted"}>{lead.info || "--"}</td>
              <td className={TD}>
                <select
                  value={lead.status}
                  onChange={(e) => onStatusChange(i, e.target.value as LeadStatus)}
                  className={
                    "rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[13px] font-semibold outline-none transition-colors focus:border-brand " +
                    statusClass(lead.status)
                  }
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s} className="text-text">
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td className={TD}>
                <div className="flex items-center gap-1">
                  <span className="text-faint">£</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={lead.value ?? ""}
                    placeholder="--"
                    onChange={(e) =>
                      onValueChange(i, e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="w-[88px] rounded-[8px] border border-border bg-surface px-2 py-1.5 text-[13px] tabular-nums outline-none transition-colors focus:border-brand"
                  />
                </div>
              </td>
              <td className={TD + " max-w-[180px] text-muted"}>{lead.notes || "--"}</td>
              <td className={TD + " text-[12.5px] text-muted"}>{lead.adName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
