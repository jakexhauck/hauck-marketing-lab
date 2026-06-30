import { useMemo, useState } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CalendarClock,
  MessageSquare,
  DollarSign,
  FileText,
  Star,
  MapPin,
} from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Badge, EmptyState } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/cn";
import { demoMode } from "../../demo/demoMode";
import { PAGE_CONTAINER } from "../../lib/layout";
import { useJobs } from "../../hooks/useJobs";
import {
  monthGrid,
  monthSummary,
  jobsOnDay,
  dayKinds,
  jobKind,
  jobInitials,
  formatMoney,
  formatLongDay,
  toIso,
  KIND_TONE,
  KIND_LABEL,
  DEMO_MONTH,
  DEMO_DEFAULT_DAY,
  type Job,
  type DayKind,
} from "../../lib/jobsPipeline";
import { NotConnectedNotice } from "./shared";

// The Jobs (Sales) surface: the tail of the Sales spine, laid out as a month
// calendar (left) + the selected day's jobs (right). Pick a day, see and work
// its jobs — mark completed, reschedule, message, take payment. Populated in
// demo/preview; a real session shows an empty calendar + not-connected notice.
// Terminal actions are gated (toast + no write) until the GHL feed is wired.

// Page scroll container, matching the other client surfaces.
const JOBS_CONTAINER = PAGE_CONTAINER;

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// The semantic dot colour for each kind (booked / completed / unpaid).
const KIND_DOT: Record<DayKind, string> = {
  booked: "bg-brand",
  completed: "bg-positive",
  unpaid: "bg-warning",
};

