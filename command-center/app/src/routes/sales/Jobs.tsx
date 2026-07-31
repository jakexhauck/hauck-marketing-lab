import { useCallback, useMemo, useState } from "react";
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
  Send,
  X,
} from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Badge, EmptyState, Segmented } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/cn";
import { demoMode } from "../../demo/demoMode";
import { PAGE_CONTAINER } from "../../lib/layout";
import { useJobs } from "../../hooks/useJobs";
import { useCalendarBusy } from "../../hooks/useApi";
import GoogleCalendarLink from "../../components/calendar/GoogleCalendarLink";
import CalendarViews, {
  type CalendarView,
} from "../../components/calendar/CalendarViews";
import { jobToItem, busyToItem, type CalendarSource } from "../../lib/calendarModel";
import {
  useCompleteJob,
  useSendConversationMessage,
  useStartReviewCampaign,
  useRescheduleAppointment,
  useMarkJobPaid,
  useHandoffSlotsQuery,
} from "../../hooks/useApi";
import { DateTimeModal } from "../../components/DateTimeModal";
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

// The Jobs (Sales) surface: the tail of the Sales spine, laid out as a month
// calendar (left) + the selected day's jobs (right). Pick a day, see and work
// its jobs — mark completed, reschedule, message, take payment. Populated in
// demo/preview; a real session shows an empty calendar + not-connected notice.
// Terminal actions are gated (toast + no write) until the GHL feed is wired.

// Page scroll container, matching the other client surfaces.
const JOBS_CONTAINER = PAGE_CONTAINER;

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// The semantic dot colour for each kind (estimate / booked / completed / unpaid).
const KIND_DOT: Record<DayKind, string> = {
  estimate: "bg-info",
  booked: "bg-brand",
  completed: "bg-positive",
  unpaid: "bg-warning",
};

// The Jobs tab hosts four views: its own day-panel ("jobs", default) plus the
// Month / Week / Agenda calendar folded in from the old standalone Calendar.
type JobsView = "jobs" | CalendarView;
const JOBS_VIEW_KEY = "hml_jobs_view";

function isJobsView(v: string | null | undefined): v is JobsView {
  return v === "jobs" || v === "month" || v === "week" || v === "agenda";
}

// ?view= wins, then the saved preference, then Jobs. The URL param exists so a
// calendar view can be linked to directly (the admin Software tab lists all four
// as separate surfaces); day-to-day use is unaffected, since no ordinary
// navigation supplies one.
function initialJobsView(): JobsView {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    if (isJobsView(fromUrl)) return fromUrl;
  } catch {
    /* ignore */
  }
  try {
    const v = window.localStorage.getItem(JOBS_VIEW_KEY);
    if (isJobsView(v)) return v;
  } catch {
    /* ignore */
  }
  return "jobs";
}

// A slot-booking request handed over from the Leads tab (structural subset of
// Sales' BookingRequest, so no import cycle).
interface JobsBooking {
  name: string;
  kind: "estimate" | "job";
  calendar: string;
  prefillAddress?: string;
  prefillService?: string;
}

// What the owner fills in when booking the appointment.
export interface BookingDetails {
  address: string;
  service: string;
  notes: string;
}

