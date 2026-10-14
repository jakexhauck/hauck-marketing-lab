import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import Shell from "../components/Shell";
import TopBar from "../components/TopBar";
import LeadRow from "../components/LeadRow";
import EmptyState from "../components/EmptyState";
import TodayQueueSection from "../components/TodayQueueSection";
import TodayDesktop from "../components/today/TodayDesktop";
import { useLeads } from "../context/LeadsContext";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { useNow } from "../context/NowContext";
import { permissionsFor } from "../lib/rolePermissions";

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

  // Stable minute-resolution clock from NowContext, so the queue memos below do
  // not recompute on every unrelated render (Date.now() changed each render).
  const now = useNow();

  // Queues key on opportunity status plus the lead's position within its own
  // pipeline (no stage-name guessing): "new" means still in the first stage,
  // "follow up" means past it but gone quiet for a day or more.
  const newLeads = useMemo(() => {
    return [...scopedLeads]
      .filter((l) => l.status === "open" && l.stagePosition === 0)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [scopedLeads]);

  const followUpLeads = useMemo(() => {
    return [...scopedLeads]
      .filter(
        (l) =>
          l.status === "open" &&
          l.stagePosition > 0 &&
          now - new Date(l.lastActivityAt).getTime() >= DAY_MS
      )
      .sort(
        (a, b) =>
          new Date(a.lastActivityAt).getTime() -
          new Date(b.lastActivityAt).getTime()
      );
  }, [scopedLeads, now]);

  const wonToday = useMemo(() => {
    return [...scopedLeads]
      .filter((l) => {
        if (l.status !== "won") return false;
        const activity = new Date(l.lastActivityAt).getTime();
        return now - activity <= DAY_MS;
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
      {/* Phone layout (below lg). The desktop client app renders TodayDesktop
          instead; both share the same LeadsContext so there is no double work. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
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
          <span className="label-cap-strong block mb-1" style={{ color: "var(--brand-text)" }}>
            Rep View Preview
          </span>
          Viewing the Today screen across all leads for {client.name}. Reps see
          only leads assigned to them.
        </div>
      )}

      <header className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <span className="label-cap-strong" style={{ color: "var(--brand-text)" }}>
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
          title="Won Today"
          count={wonToday.length}
        >
          {wonToday.length === 0 ? (
            <EmptyState message="No wins in the last 24 hours yet." />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              {wonToday.map((lead, idx) => (
                <li key={lead.id}>
                  <LeadRow
                    lead={lead}
                    onTap={onTap}
                    isLast={idx === wonToday.length - 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </TodayQueueSection>
      </main>
      </div>

      {/* Desktop client app (lg+): the Atelier command deck. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <TodayDesktop />
      </div>
    </Shell>
  );
}