export default function Jobs() {
  const demo = demoMode();
  const jobs = useJobs();
  const { showToast } = useToast();
  const today = toIso(new Date());

  // Anchor the view to the demo month so the preview always reads full; a real
  // session opens on the current month (empty until connected).
  const initial = demo ? DEMO_MONTH : { year: new Date().getFullYear(), month: new Date().getMonth() };
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState(demo ? DEMO_DEFAULT_DAY : today);

  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const summary = useMemo(
    () => monthSummary(jobs, view.year, view.month),
    [jobs, view],
  );
  const dayJobs = useMemo(() => jobsOnDay(jobs, selected), [jobs, selected]);

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const dayBookedValue = dayJobs
    .filter((j) => j.status === "booked")
    .reduce((sum, j) => sum + j.amount, 0);

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  // Terminal actions are not wired yet: explain that in the preview, never write.
  function onAction(label: string) {
    showToast(
      demo
        ? `Preview — "${label}" turns on once your calendar and pipeline are connected.`
        : `"${label}" turns on once your calendar is connected.`,
    );
  }

  return (
    <Shell>
      <div className={JOBS_CONTAINER}>
        <PageHeader
          title="Jobs"
          description="Pick a day to see and work its jobs, booked through completed."
          actions={
            demo ? (
              <Badge tone="positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />{" "}
                {summary.booked} booked this month
              </Badge>
            ) : undefined
          }
        />

        {!demo && (
          <NotConnectedNotice message="Booked and completed jobs land on this calendar automatically once your calendar and sales pipeline are connected through GoHighLevel." />
        )}

        <Panel className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* LEFT — month calendar + summary */}
          <div className="flex flex-col border-divider lg:w-[320px] lg:border-r">
            <div className="flex items-center gap-2 px-4 pt-4">
              <div className="font-display text-[15px] font-semibold text-text">{monthLabel}</div>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-text"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-text"
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="px-3 pt-3">
              <div className="mb-1 grid grid-cols-7">
                {WEEKDAYS.map((d, i) => (
                  <span key={i} className="text-center text-[10px] font-bold uppercase tracking-wide text-faint">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.flat().map((cell) => {
                  const kinds = dayKinds(jobs, cell.iso);
                  const isSel = cell.iso === selected;
                  const isToday = cell.iso === today;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelected(cell.iso)}
                      className={cn(
                        "relative flex aspect-square flex-col items-center justify-center rounded-[10px] font-display text-[12.5px] font-medium transition-colors",
                        isSel
                          ? "text-white shadow-brand"
                          : cell.inMonth
                            ? "text-text hover:bg-surface-2"
                            : "text-faint hover:bg-surface-2",
                        !isSel && isToday && "ring-1 ring-brand/40",
                      )}
                      style={isSel ? { backgroundImage: "var(--grad-brand)" } : undefined}
                      aria-pressed={isSel}
                    >
                      {cell.day}
                      <span className="mt-0.5 flex h-1 items-center gap-0.5">
                        {kinds.map((k) => (
                          <span
                            key={k}
                            className={cn(
                              "h-1 w-1 rounded-full",
                              isSel ? "bg-white/90" : KIND_DOT[k],
                            )}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Month summary */}
            <div className="mt-auto border-t border-divider px-4 py-3.5">
              <SummaryRow dot="bg-brand" label="Booked" value={String(summary.booked)} />
              <SummaryRow dot="bg-positive" label="Completed" value={String(summary.completed)} />
              <SummaryRow
                dot="bg-warning"
                label="Unpaid"
                value={
                  summary.unpaid ? `${summary.unpaid} · ${formatMoney(summary.unpaidValue)}` : "0"
                }
              />
              <div className="mt-1 flex items-center justify-between border-t border-divider pt-2.5 text-[12px]">
                <span className="text-muted">Collected this month</span>
                <span className="font-display font-semibold text-positive">
                  {formatMoney(summary.collected)}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT — selected day */}
          <div className="flex min-h-0 flex-1 flex-col bg-surface-2/40">
            <div className="flex items-center gap-3 border-b border-divider bg-surface px-5 py-4">
              <div className="min-w-0">
                <div className="font-display text-[17px] font-semibold text-text">
                  {formatLongDay(selected)}
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {dayJobs.length === 0
                    ? "No jobs"
                    : `${dayJobs.length} job${dayJobs.length > 1 ? "s" : ""}`}
                  {selected === today ? " · today" : ""}
                </div>
              </div>
              {dayBookedValue > 0 && (
                <div className="ml-auto text-right">
                  <div className="font-display text-[16px] font-semibold text-positive">
                    {formatMoney(dayBookedValue)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-faint">booked value</div>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {dayJobs.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={<CalendarCheck size={22} />}
                    title="Nothing booked this day"
                    description={
                      demo
                        ? "Pick another day with a dot to see its jobs."
                        : "Booked and completed jobs will appear here once your calendar is connected."
                    }
                  />
                </div>
              ) : (
                dayJobs.map((job) => <JobCard key={job.id} job={job} onAction={onAction} />)
              )}
            </div>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

function SummaryRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12px]">
      <span className="flex items-center gap-2 text-muted">
        <span className={cn("h-2.5 w-2.5 rounded-[3px]", dot)} aria-hidden />
        {label}
      </span>
      <span className="font-display font-semibold text-text">{value}</span>
    </div>
  );
}

// Action buttons per job state: booked work gets the full set; a finished job
// drops to payment/follow-up; a paid job to follow-up only.
function jobActions(job: Job): { label: string; icon: typeof CheckCircle2; primary?: boolean }[] {
  if (job.status === "booked") {
    return [
      { label: "Mark completed", icon: CheckCircle2, primary: true },
      { label: "Reschedule", icon: CalendarClock },
      { label: "Message", icon: MessageSquare },
      { label: "Payment", icon: DollarSign },
    ];
  }
  if (!job.paid) {
    return [
      { label: "Record payment", icon: DollarSign, primary: true },
      { label: "Resend invoice", icon: FileText },
      { label: "Message", icon: MessageSquare },
    ];
  }
  return [
    { label: "Message", icon: MessageSquare },
    { label: "Ask for review", icon: Star },
  ];
}

function JobCard({ job, onAction }: { job: Job; onAction: (label: string) => void }) {
  const kind = jobKind(job);
  const [h, ap] = job.time.split(" ");
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-14 shrink-0 text-center">
          <div className="font-display text-[15px] font-semibold leading-none text-text">{h}</div>
          <div className="mt-0.5 text-[10px] font-semibold text-faint">{ap}</div>
        </div>
        <div className="self-stretch border-l border-divider" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-tint font-display text-[10px] font-semibold text-brand-text"
              aria-hidden
            >
              {jobInitials(job.customer)}
            </span>
            <span className="truncate font-display text-[14.5px] font-semibold text-text">
              {job.customer}
            </span>
          </div>
          <div className="mt-1 truncate text-[12px] text-muted">{job.service}</div>
          <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-faint">
            <MapPin size={11} className="shrink-0" />
            {job.city} · {job.zip} · {job.phone}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-[16px] font-semibold text-text">
            {formatMoney(job.amount)}
          </div>
          <Badge tone={KIND_TONE[kind]} className="mt-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[kind])} aria-hidden />
            {KIND_LABEL[kind]}
          </Badge>
        </div>
      </div>
      <div className="flex gap-2 border-t border-divider bg-surface-2/50 px-4 py-2.5">
        {jobActions(job).map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => onAction(a.label)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border px-2 py-2 font-display text-[11.5px] font-semibold transition-colors",
                a.primary
                  ? "border-positive/40 bg-positive-tint text-positive hover:bg-positive-tint"
                  : "border-border bg-surface text-text hover:border-brand/40",
              )}
            >
              <Icon size={13} />
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
