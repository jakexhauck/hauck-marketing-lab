import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Inbox,
  Phone,
} from "lucide-react";
import { Button } from "../ui/Button";
import DesktopPage from "../desktop/DesktopPage";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import StagePill from "../StagePill";
import { useLeads } from "../../context/LeadsContext";
import { useAuth } from "../../context/AuthContext";
import { useClient } from "../../context/ClientContext";
import { useNow } from "../../context/NowContext";
import { usePipelines } from "../../context/PipelinesContext";
import { permissionsFor } from "../../lib/rolePermissions";
import { timeAgo } from "../../lib/timeAgo";
import type { Lead } from "../../types";

// The Atelier desktop Today view (lg+): the rep-focused daily queue restyled
// into the command deck. The phone keeps its own (NavyHero-less) stacked layout
// below lg; this file renders only inside `hidden lg:flex` from Today.tsx. It
// shares the same LeadsContext data and handlers, so behavior is identical.

const DAY_MS = 24 * 60 * 60 * 1000;

// One KPI tile. Calm surface, generous padding, mono label, tabular value.
function Kpi({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]"
      role="group"
      aria-label={label}
    >
      <div className="flex items-center justify-between">
        <span className="label-cap truncate">{label}</span>
        <span className="text-faint" aria-hidden>
          {icon}
        </span>
      </div>
      <div className="stat-num text-[2rem]">{value}</div>
      <div className="text-[12.5px] font-medium text-muted">{sub}</div>
    </div>
  );
}

