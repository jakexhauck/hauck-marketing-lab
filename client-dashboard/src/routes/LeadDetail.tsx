import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, Mail, MessageSquare, Phone } from "lucide-react";
import Shell from "../components/Shell";
import StagePill from "../components/StagePill";
import BackButton from "../components/BackButton";
import OutcomeButton from "../components/OutcomeButton";
import WonSheet from "../components/WonSheet";
import Avatar from "../components/Avatar";
import BrandedButton from "../components/BrandedButton";
import Toast from "../components/Toast";
import { useLeads } from "../context/LeadsContext";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import { timeAgo } from "../lib/timeAgo";
import { formatMoney } from "../lib/formatMoney";
import { e164, formatPhone } from "../lib/phone";
import ConversationThread from "../components/ConversationThread";
import MessageComposer from "../components/MessageComposer";
import type { LeadActivity, LeadStage } from "../types";

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

function prettyStage(stage: LeadStage): string {
  return stage
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface TimelineEntryProps {
  entry: LeadActivity;
  isLast: boolean;
  wonLabel: string;
}

function TimelineEntry({ entry, isLast, wonLabel }: TimelineEntryProps) {
  const dotColor =
    entry.kind === "note" ? "var(--text-muted)" : "var(--brand-primary)";

  let title = "";
  let body: string | null = null;

  if (entry.kind === "created") {
    title = "Lead created";
  } else if (entry.kind === "stage-change") {
    const from = entry.fromStage ? prettyStage(entry.fromStage) : "";
    const to = entry.toStage ? prettyStage(entry.toStage) : "";
    title = `Stage: ${from} to ${to}`;
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
          {timeAgo(iso)}
        </div>
      </div>
    </li>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getLead, markStage, getActivitiesForLead, addNote } = useLeads();
  const { client } = useClient();
  const { session } = useAuth();
  const [wonOpen, setWonOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const wonLabel = client.pipeline.wonLabel;

  const lead = id ? getLead(id) : undefined;

  const activities = useMemo(
    () => (lead ? getActivitiesForLead(lead.id) : []),
    [lead, getActivitiesForLead]
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!lead) {
    return (
      <Shell>
        <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <BackButton to="/dashboard" label="Dashboard" />
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

  const goBackWithToast = (stage: LeadStage, value?: number) => {
    markStage(lead.id, stage, value);
    let message = "";
    if (stage === "booked") message = "Marked as Booked";
    else if (stage === "lost") message = "Marked as Lost";
    else if (stage === "no-show") message = "Marked as No-Show";
    else if (stage === "won") {
      message =
        typeof value === "number"
          ? `Marked as ${wonLabel}, ${currencyFmt.format(value)}`
          : `Marked as ${wonLabel}`;
    }
    navigate("/dashboard", { state: { toast: message } });
  };

  const handleWonSave = (value: number) => {
    setWonOpen(false);
    goBackWithToast("won", value);
  };

  const handleAddNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    addNote(lead.id, trimmed);
    setNoteDraft("");
    setToast("Note added");
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
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <BackButton to="/dashboard" label="Dashboard" />
      </header>

      <div className="flex flex-col gap-5 px-5 py-5">
        <section className="flex items-center gap-4">
          <Avatar name={lead.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">
                {lead.name}
              </h1>
              <StagePill stage={lead.stage} />
            </div>
            <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
              {lead.sourceAd} · {lead.sourceCampaign}
            </div>
          </div>
        </section>

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
          <dl className="flex flex-col gap-2 border-t border-[var(--divider)] pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="label-cap">Ad</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {lead.sourceAd}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="label-cap">Campaign</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {lead.sourceCampaign}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="label-cap">Created</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {formatCreated(lead.createdAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="label-cap">Last activity</dt>
              <dd className="text-right font-semibold text-[var(--text)]">
                {timeAgoVerbose(lead.lastActivityAt)}
              </dd>
            </div>
          </dl>
        </section>

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
        </section>

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
            variant="booked"
            disabled={lead.stage === "booked"}
            onClick={() => goBackWithToast("booked")}
          >
            Mark Booked
          </OutcomeButton>
          <OutcomeButton
            variant="won"
            disabled={lead.stage === "won"}
            onClick={() => setWonOpen(true)}
          >
            {`Mark ${wonLabel}`}
          </OutcomeButton>
          <OutcomeButton
            variant="lost"
            disabled={lead.stage === "lost"}
            onClick={() => goBackWithToast("lost")}
          >
            Mark Lost
          </OutcomeButton>
          {lead.stage === "booked" && (
            <OutcomeButton
              variant="no-show"
              disabled={false}
              onClick={() => goBackWithToast("no-show")}
            >
              Mark No-Show
            </OutcomeButton>
          )}
        </section>
      </div>

      <WonSheet open={wonOpen} onCancel={() => setWonOpen(false)} onSave={handleWonSave} />
    </Shell>
  );
}
