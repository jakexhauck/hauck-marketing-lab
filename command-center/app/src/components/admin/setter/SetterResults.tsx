import { useMemo } from "react";
import { CalendarClock, CircleAlert, Trophy } from "lucide-react";
import {
  useSetterPipelinesQuery,
  useSetterLeadsQuery,
  useSetterEventsQuery,
} from "../../../hooks/useApi";
import { useNow } from "../../../context/NowContext";
import { buildResults, waitingSinceMs, type ResultRow } from "../../../lib/setterResults";
import { formatApptTime } from "../../../lib/setterApptConfirm";
import { timeAgo } from "../../../lib/timeAgo";

// Results: what happened after the estimate. Read-only on purpose: outcomes
// are stage position in the CRM today, and the write side (the owner's
// close-out with dollar amounts) is a client-app build that comes later.
// The "Awaiting result" list is that future close-out queue, surfaced now.

interface Props {
  tenantId: string;
  clientName: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// How long a quoted prospect can sit without an outcome before the row (and
// the headline tile) goes red rather than amber.
const AWAITING_DANGER_MS = 3 * DAY_MS;

function waitingLabel(sinceMs: number, now: number): string {
  const ms = Math.max(0, now - sinceMs);
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)}h waiting`;
  return `${Math.floor(ms / DAY_MS)}d waiting`;
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div
        className={
          "font-display text-[22px] font-semibold leading-none " +
          (tone === "danger" ? "text-danger" : "text-text")
        }
      >
        {value}
      </div>
      <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

function LeadLine({ row, caption, chip, chipTone }: {
  row: ResultRow;
  caption: string;
  chip?: string;
  chipTone?: "danger" | "warning" | "positive";
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate font-display text-[13px] font-semibold text-text">
          {row.lead.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-faint">
          {row.lead.city && (
            <>
              <span className="font-data truncate">{row.lead.city}</span>
              <span className="opacity-50">·</span>
            </>
          )}
          <span className="font-data shrink-0">{caption}</span>
        </div>
      </div>
      {chip && (
        <span
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide " +
            (chipTone === "danger"
              ? "bg-danger-tint text-danger"
              : chipTone === "warning"
                ? "bg-warning-tint text-warning"
                : "bg-positive-tint text-positive")
          }
        >
          {chip}
        </span>
      )}
    </li>
  );
}

function ListCard({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 font-display text-[13px] font-semibold text-text">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function SetterResults({ tenantId, clientName }: Props) {
  const now = useNow();

  const pipelinesQuery = useSetterPipelinesQuery(tenantId);
  const pipelines = pipelinesQuery.data?.pipelines ?? [];
  // The estimate flow lives in the Sales Pipeline; matched on the live name,
  // never a stored id, so a CRM-side rebuild of the pipeline still resolves.
  const salesPipeline = pipelines.find((p) => /sales/i.test(p.name)) ?? null;

  const leadsQuery = useSetterLeadsQuery(tenantId, salesPipeline?.id ?? "", !!salesPipeline);
  const leads = leadsQuery.data?.leads ?? [];

  // Visit dates come from the client's booked calendar events. The range
  // anchor is floored to the hour so the query key does not churn a refetch
  // every render (same trick as the board's appointment lookup).
  const rangeAnchor = Math.floor(now / HOUR_MS) * HOUR_MS;
  const eventsQuery = useSetterEventsQuery(
    tenantId,
    new Date(rangeAnchor - 31 * DAY_MS).toISOString(),
    new Date(rangeAnchor + 31 * DAY_MS).toISOString(),
    leads.length > 0,
  );
  const events = eventsQuery.data?.events ?? [];

  const model = useMemo(() => buildResults(leads, events, now), [leads, events, now]);

  if (pipelinesQuery.isLoading || leadsQuery.isLoading) {
    return <div className="pk-empty">Loading results...</div>;
  }
  if (pipelinesQuery.isError || leadsQuery.isError) {
    return <div className="pk-empty">Could not load results for {clientName}.</div>;
  }
  if (!salesPipeline) {
    return <div className="pk-empty">No Sales pipeline found for {clientName}.</div>;
  }

  const rate = model.convRate === null ? "--" : `${Math.round(model.convRate * 100)}%`;

  return (
    <div className="space-y-4">
      {eventsQuery.data?.incomplete && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-tint px-3 py-2 text-[12px] font-semibold text-warning">
          <CircleAlert size={14} aria-hidden />
          Some calendars could not be read; visit dates may be missing.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Upcoming estimates" value={String(model.upcoming.length)} />
        <StatTile
          label="Awaiting result"
          value={String(model.awaiting.length)}
          tone={model.awaiting.length > 0 ? "danger" : undefined}
        />
        <StatTile label="Jobs booked (30d)" value={String(model.wonRecentCount)} />
        <StatTile label="Estimate to job" value={rate} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[2fr,1fr]">
        <ListCard
          title="Awaiting result"
          icon={<CircleAlert size={15} className="text-danger" aria-hidden />}
        >
          <p className="mt-1 text-[11.5px] text-faint">
            Quoted prospects nobody has recorded an outcome for. Cleared by moving the lead in the
            CRM (owner close-out in the client app comes later).
          </p>
          {model.awaiting.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-faint">Nothing waiting on a result.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {model.awaiting.map((row) => {
                const since = waitingSinceMs(row);
                return (
                  <LeadLine
                    key={row.lead.id}
                    row={row}
                    caption={row.appt ? `Visit ${formatApptTime(row.appt.startMs)}` : "No visit date"}
                    chip={waitingLabel(since, now)}
                    chipTone={now - since >= AWAITING_DANGER_MS ? "danger" : "warning"}
                  />
                );
              })}
            </ul>
          )}
        </ListCard>

        <div className="space-y-4">
          <ListCard
            title="Upcoming"
            icon={<CalendarClock size={15} className="text-brand" aria-hidden />}
          >
            {model.upcoming.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-faint">No estimates on the calendar.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {model.upcoming.map((row) => (
                  <LeadLine
                    key={row.lead.id}
                    row={row}
                    caption={row.appt ? formatApptTime(row.appt.startMs) : ""}
                  />
                ))}
              </ul>
            )}
          </ListCard>

          <ListCard
            title="Recently won"
            icon={<Trophy size={15} className="text-positive" aria-hidden />}
          >
            {model.won.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-faint">No jobs booked yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {model.won.slice(0, 12).map((row) => (
                  <LeadLine
                    key={row.lead.id}
                    row={row}
                    caption={`${row.lead.stageName} · ${timeAgo(row.lead.updatedAt ?? row.lead.createdAt, now)}`}
                    chip="Won"
                    chipTone="positive"
                  />
                ))}
              </ul>
            )}
          </ListCard>
        </div>
      </div>
    </div>
  );
}
