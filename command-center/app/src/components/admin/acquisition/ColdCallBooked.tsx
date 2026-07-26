import { useMemo } from "react";
import type { AdminLead } from "../../../lib/api";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";

// Cold Call > Booked: the meetings he set.
//
// This is the page that settles the commission conversation, so it says what
// happened rather than what was claimed: upcoming meetings, then past ones. A
// meeting that has been and gone sits under "Already happened" until its lead is
// moved on to Qualified or Closed, which is the honest state of things until a
// showed / no-showed outcome exists to record.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fullName(lead: AdminLead): string {
  return `${lead.firstName} ${lead.lastName}`.trim() || "Unnamed prospect";
}

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// callerId "" means everyone; otherwise one person's booked meetings.
export default function ColdCallBooked({ callerId = "" }: { callerId?: string }) {
  const leadsQuery = useAdminLeadsQuery();
  const now = today();

  const { upcoming, past } = useMemo(() => {
    const booked = (leadsQuery.data?.leads ?? [])
      .filter((l) => (callerId ? l.assignedTo === callerId : true))
      .filter((l) => l.appointmentDate)
      .sort((a, b) => (a.appointmentDate ?? "").localeCompare(b.appointmentDate ?? ""));
    return {
      upcoming: booked.filter((l) => (l.appointmentDate ?? "") >= now),
      past: booked.filter((l) => (l.appointmentDate ?? "") < now).reverse(),
    };
  }, [leadsQuery.data, now, callerId]);

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading meetings...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load meetings. Reload to try again.</div>;
  }
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="pk-empty">
        No meetings booked yet. They land here when a call ends in &quot;Booked&quot;.
      </div>
    );
  }

  return (
    <div className="pk-list">
      {upcoming.length > 0 && <div className="pk-list-sec-h">Coming up</div>}
      {upcoming.map((lead) => (
        <BookedRow key={lead.id} lead={lead} />
      ))}
      {past.length > 0 && <div className="pk-list-sec-h">Already happened</div>}
      {past.map((lead) => (
        <BookedRow key={lead.id} lead={lead} />
      ))}
    </div>
  );
}

function BookedRow({ lead }: { lead: AdminLead }) {
  return (
    <div className="pk-li">
      <div className="pk-li-main">
        <div className="pk-li-label">{fullName(lead)}</div>
        <div className="pk-li-sub font-mono">{lead.phone || "No number"}</div>
      </div>
      <div className="pk-li-meta">
        <div style={{ textAlign: "right" }}>
          <div className="text-[13px] font-semibold">{dateLabel(lead.appointmentDate!)}</div>
          <div className="text-[12px] text-muted">{lead.status}</div>
        </div>
      </div>
    </div>
  );
}
