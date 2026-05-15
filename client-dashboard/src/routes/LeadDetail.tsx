import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../components/Shell";
import StagePill from "../components/StagePill";
import BackButton from "../components/BackButton";
import OutcomeButton from "../components/OutcomeButton";
import WonSheet from "../components/WonSheet";
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
        <header className="flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2">
          <BackButton to="/dashboard" label="Dashboard" />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Lead not found</h1>
          <p className="text-sm text-slate-500">
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

  return (
    <Shell>
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
        <BackButton to="/dashboard" label="Dashboard" />
        <StagePill stage={lead.stage} />
      </header>

      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-2xl font-semibold text-slate-900">{lead.name}</h1>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <a
            href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`}
            className="text-base font-medium underline"
            style={{ color: "var(--brand-primary)" }}
          >
            {lead.phone}
          </a>
          <a
            href={`mailto:${lead.email}`}
            className="break-all text-base font-medium underline"
            style={{ color: "var(--brand-primary)" }}
          >
            {lead.email}
          </a>
          <dl className="flex flex-col gap-2 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Ad</dt>
              <dd className="text-right font-medium text-slate-900">{lead.sourceAd}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Campaign</dt>
              <dd className="text-right font-medium text-slate-900">{lead.sourceCampaign}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Created</dt>
              <dd className="text-right font-medium text-slate-900">{formatCreated(lead.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Last activity</dt>
              <dd className="text-right font-medium text-slate-900">{timeAgoVerbose(lead.lastActivityAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Mark outcome
          </h2>
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
