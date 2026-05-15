import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import Shell from "../components/Shell";
import StagePill from "../components/StagePill";
import BackButton from "../components/BackButton";
import OutcomeButton from "../components/OutcomeButton";
import WonSheet from "../components/WonSheet";
import Avatar from "../components/Avatar";
import { useLeads } from "../context/LeadsContext";
import { useClient } from "../context/ClientContext";
import type { LeadStage } from "../types";

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

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getLead, markStage } = useLeads();
  const { client } = useClient();
  const [wonOpen, setWonOpen] = useState(false);
  const wonLabel = client.pipeline.wonLabel;

  const lead = id ? getLead(id) : undefined;

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

  const telDigits = lead.phone.replace(/[^0-9+]/g, "");

  return (
    <Shell>
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
          <a
            href={`tel:${telDigits}`}
            className="flex items-center gap-3 text-base font-semibold underline"
            style={{ color: "var(--brand-primary)" }}
          >
            <Phone size={16} aria-hidden="true" />
            <span>{lead.phone}</span>
          </a>
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