// The Jobs calendar body. Rendered standalone (Jobs route) and inside the
// combined Sales page's "Schedule" tab, where `embedded` drops the big page
// title (Sales owns the title) and keeps only the view controls. In `booking`
// mode the day panel becomes a slot picker for the lead being booked.
export function JobsBoard({
  embedded = false,
  booking = null,
  onBookPick,
  onBookCancel,
}: {
  embedded?: boolean;
  booking?: JobsBooking | null;
  onBookPick?: (iso: string, details: BookingDetails) => void;
  onBookCancel?: () => void;
}) {
  const demo = demoMode();
  const jobs = useJobs();
  const { showToast } = useToast();
  const completeJob = useCompleteJob();
  const startReview = useStartReviewCampaign();
  const reschedule = useRescheduleAppointment();
  const markPaid = useMarkJobPaid();
  const today = toIso(new Date());

  // The job whose Message composer is open (null = closed).
  const [msgJob, setMsgJob] = useState<Job | null>(null);
  // The job whose Reschedule picker is open (null = closed).
  const [reschedJob, setReschedJob] = useState<Job | null>(null);

  // Booking flow (Schedule tab): the slot the owner picked, and the details form.
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [bkAddress, setBkAddress] = useState(booking?.prefillAddress ?? "");
  const [bkService, setBkService] = useState(booking?.prefillService ?? "");
  const [bkNotes, setBkNotes] = useState("");

  // Anchor the view to the demo month so the preview always reads full; a real
  // session opens on the current month (empty until connected).
  const initial = demo ? DEMO_MONTH : { year: new Date().getFullYear(), month: new Date().getMonth() };
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState(demo ? DEMO_DEFAULT_DAY : today);

  // Which view is showing: the Jobs day-panel or one of the calendar views.
  const [jobsView, setJobsView] = useState<JobsView>(initialJobsView);
  const setJobsViewPersist = (v: JobsView) => {
    setJobsView(v);
    try {
      window.localStorage.setItem(JOBS_VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  // The dates the calendar is showing, reported up by CalendarViews so the busy
  // fetch follows the client as they navigate. useCallback keeps the identity
  // stable, or the child's reporting effect would loop.
  const [calRange, setCalRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const onCalendarRangeChange = useCallback((start: string, end: string) => {
    setCalRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  // Hours the client's own linked Google Calendar reports as taken. Skipped in
  // demo mode, which has no real connection to read.
  const busyQuery = useCalendarBusy(calRange.start, calRange.end, !demo);

  // The same jobs, shaped for the calendar views. Estimates map to their own
  // source so they colour distinctly from booked/completed work. Busy blocks
  // join as a third source and render behind the day.
  const calendarItems = useMemo(() => {
    const jobItems = jobs.map(jobToItem);
    const busyItems = (busyQuery.data?.busy ?? []).map(busyToItem);
    return [...jobItems, ...busyItems];
  }, [jobs, busyQuery.data]);

  const calendarConnected = useMemo<Record<CalendarSource, boolean>>(
    () => ({
      estimate: calendarItems.some((i) => i.source === "estimate"),
      job: calendarItems.some((i) => i.source === "job"),
      // The client Jobs tab shows pipeline work, never raw GHL appointments.
      // That stream belongs to the Setter Suite calendar.
      appointment: false,
      busy: busyQuery.data?.connected ?? false,
    }),
    [calendarItems, busyQuery.data],
  );

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

  // Route a job-card action. The wired writes (complete / message / review) hit
  // real endpoints (demo mirrors them in the in-memory store); the calendar +
  // invoice actions stay gated with a clear note until those feeds are wired.
  function handleAct(job: Job, label: string) {
    switch (label) {
      case "Mark completed":
        completeJob.mutate(
          { jobId: job.id },
          {
            onSuccess: () => showToast(`Marked ${job.customer}'s job completed.`),
            onError: () => showToast("Could not update the job. Please try again."),
          },
        );
        return;
      case "Message":
        setMsgJob(job);
        return;
      case "Ask for review":
        startReview.mutate(
          { contactId: job.contactId ?? "" },
          {
            onSuccess: () => showToast(`Review request sent to ${job.customer}.`),
            onError: () => showToast("Could not send the review request."),
          },
        );
        return;
      case "Reschedule":
        if (!demo && !job.appointmentId) {
          showToast("This job has no scheduled appointment to move yet.");
          return;
        }
        setReschedJob(job);
        return;
      case "Record payment":
        markPaid.mutate(
          { jobId: job.id, contactId: job.contactId ?? "", amount: job.amount },
          {
            onSuccess: () => showToast(`Marked ${job.customer}'s job paid.`),
            onError: () => showToast("Could not record the payment. Please try again."),
          },
        );
        return;
      case "Resend invoice":
        // Willis (and every probed tenant) does not use GHL invoices, so there
        // is nothing to resend. Honest note instead of a fake send.
        showToast("Invoices are not set up on this account, so there is nothing to resend.");
        return;
      default:
        showToast(
          demo
            ? `Preview — "${label}" is not available in the demo.`
            : `"${label}" is not available yet.`,
        );
    }
  }

  const viewControls = (
    <div className="flex flex-wrap items-center gap-2">
      <GoogleCalendarLink />
      <Segmented<JobsView>
        options={[
          { value: "jobs", label: "Jobs" },
          { value: "month", label: "Month" },
          { value: "week", label: "Week" },
          { value: "agenda", label: "Agenda" },
        ]}
        value={jobsView}
        onChange={setJobsViewPersist}
      />
    </div>
  );

  return (
    <>
      <div className={JOBS_CONTAINER}>
        {embedded ? (
          <div className="flex justify-end pb-1 pt-1">{viewControls}</div>
        ) : (
          <PageHeader
            title="Jobs"
            actions={viewControls}
          />
        )}

        {booking && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand-primary)]/30 bg-brand-tint px-4 py-2.5">
            <span className="text-[13px] font-semibold text-text">
              Pick a time for{" "}
              <span className="text-brand-text">{booking.name}</span>'s{" "}
              {booking.kind === "estimate" ? "estimate" : "install"} · {booking.calendar}
            </span>
            <button
              type="button"
              onClick={onBookCancel}
              className="ml-auto rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
          </div>
        )}

        {!booking && jobsView !== "jobs" ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <CalendarViews
              items={calendarItems}
              connected={calendarConnected}
              view={jobsView}
              onRangeChange={onCalendarRangeChange}
            />
          </div>
        ) : (
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
                      onClick={() => {
                        setSelected(cell.iso);
                        setSlotIso(null);
                      }}
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
              <SummaryRow dot="bg-info" label="Estimates" value={String(summary.estimates)} />
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
                  {booking
                    ? "Open times to book"
                    : dayJobs.length === 0
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
              {booking ? (
                slotIso ? (
                  <BookingForm
                    kind={booking.kind}
                    calendar={booking.calendar}
                    slotIso={slotIso}
                    address={bkAddress}
                    setAddress={setBkAddress}
                    service={bkService}
                    setService={setBkService}
                    notes={bkNotes}
                    setNotes={setBkNotes}
                    onBack={() => setSlotIso(null)}
                    onConfirm={() =>
                      onBookPick?.(slotIso, {
                        address: bkAddress.trim(),
                        service: bkService.trim(),
                        notes: bkNotes.trim(),
                      })
                    }
                  />
                ) : (
                  <BookingSlots
                    dayIso={selected}
                    dayJobs={dayJobs}
                    demo={demo}
                    calendar={booking.calendar}
                    onPick={(iso) => setSlotIso(iso)}
                  />
                )
              ) : dayJobs.length === 0 ? (
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
                dayJobs.map((job) => <JobCard key={job.id} job={job} onAct={handleAct} />)
              )}
            </div>
          </div>
        </Panel>
        )}
      </div>
      {msgJob && (
        <JobMessageModal
          job={msgJob}
          onClose={() => setMsgJob(null)}
          onSent={() => showToast(`Message sent to ${msgJob.customer}.`)}
        />
      )}
      {reschedJob && (
        <DateTimeModal
          title={`Reschedule ${reschedJob.customer}`}
          subtitle="Pick a new date and time for this job."
          confirmLabel="Reschedule"
          pending={reschedule.isPending}
          onClose={() => setReschedJob(null)}
          onConfirm={(iso) => {
            const job = reschedJob;
            // Demo jobs have no appointment id; the picker still confirms so the
            // walkthrough reads, but there is nothing to write.
            if (!job.appointmentId) {
              showToast(`Rescheduled ${job.customer}.`);
              setReschedJob(null);
              return;
            }
            const endIso = new Date(new Date(iso).getTime() + 60 * 60_000).toISOString();
            reschedule.mutate(
              { eventId: job.appointmentId, startTime: iso, endTime: endIso },
              {
                onSuccess: () => showToast(`Rescheduled ${job.customer}.`),
                onError: () => showToast("Could not reschedule. Please try again."),
                onSettled: () => setReschedJob(null),
              },
            );
          }}
        />
      )}
    </>
  );
}

// Standalone Jobs route wrapper. The combined Sales page renders <JobsBoard
// embedded /> under its "Schedule" tab instead.
export default function Jobs() {
  return (
    <Shell>
      <JobsBoard />
    </Shell>
  );
}

// Compact SMS composer for a job, keyed by the job's contact id. Sends through
// the channel-aware conversations endpoint (SMS), the same primitive the Leads
// composer uses. In a real session the job carries a contactId; the demo job
// omits it, so the send is a local no-op that still confirms in the toast.
function JobMessageModal({
  job,
  onClose,
  onSent,
}: {
  job: Job;
  onClose: () => void;
  onSent: () => void;
}) {
  const send = useSendConversationMessage();
  const [body, setBody] = useState("");
  const canSend = body.trim().length > 0 && !send.isPending;

  function submit() {
    const text = body.trim();
    if (!text) return;
    const done = () => {
      onSent();
      onClose();
    };
    if (job.contactId) {
      send.mutate(
        { contactId: job.contactId, channel: "SMS", body: text },
        { onSuccess: done, onError: done },
      );
    } else {
      done();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-[22px] pb-1.5 pt-5">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16.5px] font-semibold text-text">
              Message {job.customer}
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              Sends a text to {job.phone || "the contact on file"}.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-[22px] pb-[22px] pt-3">
          <textarea
            autoFocus
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Text ${job.customer.split(" ")[0]}…`}
            className="w-full resize-none rounded-[10px] border border-border bg-[var(--bg)] px-3 py-2.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-border bg-surface px-3.5 py-2 font-display text-[13px] font-semibold text-text hover:border-brand/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
              style={{ backgroundImage: "var(--grad-brand)" }}
            >
              <Send size={15} /> {send.isPending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  if (job.status === "estimate") {
    return [
      { label: "Reschedule", icon: CalendarClock, primary: true },
      { label: "Message", icon: MessageSquare },
    ];
  }
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

// Bookable hours shown in the slot picker (8am to 5pm start times).
const BOOK_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function slotLabel(h: number): string {
  const ap = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ap}`;
}

// The starting hour a job occupies, parsed from its "2 PM" style time, so its
// slot renders as blocked.
function jobHour(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h;
}

// A live slot ISO to a short time label ("9:00 AM"), for the real free-slot grid.
function slotTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// The day's open-time grid for booking. In demo, a fixed 8-5 grid with hours
// taken by that day's jobs rendered blocked. Live, the real free slots on the
// chosen calendar (Home Estimate / Job) for the selected day, fetched from
// /api/handoffs/slots; picking one books a real appointment on that calendar.
function BookingSlots({
  dayIso,
  dayJobs,
  demo,
  calendar,
  onPick,
}: {
  dayIso: string;
  dayJobs: Job[];
  demo: boolean;
  // The GHL calendar name handed over from the Leads tab ("Home Estimate"|"Job").
  calendar: string;
  onPick: (iso: string) => void;
}) {
  const calKey: "home-estimate" | "job" =
    calendar.toLowerCase().includes("estimate") ? "home-estimate" : "job";
  const slots = useHandoffSlotsQuery(calKey, dayIso, !demo);

  // Demo: the fixed grid blocked by that day's demo jobs.
  if (demo) {
    const blocked = new Set(
      dayJobs.map((j) => jobHour(j.time)).filter((h): h is number => h != null),
    );
    return (
      <div>
        <div className="mb-3 flex items-center gap-4 text-[11px] font-medium text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-brand-tint ring-1 ring-brand/40" />
            Open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-2" />
            Blocked
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BOOK_HOURS.map((h) => {
            const isBlocked = blocked.has(h);
            const iso = new Date(`${dayIso}T${String(h).padStart(2, "0")}:00:00`).toISOString();
            return (
              <button
                key={h}
                type="button"
                disabled={isBlocked}
                onClick={() => onPick(iso)}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-xl border px-3 py-3 font-display text-[13px] font-semibold transition-colors",
                  isBlocked
                    ? "cursor-not-allowed border-divider bg-surface-2 text-faint line-through"
                    : "border-brand/40 bg-brand-tint text-brand-text hover:bg-brand-tint-strong",
                )}
              >
                {slotLabel(h)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Live states: loading, an honest not-bookable message, empty, or real slots.
  if (slots.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-brand"
          aria-hidden
        />
      </div>
    );
  }
  const data = slots.data;
  if (slots.isError || (data && !data.ok)) {
    const needsStaff = data?.error === "calendar_needs_staff";
    const notFound = data?.error === "calendar_not_found";
    return (
      <div className="rounded-xl border border-warning/30 bg-warning-tint px-4 py-3 text-[12.5px] text-text">
        {needsStaff
          ? `The ${calendar} calendar has no team member assigned, so it can't take bookings yet. Add one in GHL, then try again.`
          : notFound
            ? `No "${calendar}" calendar found on this account yet.`
            : "Could not load open times. Please try again."}
      </div>
    );
  }
  const open = data?.slots ?? [];
  if (open.length === 0) {
    return (
      <div className="rounded-xl border border-divider bg-surface-2 px-4 py-3 text-[12.5px] text-muted">
        No open times on {calendar} this day. Pick another day.
      </div>
    );
  }
  return (
    <div>
      <div className="mb-3 text-[11px] font-medium text-muted">
        Open times on <span className="text-brand-text">{calendar}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {open.map((iso) => (
          <button
            key={iso}
            type="button"
            onClick={() => onPick(iso)}
            className="flex items-center justify-center gap-1 rounded-xl border border-brand/40 bg-brand-tint px-3 py-3 font-display text-[13px] font-semibold text-brand-text transition-colors hover:bg-brand-tint-strong"
          >
            {slotTimeLabel(iso)}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatSlot(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const BOOK_INPUT =
  "w-full rounded-lg border border-border bg-[var(--bg)] px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20";

// The details form shown once a slot is picked: address (required), service +
// scope, and a notes field whose label fits the visit type.
function BookingForm({
  kind,
  calendar,
  slotIso,
  address,
  setAddress,
  service,
  setService,
  notes,
  setNotes,
  onBack,
  onConfirm,
}: {
  kind: "estimate" | "job";
  calendar: string;
  slotIso: string;
  address: string;
  setAddress: (v: string) => void;
  service: string;
  setService: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const notesLabel = kind === "job" ? "Install notes" : "Visit notes";
  const notesHint =
    kind === "job"
      ? "What's being installed, removal, access"
      : "Gate code, dog, parking, call on arrival";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl bg-brand-tint px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="truncate font-display text-[14px] font-semibold text-text">
            {formatSlot(slotIso)}
          </div>
          <div className="text-[11.5px] text-muted">on {calendar}</div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-[12.5px] font-semibold text-brand-text hover:underline"
        >
          Change time
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-[12px] font-semibold text-text">
          Address <span className="text-danger">*</span>
        </span>
        <input
          autoFocus
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Harbor View Dr"
          className={BOOK_INPUT}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[12px] font-semibold text-text">Service + scope</span>
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="Window replacement, 6 windows"
          className={BOOK_INPUT}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[12px] font-semibold text-text">{notesLabel}</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={notesHint}
          className={BOOK_INPUT + " resize-none"}
        />
      </label>

      <button
        type="button"
        disabled={!address.trim()}
        onClick={onConfirm}
        className="mt-1 inline-flex h-10 items-center justify-center rounded-xl px-4 font-display text-[14px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-40"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        {kind === "job" ? "Book install" : "Book estimate"}
      </button>
    </div>
  );
}

function JobCard({ job, onAct }: { job: Job; onAct: (job: Job, label: string) => void }) {
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
              onClick={() => onAct(job, a.label)}
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
