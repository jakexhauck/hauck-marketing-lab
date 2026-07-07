import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ChevronLeft,
  MessageSquare,
  Tag,
} from "lucide-react";
import { Button } from "../ui/Button";
import DesktopPage from "../desktop/DesktopPage";
import WonSheet from "../WonSheet";
import MoveStageSheet from "../MoveStageSheet";
import Avatar from "../Avatar";
import LeadActionRail from "./LeadActionRail";
import LeadConversationPanel from "./LeadConversationPanel";
import {
  ChannelFilterProvider,
  useChannelFilter,
} from "../../context/ChannelFilterContext";
import NoteList from "../NoteList";
import TaskList from "../TaskList";
import { useToast } from "../../context/ToastContext";
import { useNow } from "../../context/NowContext";
import { adaptApiLead, useLeads } from "../../context/LeadsContext";
import { useLeadQuery } from "../../hooks/useApi";
import { usePipelines } from "../../context/PipelinesContext";
import { useClient } from "../../context/ClientContext";
import { useAuth } from "../../context/AuthContext";
import { timeAgo } from "../../lib/timeAgo";
import { formatMoney } from "../../lib/formatMoney";
import { leadStageLabel } from "../../lib/stageColors";
import { e164, formatPhone } from "../../lib/phone";
import type { Lead, LeadActivity } from "../../types";

// The Atelier desktop Lead detail (lg+). The phone keeps its own NavyHero
// layout; this renders only inside `hidden lg:flex` from the LeadDetail route.
// Every interaction (advance stage, send, value edit, notes, tasks, call,
// won/lost) reuses the exact same hooks and components the phone screen does.

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateFmt.format(d);
}

interface TimelineEntryProps {
  entry: LeadActivity;
  isLast: boolean;
  wonLabel: string;
  now: number;
}

function TimelineEntry({ entry, isLast, wonLabel, now }: TimelineEntryProps) {
  let title = "";
  let body: string | null = null;

  if (entry.kind === "created") {
    title = "Lead created";
  } else if (entry.kind === "stage-change") {
    const from = entry.fromStage ?? "";
    const to = entry.toStage ?? "";
    title = from ? `Stage: ${from} to ${to}` : `Stage set to ${to}`;
  } else if (entry.kind === "note") {
    title = "Note added";
    body = entry.body ?? null;
  } else if (entry.kind === "won-recorded") {
    title = `Marked ${wonLabel}: ${formatMoney(entry.value ?? 0)}`;
  }

  const iso = new Date(entry.at).toISOString();
  const dotClass = entry.kind === "note" ? "bg-faint" : "bg-brand/60";

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center pt-1.5">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dotClass}`} />
        {!isLast && <span aria-hidden className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="text-[13.5px] font-medium text-text">{title}</div>
        {body && (
          <div className="mt-1 whitespace-pre-wrap break-words text-[13px] text-muted">
            {body}
          </div>
        )}
        <div className="label-cap mt-1 text-faint">{timeAgo(iso, now)}</div>
      </div>
    </li>
  );
}

function RailPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center gap-2">
        {icon && (
          <span className="text-muted" aria-hidden>
            {icon}
          </span>
        )}
        <h2 className="label-cap">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// One-touch action rail, wired to the shared ChannelFilterContext (provided
// by the parent) so Text/Email retarget the conversation panel beside it.
// Mirrors the phone screen's PhoneActionRail in src/routes/LeadDetail.tsx.
function DesktopActionRail({
  lead,
  wonLabel,
  canMove,
  onWon,
  onMove,
}: {
  lead: Lead;
  wonLabel: string;
  canMove: boolean;
  onWon: () => void;
  onMove: () => void;
}) {
  const { select } = useChannelFilter();
  return (
    <LeadActionRail
      phone={lead.phone}
      email={lead.email}
      canWon={lead.status !== "won"}
      canMove={canMove}
      wonLabel={wonLabel}
      onText={() => select("SMS")}
      onEmail={() => select("Email")}
      onWon={onWon}
      onMove={onMove}
    />
  );
}

