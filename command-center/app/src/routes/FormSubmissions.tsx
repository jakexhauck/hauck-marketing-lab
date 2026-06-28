import { useMemo, useState } from "react";
import { FlaskConical, ChevronDown, Mail, Phone, MapPin, Clock, Inbox } from "lucide-react";
import Shell from "../components/Shell";
import { PageHeader } from "../components/PageHeader";
import { Panel, Badge, EmptyState, Segmented, type SegmentOption } from "../components/ui";
import { MetricBand, type MetricCell } from "../components/ads/MetricBand";
import { useFormSubmissions } from "../hooks/useFormSubmissions";
import {
  STATUS_LABEL,
  type FormSubmission,
  type SubmissionStatus,
} from "../lib/formSubmissions";
import { formatMoney, formatNumber, formatPercent, relativeTime, formatDateTime, formatPhone } from "../lib/format";
import type { Tone } from "../lib/status";

type StatusFilter = "all" | SubmissionStatus;

// Status -> badge tone. New stands out (brand); won is positive; archived recedes.
const STATUS_TONE: Record<SubmissionStatus, Tone> = {
  new: "brand",
  contacted: "warning",
  quoted: "warning",
  won: "positive",
  archived: "neutral",
};

function summaryCells(s: ReturnType<typeof useFormSubmissions>["summary"]): MetricCell[] {
  return [
    { label: "Total", value: formatNumber(s.total) },
    { label: "New", value: formatNumber(s.newCount), caption: "untouched" },
    { label: "This week", value: formatNumber(s.newThisWeek) },
    { label: "Quoted", value: formatNumber(s.quoted) },
    { label: "Won", value: formatNumber(s.won) },
    { label: "Conversion", value: formatPercent(s.conversionRate, 0), caption: "won / total" },
  ];
}

function SubmissionRow({ sub }: { sub: FormSubmission }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-divider last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[14.5px] text-text">{sub.name}</span>
            <Badge tone={STATUS_TONE[sub.status]}>{STATUS_LABEL[sub.status]}</Badge>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            {sub.service}
            <span className="text-faint"> · {sub.location}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {sub.budget != null && (
            <span className="ledger text-[14px] leading-none">{formatMoney(sub.budget)}</span>
          )}
          <span className="flex items-center gap-1 text-[11.5px] text-faint">
            {relativeTime(sub.submittedAt)}
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </span>
        </div>
      </button>

      {open && (
        <div className="grid gap-4 border-t border-divider bg-surface-2/40 px-4 py-4 sm:grid-cols-2">
          <div className="space-y-2.5">
            <div className="label-cap">Contact</div>
            <a
              href={`mailto:${sub.email}`}
              className="flex items-center gap-2 text-[13px] text-text hover:text-brand-text"
            >
              <Mail size={14} className="shrink-0 text-faint" /> {sub.email}
            </a>
            <a
              href={`tel:${sub.phone.replace(/[^\d+]/g, "")}`}
              className="flex items-center gap-2 text-[13px] text-text hover:text-brand-text"
            >
              <Phone size={14} className="shrink-0 text-faint" /> {formatPhone(sub.phone)}
            </a>
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <MapPin size={14} className="shrink-0 text-faint" /> {sub.location}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Clock size={14} className="shrink-0 text-faint" /> {sub.timeline}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="label-cap">Request</div>
            <p className="text-[13px] leading-relaxed text-text">{sub.message}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 text-[12.5px]">
              <dt className="text-faint">Service</dt>
              <dd className="text-muted">{sub.service}</dd>
              <dt className="text-faint">Budget</dt>
              <dd className="text-muted">{sub.budget != null ? formatMoney(sub.budget) : "Not given"}</dd>
              <dt className="text-faint">Source</dt>
              <dd className="text-muted">{sub.source}</dd>
              <dt className="text-faint">Submitted</dt>
              <dd className="text-muted">{formatDateTime(sub.submittedAt)}</dd>
            </dl>
          </div>
        </div>
      )}
    </li>
  );
}

export default function FormSubmissions() {
  const data = useFormSubmissions();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const counts = useMemo(() => {
    const c: Record<SubmissionStatus, number> = { new: 0, contacted: 0, quoted: 0, won: 0, archived: 0 };
    for (const s of data.submissions) c[s.status]++;
    return c;
  }, [data.submissions]);

  const filterOptions: SegmentOption<StatusFilter>[] = [
    { value: "all", label: "All", count: data.submissions.length },
    { value: "new", label: STATUS_LABEL.new, count: counts.new },
    { value: "contacted", label: STATUS_LABEL.contacted, count: counts.contacted },
    { value: "quoted", label: STATUS_LABEL.quoted, count: counts.quoted },
    { value: "won", label: STATUS_LABEL.won, count: counts.won },
    { value: "archived", label: STATUS_LABEL.archived, count: counts.archived },
  ];

  const visible =
    filter === "all" ? data.submissions : data.submissions.filter((s) => s.status === filter);

  return (
    <Shell>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-5 pb-12 pt-5 lg:px-8">
        <PageHeader
          title="Form Submissions"
          count={`${data.submissions.length}`}
          description={`${data.formName} · estimate requests from your website`}
          filters={
            <Segmented
              options={filterOptions}
              value={filter}
              onChange={setFilter}
              size="sm"
            />
          }
        />

        {data.demo && (
          <div className="mb-5 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-warning-tint/40 px-3.5 py-2 text-[12.5px] text-warning">
            <FlaskConical size={15} className="shrink-0" />
            <span>
              Sample data. The website estimate form is not connected yet, these submissions are
              illustrative until the live feed is wired in.
            </span>
          </div>
        )}

        <div className="mb-5">
          <MetricBand cells={summaryCells(data.summary)} cols={6} />
        </div>

        <Panel className="overflow-hidden">
          {visible.length === 0 ? (
            <EmptyState
              icon={<Inbox size={22} />}
              title="No submissions"
              description={
                filter === "all"
                  ? "Estimate requests from your website will appear here."
                  : `No ${STATUS_LABEL[filter as SubmissionStatus].toLowerCase()} submissions right now.`
              }
            />
          ) : (
            <ul>
              {visible.map((sub) => (
                <SubmissionRow key={sub.id} sub={sub} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
