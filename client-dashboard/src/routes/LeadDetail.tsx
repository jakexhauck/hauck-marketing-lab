import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  CheckSquare,
  ChevronLeft,
  Mail,
  MessageSquare,
  Phone,
  Tag,
} from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import BackButton from "../components/BackButton";
import OutcomeButton from "../components/OutcomeButton";
import WonSheet from "../components/WonSheet";
import MoveStageSheet from "../components/MoveStageSheet";
import Avatar from "../components/Avatar";
import BrandedButton from "../components/BrandedButton";
import { useToast } from "../context/ToastContext";
import { useNow } from "../context/NowContext";
import { adaptApiLead, useLeads } from "../context/LeadsContext";
import { useLeadQuery } from "../hooks/useApi";
import { usePipelines } from "../context/PipelinesContext";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import { timeAgo } from "../lib/timeAgo";
import { formatMoney } from "../lib/formatMoney";
import { leadStageLabel } from "../lib/stageColors";
import { e164, formatPhone } from "../lib/phone";
import ConversationThread from "../components/ConversationThread";
import MessageComposer from "../components/MessageComposer";
import NoteList from "../components/NoteList";
import TaskList from "../components/TaskList";
import type { LeadActivity } from "../types";

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

function timeAgoVerbose(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Math.max(0, now - then);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

interface TimelineEntryProps {
  entry: LeadActivity;
  isLast: boolean;
  wonLabel: string;
}

function TimelineEntry({ entry, isLast, wonLabel }: TimelineEntryProps) {
  const now = useNow();
  const dotColor =
    entry.kind === "note" ? "var(--text-muted)" : "var(--brand-primary)";

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

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center pt-1.5">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        {!isLast && (
          <span
            aria-hidden="true"
            className="mt-1 w-px flex-1"
            style={{ backgroundColor: "var(--border)" }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="text-sm font-medium text-[var(--text)]">{title}</div>
        {body && (
          <div className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-muted)]">
            {body}
          </div>
        )}
        <div className="label-cap mt-1 text-[var(--text-faint)]">
          {timeAgo(iso, now)}
        </div>
      </div>
    </li>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    getLead,
    markWon,
    markLost,
    moveStage,
    getActivitiesForLead,
    addNote,
    isLoading: leadsLoading,
  } = useLeads();
  const { pipelines } = usePipelines();
  const { client } = useClient();
  const { session } = useAuth();
  const { showToast } = useToast();
  const now = useNow();
  const [wonOpen, setWonOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const wonLabel = client.pipeline.wonLabel;

  const listLead = id ? getLead(id) : undefined;
  // The single-lead fetch serves two jobs: deep links (push taps) land here
  // before the list query has data, and only this endpoint carries the
  // contact enrichment (attribution, tags). Always on for real sessions.
  const detailQuery = useLeadQuery(id ?? null, Boolean(session));
  const detailLead = useMemo(
    () =>
      detailQuery.data
        ? adaptApiLead(detailQuery.data.lead, pipelines, client.id)
        : undefined,
    [detailQuery.data, pipelines, client.id],
  );
  // The list lead is fresher for stage/status (optimistic moves update it);
  // the detail lead supplies what the list omits.
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
  // The move sheet lists the lead's OWN pipeline's stages, never another
  // pipeline's. No pipeline match (deleted in GHL) means no move action.
  const leadPipeline = lead
    ? pipelines.find((p) => p.id === lead.pipelineId)
    : undefined;

  const activities = useMemo(
    () => (lead ? getActivitiesForLead(lead.id) : []),
    [lead, getActivitiesForLead]
  );

  // Still loading (cold deep link): spinner, never a premature "not found".
  if (!lead && leadPending) {
    return (
      <Shell>
        <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <BackButton to="/leads" label="Leads" />
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
            aria-hidden="true"
          />
        </div>
      </Shell>
    );
  }

  if (!lead) {
    return (
      <Shell>
        <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <BackButton to="/leads" label="Leads" />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--text)]">
            Lead not found
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            This lead may have been removed or the link is incorrect.
          </p>
        </div>
      </Shell>
    );
  }

  // Outcome actions confirm through the global toast (it survives the
  // navigation back to the list) instead of navigate-with-state.
  const handleWonSave = (value: number) => {
    setWonOpen(false);
    markWon(lead.id, value);
    showToast(`Marked as ${wonLabel}, ${currencyFmt.format(value)}`);
    navigate("/leads");
  };

  const handleLost = () => {
    setMoveOpen(false);
    markLost(lead.id);
    showToast("Marked as Lost");
    navigate("/leads");
  };

  const handleMove = (stageId: string, stageName: string) => {
    setMoveOpen(false);
    moveStage(lead.id, stageId, stageName);
    showToast(`Moved to ${stageName}`);
    navigate("/leads");
  };

  const handleAddNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    addNote(lead.id, trimmed);
    setNoteDraft("");
    showToast("Note added");
  };

  const telDigits = e164(lead.phone);
  const phoneDisplay = formatPhone(lead.phone) || lead.phone;
  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
  const visibleActivities =
    showAllActivity || activities.length <= 8
      ? activities
      : activities.slice(0, 8);

  return (
    <Shell>
      <NavyHero>
        <div className="flex items-center justify-between">
          <HeroIconButton label="Back to leads" onClick={() => navigate("/leads")}>
            <ChevronLeft size={20} />
          </HeroIconButton>
          {hasPhone && (
            <a
              href={`tel:${telDigits}`}
              aria-label={`Call ${lead.name}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-colors active:scale-[0.96]"
              style={{ background: "rgba(255,255,255,0.14)" }}
            >
              <Phone size={18} />
            </a>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Avatar name={lead.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold tracking-tight text-white">
              {lead.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold text-white"
                style={{ background: "rgba(255,255,255,0.16)" }}
              >
                {leadStageLabel(lead, wonLabel)}
              </span>
              {lead.pipelineName && (
                <span className="text-xs text-white/60">
                  {lead.pipelineName}
                </span>
              )}
            </div>
            {(lead.attribution?.ad || lead.attribution?.campaign) && (
              <div className="mt-1.5 truncate text-xs text-white/60">
                {[lead.attribution?.ad, lead.attribution?.campaign]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
        </div>
      </NavyHero>

      <div className="flex flex-col gap-5 px-5 py-5">

        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {hasPhone && (
            <a
              href={`tel:${telDigits}`}
              className="flex items-center gap-3 text-base font-semibold underline"
              style={{ color: "var(--brand-primary)" }}
            >
              <Phone size={16} aria-hidden="true" />
              <span>{phoneDisplay}</span>
            </a>
          )}
          <a
            href={`mailto:${lead.email}`}
            className="flex items-center gap-3 break-all text-base font-semibold underline"
            style={{ color: "var(--brand-primary)" }}
          >
            <Mail size={16} aria-hidden="true" />
            <span>{lead.email}</span>
          </a>
          {lead.tags && lead.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--divider)] pt-3">
              <Tag
                size={13}
                aria-hidden="true"
                className="text-[var(--text-muted)]"
              />
              {lead.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <dl className="flex flex-col gap-2 border-t border-[var(--divider)] pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="label-cap">Created</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {formatCreated(lead.createdAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="label-cap">Last activity</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {timeAgoVerbose(lead.lastActivityAt, now)}
              </dd>
            </div>
          </dl>
        </section>

        {lead.attribution && (
          <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="label-cap">Attribution</h2>
            <dl className="flex flex-col gap-2 text-sm">
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
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="label-cap">{label}</dt>
                    <dd className="break-words text-right font-semibold text-[var(--text)]">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        )}

        {session && (
          <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2">
              <MessageSquare
                size={14}
                aria-hidden="true"
                className="text-[var(--text-muted)]"
              />
              <h2 className="label-cap">Messages</h2>
            </div>
            <ConversationThread leadId={lead.id} />
            <MessageComposer leadId={lead.id} disabled={!hasPhone} />
            {!hasPhone && (
              <p className="text-xs text-[var(--text-muted)]">
                No phone number on file. Add one in GHL to send SMS.
              </p>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2">
            <MessageSquare
              size={14}
              aria-hidden="true"
              className="text-[var(--text-muted)]"
            />
            <h2 className="label-cap">Notes</h2>
          </div>
          {session && lead.contactId ? (
            <NoteList contactId={lead.contactId} onToast={showToast} />
          ) : (
            <>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a quick note about this lead."
                className="min-h-[80px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]"
              />
              <BrandedButton
                variant="primary"
                onClick={handleAddNote}
                disabled={noteDraft.trim().length === 0}
                className="self-start"
              >
                Add note
              </BrandedButton>
            </>
          )}
        </section>

        {session && lead.contactId && (
          <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2">
              <CheckSquare
                size={14}
                aria-hidden="true"
                className="text-[var(--text-muted)]"
              />
              <h2 className="label-cap">Tasks</h2>
            </div>
            <TaskList contactId={lead.contactId} onToast={showToast} />
          </section>
        )}

        <section className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2">
            <Activity
              size={14}
              aria-hidden="true"
              className="text-[var(--text-muted)]"
            />
            <h2 className="label-cap">Activity</h2>
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No activity yet.
            </p>
          ) : (
            <>
              <ul className="flex flex-col">
                {visibleActivities.map((entry, idx) => (
                  <TimelineEntry
                    key={entry.id}
                    entry={entry}
                    isLast={idx === visibleActivities.length - 1}
                    wonLabel={wonLabel}
                  />
                ))}
              </ul>
              {activities.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((v) => !v)}
                  className="self-start text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] underline transition-colors active:text-[var(--text)]"
                >
                  {showAllActivity
                    ? "Show recent"
                    : `Show all (${activities.length})`}
                </button>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label-cap-strong px-1">Mark outcome</h2>
          <OutcomeButton
            variant="won"
            disabled={lead.status === "won"}
            onClick={() => setWonOpen(true)}
          >
            {`Mark ${wonLabel}`}
          </OutcomeButton>
          <OutcomeButton
            variant="lost"
            disabled={lead.status === "lost"}
            onClick={handleLost}
          >
            Mark Lost
          </OutcomeButton>
          {leadPipeline && leadPipeline.stages.length > 0 && (
            <OutcomeButton
              variant="move"
              disabled={false}
              onClick={() => setMoveOpen(true)}
            >
              Move Stage
            </OutcomeButton>
          )}
        </section>
      </div>

      {moveOpen && leadPipeline && (
        <MoveStageSheet
          leadName={lead.name}
          currentStageId={lead.pipelineStageId}
          stages={leadPipeline.stages}
          onClose={() => setMoveOpen(false)}
          onPickStage={handleMove}
        />
      )}

      <WonSheet open={wonOpen} onCancel={() => setWonOpen(false)} onSave={handleWonSave} />
    </Shell>
  );
}