export default function LeadDetailDesktop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    getLead,
    markWon,
    markLost,
    moveStage,
    getActivitiesForLead,
    isLoading: leadsLoading,
  } = useLeads();
  const { pipelines } = usePipelines();
  const { client } = useClient();
  const { session } = useAuth();
  const { showToast } = useToast();
  const now = useNow();
  const [wonOpen, setWonOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const wonLabel = client.pipeline.wonLabel;

  const listLead = id ? getLead(id) : undefined;
  // Mirror the phone screen: the single-lead fetch carries contact enrichment
  // and serves cold deep links before the list query lands.
  const detailQuery = useLeadQuery(id ?? null, Boolean(session));
  const detailLead = useMemo(
    () =>
      detailQuery.data
        ? adaptApiLead(detailQuery.data.lead, pipelines, client.id)
        : undefined,
    [detailQuery.data, pipelines, client.id],
  );
  const lead = useMemo(() => {
    if (!listLead) return detailLead;
    if (!detailLead) return listLead;
    return {
      ...listLead,
      phone: listLead.phone || detailLead.phone,
      email: listLead.email || detailLead.email,
      attribution: detailLead.attribution,
      tags: detailLead.tags,
    };
  }, [listLead, detailLead]);
  const leadPending =
    !lead && (leadsLoading || detailQuery.isLoading || detailQuery.isFetching);
  const leadPipeline = lead
    ? pipelines.find((p) => p.id === lead.pipelineId)
    : undefined;

  const activities = useMemo(
    () => (lead ? getActivitiesForLead(lead.id) : []),
    [lead, getActivitiesForLead],
  );

  if (!lead && leadPending) {
    return (
      <DesktopPage
        title="Lead"
        actions={
          <Button variant="secondary" onClick={() => navigate("/leads")}>
            <ChevronLeft size={16} />
            Back to pipeline
          </Button>
        }
      >
        <div className="flex items-center justify-center py-24">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      </DesktopPage>
    );
  }

  if (!lead) {
    return (
      <DesktopPage
        title="Lead not found"
        actions={
          <Button variant="secondary" onClick={() => navigate("/leads")}>
            <ChevronLeft size={16} />
            Back to pipeline
          </Button>
        }
      >
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-6 py-10 text-center shadow-[var(--shadow-sm)]">
          <h2 className="font-display text-[18px] font-bold text-text">
            Lead not found
          </h2>
          <p className="mt-1 text-sm text-muted">
            This lead may have been removed or the link is incorrect.
          </p>
        </div>
      </DesktopPage>
    );
  }

  // Outcome actions confirm through the global toast and return to the list,
  // identical to the phone screen.
  const handleWonSave = (value: number) => {
    setWonOpen(false);
    markWon(lead.id, value);
    showToast(`Marked as ${wonLabel}, ${currencyFmt.format(value)}`);
    navigate("/sales/leads");
  };

  const handleLost = () => {
    setMoveOpen(false);
    markLost(lead.id);
    showToast("Marked as Lost");
    navigate("/sales/leads");
  };

  const handleMove = (stageId: string, stageName: string) => {
    setMoveOpen(false);
    moveStage(lead.id, stageId, stageName);
    showToast(`Moved to ${stageName}`);
    navigate("/sales/leads");
  };

  const telDigits = e164(lead.phone);
  const phoneDisplay = formatPhone(lead.phone) || lead.phone;
  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
  const canMove = Boolean(leadPipeline && leadPipeline.stages.length > 0);
  const stageLabel = leadStageLabel(lead, wonLabel);
  const visibleActivities =
    showAllActivity || activities.length <= 8
      ? activities
      : activities.slice(0, 8);

  const subtitle = (
    <span className="inline-flex items-center gap-2">
      <span>{stageLabel}</span>
      {lead.pipelineName && (
        <>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <span>{lead.pipelineName}</span>
        </>
      )}
    </span>
  );

  return (
    <>
      <DesktopPage
        title={
          <span className="flex items-center gap-3">
            <Avatar name={lead.name} size="sm" />
            <span className="truncate">{lead.name}</span>
          </span>
        }
        subtitle={subtitle}
        flush
        actions={
          <Button variant="ghost" onClick={() => navigate("/leads")}>
            <ChevronLeft size={16} />
            Pipeline
          </Button>
        }
      >
        <ChannelFilterProvider key={lead.id}>
          <div className="flex min-h-0 flex-1 gap-5 p-6">
            {/* Left: contact card, action rail, details */}
            <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto">
              {/* Stage + value + contact */}
              <RailPanel title="Lead value">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 text-[13px] font-semibold text-brand-text">
                    {stageLabel}
                  </span>
                </div>

                <div className="ledger mt-4 text-[2rem] leading-none">
                  {lead.value !== null ? formatMoney(lead.value) : "$0"}
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  {client.pipeline.valueLabel}
                </p>

                <dl className="mt-5 flex flex-col gap-3 border-t border-divider pt-4">
                  {hasPhone && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="label-cap">Phone</dt>
                      <dd>
                        <a
                          href={`tel:${telDigits}`}
                          className="font-data text-[13px] text-brand-text tabular-nums hover:underline"
                        >
                          {phoneDisplay}
                        </a>
                      </dd>
                    </div>
                  )}
                  {lead.email && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="label-cap">Email</dt>
                      <dd className="min-w-0">
                        <a
                          href={`mailto:${lead.email}`}
                          className="block truncate text-[13px] font-medium text-brand-text hover:underline"
                        >
                          {lead.email}
                        </a>
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <dt className="label-cap">Created</dt>
                    <dd className="font-data text-[13px] text-text tabular-nums">
                      {formatCreated(lead.createdAt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="label-cap">Last activity</dt>
                    <dd className="font-data text-[13px] text-text tabular-nums">
                      {timeAgo(lead.lastActivityAt, now)}
                    </dd>
                  </div>
                </dl>

                {lead.tags && lead.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-divider pt-4">
                    <Tag size={13} aria-hidden className="text-muted" />
                    {lead.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </RailPanel>

              {/* One-touch actions, wired to the shared channel filter so
                  Text/Email retarget the conversation panel on the right. */}
              <DesktopActionRail
                lead={lead}
                wonLabel={wonLabel}
                canMove={canMove}
                onWon={() => setWonOpen(true)}
                onMove={() => setMoveOpen(true)}
              />

              {lead.attribution &&
                (lead.attribution.source ||
                  lead.attribution.campaign ||
                  lead.attribution.ad ||
                  lead.attribution.adset) && (
                  <RailPanel title="Attribution">
                    <dl className="flex flex-col gap-2.5 text-sm">
                      {(
                        [
                          ["Source", lead.attribution.source],
                          ["Campaign", lead.attribution.campaign],
                          ["Ad", lead.attribution.ad],
                          ["Adset", lead.attribution.adset],
                        ] as const
                      )
                        .filter(([, value]) => Boolean(value))
                        .map(([label, value]) => (
                          <div
                            key={label}
                            className="flex justify-between gap-3"
                          >
                            <dt className="label-cap">{label}</dt>
                            <dd className="break-words text-right text-[13px] font-medium text-text">
                              {value}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </RailPanel>
                )}

              {/* Notes */}
              <RailPanel title="Notes" icon={<MessageSquare size={14} />}>
                {session && lead.contactId ? (
                  <NoteList contactId={lead.contactId} onToast={showToast} />
                ) : (
                  <p className="text-sm text-muted">
                    Sign in to add and view notes for this lead.
                  </p>
                )}
              </RailPanel>

              {/* Tasks */}
              {session && lead.contactId && (
                <RailPanel title="Tasks" icon={<Activity size={14} />}>
                  <TaskList contactId={lead.contactId} onToast={showToast} />
                </RailPanel>
              )}

              {/* Activity */}
              <RailPanel title="Activity" icon={<Activity size={14} />}>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted">No activity yet.</p>
                ) : (
                  <>
                    <ul className="flex flex-col">
                      {visibleActivities.map((entry, idx) => (
                        <TimelineEntry
                          key={entry.id}
                          entry={entry}
                          isLast={idx === visibleActivities.length - 1}
                          wonLabel={wonLabel}
                          now={now}
                        />
                      ))}
                    </ul>
                    {activities.length > 8 && (
                      <button
                        type="button"
                        onClick={() => setShowAllActivity((v) => !v)}
                        className="text-[12px] font-semibold text-brand-text hover:underline"
                      >
                        {showAllActivity
                          ? "Show recent"
                          : `Show all (${activities.length})`}
                      </button>
                    )}
                  </>
                )}
              </RailPanel>
            </aside>

            {/* Right: conversation, filling the available height */}
            <section className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-divider px-6 py-4">
                <MessageSquare size={15} className="text-muted" aria-hidden />
                <h2 className="font-display text-[15px] font-semibold text-text">
                  Conversation
                </h2>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-6">
                {session ? (
                  <LeadConversationPanel
                    leadId={lead.id}
                    hasPhone={hasPhone}
                    wrapProvider={false}
                  />
                ) : (
                  <p className="text-sm text-muted">
                    Sign in to view the conversation history.
                  </p>
                )}
              </div>
            </section>
          </div>
        </ChannelFilterProvider>
      </DesktopPage>

      {moveOpen && leadPipeline && (
        <MoveStageSheet
          leadName={lead.name}
          currentStageId={lead.pipelineStageId}
          stages={leadPipeline.stages}
          onClose={() => setMoveOpen(false)}
          onPickStage={handleMove}
          onWon={
            lead.status !== "won"
              ? () => {
                  setMoveOpen(false);
                  setWonOpen(true);
                }
              : undefined
          }
          onLost={lead.status !== "lost" ? handleLost : undefined}
        />
      )}

      <WonSheet
        open={wonOpen}
        onCancel={() => setWonOpen(false)}
        onSave={handleWonSave}
      />
    </>
  );
}
