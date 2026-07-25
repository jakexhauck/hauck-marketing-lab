import { useMemo } from "react";
import { Phone } from "lucide-react";
import type { AdminLead } from "../../../lib/api";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";

// Cold Call > Callbacks: everyone who said "call me back on Thursday".
//
// Separate from the main queue on purpose. A callback buried in a cold list is a
// lost deal, and these are the warmest conversations he has. Overdue first,
// because a missed callback is worse than an unmade cold call.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fullName(lead: AdminLead): string {
  return `${lead.firstName} ${lead.lastName}`.trim() || "Unnamed prospect";
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// "Overdue", "Today", "Tomorrow", then the date. Relative wording only where it
// is unambiguous; past three days out, a date is clearer than "in 4 days".
function whenLabel(date: string, now: string): { text: string; tone: "late" | "now" | "soon" } {
  if (date < now) return { text: "Overdue", tone: "late" };
  if (date === now) return { text: "Today", tone: "now" };
  const d = new Date(`${date}T00:00:00`);
  const n = new Date(`${now}T00:00:00`);
  const days = Math.round((d.getTime() - n.getTime()) / 86_400_000);
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  return {
    text: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    tone: "soon",
  };
}

export default function ColdCallCallbacks() {
  const leadsQuery = useAdminLeadsQuery();
  const now = today();

  const due = useMemo(() => {
    const leads = leadsQuery.data?.leads ?? [];
    return leads
      .filter((l) => l.followUpDate && l.status !== "Dead" && l.status !== "Closed")
      .sort((a, b) => (a.followUpDate ?? "").localeCompare(b.followUpDate ?? ""));
  }, [leadsQuery.data]);

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading callbacks...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load callbacks. Reload to try again.</div>;
  }
  if (due.length === 0) {
    return (
      <div className="pk-empty">
        No callbacks booked. They appear here when a call ends in &quot;Callback&quot;.
      </div>
    );
  }

  return (
    <div className="pk-list">
      {due.map((lead) => {
        const when = whenLabel(lead.followUpDate!, now);
        return (
          <div key={lead.id} className="pk-li">
            <div className="pk-li-main">
              <div className="pk-li-label">{fullName(lead)}</div>
              <div className="pk-li-sub font-mono">{lead.phone || "No number"}</div>
            </div>
            <div className="pk-li-meta">
              <span
                className="rounded-full px-3 py-1 text-[12px] font-semibold"
                style={{
                  background:
                    when.tone === "late"
                      ? "color-mix(in srgb, var(--danger) 14%, transparent)"
                      : when.tone === "now"
                        ? "var(--brand-tint)"
                        : "var(--surface-2)",
                  color:
                    when.tone === "late"
                      ? "var(--danger)"
                      : when.tone === "now"
                        ? "var(--brand-text)"
                        : "var(--text-muted)",
                }}
              >
                {when.text}
              </span>
              <a href={telHref(lead.phone)} className="pk-link">
                <Phone aria-hidden />
                Call
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
