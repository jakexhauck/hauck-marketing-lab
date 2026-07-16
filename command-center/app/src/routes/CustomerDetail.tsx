import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import Shell from "../components/Shell";
import { PAGE_CONTAINER } from "../lib/layout";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  useCustomerDetailQuery,
  useAddCustomerJob,
  useEditCustomerJob,
  useDeleteCustomerJob,
  useSetServicePlan,
} from "../hooks/useApi";
import { formatMoneyExact } from "../lib/formatMoney";
import type { ApiCustomerJob } from "../lib/customers";

// One customer: who they are, every job they have paid for, and when they are
// next due.
//
// This is where mistakes get fixed. The job rows feed the client's revenue
// tiles, so a wrong value has to be correctable here rather than by me in the
// database; and it is the recovery path when a close-out moved the opportunity
// but failed to save the job.

const FIELD =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-2 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (!iso) d.setMonth(d.getMonth() + 3), d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Draft {
  description: string;
  value: string;
  completedOn: string;
}

function toCents(value: string): number {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

export default function CustomerDetail() {
  const { contactId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showToast } = useToast();

  const query = useCustomerDetailQuery(contactId, Boolean(session));
  const addJob = useAddCustomerJob(contactId);
  const editJob = useEditCustomerJob(contactId);
  const deleteJob = useDeleteCustomerJob(contactId);
  const setPlan = useSetServicePlan(contactId);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ description: "", value: "", completedOn: todayIso() });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [planAt, setPlanAt] = useState("");

  const data = query.data;

  function startAdd() {
    setEditingId(null);
    setDraft({ description: "", value: "", completedOn: todayIso() });
    setAdding(true);
  }

  function startEdit(job: ApiCustomerJob) {
    setAdding(false);
    setDraft({
      description: job.description,
      value: String(job.valueCents / 100),
      completedOn: job.completedOn,
    });
    setEditingId(job.id);
  }

  async function saveDraft() {
    const body = {
      description: draft.description.trim(),
      valueCents: toCents(draft.value),
      completedOn: draft.completedOn,
    };
    try {
      if (editingId) await editJob.mutateAsync({ jobId: editingId, ...body });
      else await addJob.mutateAsync(body);
      setAdding(false);
      setEditingId(null);
      showToast(editingId ? "Job updated." : "Job added.");
    } catch (e) {
      showToast(friendly((e as Error).message));
    }
  }

  async function removeJob(jobId: string) {
    try {
      await deleteJob.mutateAsync(jobId);
      setConfirmDelete(null);
      showToast("Job removed.");
    } catch (e) {
      showToast(friendly((e as Error).message));
    }
  }

  async function savePlan(mode: "book" | "unplanned" | "none") {
    try {
      const res = (await setPlan.mutateAsync(
        mode === "book" ? { mode, at: new Date(planAt).toISOString() } : { mode },
      )) as { calendarError?: string };
      setEditingPlan(false);
      showToast(res?.calendarError ? `Saved. ${res.calendarError}` : "Next service updated.");
    } catch (e) {
      showToast(friendly((e as Error).message));
    }
  }

  const savingDraft = addJob.isPending || editJob.isPending;
  const draftValid = draft.description.trim().length > 0;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <button
          type="button"
          onClick={() => navigate("/customers")}
          className="mb-4 inline-flex items-center gap-1 self-start rounded-lg px-1 text-sm font-semibold text-muted transition-colors hover:text-text"
        >
          <ChevronLeft size={16} aria-hidden />
          Customers
        </button>

        {query.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : query.isError || !data ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            That customer could not be found.
          </div>
        ) : (
          <div className="w-full max-w-2xl">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-[22px] font-semibold text-text">{data.name}</h1>
                <p className="mt-1 text-[13px] text-muted">
                  {[data.phone, data.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                  data.type === "recurring"
                    ? "bg-brand-tint text-brand"
                    : "border border-border bg-surface text-muted",
                )}
              >
                {data.type === "recurring" ? "Recurring" : "One-Time"}
              </span>
            </header>

            <div className="mt-4 flex gap-3">
              <div className="flex-1 rounded-[var(--radius)] border border-border bg-surface p-4">
                <div className="label-cap mb-1.5">Lifetime</div>
                <div className="stat-num text-[25px]">
                  {formatMoneyExact(data.totalCents / 100)}
                </div>
              </div>
              <div className="flex-1 rounded-[var(--radius)] border border-border bg-surface p-4">
                <div className="label-cap mb-1.5">Jobs</div>
                <div className="stat-num text-[25px]">{data.jobs.length}</div>
              </div>
            </div>

            {data.type === "recurring" && (
              <section className="mt-5 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-[15px] font-semibold text-text">Next service</h2>
                  {!editingPlan && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlanAt(toLocalInput(data.nextServiceAt));
                        setEditingPlan(true);
                      }}
                      className="text-[12.5px] font-semibold text-brand hover:underline"
                    >
                      {data.nextServiceAt ? "Change" : "Set a date"}
                    </button>
                  )}
                </div>

                {data.appointmentMissing && (
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-warning">
                    <AlertTriangle size={13} aria-hidden />
                    This booking is no longer on the calendar. It may have been cancelled there.
                  </p>
                )}

                {editingPlan ? (
                  <div className="mt-3 flex flex-col gap-2.5">
                    <input
                      type="datetime-local"
                      value={planAt}
                      onChange={(e) => setPlanAt(e.target.value)}
                      className={FIELD}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={setPlan.isPending}
                        onClick={() => void savePlan("book")}
                      >
                        Book it
                      </Button>
                      <Button size="sm" onClick={() => void savePlan("unplanned")}>
                        Not scheduled yet
                      </Button>
                      <Button size="sm" onClick={() => void savePlan("none")}>
                        Nothing due
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingPlan(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={cn(
                      "mt-2 flex items-center gap-1.5 text-[13px]",
                      data.serviceState === "booked" ? "text-muted" : "text-warning",
                    )}
                  >
                    {data.serviceState === "booked" ? (
                      <>
                        <CalendarDays size={13} aria-hidden />
                        {new Date(data.nextServiceAt!).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        · on the calendar
                      </>
                    ) : data.serviceState === "overdue" ? (
                      <>
                        <AlertTriangle size={13} aria-hidden />
                        {new Date(data.nextServiceAt!).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · overdue
                      </>
                    ) : data.serviceState === "none" ? (
                      <span className="text-muted">Nothing due right now.</span>
                    ) : (
                      <>
                        <AlertTriangle size={13} aria-hidden />
                        No next service booked
                      </>
                    )}
                  </p>
                )}
              </section>
            )}

            <section className="mt-5">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 className="font-display text-[15px] font-semibold text-text">Job history</h2>
                <Button size="sm" onClick={startAdd}>
                  <Plus size={14} />
                  Add job
                </Button>
              </div>

              {data.jobsUnavailable && (
                <div className="mb-3 rounded-[var(--radius)] border border-warning/30 bg-warning-tint px-3 py-2 text-[12.5px] text-warning">
                  Job history is unavailable right now.
                </div>
              )}

              {adding && (
                <JobForm
                  draft={draft}
                  setDraft={setDraft}
                  onSave={() => void saveDraft()}
                  onCancel={() => setAdding(false)}
                  saving={savingDraft}
                  valid={draftValid}
                />
              )}

              <div className="flex flex-col gap-2">
                {data.jobs.length === 0 && !adding ? (
                  <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-faint">
                    No jobs logged yet. Add one to count their revenue.
                  </p>
                ) : (
                  data.jobs.map((job) =>
                    editingId === job.id ? (
                      <JobForm
                        key={job.id}
                        draft={draft}
                        setDraft={setDraft}
                        onSave={() => void saveDraft()}
                        onCancel={() => setEditingId(null)}
                        saving={savingDraft}
                        valid={draftValid}
                      />
                    ) : (
                      <div
                        key={job.id}
                        className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-medium text-text">
                            {job.description}
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-faint">
                            {formatDay(job.completedOn)}
                            {job.addedManually && " · added by hand"}
                          </div>
                        </div>
                        <div className="shrink-0 text-[13.5px] font-semibold tabular-figs text-text">
                          {formatMoneyExact(job.valueCents / 100)}
                        </div>
                        {confirmDelete === job.id ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void removeJob(job.id)}
                              aria-label="Confirm remove"
                              className="grid h-7 w-7 place-items-center rounded-md bg-danger text-white"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              aria-label="Keep job"
                              className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(job)}
                              aria-label={`Edit ${job.description}`}
                              className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-text"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(job.id)}
                              aria-label={`Remove ${job.description}`}
                              className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-danger-tint hover:text-danger"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    ),
                  )
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}

function JobForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  valid,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  valid: boolean;
}) {
  return (
    <div className="mb-2 rounded-[var(--radius)] border border-brand/40 bg-surface p-3">
      <input
        type="text"
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="What was the job?"
        aria-label="What was the job?"
        className={FIELD}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={draft.value}
          onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          placeholder="$0"
          aria-label="Job value"
          className={cn(FIELD, "tabular-figs")}
        />
        <input
          type="date"
          value={draft.completedOn}
          max={todayIso()}
          onChange={(e) => setDraft({ ...draft, completedOn: e.target.value })}
          aria-label="Date completed"
          className={FIELD}
        />
      </div>
      <div className="mt-2.5 flex gap-2">
        <Button variant="primary" size="sm" onClick={onSave} loading={saving} disabled={!valid}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const ERRORS: Record<string, string> = {
  description_required: "Say what the job was.",
  negative_value: "The job value cannot be negative.",
  future_date: "That date is in the future.",
  invalid_date: "That date could not be read.",
  next_service_in_past: "That date has already passed.",
  next_service_date_required: "Pick a date first.",
  jobs_unavailable: "The job history is unreachable right now. Nothing was changed.",
};

function friendly(raw: string): string {
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : "Something went wrong.";
}
