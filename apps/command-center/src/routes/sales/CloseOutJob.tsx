import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, AlertTriangle, CalendarDays, Check } from "lucide-react";
import Shell from "../../components/Shell";
import { PAGE_CONTAINER } from "../../lib/layout";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useCloseOutPrefillQuery, useCloseOutJob } from "../../hooks/useApi";
import type { CustomerType, NextServiceMode } from "../../lib/closeOut";

// The close-out page: the one gate between "job done" and "customer".
//
// Reached from a red Needs close-out badge on a Job Completed card. It is a
// whole page rather than a sheet on purpose — it is the only thing that records
// the client's revenue, and a sheet is too easy to dismiss half-finished.
//
// The customer type is ALWAYS an explicit human choice. A returning one-off is a
// real thing, so nothing here auto-promotes anyone to recurring; when the contact
// is already a customer the page says so and lets them decide.

const FIELD =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Local, not toISOString(): a job completed this evening must not be rejected
  // as "in the future" because UTC has already rolled over.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The datetime-local value for a sensible default next service: same time, next
// morning is meaningless for a 3-hour job, so we offer 9am three months out.
function defaultNextService(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ERROR_COPY: Record<string, string> = {
  description_required: "Say what the job was.",
  negative_value: "The job value cannot be negative.",
  future_date: "That date is in the future. Pick the day the job actually finished.",
  invalid_date: "That date could not be read.",
  next_service_date_required: "Pick the date to book, or choose one of the other options.",
  next_service_in_past: "That next service date has already passed.",
  stage_not_found: "This account's Customers pipeline has no matching stage.",
  already_closed_out: "This job was already closed out.",
  jobs_unavailable: "The job history is unreachable right now, so nothing was changed. Try again shortly.",
  job_not_saved:
    "They were moved to Customers, but the job did not save. Add it from their customer page.",
  ghl_error: "The CRM rejected the change and nothing was saved. Try again.",
};

export default function CloseOutJob() {
  const { opportunityId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showToast } = useToast();

  const prefill = useCloseOutPrefillQuery(opportunityId, Boolean(session));
  const closeOut = useCloseOutJob();

  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [completedOn, setCompletedOn] = useState(todayIso());
  const [type, setType] = useState<CustomerType | null>(null);
  const [mode, setMode] = useState<NextServiceMode>("book");
  const [at, setAt] = useState(defaultNextService());
  const [error, setError] = useState<string | null>(null);

  // Seed the value from the opportunity once it lands, without stamping over an
  // edit the user has already made.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && prefill.data && !("error" in prefill.data)) {
      setValue(prefill.data.valueCents ? String(prefill.data.valueCents / 100) : "");
      setSeeded(true);
    }
  }, [prefill.data, seeded]);

  const data = prefill.data;
  const notInQueue = prefill.isError && /409/.test(String(prefill.error));

  // A card that is not in Job Completed cannot be closed out. Send them back to
  // the board rather than showing a form that can only fail.
  useEffect(() => {
    if (notInQueue) {
      showToast("That job is not waiting to be closed out.");
      navigate("/sales/leads", { replace: true });
    }
  }, [notInQueue, navigate, showToast]);

  const dirty = description.trim().length > 0 || value.trim().length > 0 || type !== null;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const valueCents = useMemo(() => {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
  }, [value]);

  const canSave = Boolean(type) && description.trim().length > 0 && !closeOut.isPending;

  async function save() {
    if (!type) return;
    setError(null);
    try {
      const res = await closeOut.mutateAsync({
        opportunityId,
        type,
        description: description.trim(),
        valueCents: Number.isFinite(valueCents) ? valueCents : 0,
        completedOn,
        nextService:
          type === "one-time"
            ? { mode: "none" }
            : mode === "book"
              ? { mode: "book", at: new Date(at).toISOString() }
              : { mode },
      });
      if (res.appointmentError) {
        showToast(`Job saved. ${res.appointmentError}`);
      } else {
        showToast("Job closed out.");
      }
      navigate("/customers");
    } catch (e) {
      const raw = (e as Error).message ?? "";
      const code = Object.keys(ERROR_COPY).find((k) => raw.includes(k));
      setError(code ? ERROR_COPY[code] : raw || "Something went wrong.");
    }
  }

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <button
          type="button"
          onClick={() => navigate("/sales/leads")}
          className="mb-4 inline-flex items-center gap-1 self-start rounded-lg px-1 text-sm font-semibold text-muted transition-colors hover:text-text"
        >
          <ChevronLeft size={16} aria-hidden />
          Back to the board
        </button>

        {prefill.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : prefill.isError || !data ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            That job could not be found.
          </div>
        ) : (
          <div className="w-full max-w-lg">
            <h1 className="font-display text-[22px] font-semibold text-text">Close out job</h1>
            <p className="mt-1 text-[13px] text-muted">
              {data.name}
              {data.phone ? ` · ${data.phone}` : ""}
            </p>

            {data.alreadyClosedOut ? (
              <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-2 px-4 py-3 text-[13px] text-muted">
                <Check size={15} className="shrink-0" aria-hidden />
                This job has already been closed out.
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-lg)] border border-warning/30 bg-warning-tint px-4 py-2.5 text-[13px] text-warning">
                  <AlertTriangle size={15} className="shrink-0" aria-hidden />
                  This job needs closing out.
                </div>

                {data.configError === "pipeline_not_found" && (
                  <div className="mt-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger">
                    This account has no Customers pipeline, so nothing can be recorded yet.
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-4">
                  <label className="block">
                    <span className="text-[13px] font-medium text-text">What was the job?</span>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Replaced 4 windows, back of house"
                      className={cn(FIELD, "mt-1.5")}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[13px] font-medium text-text">Job value</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="$0"
                        className={cn(FIELD, "mt-1.5 tabular-figs")}
                      />
                      <span className="mt-1 block text-[11.5px] text-faint">
                        $0 is fine for a warranty callback.
                      </span>
                    </label>
                    <label className="block">
                      <span className="text-[13px] font-medium text-text">Date completed</span>
                      <input
                        type="date"
                        value={completedOn}
                        max={todayIso()}
                        onChange={(e) => setCompletedOn(e.target.value)}
                        className={cn(FIELD, "mt-1.5")}
                      />
                    </label>
                  </div>

                  <fieldset>
                    <legend className="text-[13px] font-medium text-text">Customer type</legend>
                    {data.existingCustomer && (
                      <p className="mt-1 text-[12px] text-muted">
                        {data.name.split(" ")[0]} is already a{" "}
                        {data.existingCustomer.type === "recurring" ? "recurring" : "one-time"}{" "}
                        customer. A second job usually means recurring, but a returning one-off is
                        real too.
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {(["one-time", "recurring"] as CustomerType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setType(t)}
                          className={cn(
                            "rounded-[var(--radius)] border px-3 py-2.5 text-[13.5px] font-semibold transition-colors",
                            type === t
                              ? "border-brand bg-brand text-white"
                              : "border-border bg-surface text-muted hover:border-brand/45",
                          )}
                        >
                          {t === "one-time" ? "One-Time" : "Recurring"}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {type === "recurring" && (
                    <fieldset className="rounded-[var(--radius)] border border-border bg-surface-2/50 p-3">
                      <legend className="px-1 text-[13px] font-medium text-text">
                        Next service
                      </legend>
                      <div className="flex flex-col gap-2">
                        <Choice
                          checked={mode === "book"}
                          onSelect={() => setMode("book")}
                          label="Book it now"
                          hint="Goes on the service calendar and syncs to Google."
                        >
                          {mode === "book" && (
                            <input
                              type="datetime-local"
                              value={at}
                              onChange={(e) => setAt(e.target.value)}
                              className={cn(FIELD, "mt-2")}
                            />
                          )}
                        </Choice>
                        <Choice
                          checked={mode === "unplanned"}
                          onSelect={() => setMode("unplanned")}
                          label="Not scheduled yet"
                          hint="Shows amber on Customers until someone books it."
                        />
                        <Choice
                          checked={mode === "none"}
                          onSelect={() => setMode("none")}
                          label="No next service planned"
                          hint="Recurring, but nothing due. No flag."
                        />
                      </div>
                    </fieldset>
                  )}

                  {error && (
                    <div className="rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-3 py-2.5 text-[13px] text-danger">
                      {error}
                    </div>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => void save()}
                    disabled={!canSave}
                    loading={closeOut.isPending}
                  >
                    Save and move to Customers
                  </Button>
                  {!type && (
                    <p className="-mt-2 text-center text-[12px] text-faint">
                      Pick a customer type to save.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Choice({
  checked,
  onSelect,
  label,
  hint,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-[var(--radius)] border p-2.5 transition-colors",
        checked ? "border-brand bg-surface" : "border-border bg-surface hover:border-brand/40",
      )}
    >
      <span className="flex items-start gap-2.5">
        <input
          type="radio"
          name="next-service"
          checked={checked}
          onChange={onSelect}
          className="mt-0.5 accent-[var(--brand-primary)]"
        />
        <span className="min-w-0">
          <span className="block text-[13.5px] font-medium text-text">{label}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-faint">
            {label === "Book it now" && <CalendarDays size={11} aria-hidden />}
            {hint}
          </span>
        </span>
      </span>
      {children}
    </label>
  );
}