// A single lead line within a queue section. Reuses Avatar + StagePill + timeAgo
// and preserves the two real row actions from the phone's LeadRow: open the lead
// (whole-row click / Enter) and advance it to the next stage (moveStage), plus a
// call affordance when a phone number exists.
function LeadLine({
  lead,
  now,
  isLast,
  onTap,
}: {
  lead: Lead;
  now: number;
  isLast: boolean;
  onTap: (id: string) => void;
}) {
  const { pipelines } = usePipelines();
  const { moveStage } = useLeads();

  const pipeline = pipelines.find((p) => p.id === lead.pipelineId);
  const nextStage =
    lead.status === "open" && pipeline && lead.stagePosition >= 0
      ? (pipeline.stages[lead.stagePosition + 1] ?? null)
      : null;

  const telDigits = lead.phone ? lead.phone.replace(/[^0-9+]/g, "") : "";
  const hasPhone = telDigits.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTap(lead.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap(lead.id);
        }
      }}
      className={
        "group flex w-full cursor-pointer items-center gap-4 px-6 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40" +
        (isLast ? "" : " border-b border-divider")
      }
    >
      <Avatar name={lead.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[14.5px] font-semibold text-text">
          {lead.name}
        </div>
        {lead.sourceAd && (
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            {lead.sourceAd}
          </div>
        )}
      </div>

      <StagePill lead={lead} className="hidden sm:inline-flex" />

      <span className="hidden w-[72px] shrink-0 text-right font-data text-[11.5px] text-faint tabular-nums lg:inline-block">
        {timeAgo(lead.lastActivityAt, now)}
      </span>

      <div className="flex shrink-0 items-center gap-2">
        {hasPhone && (
          <a
            href={`tel:${telDigits}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${lead.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Phone size={16} aria-hidden />
          </a>
        )}
        {nextStage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              moveStage(lead.id, nextStage.id, nextStage.name);
            }}
            aria-label={`Move ${lead.name} to ${nextStage.name}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-[12.5px] font-semibold text-muted transition-colors hover:border-brand/40 hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <span className="hidden max-w-[120px] truncate xl:inline">
              {nextStage.name}
            </span>
            <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

// One queue (New Leads / Follow Up / Won Today): a calm panel with a header row
// carrying a count, then either a list of LeadLines or a centered empty state.
function QueueSection({
  icon,
  title,
  count,
  emptyMessage,
  leads,
  now,
  onTap,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyMessage: string;
  leads: Lead[];
  now: number;
  onTap: (id: string) => void;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-divider px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="text-faint" aria-hidden>
            {icon}
          </span>
          <h2 className="font-display text-[16px] font-semibold text-text">
            {title}
          </h2>
        </div>
        <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-surface-2 px-2 py-0.5 font-data text-[12px] font-semibold text-muted tabular-nums">
          {count}
        </span>
      </div>
      {leads.length === 0 ? (
        <div className="px-6 py-2">
          <EmptyState title={title} message={emptyMessage} />
        </div>
      ) : (
        <div>
          {leads.map((lead, idx) => (
            <LeadLine
              key={lead.id}
              lead={lead}
              now={now}
              isLast={idx === leads.length - 1}
              onTap={onTap}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function TodayDesktop() {
  const navigate = useNavigate();
  const { leads: allLeads, isLoading, error } = useLeads();
  const { currentUser } = useAuth();
  const { client } = useClient();
  const now = useNow();

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

  // Queues key on opportunity status plus the lead's position within its own
  // pipeline (no stage-name guessing): "new" means still in the first stage,
  // "follow up" means past it but gone quiet for a day or more. Same logic the
  // phone Today screen uses.
  const newLeads = useMemo(() => {
    return [...scopedLeads]
      .filter((l) => l.status === "open" && l.stagePosition === 0)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [scopedLeads]);

  const followUpLeads = useMemo(() => {
    return [...scopedLeads]
      .filter(
        (l) =>
          l.status === "open" &&
          l.stagePosition > 0 &&
          now - new Date(l.lastActivityAt).getTime() >= DAY_MS,
      )
      .sort(
        (a, b) =>
          new Date(a.lastActivityAt).getTime() -
          new Date(b.lastActivityAt).getTime(),
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
          new Date(a.lastActivityAt).getTime(),
      );
  }, [scopedLeads, now]);

  const waitingCount = newLeads.length + followUpLeads.length;
  const firstName = currentUser?.name?.split(" ")[0] ?? "there";

  const onTap = (id: string) => navigate(`/lead/${id}`);

  return (
    <DesktopPage
      title="Today"

      actions={
        <>
          <Button variant="primary" onClick={() => navigate("/dashboard")}>
            View pipeline
            <ArrowRight size={16} />
          </Button>
        </>
      }
    >
      {error ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          Failed to load your leads. {error.message ?? "Try again."}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      ) : (
        <>
          {!isRep && currentUser && (
            <div className="mb-6 rounded-[var(--radius-lg)] border border-border bg-brand-tint px-5 py-4 text-[13px] text-text">
              <span className="label-cap mb-1 block text-brand-text">
                Rep view preview
              </span>
              Viewing the Today screen across all leads for {client.name}. Reps
              see only leads assigned to them.
            </div>
          )}

          {/* Lead-in: who this is for and how much is waiting. */}
          <div className="mb-7 flex items-end justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <span className="hero-num text-[56px] text-text">
                {waitingCount}
              </span>
              <div className="flex flex-col pb-1">
                <span className="font-display text-[18px] font-bold text-text">
                  {waitingCount === 1 ? "lead" : "leads"} waiting
                </span>
                <span className="text-[13px] text-muted">
                  Hey {firstName}, here is what needs you now.
                </span>
              </div>
            </div>
          </div>

          {/* KPI band: the three queues at a glance. */}
          <section className="mb-7 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Kpi
              label="New leads"
              value={newLeads.length}
              sub="waiting on first contact"
              icon={<Inbox size={16} />}
            />
            <Kpi
              label="Follow up"
              value={followUpLeads.length}
              sub="quiet for 24h or more"
              icon={<Clock size={16} />}
            />
            <Kpi
              label="Won today"
              value={wonToday.length}
              sub="closed in the last 24h"
              icon={<CheckCircle2 size={16} />}
            />
          </section>

          {/* The three queues, full lists. */}
          <div className="flex flex-col gap-6">
            <QueueSection
              icon={<Inbox size={16} aria-hidden />}
              title="New Leads"
              count={newLeads.length}
              emptyMessage="No new leads in your queue. Nice work."
              leads={newLeads}
              now={now}
              onTap={onTap}
            />
            <QueueSection
              icon={<Clock size={16} aria-hidden />}
              title="Follow Up"
              count={followUpLeads.length}
              emptyMessage="Nothing has gone cold in the last 24 hours."
              leads={followUpLeads}
              now={now}
              onTap={onTap}
            />
            <QueueSection
              icon={<CheckCircle2 size={16} aria-hidden />}
              title="Won Today"
              count={wonToday.length}
              emptyMessage="No wins in the last 24 hours yet."
              leads={wonToday}
              now={now}
              onTap={onTap}
            />
          </div>
        </>
      )}
    </DesktopPage>
  );
}
