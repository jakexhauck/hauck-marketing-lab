import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import Shell from "../components/Shell";
import TopBar from "../components/TopBar";
import LeadRow from "../components/LeadRow";
import EmptyState from "../components/EmptyState";
import TodayQueueSection from "../components/TodayQueueSection";
import { useLeads } from "../context/LeadsContext";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { permissionsFor } from "../lib/rolePermissions";
import type { Lead } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Today() {
  const navigate = useNavigate();
  const { leads: allLeads } = useLeads();
  const { currentUser } = useAuth();
  const { client } = useClient();

  const permissions = currentUser
    ? permissionsFor(currentUser.role)
    : permissionsFor("owner");

  const isRep = currentUser?.role === "rep";

  const scopedLeads = useMemo(() => {
    if (permissions.assignedOnly && currentUser) {
      return allLeads.filter((l) => l.assignedUserId === currentUser.id);
    }
    return allLeads;
  }, [allLeads, permissions.assignedOnly, currentUser]);

  const now = Date.now();

  const newLeads = useMemo(() => {
    return [...scopedLeads]
      .filter((l) => l.stage === "new")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [scopedLeads]);

  const followUpLeads = useMemo(() => {
    const stages: Lead["stage"][] = [
      "contacted",
      "estimate-sent",
      "consultation",
    ];
    return [...scopedLeads]
      .filter(
        (l) =>
          stages.includes(l.stage) &&
          now - new Date(l.lastActivityAt).getTime() >= DAY_MS
      )
      .sort(
        (a, b) =>
          new Date(a.lastActivityAt).getTime() -
          new Date(b.lastActivityAt).getTime()
      );
  }, [scopedLeads, now]);

  const bookedToday = useMemo(() => {
    return [...scopedLeads]
      .filter((l) => {
        if (l.stage !== "booked") return false;
        const created = new Date(l.createdAt).getTime();
        const activity = new Date(l.lastActivityAt).getTime();
        return now - created <= DAY_MS || now - activity <= DAY_MS;
      })
      .sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime()
      );
  }, [scopedLeads, now]);

  const waitingCount = newLeads.length + followUpLeads.length;
  const firstName = currentUser?.name?.split(" ")[0] ?? "there";

  const onTap = (id: string) => navigate(`/lead/${id}`);

  return (
    <Shell>
      <TopBar />

      {!isRep && currentUser && (
        <div
          className="mx-5 mt-4 rounded-xl border px-4 py-3 text-xs"
          style={{
            background: "var(--brand-primary-tint)",
            borderColor: "var(--border)",
            color: "var(--brand-primary-dark)",
          }}
        >
          <span className="label-cap-strong block mb-1" style={{ color: "var(--brand-primary)" }}>
            Rep View Preview
          </span>
          Viewing the Today screen across all leads for {client.name}. Reps see
          only leads assigned to them.
        </div>
      )}

      <header className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <span className="label-cap-strong" style={{ color: "var(--brand-primary)" }}>
            Today
          </span>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[var(--text-muted)] transition-colors active:scale-[0.97] active:bg-[var(--surface-2)]"
            style={{ minHeight: "36px" }}
          >
            Pipeline
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="hero-num text-[64px] text-[var(--text)]">
            {waitingCount}
          </span>
          <div className="flex flex-col">
            <span className="font-display text-base font-bold text-[var(--text)]">
              {waitingCount === 1 ? "lead" : "leads"} waiting
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Hey {firstName}, here is what needs you now.
            </span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-5 pb-8">
        <TodayQueueSection
          icon={<Inbox size={14} aria-hidden="true" />}
          title="New Leads"
          count={newLeads.length}
        >
          {newLeads.length === 0 ? (
            <EmptyState message="No new leads in your queue. Nice work." />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {newLeads.map((lead, idx) => (
                <li key={lead.id}>
                  <LeadRow
                    lead={lead}
                    onTap={onTap}
                    isLast={idx === newLeads.length - 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </TodayQueueSection>

        <TodayQueueSection
          icon={<Clock size={14} aria-hidden="true" />}
          title="Follow Up"
          count={followUpLeads.length}
        >
          {followUpLeads.length === 0 ? (
            <EmptyState message="Nothing has gone cold in the last 24 hours." />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {followUpLeads.map((lead, idx) => (
                <li key={lead.id}>
                  <LeadRow
                    lead={lead}
                    onTap={onTap}
                    isLast={idx === followUpLeads.length - 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </TodayQueueSection>

        <TodayQueueSection
          icon={<CheckCircle2 size={14} aria-hidden="true" />}
          title="Booked Today"
          count={bookedToday.length}
        >
          {bookedToday.length === 0 ? (
            <EmptyState message="No bookings in the last 24 hours yet." />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {bookedToday.map((lead, idx) => (
                <li key={lead.id}>
                  <LeadRow
                    lead={lead}
                    onTap={onTap}
                    isLast={idx === bookedToday.length - 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </TodayQueueSection>
      </main>
    </Shell>
  );
}
