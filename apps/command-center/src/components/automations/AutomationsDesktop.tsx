import { FlaskConical, Lock, GitBranch, RefreshCw } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import StatCard from "../StatCard";
import AutomationCard from "./AutomationCard";
import { ChannelLegend } from "./SequenceFlow";
import {
  FOLLOW_UPS,
  REACTIVATIONS,
  automationSummary,
  type Channel,
} from "../../lib/automations";

// Every channel that appears anywhere, for the header legend.
const ALL_CHANNELS: Channel[] = ["sms", "email", "call", "wait"];

// The desktop Automations surface (lg+): a read-only command view of the
// follow-up sequences and reactivation campaigns the agency runs. The client
// watches the machine work; nothing here mutates.
export default function AutomationsDesktop() {
  const s = automationSummary();

  return (
    <DesktopPage
      title="Automations"
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">
          <Lock size={12} aria-hidden="true" />
          Read-only · Managed by Hauck
        </span>
      }
    >
      <div className="mb-6 flex items-center gap-2 rounded-[var(--radius-lg)] border border-warning/30 bg-warning-tint px-4 py-2.5 text-[13px] text-warning">
        <FlaskConical size={15} className="shrink-0" aria-hidden="true" />
        <span>
          Sample data. These sequences illustrate the automations we run for you;
          live counts switch on once your account is wired in.
        </span>
      </div>

      {/* Summary band: structural counts only, never invented performance. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active automations" value={`${s.activeCount} of ${s.total}`} />
        <StatCard label="Enrolled right now" value={s.enrolledNow.toLocaleString()} />
        <StatCard label="Database in reactivation" value={s.databaseInPlay.toLocaleString()} />
        <StatCard label="Automated touches" value={s.touchesPerJourney.toLocaleString()} />
      </div>

      <div className="mt-4">
        <ChannelLegend channels={ALL_CHANNELS} />
      </div>

      {/* Follow-up sequences. */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label-cap flex items-center gap-1.5 text-brand-text">
              <GitBranch size={13} aria-hidden="true" /> Always on
            </div>
            <h2 className="mt-1 font-display text-[18px] font-semibold text-text">
              Follow-Up Sequences
            </h2>
          </div>
          <span className="label-cap">{FOLLOW_UPS.length} sequences</span>
        </div>
        <div className="flex flex-col gap-4">
          {FOLLOW_UPS.map((a) => (
            <AutomationCard key={a.id} automation={a} />
          ))}
        </div>
      </section>

      {/* Database reactivation waves. */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label-cap flex items-center gap-1.5 text-brand-text">
              <RefreshCw size={13} aria-hidden="true" /> Bringing them back
            </div>
            <h2 className="mt-1 font-display text-[18px] font-semibold text-text">
              Database Reactivation
            </h2>
          </div>
          <span className="label-cap">{REACTIVATIONS.length} campaigns</span>
        </div>
        <div className="flex flex-col gap-4">
          {REACTIVATIONS.map((c) => (
            <AutomationCard
              key={c.id}
              automation={c}
              wave={{ audience: c.audience, listSize: c.listSize, contacted: c.contacted }}
            />
          ))}
        </div>
      </section>
    </DesktopPage>
  );
}
